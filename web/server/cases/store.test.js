import test from 'node:test';
import assert from 'node:assert/strict';
import { CaseInputError, CaseStore } from './store.js';

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
