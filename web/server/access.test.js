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

const IN_SCOPE_ANSWERS = {
  partiesActingInBusiness: 'yes',
  payerBasedInUk: 'yes',
  invoiceDelivered: 'yes',
  debtDisputed: 'no',
  payerInsolvencyProcess: 'no',
  courtProceedings: 'no',
  contractTermsOver60Days: 'no',
  debtOlderThanSixYears: 'no',
};

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

test('the HTTP draft lifecycle blocks send hand-off until the exact version is approved', async (t) => {
  const service = await startServer();
  t.after(() => service.stop());
  const headers = { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN };

  const created = await fetch(`${service.origin}/api/cases`, {
    method: 'POST', headers, body: JSON.stringify(confirmedCase(105)),
  });
  const caseId = (await created.json()).case.id;

  // Clear the task 8 routing gate: this test is about the approval gate, and an
  // unanswered questionnaire blocks delivery on its own.
  const cleared = await fetch(`${service.origin}/api/cases/${caseId}/eligibility`, {
    method: 'PUT', headers, body: JSON.stringify({ answers: IN_SCOPE_ANSWERS }),
  });
  assert.equal(cleared.status, 200);

  const draftResponse = await fetch(`${service.origin}/api/cases/${caseId}/drafts`, {
    method: 'POST', headers, body: JSON.stringify({
      subject: 'Payment reminder', body: 'Please arrange payment.', authorType: 'local_llm',
    }),
  });
  assert.equal(draftResponse.status, 201);
  const draft = (await draftResponse.json()).case.drafts[0];
  assert.equal(draft.status, 'draft');
  assert.equal(draft.authorType, 'human');

  const blocked = await fetch(`${service.origin}/api/cases/${caseId}/drafts/${draft.id}/send-authorizations`, {
    method: 'POST', headers, body: JSON.stringify({ expectedVersion: 1 }),
  });
  assert.equal(blocked.status, 409);

  const approved = await fetch(`${service.origin}/api/cases/${caseId}/drafts/${draft.id}/reviews`, {
    method: 'POST', headers, body: JSON.stringify({ action: 'approve', expectedVersion: 1 }),
  });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).case.drafts[0].status, 'approved');

  const authorized = await fetch(`${service.origin}/api/cases/${caseId}/drafts/${draft.id}/send-authorizations`, {
    method: 'POST', headers, body: JSON.stringify({ expectedVersion: 1 }),
  });
  assert.equal(authorized.status, 200);
  const authorization = (await authorized.json()).authorization;
  assert.equal(authorization.sent, false);
  assert.equal(authorization.transport, 'not_connected');

  const edited = await fetch(`${service.origin}/api/cases/${caseId}/drafts/${draft.id}`, {
    method: 'PUT', headers, body: JSON.stringify({ expectedVersion: 1, subject: draft.subject, body: 'Edited after approval.' }),
  });
  assert.equal(edited.status, 200);
  const editedDraft = (await edited.json()).case.drafts[0];
  assert.equal(editedDraft.version, 2);
  assert.equal(editedDraft.status, 'draft');
  assert.equal(editedDraft.approvedVersion, null);

  const blockedAgain = await fetch(`${service.origin}/api/cases/${caseId}/drafts/${draft.id}/send-authorizations`, {
    method: 'POST', headers, body: JSON.stringify({ expectedVersion: 2 }),
  });
  assert.equal(blockedAgain.status, 409);

  const detail = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  const events = (await detail.json()).case.drafts[0].auditEvents.map((event) => event.eventType);
  assert.deepEqual(events, [
    'draft_created', 'send_blocked', 'draft_approved', 'send_authorized', 'draft_updated', 'send_blocked',
  ]);
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

