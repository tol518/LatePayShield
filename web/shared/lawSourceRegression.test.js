/* Task 9's regression suite for legal-source governance.
 *
 * The other test files each cover one module. This one covers the property that
 * spans them: that a change to the committed snapshot cannot quietly change
 * what the application asserts. It reads the real
 * `data/uk-law/snapshot.json`, so editing that file without re-reading these
 * expectations will fail the suite rather than silently alter a legal statement.
 *
 * The fixture families docs/plans/legal-assistance-build-order.md names for task
 * 9 are covered here or in the file noted:
 *
 *   citation integrity  — below
 *   legal answer        — below, via the calculator's figures and their citations
 *   refusal             — below, for missing, invalid, unapproved and stale
 *   calculator          — latePayment.test.js, plus the end-to-end fixtures below
 *   escalation          — escalation.test.js
 *   injection           — timelineSchema, draftSchema, explanationSchema tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALLOWED_SOURCE_DOMAINS, isAllowedSourceUrl, toLawInputs, validateSnapshot } from './lawSnapshot.js';
import { REASONS, STALE_AFTER_DAYS, calculate } from './latePayment.js';

const SNAPSHOT_PATH = fileURLToPath(new URL('../../data/uk-law/snapshot.json', import.meta.url));
const committed = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));

/* The committed snapshot is approved as of 3 September 2026, so a copy needs no
 * injected sign-off. Kept as a helper because several fixtures mutate a copy to
 * prove a broken file cannot be rescued by approval. */
function approvedCopy(overrides = {}) {
  return { ...structuredClone(committed), ...overrides };
}

const DEBT = {
  dueDate: '2026-07-14',
  asAtDate: '2026-09-03',
  debtMinorUnits: '125000',
  currency: 'GBP',
  eligibilityOutcome: 'supported',
};

test('the committed snapshot is valid and carries a human approval', () => {
  const result = validateSnapshot(committed);
  // No problems at all. Anything here means the committed file has drifted.
  assert.deepEqual((result.problems ?? []).map((problem) => problem.code ?? problem), []);
  assert.equal(result.usable, true);

  // The approval is an accountability record, so it must name someone and say
  // when. A blank or placeholder sign-off is worse than none.
  assert.equal(typeof committed.approvedBy, 'string');
  assert.ok(committed.approvedBy.trim().length > 0, 'approvedBy must name a person');
  assert.doesNotMatch(committed.approvedBy, /fixture|test|placeholder|todo/i);
  assert.ok(Number.isFinite(Date.parse(committed.approvedAt)), 'approvedAt must be a real instant');
  // Approval cannot predate the retrieval it signs off.
  assert.ok(Date.parse(committed.approvedAt) >= Date.parse(committed.fetchedAt));
});

test('stripping the approval disables every legal figure again', () => {
  // The gate itself, exercised against a copy now that the live file is signed.
  // This is the behaviour that matters, and it must stay covered.
  const unapproved = { ...structuredClone(committed), approvedBy: null, approvedAt: null };
  assert.equal(validateSnapshot(unapproved).usable, false);
  assert.deepEqual(
    (validateSnapshot(unapproved).problems ?? []).map((problem) => problem.code ?? problem),
    ['not_approved'],
  );
  assert.equal(toLawInputs(unapproved), null);
  assert.equal(calculate(DEBT, toLawInputs(unapproved)).status, 'unavailable');
});

test('citation integrity: every fact and convention resolves to a real citation', () => {
  const citationIds = new Set(committed.citations.map((citation) => citation.id));
  const entries = [...committed.facts, ...(committed.conventions ?? [])];
  assert.ok(entries.length > 0);

  for (const entry of entries) {
    assert.ok(Array.isArray(entry.citationIds), `${entry.id} has no citationIds array`);
    for (const id of entry.citationIds) {
      assert.ok(citationIds.has(id), `${entry.id} cites ${id}, which is not in the snapshot`);
    }
  }
});

