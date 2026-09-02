import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import xummSdkPackage from 'xumm-sdk';
import { readAiConfig } from './ai/config.js';
import { runExtraction, MAX_INVOICE_CHARACTERS } from './ai/extract.js';
import { extractDocumentText, MAX_DOCUMENT_BYTES, MAX_PDF_PAGES } from './ai/documentText.js';
import { CaseInputError, CaseStore } from './cases/store.js';
import {
  AccessError,
  authorizeNetwork,
  authorizeOperator,
  describeBindRefusal,
  injectOperatorToken,
  readAccessConfig,
} from './access.js';

const { XummSdk } = xummSdkPackage;
// This package is intentionally frontend-adjacent, but credentials belong to
// the repository's existing private environment file, alongside the other
// testnet service configuration. They are never sent to Vite or the browser.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const PORT = Number(process.env.XAMAN_SERVER_PORT ?? 8787);
const HOST = process.env.XAMAN_SERVER_HOST ?? '127.0.0.1';
// Network and operator policy is resolved before the socket opens, so an
// unsafe bind fails to start instead of serving case data to the network.
let access;
try {
  access = readAccessConfig(process.env);
} catch (error) {
  console.error(`Web service access configuration is invalid: ${error.message}`);
  process.exit(1);
}
const bindRefusal = describeBindRefusal(access);
if (bindRefusal) {
  console.error(bindRefusal);
  process.exit(1);
}
const XRPL_TESTNET_RPC_URL = process.env.XRPL_TESTNET_RPC_URL ?? 'https://s.altnet.rippletest.net:51234';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLASSIC_ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const MAX_BODY_BYTES = 16 * 1024;
// A pasted invoice is legitimately larger than any other request this service
// takes, so the AI route gets its own ceiling instead of raising it everywhere.
const MAX_AI_BODY_BYTES = Math.ceil(MAX_DOCUMENT_BYTES * 4 / 3) + 256 * 1024;
const SESSION_LIFETIME_MS = 15 * 60 * 1000;
const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));
const PROJECT_DIR = fileURLToPath(new URL('../../', import.meta.url));
const FDC_AUTOMATION_ENABLED = process.env.FDC_UI_AUTOMATION_ENABLED === 'true';
const FDC_AUTOMATION_READY = FDC_AUTOMATION_ENABLED && Boolean(
  process.env.COSTON2_PRIVATE_KEY && process.env.LATEPAY_SHIELD_ADDRESS && process.env.FDC_VERIFIER_API_KEY,
);
const FDC_JOB_OUTPUT_LIMIT = 12_000;

const apiKey = process.env.XUMM_APIKEY?.trim();
const apiSecret = process.env.XUMM_APISECRET?.trim();
const configured = UUID.test(apiKey ?? '') && UUID.test(apiSecret ?? '');
const sdk = configured ? new XummSdk(apiKey, apiSecret) : null;
const sessions = new Map();
const createAttempts = new Map();
const aiAttempts = new Map();
const fdcJobs = new Map();
const fdcQueue = [];
const caseStore = new CaseStore(process.env.CASE_DATABASE_PATH
  ? { databasePath: process.env.CASE_DATABASE_PATH }
  : undefined);
let activeFdcJob = null;