test('eligibility answers are authorized, scoped, and validated', async (t) => {
  const service = await startServer();
  t.after(() => service.stop());

  const created = await fetch(`${service.origin}/api/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: JSON.stringify(confirmedCase(105)),
  });
  const caseId = (await created.json()).case.id;
  const path = `/api/cases/${caseId}/eligibility`;

  function save(token, answers) {
    return fetch(`${service.origin}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { [TOKEN_HEADER]: token } : {}) },
      body: JSON.stringify({ answers }),
    });
  }

  assert.equal((await save(null, { debtDisputed: 'no' })).status, 401);
  assert.equal((await save(OTHER_TOKEN, { debtDisputed: 'no' })).status, 404);
  assert.equal((await save(OPERATOR_TOKEN, { isTheClaimStrong: 'yes' })).status, 400);

  // A literal null body parses successfully, so the route has to survive it
  // rather than fall through to the generic failure code.
  const nullBody = await fetch(`${service.origin}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: 'null',
  });
  assert.equal(nullBody.status, 400);

  const saved = await save(OPERATOR_TOKEN, { debtDisputed: 'no', payerBasedInUk: 'yes' });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).case.eligibility.answers, { debtDisputed: 'no', payerBasedInUk: 'yes' });

  // The service returns answers only. It cannot compute an outcome, because it
  // never reads the agreement deadline from Coston2.
  const detail = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  const eligibility = (await detail.json()).case.eligibility;
  assert.deepEqual(Object.keys(eligibility).sort(), ['answers', 'assessedAt']);

  // A cross-origin write is refused on the headers alone.
  const crossOrigin = await fetch(`${service.origin}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: 'https://mallory.example', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: JSON.stringify({ answers: { debtDisputed: 'yes' } }),
  });
  assert.equal(crossOrigin.status, 403);

  const unchanged = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  assert.equal((await unchanged.json()).case.eligibility.answers.debtDisputed, 'no');
});

test('the timeline suggestion route is authorized and stays off when the model is disabled', async (t) => {
  const service = await startServer();
  t.after(() => service.stop());

  const body = JSON.stringify({ documentText: '14 July 2026 — Reminder sent to accounts@contoso.example about the invoice.' });

  // Reaching the port is not permission, for a suggestion route either.
  const unauthenticated = await fetch(`${service.origin}/api/ai/timelines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  assert.equal(unauthenticated.status, 401);

  // With the assistant off this is a disabled feature, not an error: the reply
  // says so and the manual timeline form is unaffected.
  const disabled = await fetch(`${service.origin}/api/ai/timelines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body,
  });
  assert.equal(disabled.status, 503);
  assert.match((await disabled.json()).error, /AI assistant is disabled/);
});

test('a confirmed timeline proposal is stored with its provenance, and an ungrounded one is refused', async (t) => {
  const service = await startServer();
  t.after(() => service.stop());

  const created = await fetch(`${service.origin}/api/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: JSON.stringify(confirmedCase(510)),
  });
  assert.equal(created.status, 201);
  const caseId = (await created.json()).case.id;

  const confirmed = await fetch(`${service.origin}/api/cases/${caseId}/communications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: JSON.stringify({
      occurredAt: '2026-08-02T09:00:00.000Z',
      channel: 'phone',
      direction: 'inbound',
      summary: 'Payer said on the call that the payment had been approved.',
      authorType: 'local_llm',
      sourceQuote: 'he said the payment had been approved',
      sourceSha256: 'd'.repeat(64),
      modelName: 'mlx-community/Qwen3-8B-4bit',
    }),
  });
  assert.equal(confirmed.status, 201);
  const entry = (await confirmed.json()).case.communications[0];
  assert.equal(entry.authorType, 'local_llm');
  assert.equal(entry.sourceQuote, 'he said the payment had been approved');
  assert.equal(entry.sourceSha256, 'd'.repeat(64));
  assert.equal(entry.confirmedBy, 'local-operator');

  // A model-authored entry that arrives without its quote or fingerprint cannot
  // be confirmed: the reviewer would have nothing to check it against.
  const ungrounded = await fetch(`${service.origin}/api/cases/${caseId}/communications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: JSON.stringify({
      occurredAt: '2026-08-02T09:00:00.000Z',
      channel: 'phone',
      direction: 'inbound',
      summary: 'Payer said the payment had been approved.',
      authorType: 'local_llm',
    }),
  });
  assert.equal(ungrounded.status, 400);

  const detail = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  assert.equal((await detail.json()).case.communications.length, 1);
});

test('the explanation and drafting routes are authorized and stay off when the model is disabled', async (t) => {
  const service = await startServer();
  t.after(() => service.stop());

  const created = await fetch(`${service.origin}/api/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: JSON.stringify(confirmedCase(610)),
  });
  const caseId = (await created.json()).case.id;

  const explanationBody = JSON.stringify({ status: 'PAID_VERIFIED', facts: [] });
  const draftBody = JSON.stringify({ asAtDate: '2026-09-03', tone: 'neutral' });

  // Reaching the port is not permission, for either suggestion route.
  const unauthenticatedExplanation = await fetch(`${service.origin}/api/ai/explanations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: explanationBody,
  });
  assert.equal(unauthenticatedExplanation.status, 401);

  const unauthenticatedDraft = await fetch(`${service.origin}/api/cases/${caseId}/drafts/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: draftBody,
  });
  assert.equal(unauthenticatedDraft.status, 401);

  // With the assistant off both are a disabled feature, not an error.
  const disabledExplanation = await fetch(`${service.origin}/api/ai/explanations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: explanationBody,
  });
  assert.equal(disabledExplanation.status, 503);
  assert.match((await disabledExplanation.json()).error, /AI assistant is disabled/);

  const disabledDraft = await fetch(`${service.origin}/api/cases/${caseId}/drafts/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: draftBody,
  });
  assert.equal(disabledDraft.status, 503);

  // Nothing was drafted by any refused or disabled request.
  const detail = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  assert.deepEqual((await detail.json()).case.drafts, []);
});

