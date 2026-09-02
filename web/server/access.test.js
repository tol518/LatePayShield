import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authorizeNetwork,
  authorizeOperator,
  describeBindRefusal,
  isLoopbackHostname,
  readAccessConfig,
} from './access.js';

const SERVER = fileURLToPath(new URL('./index.js', import.meta.url));
const OPERATOR_TOKEN = 'a'.repeat(48);
const OTHER_TOKEN = 'b'.repeat(48);
const TOKEN_HEADER = 'X-LatePay-Operator-Token';

function confirmedCase(agreementId) {
  return {
    agreementId,
    invoiceNumber: `INV-${agreementId}`,
    supplierName: 'Northwind Studio Ltd',
    payerName: 'Contoso Ltd',
    invoiceDueDate: '2026-09-29',
    factsConfirmed: true,
  };
}

/**
 * `fetch` refuses to send a Host header, so a rebinding attempt is made with a
 * raw request that carries the attacker's name for the same loopback socket.
 */
function requestWithHost(origin, path, hostHeader, headers = {}) {
  const { port } = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers: { Host: hostHeader, ...headers } },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode));
      },
    );
    request.once('error', reject);
    request.end();
  });
}

/** Start the real service on an ephemeral loopback port with a scratch database. */
async function startServer(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'latepay-access-'));
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      XAMAN_SERVER_PORT: '0',
      XAMAN_SERVER_HOST: '127.0.0.1',
      CASE_DATABASE_PATH: join(directory, 'cases.sqlite'),
      WEB_OPERATOR_TOKENS: `local-operator:${OPERATOR_TOKEN},second-operator:${OTHER_TOKEN}`,
      AI_ASSISTANT_ENABLED: 'false',
      FDC_UI_AUTOMATION_ENABLED: 'false',
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The service did not start: ${log}`)), 20_000);
    child.stdout.on('data', (chunk) => {
      log += chunk;
      const match = log.match(/service: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.stderr.on('data', (chunk) => { log += chunk; });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`The service exited with code ${code}: ${log}`));
    });
  });

  return {
    origin,
    async stop() {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test('the case API refuses unauthenticated reads and writes', async (t) => {
  const service = await startServer();
  t.after(() => service.stop());

  const list = await fetch(`${service.origin}/api/cases`);
  assert.equal(list.status, 401);

  const detail = await fetch(`${service.origin}/api/cases/00000000-0000-4000-8000-000000000000`);
  assert.equal(detail.status, 401);

  const created = await fetch(`${service.origin}/api/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(confirmedCase(101)),
  });
  assert.equal(created.status, 401);

  const communication = await fetch(`${service.origin}/api/cases/00000000-0000-4000-8000-000000000000/communications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ occurredAt: '2026-09-02T10:30:00.000Z', channel: 'email', direction: 'outbound', summary: 'No.' }),
  });
  assert.equal(communication.status, 401);

  const wrongToken = await fetch(`${service.origin}/api/cases`, { headers: { [TOKEN_HEADER]: 'c'.repeat(48) } });
  assert.equal(wrongToken.status, 401);

  // The page the local service serves carries the token the UI presents, so
  // only same-origin code in that page can read it.
  const page = await fetch(`${service.origin}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), new RegExp(`<meta name="latepay-operator-token" content="${OPERATOR_TOKEN}">`));

  // Nothing was written by any of the refused requests.
  const authorized = await fetch(`${service.origin}/api/cases`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  assert.equal(authorized.status, 200);
  assert.deepEqual((await authorized.json()).cases, []);
});

test('an authenticated operator only sees and changes its own cases', async (t) => {
  const service = await startServer();
  t.after(() => service.stop());

  const created = await fetch(`${service.origin}/api/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: JSON.stringify(confirmedCase(102)),
  });
  assert.equal(created.status, 201);
  const caseId = (await created.json()).case.id;

  const otherDetail = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OTHER_TOKEN } });
  assert.equal(otherDetail.status, 404);

  const otherList = await fetch(`${service.origin}/api/cases`, { headers: { [TOKEN_HEADER]: OTHER_TOKEN } });
  assert.deepEqual((await otherList.json()).cases, []);

  const otherWrite = await fetch(`${service.origin}/api/cases/${caseId}/communications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OTHER_TOKEN },
    body: JSON.stringify({ occurredAt: '2026-09-02T10:30:00.000Z', channel: 'email', direction: 'outbound', summary: 'No.' }),
  });
  assert.equal(otherWrite.status, 404);

  const ownDetail = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  assert.equal((await ownDetail.json()).case.communicationCount, 0);
});