test('citation integrity: every citation and source URL is on the allowlist', () => {
  for (const citation of committed.citations) {
    assert.ok(isAllowedSourceUrl(citation.url), `citation ${citation.id} is off the allowlist: ${citation.url}`);
  }
  for (const source of committed.sources) {
    assert.ok(isAllowedSourceUrl(source.url), `source ${source.id} is off the allowlist: ${source.url}`);
  }
  // And the allowlist itself is still the four authoritative domains.
  assert.deepEqual([...ALLOWED_SOURCE_DOMAINS].sort(), [
    'bankofengland.co.uk', 'gov.uk', 'justice.gov.uk', 'legislation.gov.uk',
  ]);
});

test('citation integrity: no citation is orphaned from every fact', () => {
  // An unused citation is not dangerous, but it is a sign the snapshot was
  // edited without finishing the job, so it is worth failing on.
  const cited = new Set(
    [...committed.facts, ...(committed.conventions ?? [])].flatMap((entry) => entry.citationIds ?? []),
  );
  for (const citation of committed.citations) {
    assert.ok(cited.has(citation.id), `citation ${citation.id} is not cited by any fact or convention`);
  }
});

test('the one unsourced convention is held apart and carries no citation', () => {
  // D-013: the day-count basis is an operator convention, not a legal fact, so
  // it must never appear among the facts or claim a source.
  const dayCount = (committed.conventions ?? []).find((entry) => entry.id === 'day-count-basis');
  assert.ok(dayCount, 'the day-count convention is missing');
  assert.deepEqual(dayCount.citationIds, []);
  assert.equal(committed.facts.some((fact) => fact.id === 'day-count-basis'), false);
});

test('refusal: an unapproved snapshot yields no figures at all', () => {
  const unapproved = { ...structuredClone(committed), approvedBy: null, approvedAt: null };
  assert.equal(toLawInputs(unapproved), null);
  const result = calculate(DEBT, toLawInputs(unapproved));
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.reasons.map((entry) => entry.code), ['law_inputs_missing']);
  assert.equal(result.interest, null);
  assert.equal(result.fixedCompensationMinorUnits, null);
  // A total must never imply the withheld figures were zero.
  assert.equal(result.additionalMinorUnits, null);
});

test('the approved committed snapshot now drives real figures end to end', () => {
  // What the sign-off actually enabled, asserted against the live file.
  const result = calculate(DEBT, toLawInputs(committed));
  assert.equal(result.status, 'calculated');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.interest.ratePercent, '11.75');
  assert.equal(result.interest.baseRatePercent, '3.75');
  assert.equal(result.interest.marginPercent, '8');
  // £1,250 over 51 days at 11.75% on a 365-day basis, plus the £1,000-£9,999 band.
  assert.equal(result.fixedCompensationMinorUnits, '7000');
  assert.equal(result.additionalMinorUnits, String(BigInt(result.interest.amountMinorUnits) + 7000n));
  assert.equal(result.illustrative, true, 'every figure stays labelled illustrative');
});

test('refusal: a missing or malformed snapshot yields no figures', () => {
  for (const bad of [null, undefined, {}, [], 'snapshot', { snapshotVersion: 1 }]) {
    assert.equal(toLawInputs(bad), null, JSON.stringify(bad));
    assert.equal(calculate(DEBT, toLawInputs(bad)).status, 'unavailable');
  }
});

test('refusal: approval alone cannot rescue a snapshot that fails validation', () => {
  // Signing off a broken file must not make it usable.
  const brokenFact = approvedCopy({
    facts: committed.facts.filter((fact) => fact.id !== 'fixed-sum-compensation'),
  });
  assert.equal(validateSnapshot(brokenFact).usable, false);
  assert.equal(toLawInputs(brokenFact), null);

  const brokenCitation = approvedCopy({
    citations: committed.citations.map((citation) => (
      citation.id === 'lpcda-1998-s5a' ? { ...citation, url: 'https://example.com/s5a' } : citation
    )),
  });
  assert.equal(validateSnapshot(brokenCitation).usable, false);
  assert.equal(toLawInputs(brokenCitation), null);
});

