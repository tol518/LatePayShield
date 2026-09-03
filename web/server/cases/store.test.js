import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CaseInputError, CaseStateError, CaseStore } from './store.js';

const OPERATOR = 'local-operator';
const OTHER_OPERATOR = 'second-operator';

function confirmedCase(overrides = {}) {
  return {
    agreementId: 8,
    invoiceNumber: 'INV-2026-008',
    supplierName: 'Northwind Studio Ltd',
    payerName: 'Contoso Ltd',
    invoiceCurrency: 'GBP',
    invoiceAmountMinorUnits: '125000',
    invoiceDueDate: '2026-09-29',
    paymentTermsText: 'Payment due within 30 days.',
    invoiceSourceName: 'invoice-008.pdf',
    invoiceSourceSha256: 'a'.repeat(64),
    sourceQuotes: { invoiceNumber: 'Invoice number INV-2026-008' },
    factsConfirmed: true,
    ...overrides,
  };
}

test('persists a human-confirmed case and a communication note', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    assert.equal(created.agreementId, 8);
    assert.equal(created.ownerId, OPERATOR);
    assert.equal(created.sourceQuotes.invoiceNumber, 'Invoice number INV-2026-008');
    assert.equal(created.communications.length, 0);

    const updated = store.addCommunication(created.id, {
      occurredAt: '2026-09-02T10:30:00.000Z',
      channel: 'email',
      direction: 'outbound',
      subject: 'Payment reminder',
      summary: 'Reminder sent; no response recorded yet.',
    }, OPERATOR);
    assert.equal(updated.communicationCount, 1);
    assert.equal(updated.communications[0].subject, 'Payment reminder');
    assert.equal(store.listCases(OPERATOR)[0].communicationCount, 1);
  } finally {
    store.close();
  }
});

test('rejects unconfirmed facts and duplicate agreement links', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    assert.throws(
      () => store.createCase(confirmedCase({ factsConfirmed: false }), OPERATOR),
      (error) => error instanceof CaseInputError && /Confirm the case facts/.test(error.message),
    );
    store.createCase(confirmedCase(), OPERATOR);
    assert.throws(
      () => store.createCase(confirmedCase(), OPERATOR),
      (error) => error instanceof CaseInputError && /already has a case file/.test(error.message),
    );
  } finally {
    store.close();
  }
});

test('rejects malformed case and communication fields', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    assert.throws(() => store.createCase(confirmedCase({ invoiceDueDate: 'not-a-date' }), OPERATOR), CaseInputError);
    const created = store.createCase(confirmedCase(), OPERATOR);
    assert.throws(() => store.addCommunication(created.id, {
      occurredAt: '2026-09-02T10:30:00.000Z',
      channel: 'chatbot',
      direction: 'outbound',
      summary: 'Invalid channel.',
    }, OPERATOR), CaseInputError);
  } finally {
    store.close();
  }
});

test('scopes every case read and write to the owning operator', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);

    // Another authenticated operator may not read, open, or append to a case
    // it does not own, even holding its exact identifier.
    assert.deepEqual(store.listCases(OTHER_OPERATOR), []);
    assert.equal(store.getCase(created.id, OTHER_OPERATOR), null);
    assert.equal(store.addCommunication(created.id, {
      occurredAt: '2026-09-02T10:30:00.000Z',
      channel: 'email',
      direction: 'outbound',
      summary: 'Should never be written.',
    }, OTHER_OPERATOR), null);
    assert.equal(store.getCase(created.id, OPERATOR).communicationCount, 0);
  } finally {
    store.close();
  }
});

test('refuses any case operation with no authorized operator', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    for (const operation of [
      () => store.listCases(),
      () => store.getCase('00000000-0000-4000-8000-000000000000'),
      () => store.createCase(confirmedCase()),
      () => store.addCommunication('00000000-0000-4000-8000-000000000000', {}),
    ]) {
      assert.throws(operation, /authorized operator ID is required/);
    }
  } finally {
    store.close();
  }
});

