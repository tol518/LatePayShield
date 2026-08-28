import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import xummSdkPackage from 'xumm-sdk';

const { XummSdk } = xummSdkPackage;
// This package is intentionally frontend-adjacent, but credentials belong to
// the repository's existing private environment file, alongside the other
// testnet service configuration. They are never sent to Vite or the browser.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const PORT = Number(process.env.XAMAN_SERVER_PORT ?? 8787);
const HOST = process.env.XAMAN_SERVER_HOST ?? '127.0.0.1';
const XRPL_TESTNET_RPC_URL = process.env.XRPL_TESTNET_RPC_URL ?? 'https://s.altnet.rippletest.net:51234';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLASSIC_ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const MAX_BODY_BYTES = 16 * 1024;
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
const fdcJobs = new Map();
const fdcQueue = [];
let activeFdcJob = null;

function allowPaymentRequest(address) {
  const now = Date.now();
  const current = createAttempts.get(address);
  if (!current || current.resetAt <= now) {
    createAttempts.set(address, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
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

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error('Request body is too large.');
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
      instruction: `Pay agreement #${payment.agreementId} on XRPL Testnet`,
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
    sendJson(response, 400, { error: 'Invalid Xaman payment request ID.' });
    return;
  }
  const session = sessions.get(id);
  if (!session) {
    sendJson(response, 404, { error: 'This payment request is no longer active. Create a new request.' });
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

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function serveFrontend(response, pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  let filePath = join(DIST_DIR, relative || 'index.html');
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    response.end(content);
  } catch {
    try {
      const index = await readFile(join(DIST_DIR, 'index.html'));
      response.writeHead(200, { 'Content-Type': MIME['.html'], 'X-Content-Type-Options': 'nosniff' });
      response.end(index);
    } catch {
      sendJson(response, 404, { error: 'Frontend build not found. Run npm run build first.' });
    }
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? `${HOST}:${PORT}`}`);
    if (request.method === 'GET' && url.pathname === '/api/xaman/health') {
      sendJson(response, 200, {
        configured,
        network: 'XRPL Testnet',
        fdcAutomationEnabled: FDC_AUTOMATION_ENABLED,
        fdcAutomationReady: FDC_AUTOMATION_READY,
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
    const xrplMatch = request.method === 'GET' && url.pathname.match(/^\/api\/xrpl\/transactions\/([A-Fa-f0-9]{64})$/);
    if (xrplMatch) {
      await xrplTransaction(response, xrplMatch[1]);
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
    console.error('Xaman service request failed:', error?.message ?? error);
    sendJson(response, error?.message?.includes('required') || error?.message?.includes('must') ? 400 : 502, {
      error: error?.message ?? 'Xaman payment service failed.',
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`LatePay Xaman service: http://${HOST}:${PORT}`);
  console.log(configured ? 'Xaman credentials loaded; Testnet payment requests are enabled.' : 'Xaman credentials missing; add them to the repository-root .env to enable wallet payments.');
  console.log(FDC_AUTOMATION_READY
    ? 'FDC UI automation enabled; jobs run one at a time.'
    : FDC_AUTOMATION_ENABLED
      ? 'FDC UI automation enabled but missing required root testnet configuration.'
      : 'FDC UI automation disabled; set FDC_UI_AUTOMATION_ENABLED=true in the repository-root .env to enable it.');
});