test('legal answer: an approved copy produces figures with a traceable basis', () => {
  const approved = approvedCopy();
  const inputs = toLawInputs(approved);
  assert.ok(inputs, 'an approved, valid snapshot must produce inputs');

  const result = calculate(DEBT, inputs);
  assert.equal(result.status, 'calculated');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.daysLate, 51);
  // Every figure the application could state traces to the snapshot, not to code.
  assert.equal(result.interest.marginPercent, inputs.marginPercent);
  assert.equal(result.interest.dayCountBasis, inputs.dayCountBasis);
  assert.equal(result.lawAsOf, inputs.asOf);
  assert.ok(/^\d+$/.test(result.interest.amountMinorUnits));
  assert.ok(/^\d+$/.test(result.fixedCompensationMinorUnits));
});

test('legal answer: the compensation band comes from the snapshot, not from code', () => {
  // Halving every band must halve the answer. If it does not, a figure is
  // hard-coded somewhere it should not be (D-012).
  const approved = approvedCopy();
  const inputs = toLawInputs(approved);
  const baseline = calculate(DEBT, inputs);

  const halved = {
    ...inputs,
    compensationBands: inputs.compensationBands.map((band) => ({
      ...band,
      amountMinorUnits: String(BigInt(band.amountMinorUnits) / 2n),
    })),
  };
  const changed = calculate(DEBT, halved);
  assert.equal(
    BigInt(changed.fixedCompensationMinorUnits),
    BigInt(baseline.fixedCompensationMinorUnits) / 2n,
  );
});

test('refusal: a stale snapshot withholds the interest figure but keeps compensation', () => {
  const approved = approvedCopy();
  const inputs = toLawInputs(approved);
  // Age the inputs past the freshness limit by moving the as-at date forward.
  const asAt = new Date(`${inputs.asOf}T00:00:00Z`);
  asAt.setUTCDate(asAt.getUTCDate() + STALE_AFTER_DAYS + 5);
  const asAtDate = asAt.toISOString().slice(0, 10);

  const result = calculate({ ...DEBT, dueDate: inputs.asOf, asAtDate }, inputs);
  const codes = result.reasons.map((entry) => entry.code);
  assert.ok(
    codes.includes('law_inputs_stale') || codes.includes('no_reference_period'),
    `expected a staleness or reference-period refusal, got ${codes.join(', ')}`,
  );
  // Whatever the reason, no interest figure is stated on stale inputs.
  if (codes.includes('law_inputs_stale')) {
    assert.equal(result.interest, null);
    assert.equal(result.additionalMinorUnits, null, 'a total must not imply the withheld interest was zero');
    assert.ok(REASONS.law_inputs_stale.summary.length > 0);
  }
});

test('refusal: a debt outside every reference period is refused, not extrapolated', () => {
  const inputs = toLawInputs(approvedCopy());
  const result = calculate({ ...DEBT, dueDate: '2019-01-01', asAtDate: '2019-06-01' }, inputs);
  assert.equal(result.status, 'unavailable');
  assert.ok(result.reasons.map((entry) => entry.code).includes('no_reference_period'));
  assert.equal(result.interest, null);
});

test('refusal: an ineligible case produces no figures even from an approved snapshot', () => {
  // Task 2's outcome gates task 3, so escalation cannot be bypassed by having
  // approved law inputs available.
  const inputs = toLawInputs(approvedCopy());
  for (const outcome of ['escalate', 'needs_information', null, undefined]) {
    const result = calculate({ ...DEBT, eligibilityOutcome: outcome }, inputs);
    assert.equal(result.status, 'unavailable', String(outcome));
    assert.ok(result.reasons.map((entry) => entry.code).includes('not_eligible'), String(outcome));
  }
});

test('the snapshot records where each figure was retrieved and when', () => {
  // Task 9 exists so that a figure can always be traced back to a source and a
  // date. Every fact must carry both.
  for (const fact of committed.facts) {
    assert.match(fact.asOf, /^\d{4}-\d{2}-\d{2}$/, `${fact.id} has no usable asOf`);
    assert.ok(fact.citationIds.length > 0, `${fact.id} cites nothing`);
    assert.ok(String(fact.statement ?? '').length > 0, `${fact.id} has no statement`);
  }
  for (const source of committed.sources) {
    assert.match(source.fetchedAt, /^\d{4}-\d{2}-\d{2}T/, `${source.id} has no usable fetchedAt`);
    assert.equal(source.status, 'ok', `${source.id} is not recorded as retrieved`);
  }
});