test('stores, replaces, and scopes eligibility answers', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    assert.equal(created.eligibility, null);

    const saved = store.saveEligibility(created.id, { debtDisputed: 'no', payerBasedInUk: 'yes' }, OPERATOR);
    assert.deepEqual(saved.eligibility.answers, { debtDisputed: 'no', payerBasedInUk: 'yes' });
    assert.match(saved.eligibility.assessedAt, /^\d{4}-\d{2}-\d{2}T/);

    // Saving again replaces the single answer set rather than appending one.
    const replaced = store.saveEligibility(created.id, { debtDisputed: 'unknown' }, OPERATOR);
    assert.deepEqual(replaced.eligibility.answers, { debtDisputed: 'unknown' });
    assert.deepEqual(store.getCase(created.id, OPERATOR).eligibility.answers, { debtDisputed: 'unknown' });

    // No outcome is persisted; the row holds answers and a timestamp only.
    assert.deepEqual(Object.keys(replaced.eligibility).sort(), ['answers', 'assessedAt']);

    assert.equal(store.saveEligibility(created.id, { debtDisputed: 'no' }, OTHER_OPERATOR), null);
    assert.deepEqual(store.getCase(created.id, OPERATOR).eligibility.answers, { debtDisputed: 'unknown' });
  } finally {
    store.close();
  }
});

test('rejects an eligibility answer map it cannot trust', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    for (const answers of [{ isTheClaimStrong: 'yes' }, { debtDisputed: 'probably' }, 'yes', null]) {
      assert.throws(() => store.saveEligibility(created.id, answers, OPERATOR), CaseInputError);
    }
    assert.equal(store.getCase(created.id, OPERATOR).eligibility, null);
    assert.throws(() => store.saveEligibility(created.id, { debtDisputed: 'no' }), /authorized operator ID is required/);
  } finally {
    store.close();
  }
});
test('persists a draft and requires approval before authorizing a send hand-off', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    // This test is about the approval gate, so clear the task 8 routing gate
    // first: an unanswered questionnaire blocks delivery on its own.
    store.saveEligibility(created.id, inScopeAnswers(), OPERATOR);
    const withDraft = store.createDraft(created.id, {
      purpose: 'payment_reminder',
      subject: 'Invoice INV-2026-008 is overdue',
      body: 'Please arrange payment or contact us if there is a problem.',
      citations: [],
    }, OPERATOR);
    const draft = withDraft.drafts[0];

    assert.equal(draft.status, 'draft');
    assert.equal(draft.version, 1);
    assert.equal(draft.authorType, 'human');
    assert.equal(draft.auditEvents[0].eventType, 'draft_created');
    assert.throws(
      () => store.authorizeDraftSend(created.id, draft.id, { expectedVersion: 1 }, OPERATOR),
      (error) => error instanceof CaseStateError && /must be approved/.test(error.message),
    );
    assert.equal(store.getCase(created.id, OPERATOR).drafts[0].auditEvents.at(-1).eventType, 'send_blocked');

    const approvedCase = store.reviewDraft(created.id, draft.id, {
      action: 'approve',
      expectedVersion: 1,
    }, OPERATOR);
    assert.equal(approvedCase.drafts[0].status, 'approved');
    assert.equal(approvedCase.drafts[0].approvedVersion, 1);

    const authorization = store.authorizeDraftSend(created.id, draft.id, { expectedVersion: 1 }, OPERATOR);
    assert.equal(authorization.version, 1);
    assert.equal(authorization.transport, 'not_connected');
    assert.equal(authorization.sent, false);
    assert.equal(store.getCase(created.id, OPERATOR).drafts[0].auditEvents.at(-1).eventType, 'send_authorized');
  } finally {
    store.close();
  }
});

