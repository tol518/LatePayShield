# Late-Payment Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship task 3 of the legal-assistance build order: a deterministic late-payment calculator so no language model ever performs authoritative arithmetic.

**Architecture:** One pure ESM module, `web/shared/latePayment.js`, exporting `calculate(caseFacts, lawInputs)`. Every legal value — the margin, the reference rates, the compensation bands, the day-count basis — arrives as an input, so the module is buildable and fully testable before task 4's approved snapshot exists, and no snapshot value can ever drift from a hardcoded copy. Money is integer minor units in `BigInt`; dates are calendar strings differenced in UTC; the module never reads a clock.

**Tech Stack:** Node 22+ (`node:test`), plain ESM. No new dependencies. No UI, no route, no storage.

**Design document:** [`2026-09-02-late-payment-calculator-design.md`](2026-09-02-late-payment-calculator-design.md)

## Global Constraints

- **Branch and commit policy.** All work happens on `feat/late-payment-calculator`. The user has approved one commit per task on that branch, and nothing else: never amend, never push, never tag, never merge, and never touch `main`.
- **Commit messages.** Short, plain, human sounding, no em dashes. No `Co-Authored-By` trailer, no "Generated with" line, and no mention of Claude, Anthropic, or AI anywhere in the message.
- No new npm dependencies.
- **No legal value may appear in the module.** Not the margin over base rate, not the £40/£70/£100 compensation bands, not the 365-day basis, not any base rate. They arrive as inputs. `STALE_AFTER_DAYS = 90` is the sole exception: it is this repository's own policy, not a fact about the law.
- `web/shared/latePayment.js` must stay pure: no `node:` imports, no `import.meta.env`, no `fetch`, and no reading of the current time. `asAtDate` is always supplied by the caller.
- **No float may touch a monetary value.** Money is `BigInt` in minor units throughout, crossing the module boundary as decimal strings.
- The module never calls `new Date(string)`. Dates are parsed from their year, month and day components and differenced in UTC.
- Interest is simple, never compounded, and is rounded half up to the nearest penny exactly once, at the end.
- Status values are exactly `calculated` and `unavailable`. An `unavailable` result carries `null` for `interest`, `fixedCompensationMinorUnits` and `additionalMinorUnits`.
- `illustrative` is `true` on every result without exception.
- No string may state a legal conclusion. Nothing says a sum is owed, that a debt is recoverable, that a claim is barred, or what a court would do.
- Follow the conventions already in `web/shared/eligibility.js`: frozen reason catalogue, `{ code, summary }` reasons, comments that explain a non-obvious why. Never reference a doc path, a spec, or a task number in a code comment, and never write a comment that reads as machine-generated.
- Test command: `npm --prefix web test`. The `shared/*.test.js` glob is already in the script, so a new test file there is picked up with no change.

---

### Task 1: The calculator module

**Files:**
- Create: `web/shared/latePayment.js`
- Create: `web/shared/latePayment.test.js`

**Interfaces:**
- Consumes: nothing. `eligibilityOutcome` arrives as a plain string, so this module does not import `web/shared/eligibility.js`.
- Produces:
  - `STALE_AFTER_DAYS` — `90`.
  - `REASONS` — frozen object keyed by reason code, each `{ status, summary }`.
  - `calculate(caseFacts, lawInputs)` — returns a result object whose keys are always exactly `status`, `reasons`, `dueDate`, `asAtDate`, `daysLate`, `debtMinorUnits`, `currency`, `interest`, `fixedCompensationMinorUnits`, `additionalMinorUnits`, `lawAsOf`, `illustrative`.

Every fixture figure below was computed with `BigInt` before this plan was written. They are correct; do not adjust a number to make a test pass.

- [ ] **Step 1: Write the failing test**