test('cross-origin and rebound requests are refused whatever the Content-Type', async (t) => {
  const service = await startServer();
  t.after(() => service.stop());

  for (const contentType of ['text/plain', 'application/json', 'application/x-www-form-urlencoded']) {
    const response = await fetch(`${service.origin}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': contentType, Origin: 'https://mallory.example', [TOKEN_HEADER]: OPERATOR_TOKEN },
      body: JSON.stringify(confirmedCase(103)),
    });
    assert.equal(response.status, 403, `Content-Type ${contentType} was not refused.`);
  }

  assert.equal(
    await requestWithHost(service.origin, '/api/cases', 'case-data.mallory.example', { [TOKEN_HEADER]: OPERATOR_TOKEN }),
    403,
  );
  assert.equal(await requestWithHost(service.origin, '/', 'case-data.mallory.example'), 403);
  assert.equal(await requestWithHost(service.origin, '/api/cases', '127.0.0.1', { [TOKEN_HEADER]: OPERATOR_TOKEN }), 200);

  // A same-origin write from the served page still works.
  const sameOrigin = await fetch(`${service.origin}/api/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: service.origin, [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: JSON.stringify(confirmedCase(104)),
  });
  assert.equal(sameOrigin.status, 201);
});

test('refuses to bind outside loopback without an authenticated deployment', async () => {
  await assert.rejects(
    startServer({ XAMAN_SERVER_HOST: '0.0.0.0', WEB_OPERATOR_TOKENS: '' }),
    /WEB_AUTHENTICATED_DEPLOYMENT=true/,
  );
  await assert.rejects(
    startServer({ XAMAN_SERVER_HOST: '0.0.0.0', WEB_AUTHENTICATED_DEPLOYMENT: 'true', WEB_OPERATOR_TOKENS: '' }),
    /requires WEB_OPERATOR_TOKENS/,
  );
  await assert.rejects(
    startServer({ XAMAN_SERVER_HOST: '0.0.0.0', WEB_AUTHENTICATED_DEPLOYMENT: 'true' }),
    /requires WEB_ALLOWED_ORIGINS/,
  );
});

test('loopback spellings are recognised and obfuscated ones are not', () => {
  for (const host of ['127.0.0.1', '127.1.2.3', 'localhost', '::1', '::ffff:127.0.0.1', '[::1]']) {
    assert.equal(isLoopbackHostname(host), true, host);
  }
  for (const host of ['0.0.0.0', '2130706433', '0177.0.0.1', '127.0.0.1.mallory.example', '192.168.1.10', '']) {
    assert.equal(isLoopbackHostname(host), false, host);
  }
});

test('invalid operator and origin configuration is rejected at load', () => {
  assert.throws(() => readAccessConfig({ WEB_OPERATOR_TOKENS: 'no-separator' }), /operatorId:token/);
  assert.throws(() => readAccessConfig({ WEB_OPERATOR_TOKENS: 'local-operator:short' }), /at least 24 characters/);
  assert.throws(() => readAccessConfig({ WEB_ALLOWED_ORIGINS: 'cases.example.test' }), /absolute origin/);

  const generated = readAccessConfig({});
  assert.equal(generated.loopbackOnly, true);
  assert.equal(generated.generatedToken?.length, 64);
  assert.equal(describeBindRefusal(generated), null);
});

test('the policy checks run before any route or body is considered', () => {
  const config = readAccessConfig({ WEB_OPERATOR_TOKENS: `local-operator:${OPERATOR_TOKEN}` });
  const request = (headers, remoteAddress = '127.0.0.1') => ({ headers, socket: { remoteAddress } });

  assert.throws(() => authorizeNetwork(request({ host: '127.0.0.1:8787' }, '203.0.113.9'), config), /local requests only/);
  assert.throws(() => authorizeNetwork(request({}), config), /Host header/);
  assert.throws(
    () => authorizeNetwork(request({ host: '127.0.0.1:8787', origin: 'https://mallory.example' }), config),
    /origin that is not allowed/,
  );
  authorizeNetwork(request({ host: 'localhost:5173', origin: 'http://localhost:5173' }), config);

  assert.throws(() => authorizeOperator(request({ host: '127.0.0.1:8787' }), config), /needs an operator token/);
  assert.equal(
    authorizeOperator(request({ host: '127.0.0.1:8787', 'x-latepay-operator-token': OPERATOR_TOKEN }), config),
    'local-operator',
  );
});