test('a drafting request cannot reach another operator case', async (t) => {
  const service = await startServer();
  t.after(() => service.stop());

  const created = await fetch(`${service.origin}/api/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: JSON.stringify(confirmedCase(611)),
  });
  const caseId = (await created.json()).case.id;

  // The second operator holds the exact case identifier and still gets nothing.
  // Ownership is decided before the assistant is consulted, so the answer is
  // 404 rather than leaking whether a model happens to be configured.
  const crossOperator = await fetch(`${service.origin}/api/cases/${caseId}/drafts/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OTHER_TOKEN },
    body: JSON.stringify({ asAtDate: '2026-09-03', tone: 'neutral' }),
  });
  assert.equal(crossOperator.status, 404);

  const detail = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  assert.deepEqual((await detail.json()).case.drafts, []);
});

test('an escalated case is refused a send hand-off over HTTP, and says why', async (t) => {
  const service = await startServer();
  t.after(() => service.stop());
  const headers = { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN };

  const created = await fetch(`${service.origin}/api/cases`, {
    method: 'POST', headers, body: JSON.stringify(confirmedCase(801)),
  });
  const caseId = (await created.json()).case.id;

  // A disputed debt: task 8's first named category.
  await fetch(`${service.origin}/api/cases/${caseId}/eligibility`, {
    method: 'PUT', headers, body: JSON.stringify({ answers: { ...IN_SCOPE_ANSWERS, debtDisputed: 'yes' } }),
  });

  // The case read carries the same verdict the gate will enforce.
  const detail = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  const { delivery } = await detail.json();
  assert.equal(delivery.allowed, false);
  assert.equal(delivery.route, 'professional_review');
  assert.ok(delivery.codes.includes('dispute'));

  const draftResponse = await fetch(`${service.origin}/api/cases/${caseId}/drafts`, {
    method: 'POST', headers, body: JSON.stringify({ subject: 'Payment reminder', body: 'Please arrange payment.' }),
  });
  const draft = (await draftResponse.json()).case.drafts[0];

  // Approving the wording does not clear the case.
  const approved = await fetch(`${service.origin}/api/cases/${caseId}/drafts/${draft.id}/reviews`, {
    method: 'POST', headers, body: JSON.stringify({ action: 'approve', expectedVersion: 1 }),
  });
  assert.equal(approved.status, 200);

  const refused = await fetch(`${service.origin}/api/cases/${caseId}/drafts/${draft.id}/send-authorizations`, {
    method: 'POST', headers, body: JSON.stringify({ expectedVersion: 1 }),
  });
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).error, /qualified adviser/);

  // The refusal is audited with the route and every code that fired.
  const after = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  const events = (await after.json()).case.drafts[0].auditEvents;
  const last = events.at(-1);
  assert.equal(last.eventType, 'send_blocked');
  assert.equal(last.details.reason, 'escalation_required');
  assert.equal(last.details.route, 'professional_review');
  assert.ok(last.details.codes.includes('dispute'));
  // No authorization was recorded for an escalated case.
  assert.equal(events.some((event) => event.eventType === 'send_authorized'), false);
});