Create `web/shared/latePayment.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { REASONS, STALE_AFTER_DAYS, calculate } from './latePayment.js';

/** Law inputs a fixture supplies. No value here is an approved legal figure. */
function lawInputs(overrides = {}) {
  return {
    asOf: '2026-10-01',
    marginPercent: '8',
    dayCountBasis: 365,
    referencePeriods: [
      { start: '2026-01-01', end: '2026-06-30', baseRatePercent: '4.75' },
      { start: '2026-07-01', end: '2026-12-31', baseRatePercent: '4.25' },
    ],
    compensationBands: [
      { upToMinorUnits: '99999', amountMinorUnits: '4000' },
      { upToMinorUnits: '999999', amountMinorUnits: '7000' },
      { upToMinorUnits: null, amountMinorUnits: '10000' },
    ],
    ...overrides,
  };
}

function caseFacts(overrides = {}) {
  return {
    eligibilityOutcome: 'supported',
    debtMinorUnits: '125000',
    currency: 'GBP',
    dueDate: '2026-09-29',
    asAtDate: '2026-11-15',
    ...overrides,
  };
}

function codes(result) {
  return result.reasons.map((reason) => reason.code);
}

test('produces the worked example end to end', () => {
  const result = calculate(caseFacts(), lawInputs());
  assert.equal(result.status, 'calculated');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.dueDate, '2026-09-29');
  assert.equal(result.asAtDate, '2026-11-15');
  assert.equal(result.daysLate, 47);
  assert.equal(result.debtMinorUnits, '125000');
  assert.equal(result.currency, 'GBP');
  assert.equal(result.lawAsOf, '2026-10-01');
  assert.equal(result.illustrative, true);
  // 125000p at 12.25% for 47 days on a 365-day basis is 1971.7465... pence.
  assert.deepEqual(result.interest, {
    ratePercent: '12.25',
    baseRatePercent: '4.25',
    marginPercent: '8',
    referencePeriod: { start: '2026-07-01', end: '2026-12-31' },
    dayCountBasis: 365,
    amountMinorUnits: '1972',
  });
  assert.equal(result.fixedCompensationMinorUnits, '7000');
  assert.equal(result.additionalMinorUnits, '8972');
});

test('selects the fixed compensation band at each boundary', () => {
  for (const [debtMinorUnits, expected] of [
    ['99999', '4000'],
    ['100000', '7000'],
    ['999999', '7000'],
    ['1000000', '10000'],
  ]) {
    const result = calculate(caseFacts({ debtMinorUnits }), lawInputs());
    assert.equal(result.fixedCompensationMinorUnits, expected, `debt ${debtMinorUnits}`);
  }
});

test('counts whole days across a leap day', () => {
  const result = calculate(
    caseFacts({ dueDate: '2028-02-27', asAtDate: '2028-03-01' }),
    lawInputs({
      asOf: '2028-01-15',
      referencePeriods: [{ start: '2028-01-01', end: '2028-06-30', baseRatePercent: '5' }],
    }),
  );
  // 28 February, 29 February, 1 March.
  assert.equal(result.daysLate, 3);
  assert.equal(result.status, 'calculated');
});

test('reports a debt that is not yet late without figures', () => {
  for (const asAtDate of ['2026-09-29', '2026-09-01']) {
    const result = calculate(caseFacts({ asAtDate }), lawInputs());
    assert.equal(result.status, 'calculated', asAtDate);
    assert.deepEqual(codes(result), ['not_yet_late'], asAtDate);
    assert.equal(result.daysLate, 0, asAtDate);
    assert.equal(result.interest, null, asAtDate);
    assert.equal(result.fixedCompensationMinorUnits, null, asAtDate);
    assert.equal(result.additionalMinorUnits, '0', asAtDate);
  }
});

test('applies the rate of the period the debt became late in', () => {
  const firstHalf = calculate(
    caseFacts({ dueDate: '2026-03-31', asAtDate: '2026-04-30' }),
    lawInputs({ asOf: '2026-04-01' }),
  );
  assert.equal(firstHalf.interest.baseRatePercent, '4.75');
  assert.equal(firstHalf.interest.ratePercent, '12.75');
  assert.deepEqual(firstHalf.interest.referencePeriod, { start: '2026-01-01', end: '2026-06-30' });
  assert.equal(firstHalf.daysLate, 30);
  assert.equal(firstHalf.interest.amountMinorUnits, '1310');

  // Due on the last day of the first half, so the debt becomes late on 1 July
  // and the second half's rate governs the whole accrual.
  const boundary = calculate(
    caseFacts({ dueDate: '2026-06-30', asAtDate: '2026-12-01' }),
    lawInputs({ asOf: '2026-10-01' }),
  );
  assert.equal(boundary.interest.baseRatePercent, '4.25');
  assert.deepEqual(boundary.interest.referencePeriod, { start: '2026-07-01', end: '2026-12-31' });
});

test('refuses when no supplied period covers the date the debt became late', () => {
  const result = calculate(
    caseFacts({ dueDate: '2025-03-01', asAtDate: '2025-04-01' }),
    lawInputs({ asOf: '2025-03-15' }),
  );
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(codes(result), ['no_reference_period']);
  assert.equal(result.interest, null);
  assert.equal(result.fixedCompensationMinorUnits, null);
  assert.equal(result.additionalMinorUnits, null);
});

test('withholds interest past the staleness threshold but still gives compensation', () => {
  assert.equal(STALE_AFTER_DAYS, 90);

  // 17 August is exactly 90 days before 15 November; 16 August is 91.
  const fresh = calculate(caseFacts(), lawInputs({ asOf: '2026-08-17' }));
  assert.equal(fresh.status, 'calculated');
  assert.deepEqual(codes(fresh), []);
  assert.equal(fresh.interest.amountMinorUnits, '1972');

  const stale = calculate(caseFacts(), lawInputs({ asOf: '2026-08-16' }));
  assert.equal(stale.status, 'calculated');
  assert.deepEqual(codes(stale), ['law_inputs_stale']);
  assert.equal(stale.interest, null);
  assert.equal(stale.fixedCompensationMinorUnits, '7000');
  assert.equal(stale.additionalMinorUnits, '7000');
  assert.equal(stale.lawAsOf, '2026-08-16');
});

test('produces no figures unless eligibility reached a supported outcome', () => {
  for (const eligibilityOutcome of ['escalate', 'needs_information', undefined, 'anything']) {
    const result = calculate(caseFacts({ eligibilityOutcome }), lawInputs());
    assert.equal(result.status, 'unavailable', String(eligibilityOutcome));
    assert.ok(codes(result).includes('not_eligible'), String(eligibilityOutcome));
    assert.equal(result.interest, null);
    assert.equal(result.fixedCompensationMinorUnits, null);
    assert.equal(result.additionalMinorUnits, null);
  }
});

test('rounds a half penny up, once, at the end', () => {
  function oneDayAtOnePercent(debtMinorUnits) {
    return calculate(
      caseFacts({ debtMinorUnits, dueDate: '2026-09-29', asAtDate: '2026-09-30' }),
      lawInputs({
        marginPercent: '0',
        dayCountBasis: 2,
        referencePeriods: [{ start: '2026-07-01', end: '2026-12-31', baseRatePercent: '1' }],
      }),
    );
  }

  // 100p at 1% for one day on a two-day basis is exactly 0.5 pence.
  assert.equal(oneDayAtOnePercent('100').interest.amountMinorUnits, '1');
  // 300p on the same terms is exactly 1.5 pence.
  assert.equal(oneDayAtOnePercent('300').interest.amountMinorUnits, '2');
});

test('stays exact on a debt where floating-point arithmetic drifts', () => {
  const result = calculate(caseFacts({ debtMinorUnits: '987654321987654321' }), lawInputs());
  assert.equal(result.interest.amountMinorUnits, '15579232216010739');
  // The same sum through Number arithmetic lands a penny low.
  assert.equal(Math.round(987654321987654321 * 0.1225 * 47 / 365), 15579232216010738);
  assert.equal(result.fixedCompensationMinorUnits, '10000');
  assert.equal(result.additionalMinorUnits, '15579232216020739');
});

test('refuses law inputs it cannot read', () => {
  const cases = [
    ['missing', undefined, 'law_inputs_missing'],
    ['null', null, 'law_inputs_missing'],
    ['not an object', 'snapshot', 'law_inputs_invalid'],
    ['array', [], 'law_inputs_invalid'],
    ['bad margin', lawInputs({ marginPercent: '8%' }), 'law_inputs_invalid'],
    ['bad as-of date', lawInputs({ asOf: '2026-02-30' }), 'law_inputs_invalid'],
    ['no periods', lawInputs({ referencePeriods: [] }), 'law_inputs_invalid'],
    ['bad base rate', lawInputs({
      referencePeriods: [{ start: '2026-07-01', end: '2026-12-31', baseRatePercent: 'four' }],
    }), 'law_inputs_invalid'],
    ['period ends before it starts', lawInputs({
      referencePeriods: [{ start: '2026-12-31', end: '2026-07-01', baseRatePercent: '4.25' }],
    }), 'law_inputs_invalid'],
    ['no bands', lawInputs({ compensationBands: [] }), 'law_inputs_invalid'],
    ['no open top band', lawInputs({
      compensationBands: [{ upToMinorUnits: '999999', amountMinorUnits: '7000' }],
    }), 'law_inputs_invalid'],
    ['band amount in major units', lawInputs({
      compensationBands: [{ upToMinorUnits: null, amountMinorUnits: '70.00' }],
    }), 'law_inputs_invalid'],
    ['zero day count', lawInputs({ dayCountBasis: 0 }), 'law_inputs_invalid'],
    ['fractional day count', lawInputs({ dayCountBasis: 365.25 }), 'law_inputs_invalid'],
  ];

  for (const [label, input, expected] of cases) {
    const result = calculate(caseFacts(), input);
    assert.equal(result.status, 'unavailable', label);
    assert.deepEqual(codes(result), [expected], label);
    assert.equal(result.interest, null, label);
    assert.equal(result.lawAsOf, null, label);
  }
});

test('refuses case facts it cannot use', () => {
  for (const [label, overrides, expected] of [
    ['non-sterling', { currency: 'EUR' }, 'currency_not_gbp'],
    ['missing currency', { currency: '' }, 'currency_not_gbp'],
    ['empty debt', { debtMinorUnits: '' }, 'debt_amount_unusable'],
    ['debt in major units', { debtMinorUnits: '1250.00' }, 'debt_amount_unusable'],
    ['zero debt', { debtMinorUnits: '0' }, 'debt_amount_unusable'],
    ['negative debt', { debtMinorUnits: '-100' }, 'debt_amount_unusable'],
    ['impossible due date', { dueDate: '2026-02-30' }, 'dates_unusable'],
    ['missing as-at date', { asAtDate: '' }, 'dates_unusable'],
    ['non-date', { dueDate: 'next Tuesday' }, 'dates_unusable'],
    ['two-digit year', { dueDate: '26-09-29' }, 'dates_unusable'],
  ]) {
    const result = calculate(caseFacts(overrides), lawInputs());
    assert.equal(result.status, 'unavailable', label);
    assert.deepEqual(codes(result), [expected], label);
    assert.equal(result.interest, null, label);
  }
});

test('is deterministic and reads no clock', () => {
  assert.deepEqual(calculate(caseFacts(), lawInputs()), calculate(caseFacts(), lawInputs()));
});

test('every result carries the same keys, so no caller can read a stray figure', () => {
  const expected = [
    'additionalMinorUnits', 'asAtDate', 'currency', 'daysLate', 'debtMinorUnits',
    'dueDate', 'fixedCompensationMinorUnits', 'illustrative', 'interest',
    'lawAsOf', 'reasons', 'status',
  ];
  for (const result of [
    calculate(caseFacts(), lawInputs()),
    calculate(caseFacts({ eligibilityOutcome: 'escalate' }), lawInputs()),
    calculate(caseFacts(), undefined),
    calculate(caseFacts({ asAtDate: '2026-09-01' }), lawInputs()),
    calculate({}, {}),
  ]) {
    assert.deepEqual(Object.keys(result).sort(), expected);
    assert.equal(result.illustrative, true);
  }
});

test('no reason summary states a legal conclusion', () => {
  const forbidden = /\b(entitled|enforceable|unenforceable|you should|will win|owes you|barred|must pay)\b/i;
  for (const [code, entry] of Object.entries(REASONS)) {
    assert.doesNotMatch(entry.summary, forbidden, `${code} summary states a conclusion.`);
    assert.ok(['calculated', 'unavailable'].includes(entry.status), `${code} has an unknown status.`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/shared/latePayment.test.js`
