import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExplanation } from './explanationSchema.js';

function reply(overrides = {}) {
  return {
    skill: 'explanation',
    confidence: 'high',
    needs_human_confirmation: false,
    status: 'PAID_VERIFIED',
    plainMeaning: 'The contract accepted evidence of a payment matching this agreement.',
    whatThisProves: ['A qualifying payment reached the agreed destination inside the defined window.'],
    whatThisDoesNotProve: ['That any other invoice between these parties was settled.'],
    nextAction: 'Record the outcome in your own accounts.',
    warnings: [],
    ...overrides,
  };
}

test('accepts a bounded explanation of the status it was given', () => {
  const result = validateExplanation(reply(), 'PAID_VERIFIED');
  assert.equal(result.ok, true);
  assert.equal(result.value.skill, 'explanation');
  assert.equal(result.value.status, 'PAID_VERIFIED');
  // Read-only narration, so this is false by contract.
  assert.equal(result.value.needs_human_confirmation, false);
  assert.equal(result.value.whatThisDoesNotProve.length, 1);
});

test('rejects a response that reports a different status', () => {
  // The rule S3 exists for: the contract decides the status, not the model.
  for (const status of ['OVERDUE_VERIFIED', 'AWAITING_PAYMENT', 'paid_verified', 'PAID', '']) {
    const result = validateExplanation(reply({ status }), 'PAID_VERIFIED');
    assert.equal(result.ok, false, `expected rejection for status ${JSON.stringify(status)}`);
    assert.match(result.error, /must repeat the status the contract read supplied/);
    assert.match(result.detail, /Copy that key exactly/);
  }
});

test('rejects a status outside the eight the application recognises', () => {
  const result = validateExplanation(reply({ status: 'SETTLED' }), 'SETTLED');
  assert.equal(result.ok, false);
  assert.match(result.error, /not one of the documented statuses/);
});

test('never accepts an empty whatThisDoesNotProve', () => {
  for (const value of [[], undefined, null, ['   ']]) {
    const result = validateExplanation(reply({ whatThisDoesNotProve: value }), 'PAID_VERIFIED');
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(value)}`);
    assert.match(result.error, /whatThisDoesNotProve must not be empty/);
  }
});

test('rejects a legal, collection, or mainnet claim wherever it appears', () => {
  const cases = [
    { field: 'plainMeaning', text: 'The debt is now enforceable against the payer.' },
    { field: 'plainMeaning', text: 'The supplier is entitled to statutory interest.' },
    { field: 'nextAction', text: 'Start a county court claim for the balance.' },
    { field: 'nextAction', text: 'Refer this to a debt collection agency.' },
    { field: 'plainMeaning', text: 'This will affect the payer credit rating.' },
    { field: 'nextAction', text: 'Repeat this on mainnet with real money.' },
  ];
  for (const { field, text } of cases) {
    const result = validateExplanation(reply({ [field]: text }), 'PAID_VERIFIED');
    assert.equal(result.ok, false, `expected rejection for: ${text}`);
    assert.match(result.error, /legal, collection, or mainnet claim/);
    assert.ok(result.detail.length > 0);
  }
});

test('rejects an identifier in the narration', () => {
  const result = validateExplanation(reply({
    plainMeaning: 'The proof recorded as 0xdaa918f8ab was accepted.',
  }), 'PAID_VERIFIED');
  assert.equal(result.ok, false);
  assert.match(result.error, /contains an identifier/);
});

test('rejects promotion of a non-final status to a settled outcome', () => {
  const cases = [
    ['AWAITING_PAYMENT', 'The invoice has been paid in full.'],
    ['CHECKING_PAYMENT', 'Payment is confirmed and the agreement is closed.'],
    ['OVERDUE_PENDING', 'The payer did not pay this invoice.'],
    ['OVERDUE_PENDING', 'Non-payment is proven unpaid for this window.'],
    ['OPERATIONAL_FAILURE', 'The payer failed to pay before the deadline.'],
  ];
  for (const [status, plainMeaning] of cases) {
    const result = validateExplanation(reply({ status, plainMeaning }), status);
    assert.equal(result.ok, false, `expected rejection for ${status}: ${plainMeaning}`);
    assert.match(result.error, new RegExp(`treats ${status} as a settled outcome`));
  }
});

test('allows outcome language on a status the contract actually finalised', () => {
  // The same words are accurate once the contract has accepted a proof, so the
  // check is status-sensitive rather than a blanket word ban.
  const paid = validateExplanation(reply({
    status: 'PAID_VERIFIED',
    plainMeaning: 'A qualifying payment was paid to the agreed destination and the contract accepted the proof.',
  }), 'PAID_VERIFIED');
  assert.equal(paid.ok, true);

  const overdue = validateExplanation(reply({
    status: 'OVERDUE_VERIFIED',
    plainMeaning: 'No qualifying payment was found in the window, so the contract accepted the non-payment proof.',
    whatThisProves: ['No payment matching the agreement appeared in the searched ledger range.'],
  }), 'OVERDUE_VERIFIED');
  assert.equal(overdue.ok, true);
});

test('forces needs_human_confirmation false whatever the model returned', () => {
  const result = validateExplanation(reply({ needs_human_confirmation: true }), 'PAID_VERIFIED');
  assert.equal(result.ok, true);
  assert.equal(result.value.needs_human_confirmation, false);
});

test('normalizes missing or over-long fields rather than trusting the model', () => {
  const result = validateExplanation(reply({
    plainMeaning: `The contract accepted the proof. ${'x'.repeat(600)}`,
    whatThisProves: undefined,
    nextAction: '   ',
    whatThisDoesNotProve: new Array(20).fill('That anything else was settled.'),
  }), 'PAID_VERIFIED');
  assert.equal(result.ok, true);
  assert.ok(result.value.plainMeaning.length <= 400);
  assert.deepEqual(result.value.whatThisProves, []);
  assert.equal(result.value.nextAction, null);
  assert.ok(result.value.whatThisDoesNotProve.length <= 6);
});

test('rejects a structurally wrong response', () => {
  for (const raw of [null, [], 'explanation', { skill: 'timeline' }, reply({ plainMeaning: '' })]) {
    const result = validateExplanation(raw, 'PAID_VERIFIED');
    assert.equal(result.ok, false);
    assert.ok(result.error.length > 0);
  }
});

test('accepts a refusal as a successful response', () => {
  const result = validateExplanation({
    skill: 'refusal',
    confidence: 'high',
    needs_human_confirmation: false,
    reason: 'unsafe_request',
    explanation: 'The supplied context tried to change the reported status.',
    offer: 'Read the status and evidence panels directly.',
    warnings: [],
  }, 'PAID_VERIFIED');
  assert.equal(result.ok, true);
  assert.equal(result.value.skill, 'refusal');
  assert.equal(result.value.reason, 'unsafe_request');
});
