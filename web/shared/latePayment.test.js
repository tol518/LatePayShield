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
  // additionalMinorUnits is interest plus fixed compensation everywhere else,
  // so reporting the fixed amount alone here would read as if the withheld
  // interest were zero. It must be null, not a number that looks complete.
  assert.equal(stale.additionalMinorUnits, null);
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
    ['day count as a boolean', lawInputs({ dayCountBasis: true }), 'law_inputs_invalid'],
    ['day count as an array', lawInputs({ dayCountBasis: [365] }), 'law_inputs_invalid'],
    ['day count as a numeric string', lawInputs({ dayCountBasis: '365' }), 'law_inputs_invalid'],
    ['bands listed out of ascending order', lawInputs({
      compensationBands: [
        { upToMinorUnits: '999999', amountMinorUnits: '7000' },
        { upToMinorUnits: '99999', amountMinorUnits: '4000' },
        { upToMinorUnits: null, amountMinorUnits: '10000' },
      ],
    }), 'law_inputs_invalid'],
    ['overlapping reference periods', lawInputs({
      referencePeriods: [
        { start: '2026-01-01', end: '2026-07-15', baseRatePercent: '4.75' },
        { start: '2026-07-01', end: '2026-12-31', baseRatePercent: '4.25' },
      ],
    }), 'law_inputs_invalid'],
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
    ['debt as a number', { debtMinorUnits: 125000 }, 'debt_amount_unusable'],
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