Expected: FAIL with `Cannot find module` for `./latePayment.js`.

- [ ] **Step 3: Write the module**

Create `web/shared/latePayment.js`:

```js
/*
 * Deterministic late-payment figures for the supported UK business-to-business
 * scope.
 *
 * No legal value lives here. The margin, the reference rates, the compensation
 * bands and the day-count basis all arrive as inputs, so an approved source and
 * a copy in code can never drift apart, because there is no copy. Nothing here
 * concludes that a sum is owed; every figure is an illustration.
 *
 * This module is imported unchanged by the local service and by the browser
 * bundle, so it stays free of platform APIs and never reads a clock.
 */

// How old law inputs may be before the interest rate is too perishable to
// state. This is the repository's own currency policy rather than a fact about
// the law, which is why it may live in code while the legal values may not.
export const STALE_AFTER_DAYS = 90;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WHOLE_MINOR_UNITS = /^\d+$/;
const PERCENT = /^\d{1,3}(\.\d{1,4})?$/;
// Percentages are held as integers scaled by four decimal places so that a
// base rate and a margin add exactly.
const PERCENT_SCALE = 10_000n;
const PERCENT_DECIMALS = 4;
const DAY_MS = 86_400_000;

export const REASONS = Object.freeze({
  not_eligible: {
    status: 'unavailable',
    summary: 'The eligibility questionnaire has not reached a supported outcome, so no figures are produced.',
  },
  law_inputs_missing: {
    status: 'unavailable',
    summary: 'No approved law inputs were supplied, so no figures are produced.',
  },
  law_inputs_invalid: {
    status: 'unavailable',
    summary: 'The supplied law inputs could not be read, so no figures are produced.',
  },
  no_reference_period: {
    status: 'unavailable',
    summary: 'No supplied reference period covers the date the debt became late, so no interest figure can be produced.',
  },
  currency_not_gbp: {
    status: 'unavailable',
    summary: 'The debt is not in sterling, so it cannot be measured against sterling rates and bands.',
  },
  debt_amount_unusable: {
    status: 'unavailable',
    summary: 'The debt is not recorded as a whole, positive number of minor units.',
  },
  dates_unusable: {
    status: 'unavailable',
    summary: 'The due date or the as-at date is not a real calendar date.',
  },
  law_inputs_stale: {
    status: 'calculated',
    summary: 'The law inputs are older than the freshness limit, so the statutory interest figure is withheld.',
  },
  not_yet_late: {
    status: 'calculated',
    summary: 'The as-at date is on or before the due date, so there are no late-payment figures to illustrate yet.',
  },
});
Object.values(REASONS).forEach(Object.freeze);

/** Midnight UTC of a calendar date, or null when the text is not one. */
function parseDate(value) {
  const match = ISO_DATE.exec(String(value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls a date like 2026-02-30 forward into March instead of
  // rejecting it, so the round trip is what actually validates the day.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.getTime();
}

function daysBetween(fromMs, toMs) {
  return Math.round((toMs - fromMs) / DAY_MS);
}

/** A percentage as an integer scaled by PERCENT_SCALE, or null. */
function parsePercent(value) {
  const text = String(value ?? '').trim();
  if (!PERCENT.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * PERCENT_SCALE + BigInt(fraction.padEnd(PERCENT_DECIMALS, '0'));
}

function formatPercent(scaled) {
  const whole = scaled / PERCENT_SCALE;
  const fraction = String(scaled % PERCENT_SCALE).padStart(PERCENT_DECIMALS, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** Every supplied law value read and checked, or null if any of it is unusable. */
function readLawInputs(lawInputs) {
  if (!lawInputs || typeof lawInputs !== 'object' || Array.isArray(lawInputs)) return null;

  const asOf = parseDate(lawInputs.asOf);
  const margin = parsePercent(lawInputs.marginPercent);
  const dayCount = Number(lawInputs.dayCountBasis);
  if (asOf === null || margin === null) return null;
  if (!Number.isInteger(dayCount) || dayCount <= 0) return null;

  if (!Array.isArray(lawInputs.referencePeriods) || lawInputs.referencePeriods.length === 0) return null;
  const periods = [];
  for (const period of lawInputs.referencePeriods) {
    const start = parseDate(period?.start);
    const end = parseDate(period?.end);
    const baseRate = parsePercent(period?.baseRatePercent);
    if (start === null || end === null || baseRate === null || end < start) return null;
    periods.push({ start, end, baseRate, startDate: String(period.start).trim(), endDate: String(period.end).trim() });
  }

  if (!Array.isArray(lawInputs.compensationBands) || lawInputs.compensationBands.length === 0) return null;
  const bands = [];
  for (const band of lawInputs.compensationBands) {
    const amount = String(band?.amountMinorUnits ?? '').trim();
    if (!WHOLE_MINOR_UNITS.test(amount)) return null;
    const upTo = band?.upToMinorUnits;
    if (upTo === null || upTo === undefined) {
      bands.push({ upTo: null, amount });
      continue;
    }
    const text = String(upTo).trim();
    if (!WHOLE_MINOR_UNITS.test(text)) return null;
    bands.push({ upTo: BigInt(text), amount });
  }
  // Without an open top band a large debt would silently fall through to no
  // compensation at all, which is worse than refusing to read the inputs.
  if (bands.at(-1).upTo !== null) return null;

  return { asOf, asOfDate: String(lawInputs.asOf).trim(), margin, dayCount, periods, bands };
}

function interestMinorUnits(debt, rateScaled, days, dayCount) {
  const numerator = debt * rateScaled * BigInt(days);
  const denominator = PERCENT_SCALE * 100n * BigInt(dayCount);
  // Rounded half up once, here. Rounding each day and summing would drift.
  return (2n * numerator + denominator) / (2n * denominator);
}

/** Every result carries the same keys, so no caller can read a stray figure. */
function result(fields) {
  return {
    status: 'unavailable',
    reasons: [],
    dueDate: null,
    asAtDate: null,
    daysLate: null,
    debtMinorUnits: null,
    currency: null,
    interest: null,
    fixedCompensationMinorUnits: null,
    additionalMinorUnits: null,
    lawAsOf: null,
    illustrative: true,
    ...fields,
  };
}

/**
 * Illustrate the late-payment position of one debt at one date.
 *
 * The caller supplies the as-at date, so the same inputs always produce the
 * same figures and nothing here depends on when it runs.
 */
export function calculate(caseFacts, lawInputs) {
  const reasons = [];
  const add = (code) => reasons.push({ code, summary: REASONS[code].summary });

  const dueMs = parseDate(caseFacts?.dueDate);
  const asAtMs = parseDate(caseFacts?.asAtDate);
  const debtText = String(caseFacts?.debtMinorUnits ?? '').trim();
  const debtUsable = WHOLE_MINOR_UNITS.test(debtText) && BigInt(debtText) > 0n;
  const currency = String(caseFacts?.currency ?? '').trim().toUpperCase();
  const law = lawInputs === undefined || lawInputs === null ? undefined : readLawInputs(lawInputs);

  const echo = {
    dueDate: dueMs === null ? null : String(caseFacts.dueDate).trim(),
    asAtDate: asAtMs === null ? null : String(caseFacts.asAtDate).trim(),
    daysLate: dueMs === null || asAtMs === null ? null : Math.max(0, daysBetween(dueMs, asAtMs)),
    debtMinorUnits: debtUsable ? debtText : null,
    currency: currency === 'GBP' ? currency : null,
    lawAsOf: law ? law.asOfDate : null,
  };

  if (caseFacts?.eligibilityOutcome !== 'supported') add('not_eligible');
  if (dueMs === null || asAtMs === null) add('dates_unusable');
  if (!debtUsable) add('debt_amount_unusable');
  if (currency !== 'GBP') add('currency_not_gbp');
  if (law === undefined) add('law_inputs_missing');
  else if (law === null) add('law_inputs_invalid');

  if (reasons.length > 0) return result({ ...echo, reasons });

  if (echo.daysLate === 0) {
    add('not_yet_late');
    return result({ ...echo, status: 'calculated', reasons, additionalMinorUnits: '0' });
  }

  // The debt becomes late the day after it fell due, and that date decides
  // which reference period governs the whole accrual.
  const lateFromMs = dueMs + DAY_MS;
  const period = law.periods.find((entry) => lateFromMs >= entry.start && lateFromMs <= entry.end);
  if (!period) {
    add('no_reference_period');
    return result({ ...echo, reasons });
  }

  const debt = BigInt(debtText);
  const band = law.bands.find((entry) => entry.upTo === null || debt <= entry.upTo);

  if (daysBetween(law.asOf, asAtMs) > STALE_AFTER_DAYS) {
    add('law_inputs_stale');
    return result({
      ...echo,
      status: 'calculated',
      reasons,
      fixedCompensationMinorUnits: band.amount,
      additionalMinorUnits: band.amount,
    });
  }

  const rateScaled = period.baseRate + law.margin;
  const amount = interestMinorUnits(debt, rateScaled, echo.daysLate, law.dayCount);
  return result({
    ...echo,
    status: 'calculated',
    reasons,
    interest: {
      ratePercent: formatPercent(rateScaled),
      baseRatePercent: formatPercent(period.baseRate),
      marginPercent: formatPercent(law.margin),
      referencePeriod: { start: period.startDate, end: period.endDate },
      dayCountBasis: law.dayCount,
      amountMinorUnits: String(amount),
    },
    fixedCompensationMinorUnits: band.amount,
    additionalMinorUnits: String(amount + BigInt(band.amount)),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test web/shared/latePayment.test.js`