test('editing an approved draft creates a version and invalidates approval', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    const draft = store.createDraft(created.id, {
      subject: 'Payment reminder',
      body: 'Original body.',
    }, OPERATOR).drafts[0];
    store.reviewDraft(created.id, draft.id, { action: 'approve', expectedVersion: 1 }, OPERATOR);

    const updated = store.updateDraft(created.id, draft.id, {
      expectedVersion: 1,
      subject: 'Updated payment reminder',
      body: 'Edited body.',
    }, OPERATOR).drafts[0];
    assert.equal(updated.version, 2);
    assert.equal(updated.status, 'draft');
    assert.equal(updated.approvedVersion, null);
    assert.equal(updated.auditEvents.at(-1).eventType, 'draft_updated');
    assert.equal(updated.auditEvents.at(-1).details.approvalInvalidated, true);
    assert.throws(
      () => store.authorizeDraftSend(created.id, draft.id, { expectedVersion: 2 }, OPERATOR),
      CaseStateError,
    );
    assert.throws(
      () => store.reviewDraft(created.id, draft.id, { action: 'approve', expectedVersion: 1 }, OPERATOR),
      /changed after it was opened/,
    );
  } finally {
    store.close();
  }
});

test('rejected drafts and cross-operator draft operations cannot obtain send authorization', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    // As above: isolate the approval and ownership checks from task 8 routing.
    store.saveEligibility(created.id, inScopeAnswers(), OPERATOR);
    const draft = store.createDraft(created.id, {
      subject: 'Payment reminder',
      body: 'Draft body.',
    }, OPERATOR).drafts[0];
    const rejected = store.reviewDraft(created.id, draft.id, {
      action: 'reject',
      expectedVersion: 1,
      note: 'The amount needs checking.',
    }, OPERATOR).drafts[0];
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.auditEvents.at(-1).details.note, 'The amount needs checking.');
    assert.throws(
      () => store.authorizeDraftSend(created.id, draft.id, { expectedVersion: 1 }, OPERATOR),
      /must be approved/,
    );

    assert.equal(store.updateDraft(created.id, draft.id, {
      expectedVersion: 1,
      subject: 'Attempted edit',
      body: 'Should not be written.',
    }, OTHER_OPERATOR), null);
    assert.equal(store.reviewDraft(created.id, draft.id, {
      action: 'approve',
      expectedVersion: 1,
    }, OTHER_OPERATOR), null);
    assert.equal(store.authorizeDraftSend(created.id, draft.id, { expectedVersion: 1 }, OTHER_OPERATOR), null);
  } finally {
    store.close();
  }
});

test('records provenance when a proposed timeline entry is confirmed', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);

    const updated = store.addCommunication(created.id, {
      occurredAt: '2026-08-02T09:00:00.000Z',
      channel: 'phone',
      direction: 'inbound',
      summary: 'Payer said on the call that the payment had been approved.',
      authorType: 'local_llm',
      sourceQuote: 'he said the payment had been approved',
      sourceSha256: 'b'.repeat(64),
      modelName: 'mlx-community/Qwen3-8B-4bit',
    }, OPERATOR);

    const entry = updated.communications[0];
    assert.equal(entry.authorType, 'local_llm');
    assert.equal(entry.sourceQuote, 'he said the payment had been approved');
    assert.equal(entry.sourceSha256, 'b'.repeat(64));
    assert.equal(entry.modelName, 'mlx-community/Qwen3-8B-4bit');
    // Confirmation is the write, so the confirming operator and time are known
    // for every stored entry.
    assert.equal(entry.confirmedBy, OPERATOR);
    assert.match(entry.confirmedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    store.close();
  }
});

test('a manually typed timeline entry stays distinguishable from a confirmed proposal', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    const updated = store.addCommunication(created.id, {
      occurredAt: '2026-09-02T10:30:00.000Z',
      channel: 'email',
      direction: 'outbound',
      summary: 'Reminder sent; no response recorded yet.',
    }, OPERATOR);

    const entry = updated.communications[0];
    assert.equal(entry.authorType, 'human');
    assert.equal(entry.sourceQuote, null);
    assert.equal(entry.sourceSha256, null);
    assert.equal(entry.modelName, null);
    assert.equal(entry.confirmedBy, OPERATOR);
  } finally {
    store.close();
  }
});

