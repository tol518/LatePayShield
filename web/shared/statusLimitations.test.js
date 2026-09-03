import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES, STATUS_ORDER } from '../src/lib/statuses.js';
import {
  MANDATORY_CLAUSES,
  isKnownStatus,
  mandatoryClauseCodes,
  mandatoryClauses,
  statusLabel,
  statusMeaning,
} from './statusLimitations.js';

test('every documented status has at least one limitation clause', () => {
  // A status with no clause would let an explanation stand with nothing said
  // about its edges, which is the failure docs/ui-language.md warns about.
  for (const status of STATUS_ORDER) {
    assert.ok(mandatoryClauses(status).length > 0, `${status} has no clause`);
  }
});

test('a finalised outcome carries all four clauses SKILLS.md names', () => {
  // Acceptance check 5: every PAID_VERIFIED and OVERDUE_VERIFIED explanation
  // must carry the memo, window-bounding, testnet and startLedger limitations.
  for (const status of ['PAID_VERIFIED', 'OVERDUE_VERIFIED']) {
    const codes = mandatoryClauseCodes(status);
    assert.deepEqual(
      [...codes].sort(),
      ['memo_not_checked', 'start_ledger_unverifiable', 'testnet_prototype', 'window_bounded'],
      `${status} is missing a mandatory clause`,
    );
  }
});

test('the clause texts carry the substance the specification requires', () => {
  assert.match(MANDATORY_CLAUSES.memo_not_checked, /destination tag/i);
  assert.match(MANDATORY_CLAUSES.memo_not_checked, /memo/i);
  assert.match(MANDATORY_CLAUSES.window_bounded, /ledger range and time window/i);
  assert.match(MANDATORY_CLAUSES.window_bounded, /testnet/i);
  assert.match(MANDATORY_CLAUSES.window_bounded, /not proof of a debt/i);
  assert.match(MANDATORY_CLAUSES.testnet_prototype, /unaudited/i);
  assert.match(MANDATORY_CLAUSES.testnet_prototype, /no legal or financial standing/i);
  assert.match(MANDATORY_CLAUSES.start_ledger_unverifiable, /cannot be corroborated on-chain/i);
});

test('every clause is stated as a limitation, never as a reassurance', () => {
  // The point of the list is what the evidence does not establish, so no clause
  // may read as a claim.
  for (const [code, clause] of Object.entries(MANDATORY_CLAUSES)) {
    assert.match(clause, /\b(does not|cannot|no |not )\b/i, `${code} does not read as a limitation`);
    assert.doesNotMatch(clause, /\bproves that\b|\bguarantees\b|\bconfirms that\b/i, `${code} reads as a claim`);
  }
});

test('a pending or failure status is never told it bounds a window it has not proved', () => {
  // OVERDUE_PENDING and OPERATIONAL_FAILURE must carry the window-bounding
  // clause, because those are the states a reader is most likely to read as
  // non-payment.
  for (const status of ['OVERDUE_PENDING', 'OPERATIONAL_FAILURE']) {
    assert.ok(mandatoryClauseCodes(status).includes('window_bounded'), status);
  }
  // And every status says it is a testnet prototype.
  for (const status of STATUS_ORDER) {
    assert.ok(mandatoryClauseCodes(status).includes('testnet_prototype'), status);
  }
});

test('recognises exactly the eight documented statuses', () => {
  for (const status of STATUS_ORDER) assert.equal(isKnownStatus(status), true);
  for (const status of ['SETTLED', 'paid_verified', '', null, undefined, 'toString', '__proto__']) {
    assert.equal(isKnownStatus(status), false, `${String(status)} must not be recognised`);
  }
  assert.deepEqual(STATUS_ORDER.length, Object.keys(STATUSES).length);
});

test('label and meaning come from the interface, so narration cannot drift', () => {
  assert.equal(statusLabel('OVERDUE_VERIFIED'), STATUSES.OVERDUE_VERIFIED.label);
  assert.equal(statusMeaning('OVERDUE_VERIFIED'), STATUSES.OVERDUE_VERIFIED.meaning);
  assert.equal(statusLabel('SETTLED'), null);
  assert.equal(statusMeaning('SETTLED'), null);
});

test('an unknown status yields no clauses rather than a default set', () => {
  assert.deepEqual(mandatoryClauses('SETTLED'), []);
  assert.deepEqual(mandatoryClauseCodes('SETTLED'), []);
});

test('the returned arrays cannot be mutated into the shared table', () => {
  const first = mandatoryClauseCodes('PAID_VERIFIED');
  first.push('invented_clause');
  assert.equal(mandatoryClauseCodes('PAID_VERIFIED').length, 4);
});