Expected: PASS, 15 tests.

If a figure assertion fails, the defect is in the implementation, not the fixture. Every expected figure in the test file was computed with `BigInt` before this plan was written. Do not change a number to make a test pass; report it instead.

- [ ] **Step 5: Run the whole suite**

Run: `npm --prefix web test`
Expected: PASS, 77 tests. The `shared/*.test.js` glob already in `web/package.json` picks the new file up with no change.

- [ ] **Step 6: Confirm the module is genuinely pure**

Run:

```bash
grep -nE "require\(|from 'node:|import\.meta|fetch\(|Date\.now|new Date\(\)" web/shared/latePayment.js
```

Expected: no output. The only `new Date(...)` call in the file takes an explicit `Date.UTC(...)` value.

- [ ] **Step 7: Commit**

```bash
git add web/shared/latePayment.js web/shared/latePayment.test.js
git commit -m "Add the deterministic late payment calculator"
git log --oneline -1
```

Report the commit hash and the test count.

---

### Task 2: Documentation sync

**Files:**
- Modify: `docs/issue-board.md` (legal-assistance build-order row 3, and the Tolga application rows if this changes what they claim)
- Modify: `docs/plans/legal-assistance-build-order.md` (task 3 status and the "Next task" section)
- Modify: `docs/project-status.md` (verified progress and the renumbered next priorities)
- Modify: `docs/data-and-contracts.md` (the input and output shapes, the reason codes, and the money and date conventions)
- Modify: `docs/testing-and-demo.md` (the fixture suite and the new total)
- Modify: `docs/ai/SKILLS.md` (§6 and the S5 description)
- Modify: `docs/decisions.md` (append D-012)
- Modify: `docs/plans/2026-09-02-late-payment-calculator-design.md` (the `**Status:**` line)