function allowRequest(attempts, address, limit) {
  const now = Date.now();
  const current = attempts.get(address);
  if (!current || current.resetAt <= now) {
    attempts.set(address, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function allowPaymentRequest(address) {
  return allowRequest(createAttempts, address, 12);
}

// The model answers one request at a time on the operator's own hardware, so a
// tighter ceiling here protects the machine rather than the service.
function allowAiRequest(address) {
  return allowRequest(aiAttempts, address, 6);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function appendJobOutput(job, chunk) {
  const text = String(chunk ?? '');
  job.output = `${job.output ?? ''}${text}`.slice(-FDC_JOB_OUTPUT_LIMIT);
  job.updatedAt = new Date().toISOString();
}

function publicFdcJob(job) {
  return {
    id: job.id,
    agreementId: job.agreementId,
    transactionHash: job.transactionHash,
    status: job.status,
    step: job.step,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt ?? null,
    error: job.error ?? null,
    output: job.output ?? '',
  };
}

function runCommand(job, step, command, args) {
  return new Promise((resolve, reject) => {
    job.step = step;
    job.updatedAt = new Date().toISOString();
    appendJobOutput(job, `\n[${step}]\n`);
    const child = spawn(command, args, {
      cwd: PROJECT_DIR,
      env: {
        ...process.env,
        XRPL_TX_HASH: job.transactionHash,
        AGREEMENT_ID: String(job.agreementId),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => appendJobOutput(job, chunk));
    child.stderr.on('data', (chunk) => appendJobOutput(job, chunk));
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${step} ${signal ? `was interrupted (${signal})` : `exited with code ${code}`}.`));
    });
  });
}

async function runFdcJob(job) {
  job.status = 'running';
  job.updatedAt = new Date().toISOString();
  try {
    // These are the protocol team's exact, already-proven commands. The server
    // deliberately orchestrates them instead of reproducing any proof logic.
    await runCommand(job, 'Preparing FDC request', 'node', ['scripts/prepare-fdc-request.js', job.transactionHash]);
    await runCommand(job, 'Submitting FDC request', 'npm', ['run', 'fdc:submit']);
    await runCommand(job, 'Waiting for FDC proof', 'npm', ['run', 'fdc:proof']);
    await runCommand(job, 'Recording PaidVerified', 'npm', ['run', 'fdc:record']);
    job.status = 'completed';
    job.step = 'PaidVerified recorded on Coston2';
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
  } catch (error) {
    job.status = 'failed';
    job.error = error?.message ?? 'The FDC job failed.';
    job.updatedAt = new Date().toISOString();
  }
}

async function drainFdcQueue() {
  if (activeFdcJob) return;
  const job = fdcQueue.shift();
  if (!job) return;
  activeFdcJob = job;
  await runFdcJob(job);
  activeFdcJob = null;
  void drainFdcQueue();
}

function validateFdcJob(input) {
  const agreementId = Number(input.agreementId);
  const transactionHash = String(input.transactionHash ?? '').trim().replace(/^0x/i, '').toUpperCase();
  if (!Number.isSafeInteger(agreementId) || agreementId <= 0) throw new Error('A valid agreement ID is required.');
  if (!/^[A-F0-9]{64}$/.test(transactionHash)) throw new Error('A 64-character XRPL transaction hash is required.');
  return { agreementId, transactionHash };
}

async function createFdcJob(request, response) {
  if (!FDC_AUTOMATION_ENABLED || !FDC_AUTOMATION_READY) {
    sendJson(response, 503, {
      error: FDC_AUTOMATION_ENABLED
        ? 'FDC automation is missing required repository-root testnet configuration.'
        : 'FDC automation is disabled. Set FDC_UI_AUTOMATION_ENABLED=true in the repository-root .env, then restart the web service.',
    });
    return;
  }
  const input = validateFdcJob(await readJson(request));
  const existing = [...fdcJobs.values()].find((job) =>
    job.agreementId === input.agreementId && job.transactionHash === input.transactionHash &&
    ['queued', 'running', 'completed'].includes(job.status),
  );
  if (existing) {
    sendJson(response, 200, publicFdcJob(existing));
    return;
  }
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    ...input,
    status: 'queued',
    step: activeFdcJob ? 'Queued behind another FDC verification' : 'Queued for FDC verification',
    createdAt: now,
    updatedAt: now,
    output: '',
  };
  fdcJobs.set(job.id, job);
  fdcQueue.push(job);
  void drainFdcQueue();
  sendJson(response, 202, publicFdcJob(job));
}

function fdcJobStatus(response, id) {
  const job = fdcJobs.get(id);
  if (!job) {
    sendJson(response, 404, { error: 'This FDC job is not in this service session. Check the agreement on Coston2 or start a new verification.' });
    return;
  }
  sendJson(response, 200, publicFdcJob(job));
}

async function aiExtract(request, response) {
  const config = readAiConfig();
  if (!config.ready) {
    // Not an error: the assistant is optional and the manual form is complete.
    sendJson(response, 503, { error: config.unavailableReason });
    return;
  }

  const body = await readJson(request, MAX_AI_BODY_BYTES);
  const document = body.document ? await extractDocumentText(body.document) : null;
  const sourceText = document?.text ?? body.invoiceText;
  const result = await runExtraction(sourceText);
  sendJson(response, 200, {
    ...result,
    document: document ? { name: document.name, format: document.format, size: document.size } : null,
    // This fingerprint lets a saved case identify the exact source that was
    // reviewed without persisting the raw invoice text in the first slice.
    sourceSha256: createHash('sha256').update(String(sourceText)).digest('hex'),
  });
}

async function readJson(request, limit = MAX_BODY_BYTES) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > limit) throw new Error('Request body is too large.');
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function validatePayment(input) {
  const destination = String(input.destination ?? '').trim();
  const amountDrops = String(input.amountDrops ?? '').trim();
  const destinationTag = Number(input.destinationTag);
  const agreementId = Number(input.agreementId);
  const dueAt = Number(input.dueAt);

  if (!CLASSIC_ADDRESS.test(destination)) throw new Error('A valid classic XRPL Testnet destination is required.');
  if (!/^\d+$/.test(amountDrops) || BigInt(amountDrops) <= 0n) throw new Error('The XRP amount must be positive drops.');
  if (!Number.isSafeInteger(destinationTag) || destinationTag < 0 || destinationTag > 0xffffffff) throw new Error('The destination tag must be an unsigned 32-bit integer.');
  if (!Number.isSafeInteger(agreementId) || agreementId <= 0) throw new Error('A valid agreement ID is required.');
  if (!Number.isSafeInteger(dueAt) || dueAt <= Math.floor(Date.now() / 1000) + 60) throw new Error('The agreement deadline is too close or has passed.');

  return { destination, amountDrops, destinationTag, agreementId, dueAt };
}

function publicSession(session) {
  return {
    id: session.id,
    status: session.status,
    opened: session.opened,
    txid: session.txid,
    account: session.account,
    dispatchResult: session.dispatchResult,
    deepLink: session.deepLink,
    qrPng: session.qrPng,
    expiresAt: session.expiresAt,
  };
}

async function createPayment(request, response) {
  if (!configured) {
    sendJson(response, 503, { error: 'Xaman payment service is not configured. Add XUMM_APIKEY and XUMM_APISECRET to the repository-root .env.' });
    return;
  }

  const payment = validatePayment(await readJson(request));
  const minutesUntilDeadline = Math.floor((payment.dueAt * 1000 - Date.now()) / 60_000);
  const expireMinutes = Math.max(2, Math.min(5, minutesUntilDeadline));
  const payload = {
    txjson: {
      TransactionType: 'Payment',
      Destination: payment.destination,
      DestinationTag: payment.destinationTag,
      Amount: payment.amountDrops,
    },
    options: {
      submit: true,
      expire: expireMinutes,
      force_network: 'TESTNET',
    },
    custom_meta: {
      identifier: `latepay-agreement-${payment.agreementId}`,
      instruction: `Pay agreement #${payment.agreementId} from an account other than the receiving account`,
    },
  };

  const subscription = await sdk.payload.createAndSubscribe(payload, ({ data, payload: current }) => {
    const session = sessions.get(current.meta.uuid);
    if (!session) return undefined;

    session.opened = session.opened || Boolean(current.meta.app_opened || data.opened);
    if (current.meta.signed || data.signed) {
      session.status = 'signed';
      session.txid = current.response?.txid ?? data.txid ?? null;
      session.account = current.response?.account ?? current.response?.signer ?? null;
      session.dispatchResult = current.response?.dispatched_result ?? data.dispatched_result ?? null;
      return { resolved: true };
    }
    if (current.meta.cancelled) {
      session.status = 'cancelled';
      return { resolved: true };
    }
    if (current.meta.expired || data.expired) {
      session.status = 'expired';
      return { resolved: true };
    }
    return undefined;
  });

  const created = subscription.created;
  const session = {
    id: created.uuid,
    status: 'waiting',
    opened: false,
    txid: null,
    account: null,
    dispatchResult: null,
    deepLink: created.next.always,
    qrPng: created.refs.qr_png,
    expiresAt: new Date(Date.now() + expireMinutes * 60_000).toISOString(),
  };
  sessions.set(session.id, session);
  setTimeout(() => sessions.delete(session.id), SESSION_LIFETIME_MS).unref();
  sendJson(response, 201, publicSession(session));
}

async function createWalletConnection(response) {
  if (!configured) {
    sendJson(response, 503, { error: 'Xaman wallet connection is not configured. Add XUMM_APIKEY and XUMM_APISECRET to the repository-root .env.' });
    return;
  }

  const expireMinutes = 5;
  const payload = {
    txjson: { TransactionType: 'SignIn' },
  };

  const subscription = await sdk.payload.createAndSubscribe(payload, ({ data, payload: current }) => {
    const session = sessions.get(current.meta.uuid);
    if (!session) return undefined;

    session.opened = session.opened || Boolean(current.meta.app_opened || data.opened);
    if (current.meta.signed || data.signed) {
      session.status = 'signed';
      session.account = current.response?.account ?? current.response?.signer ?? data.account ?? null;
      return { resolved: true };
    }
    if (current.meta.cancelled) {
      session.status = 'cancelled';
      return { resolved: true };
    }
    if (current.meta.expired || data.expired) {
      session.status = 'expired';
      return { resolved: true };
    }
    return undefined;
  });

  const created = subscription.created;
  const session = {
    id: created.uuid,
    status: 'waiting',
    opened: false,
    txid: null,
    account: null,
    dispatchResult: null,
    deepLink: created.next.always,
    qrPng: created.refs.qr_png,
    expiresAt: new Date(Date.now() + expireMinutes * 60_000).toISOString(),
  };
  sessions.set(session.id, session);
  setTimeout(() => sessions.delete(session.id), SESSION_LIFETIME_MS).unref();
  sendJson(response, 201, publicSession(session));
}

function paymentStatus(response, id) {
  if (!UUID.test(id)) {
    sendJson(response, 400, { error: 'Invalid Xaman request ID.' });
    return;
  }
  const session = sessions.get(id);
  if (!session) {
    sendJson(response, 404, { error: 'This Xaman request is no longer active. Create a new request.' });
    return;
  }
  sendJson(response, 200, publicSession(session));
}

async function xrplTransaction(response, hash) {
  if (!/^[A-F0-9]{64}$/i.test(hash)) {
    sendJson(response, 400, { error: 'Invalid XRPL transaction hash.' });
    return;
  }

  const upstream = await fetch(XRPL_TESTNET_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'tx', params: [{ transaction: hash.toUpperCase(), binary: false }] }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await upstream.json();
  if (!upstream.ok) {
    sendJson(response, 502, { error: `XRPL Testnet RPC returned HTTP ${upstream.status}.` });
    return;
  }
  sendJson(response, 200, payload);
}

async function xrplAgreementDefaults(response) {
  const upstream = await fetch(XRPL_TESTNET_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'ledger_current', params: [{}] }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await upstream.json();
  const ledgerIndex = Number(payload?.result?.ledger_current_index);
  if (!upstream.ok || !Number.isSafeInteger(ledgerIndex) || ledgerIndex <= 0) {
    sendJson(response, 502, { error: 'The current XRPL Testnet ledger could not be read.' });
    return;
  }
  sendJson(response, 200, {
    network: 'XRPL Testnet',
    startLedger: ledgerIndex,
    destinationTag: randomInt(1, 0x100000000),
  });
}

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendHtml(response, html) {
  const body = injectOperatorToken(html, access);
  response.writeHead(200, {
    'Content-Type': MIME['.html'],
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

async function serveFrontend(response, pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  let filePath = join(DIST_DIR, relative || 'index.html');
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
    if (extname(filePath) === '.html') {
      sendHtml(response, await readFile(filePath, 'utf8'));
      return;
    }
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    response.end(content);
  } catch {
    try {
      sendHtml(response, await readFile(join(DIST_DIR, 'index.html'), 'utf8'));
    } catch {
      sendJson(response, 404, { error: 'Frontend build not found. Run npm run build first.' });
    }
  }
}

const server = http.createServer(async (request, response) => {
  try {
    authorizeNetwork(request, access);
    const url = new URL(request.url, `http://${request.headers.host ?? `${HOST}:${PORT}`}`);
    // Every API route, case routes included, needs an authenticated operator.
    // Reaching the port is not permission.
    const operatorId = url.pathname.startsWith('/api/') ? authorizeOperator(request, access) : null;
    if (request.method === 'GET' && url.pathname === '/api/xaman/health') {
      const aiConfig = readAiConfig();
      sendJson(response, 200, {
        configured,
        network: 'XRPL Testnet',
        fdcAutomationEnabled: FDC_AUTOMATION_ENABLED,
        fdcAutomationReady: FDC_AUTOMATION_READY,
        // The model's address is never included: the browser only learns
        // whether suggestions can be attempted.
        aiEnabled: aiConfig.enabled,
        aiReady: aiConfig.ready,
        aiUnavailableReason: aiConfig.unavailableReason,
        aiMaxInvoiceCharacters: MAX_INVOICE_CHARACTERS,
        aiMaxDocumentBytes: MAX_DOCUMENT_BYTES,
        aiMaxPdfPages: MAX_PDF_PAGES,
        aiDocumentFormats: ['PDF', 'XML', 'UBL'],
      });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/xaman/payments') {
      if (!allowPaymentRequest(request.socket.remoteAddress ?? 'unknown')) {
        sendJson(response, 429, { error: 'Too many payment requests. Wait one minute and try again.' });
        return;
      }
      await createPayment(request, response);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/xaman/wallet-connections') {
      if (!allowPaymentRequest(request.socket.remoteAddress ?? 'unknown')) {
        sendJson(response, 429, { error: 'Too many wallet requests. Wait one minute and try again.' });
        return;
      }
      await createWalletConnection(response);
      return;
    }
    const walletConnectionMatch = request.method === 'GET' && url.pathname.match(/^\/api\/xaman\/wallet-connections\/([^/]+)$/);
    if (walletConnectionMatch) {
      paymentStatus(response, walletConnectionMatch[1]);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/xrpl/agreement-defaults') {
      await xrplAgreementDefaults(response);
      return;
    }
    const xrplMatch = request.method === 'GET' && url.pathname.match(/^\/api\/xrpl\/transactions\/([A-Fa-f0-9]{64})$/);
    if (xrplMatch) {
      await xrplTransaction(response, xrplMatch[1]);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/ai/extractions') {
      if (!allowAiRequest(request.socket.remoteAddress ?? 'unknown')) {
        sendJson(response, 429, { error: 'Too many suggestion requests. Wait one minute, or enter the terms manually.' });
        return;
      }
      await aiExtract(request, response);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/cases') {
      sendJson(response, 200, { cases: caseStore.listCases(operatorId) });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/cases') {
      sendJson(response, 201, { case: caseStore.createCase(await readJson(request), operatorId) });
      return;
    }
    const caseMatch = request.method === 'GET' && url.pathname.match(/^\/api\/cases\/([0-9a-f-]{36})$/i);
    if (caseMatch) {
      const caseFile = caseStore.getCase(caseMatch[1], operatorId);
      if (!caseFile) sendJson(response, 404, { error: 'Case file not found.' });
      else sendJson(response, 200, { case: caseFile });
      return;
    }
    const communicationMatch = request.method === 'POST' && url.pathname.match(/^\/api\/cases\/([0-9a-f-]{36})\/communications$/i);
    if (communicationMatch) {
      const caseFile = caseStore.addCommunication(communicationMatch[1], await readJson(request), operatorId);
      if (!caseFile) sendJson(response, 404, { error: 'Case file not found.' });
      else sendJson(response, 201, { case: caseFile });
      return;
    }
    const eligibilityMatch = request.method === 'PUT' && url.pathname.match(/^\/api\/cases\/([0-9a-f-]{36})\/eligibility$/i);
    if (eligibilityMatch) {
      const { answers } = await readJson(request) ?? {};
      const caseFile = caseStore.saveEligibility(eligibilityMatch[1], answers, operatorId);
      if (!caseFile) sendJson(response, 404, { error: 'Case file not found.' });
      else sendJson(response, 200, { case: caseFile });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/fdc/payments') {
      await createFdcJob(request, response);
      return;
    }
    const fdcJobMatch = request.method === 'GET' && url.pathname.match(/^\/api\/fdc\/jobs\/([0-9a-f-]{36})$/i);
    if (fdcJobMatch) {
      fdcJobStatus(response, fdcJobMatch[1]);
      return;
    }
    const statusMatch = request.method === 'GET' && url.pathname.match(/^\/api\/xaman\/payments\/([^/]+)$/);
    if (statusMatch) {
      paymentStatus(response, statusMatch[1]);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'API route not found.' });
      return;
    }
    await serveFrontend(response, url.pathname);
  } catch (error) {
    if (error instanceof AccessError) {
      // Logged without the presented token, and answered with no detail about
      // which check failed beyond what the operator needs to fix it.
      console.error(`Web service refused a request: ${error.message}`);
      sendJson(response, error.status, { error: error.message });
      return;
    }
    console.error('Web service request failed:', error?.message ?? error);
    if (error?.name === 'AiUnavailableError') {
      sendJson(response, 503, { error: error.message });
      return;
    }
    if (error?.name === 'AiInputError') {
      sendJson(response, 400, { error: error.message });
      return;
    }
    if (error instanceof CaseInputError) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    sendJson(response, error?.message?.includes('required') || error?.message?.includes('must') ? 400 : 502, {
      error: error?.message ?? 'Xaman payment service failed.',
    });
  }
});

server.listen(PORT, HOST, () => {
  const port = server.address()?.port ?? PORT;
  console.log(`LatePay Xaman service: http://${HOST}:${port}`);
  console.log(access.loopbackOnly
    ? `Loopback deployment; case and service routes require an operator token${access.generatedToken ? ' generated for this run and served in the page' : ' from WEB_OPERATOR_TOKENS'}.`
    : `Authenticated deployment on ${access.host}; ${access.operators.size} operator token(s) and ${access.allowedOrigins.size} allowed origin(s) configured.`);
  console.log(configured ? 'Xaman credentials loaded; Testnet payment requests are enabled.' : 'Xaman credentials missing; add them to the repository-root .env to enable wallet payments.');
  const aiConfig = readAiConfig();
  console.log(aiConfig.ready
    ? `Local AI assistant enabled; invoice suggestions use ${aiConfig.model}.`
    : `Local AI assistant off; ${aiConfig.unavailableReason}`);
  console.log(FDC_AUTOMATION_READY
    ? 'FDC UI automation enabled; jobs run one at a time.'
    : FDC_AUTOMATION_ENABLED
      ? 'FDC UI automation enabled but missing required root testnet configuration.'
      : 'FDC UI automation disabled; set FDC_UI_AUTOMATION_ENABLED=true in the repository-root .env to enable it.');
});