test('refuses a model-authored timeline entry that has lost its grounding', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    const base = {
      occurredAt: '2026-08-02T09:00:00.000Z',
      channel: 'phone',
      direction: 'inbound',
      summary: 'Payer said the payment had been approved.',
      authorType: 'local_llm',
      sourceQuote: 'he said the payment had been approved',
      sourceSha256: 'b'.repeat(64),
    };
    for (const override of [
      { sourceQuote: '' },
      { sourceQuote: undefined },
      { sourceSha256: 'not-a-digest' },
      { sourceSha256: undefined },
      { authorType: 'solicitor' },
    ]) {
      assert.throws(
        () => store.addCommunication(created.id, { ...base, ...override }, OPERATOR),
        CaseInputError,
      );
    }
    assert.equal(store.getCase(created.id, OPERATOR).communications.length, 0);
  } finally {
    store.close();
  }
});

test('a case database written before provenance existed keeps its notes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'latepay-store-'));
  const databasePath = join(directory, 'cases.sqlite');
  try {
    // The shape this table had before timeline provenance was added.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE case_files (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL DEFAULT 'local-operator',
        agreement_id INTEGER NOT NULL UNIQUE,
        invoice_number TEXT NOT NULL,
        supplier_name TEXT NOT NULL,
        payer_name TEXT NOT NULL,
        invoice_currency TEXT,
        invoice_amount_minor_units TEXT,
        invoice_due_date TEXT NOT NULL,
        payment_terms_text TEXT,
        invoice_source_name TEXT,
        invoice_source_sha256 TEXT,
        source_quotes_json TEXT NOT NULL DEFAULT '{}',
        facts_confirmed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE case_communications (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES case_files(id) ON DELETE CASCADE,
        occurred_at TEXT NOT NULL,
        channel TEXT NOT NULL,
        direction TEXT NOT NULL,
        subject TEXT,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO case_files VALUES (
        'case-1', 'local-operator', 8, 'INV-2026-008', 'Northwind Studio Ltd', 'Contoso Ltd',
        'GBP', '125000', '2026-09-29', NULL, NULL, NULL, '{}',
        '2026-09-02T09:00:00.000Z', '2026-09-02T09:00:00.000Z', '2026-09-02T09:00:00.000Z'
      );
      INSERT INTO case_communications VALUES (
        'note-1', 'case-1', '2026-09-02T10:30:00.000Z', 'email', 'outbound',
        'Payment reminder', 'Reminder sent before provenance existed.', '2026-09-02T10:30:00.000Z'
      );
    `);
    legacy.close();

    const store = new CaseStore({ databasePath });
    try {
      const existing = store.getCase('case-1', OPERATOR);
      assert.equal(existing.communications.length, 1);
      assert.equal(existing.communications[0].summary, 'Reminder sent before provenance existed.');
      // An entry that predates provenance reads as the human note it was.
      assert.equal(existing.communications[0].authorType, 'human');
      assert.equal(existing.communications[0].sourceQuote, null);
      assert.equal(existing.communications[0].confirmedBy, null);

      // The migrated table still accepts a new confirmed proposal.
      const updated = store.addCommunication('case-1', {
        occurredAt: '2026-08-02T09:00:00.000Z',
        channel: 'phone',
        direction: 'inbound',
        summary: 'Payer said the payment had been approved.',
        authorType: 'local_llm',
        sourceQuote: 'he said the payment had been approved',
        sourceSha256: 'e'.repeat(64),
      }, OPERATOR);
      assert.equal(updated.communications.length, 2);
      assert.equal(updated.communications.find((item) => item.authorType === 'local_llm').sourceSha256, 'e'.repeat(64));
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Every eligibility question answered in the non-escalating direction. */
function inScopeAnswers(overrides = {}) {
  return {
    partiesActingInBusiness: 'yes',
    payerBasedInUk: 'yes',
    invoiceDelivered: 'yes',
    debtDisputed: 'no',
    payerInsolvencyProcess: 'no',
    courtProceedings: 'no',
    contractTermsOver60Days: 'no',
    debtOlderThanSixYears: 'no',
    ...overrides,
  };
}

function approvedDraft(store, caseId) {
  store.createDraft(caseId, { subject: 'Invoice reminder', body: 'Please arrange payment of the invoice.' }, OPERATOR);
  const draft = store.getCase(caseId, OPERATOR).drafts[0];
  store.reviewDraft(caseId, draft.id, { action: 'approve', expectedVersion: draft.version }, OPERATOR);
  return store.getCase(caseId, OPERATOR).drafts[0];
}

test('an escalated case cannot hand an approved draft to a transport', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    store.saveEligibility(created.id, inScopeAnswers({ debtDisputed: 'yes' }), OPERATOR);
    const draft = approvedDraft(store, created.id);

    // Approval is a statement about the wording; escalation is a statement
    // about the case, and it outranks it.
    assert.throws(
      () => store.authorizeDraftSend(created.id, draft.id, { expectedVersion: draft.version }, OPERATOR),
      /qualified adviser/,
    );

    const events = store.getCase(created.id, OPERATOR).drafts[0].auditEvents;
    const blocked = events.at(-1);
    assert.equal(blocked.eventType, 'send_blocked');
    assert.equal(blocked.details.reason, 'escalation_required');
    assert.equal(blocked.details.route, 'professional_review');
    assert.ok(blocked.details.codes.includes('dispute'));
  } finally {
    store.close();
  }
});

test('an incomplete questionnaire blocks the send gate even for an approved draft', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    const draft = approvedDraft(store, created.id);

    // No answers saved at all: whether this case may be handled automatically
    // is unknown, and unknown is not permission.
    assert.throws(
      () => store.authorizeDraftSend(created.id, draft.id, { expectedVersion: draft.version }, OPERATOR),
      /not complete/,
    );
    assert.equal(
      store.getCase(created.id, OPERATOR).drafts[0].auditEvents.at(-1).details.route,
      'operator_action',
    );
  } finally {
    store.close();
  }
});

test('an in-scope case with a complete questionnaire still passes the send gate', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    store.saveEligibility(created.id, inScopeAnswers(), OPERATOR);
    const draft = approvedDraft(store, created.id);

    const authorization = store.authorizeDraftSend(created.id, draft.id, { expectedVersion: draft.version }, OPERATOR);
    assert.equal(authorization.version, draft.version);
    assert.equal(authorization.sent, false);
    assert.equal(authorization.transport, 'not_connected');
    assert.equal(
      store.getCase(created.id, OPERATOR).drafts[0].auditEvents.at(-1).eventType,
      'send_authorized',
    );
  } finally {
    store.close();
  }
});

test('a high-value invoice blocks the send gate from the case facts alone', () => {
  const store = new CaseStore({ databasePath: ':memory:', highValueThresholdMinorUnits: 100000 });
  try {
    // The case fixture records 125000 minor units, above this threshold.
    const created = store.createCase(confirmedCase(), OPERATOR);
    store.saveEligibility(created.id, inScopeAnswers(), OPERATOR);
    const draft = approvedDraft(store, created.id);

    assert.throws(
      () => store.authorizeDraftSend(created.id, draft.id, { expectedVersion: draft.version }, OPERATOR),
      /qualified adviser/,
    );
    assert.ok(
      store.getCase(created.id, OPERATOR).drafts[0].auditEvents.at(-1).details.codes.includes('high_value'),
    );
  } finally {
    store.close();
  }
});

test('the routing decision is readable, and scoped to the owning operator', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    store.saveEligibility(created.id, inScopeAnswers({ payerInsolvencyProcess: 'yes' }), OPERATOR);

    const decision = store.deliveryDecisionFor(created.id, OPERATOR);
    assert.equal(decision.allowed, false);
    assert.equal(decision.route, 'professional_review');
    assert.ok(decision.codes.includes('insolvency'));

    assert.equal(store.deliveryDecisionFor(created.id, OTHER_OPERATOR), null);
  } finally {
    store.close();
  }
});