**Interfaces:**
- Consumes: the finished module from Task 1.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Record the decision**

Append to `docs/decisions.md`, above the closing "Entry format" section:

```markdown
## D-012 - Legal values are calculator inputs, never constants in code

**Date:** 2 September 2026
**Status:** Accepted

**Decision:** `web/shared/latePayment.js` embeds no legal value. The margin over
base rate, the reference rates, the fixed-compensation bands and the day-count
basis all arrive as a `lawInputs` argument, and the module refuses to produce a
figure when they are missing, unreadable, or older than the freshness limit.
`STALE_AFTER_DAYS` is the sole number held in code, because it is this
repository's own currency policy rather than a fact about the law.

**Reason:** The approved UK-law source library is a later task, and this
repository does not state a legal fact without an inspectable source. Taking the
values as inputs let the calculator and its fixtures be built and tested first.
It also removes a defect class permanently: an approved source value and a copy
in code cannot drift apart when there is no copy.

**Consequence:** The calculator produces nothing until an approved source
supplies its inputs, which is the intended behaviour rather than a gap. The
fixture suite supplies its own law values, and no figure in it is an approved
legal value. Every result carries `lawAsOf` and `illustrative: true`, so no
consumer can render a figure without its date or present one as settled.
```

- [ ] **Step 2: Update the issue board**

In `docs/issue-board.md`, change the legal-assistance build-order row 3 status from `Not started` to `Done`, and replace its dependency cell with completion evidence naming: the pure module `web/shared/latePayment.js`; that every legal value is an input and none is held in code; `BigInt` minor units with a single half-up rounding at the end; UTC calendar-date arithmetic; the single rate fixed by the date the debt became late; the nine reason codes; and the fixture count that actually passed.

State plainly that the calculator produces no figures until task 4 supplies approved law inputs, and that no UI, route, or storage was built. Do not describe anything as verified beyond what the suite actually ran.

- [ ] **Step 3: Update the build-order plan**

In `docs/plans/legal-assistance-build-order.md`, change task 3 to **Done** with the same evidence in one or two sentences, update the `**Status:**` header line, and replace the "Next task" section with task 4: the approved UK-law source library, noting that it supplies this calculator's `lawInputs` and that legal information and calculation stay disabled while the snapshot is missing, invalid or stale.

- [ ] **Step 4: Update the project status**

In `docs/project-status.md`, move the calculator into the verified-progress section with the same evidence, and renumber the remaining priorities so the approved source library is first.

- [ ] **Step 5: Update the data and contracts reference**

In `docs/data-and-contracts.md`, add a calculator section beside the existing case-storage one, documenting: the `caseFacts` and `lawInputs` shapes; the result shape with every key; the nine reason codes with the status each produces; that money is whole minor units carried as decimal strings and computed in `BigInt`; that interest is simple, not compounded, and rounded half up once at the end; that dates are `YYYY-MM-DD` differenced in UTC; and that the reference period is chosen by the date the debt became late, which is the day after the due date.

- [ ] **Step 6: Update testing and demo**

In `docs/testing-and-demo.md`, add the 15 fixtures in `web/shared/latePayment.test.js` and the new suite total. Record that this task has no browser check because it builds no UI, rather than leaving that unexplained.

- [ ] **Step 7: Update the skills contract**

In `docs/ai/SKILLS.md`, update §6 so the arithmetic row names the module that now owns it, and update the S5 description to record that the figures it narrates come from this calculator and that S5 stays disabled until an approved snapshot exists. Add one sentence stating that the model performs no arithmetic and may not adjust a figure the calculator produced.

- [ ] **Step 8: Correct the design document status**

In `docs/plans/2026-09-02-late-payment-calculator-design.md`, change the `**Status:**` line from "Approved design; not yet implemented" to reflect that it is implemented, and correct anything else in it that the implementation changed.

- [ ] **Step 9: Check the suite and the links**

Run: `npm --prefix web test`
Expected: PASS, 77 tests, unchanged by documentation edits.

Then confirm every relative link added in this task resolves to a real file.

- [ ] **Step 10: Commit**

```bash
git add docs
git commit -m "Record the late payment calculator in the docs"
git log --oneline -1
```

Report the commit hash, what changed, what was actually verified, and what remains planned.
