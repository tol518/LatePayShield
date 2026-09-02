import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_SOURCE_DOMAINS,
  PROBLEMS,
  SNAPSHOT_VERSION,
  snapshotAgeDays,
  toLawInputs,
  validateSnapshot,
} from './lawSnapshot.js';

/** A structurally complete, approved snapshot. Values are fixtures, not approved law. */
function snapshot(overrides = {}) {
  return {
    snapshotVersion: 1,
    fetchedAt: '2026-09-02T00:00:00Z',
    nextRefreshDue: '2026-10-02T00:00:00Z',
    approvedBy: 'test operator',
    approvedAt: '2026-09-02T00:00:00Z',
    sources: [
      { id: 'si', url: 'https://www.legislation.gov.uk/uksi/2002/1675/made', fetchedAt: '2026-09-02T00:00:00Z', status: 'ok' },
    ],
    facts: [
      {
        id: 'statutory-interest-margin',
        volatility: 'low',
        statement: 'Margin over the official dealing rate.',
        values: { marginPercent: '8' },
        citationIds: ['si'],
        asOf: '2026-09-02',
      },
      {
        id: 'statutory-interest-reference-rate',
        volatility: 'high',
        statement: 'Official dealing rate fixed half-yearly.',
        values: {
          referencePeriods: [
            { start: '2026-01-01', end: '2026-06-30', baseRatePercent: '3.75' },
            { start: '2026-07-01', end: '2026-12-31', baseRatePercent: '3.75' },
          ],
        },
        citationIds: ['si'],
        asOf: '2026-08-20',
      },
      {
        id: 'fixed-sum-compensation',
        volatility: 'medium',
        statement: 'Fixed sums banded by debt size.',
        values: {
          bands: [
            { upToMinorUnits: '99999', amountMinorUnits: '4000' },
            { upToMinorUnits: '999999', amountMinorUnits: '7000' },
            { upToMinorUnits: null, amountMinorUnits: '10000' },
          ],
        },
        citationIds: ['si'],
        asOf: '2026-09-01',
      },
    ],
    conventions: [
      {
        id: 'day-count-basis',
        value: '365',
        statement: 'A 365-day year. No primary source prescribes one, so the operator chose it.',
        citationIds: [],
      },
    ],
    citations: [
      { id: 'si', title: 'Late Payment of Commercial Debts (Rate of Interest) (No. 3) Order 2002, article 4', url: 'https://www.legislation.gov.uk/uksi/2002/1675/made' },
    ],
    ...overrides,
  };
}

/** Replace one fact by id, keeping the rest of the fixture intact. */
function withFact(id, changes) {
  const facts = snapshot().facts.map((fact) => fact.id === id ? { ...fact, ...changes } : fact);
  return snapshot({ facts });
}

function codes(result) {
  return result.problems.map((problem) => problem.code).sort();
}

test('an approved, well-formed snapshot is usable with no problems', () => {
  const result = validateSnapshot(snapshot());
  assert.equal(result.usable, true);
  assert.deepEqual(result.problems, []);
  assert.equal(SNAPSHOT_VERSION, 1);
});

test('a snapshot with no approval is refused, and that is the only problem', () => {
  for (const overrides of [{ approvedBy: null }, { approvedAt: null }, { approvedBy: '   ' }]) {
    const result = validateSnapshot(snapshot(overrides));
    assert.equal(result.usable, false);
    assert.deepEqual(codes(result), ['not_approved']);
  }
});

test('a missing or malformed snapshot is refused before anything else is read', () => {
  for (const [input, expected] of [
    [undefined, 'snapshot_missing'],
    [null, 'snapshot_missing'],
    ['a snapshot', 'snapshot_malformed'],
    [[], 'snapshot_malformed'],
    [{}, 'snapshot_malformed'],
  ]) {
    const result = validateSnapshot(input);
    assert.equal(result.usable, false);
    assert.ok(codes(result).includes(expected), `${String(input)} gave ${codes(result)}`);
  }
});

test('only the version this build reads is accepted', () => {
  for (const snapshotVersion of [0, 2, '1', null, undefined]) {
    const result = validateSnapshot(snapshot({ snapshotVersion }));
    assert.equal(result.usable, false);
    assert.ok(codes(result).includes('unsupported_version'), String(snapshotVersion));
  }
});

test('a fact citing a citation the snapshot does not define is refused', () => {
  const result = validateSnapshot(withFact('statutory-interest-margin', { citationIds: ['nowhere'] }));
  assert.equal(result.usable, false);
  assert.deepEqual(codes(result), ['citation_unresolved']);
});

test('a required fact that is absent or unusable is refused', () => {
  const missing = validateSnapshot(snapshot({ facts: snapshot().facts.filter((fact) => fact.id !== 'fixed-sum-compensation') }));
  assert.deepEqual(codes(missing), ['fact_missing']);

  for (const [id, changes] of [
    ['statutory-interest-margin', { values: { marginPercent: '8%' } }],
    ['statutory-interest-reference-rate', { values: { referencePeriods: [] } }],
    ['statutory-interest-reference-rate', { values: { referencePeriods: [{ start: '2026-02-30', end: '2026-06-30', baseRatePercent: '3.75' }] } }],
    ['fixed-sum-compensation', { values: { bands: [{ upToMinorUnits: null, amountMinorUnits: '70.00' }] } }],
    ['statutory-interest-margin', { volatility: 'occasional' }],
  ]) {
    const result = validateSnapshot(withFact(id, changes));
    assert.equal(result.usable, false, `${id} ${JSON.stringify(changes)}`);
    assert.ok(codes(result).includes('fact_malformed'), `${id} gave ${codes(result)}`);
  }
});

test('a required convention that is absent, unusable, or cited is refused', () => {
  const absent = validateSnapshot(snapshot({ conventions: [] }));
  assert.deepEqual(codes(absent), ['convention_missing']);

  const cited = validateSnapshot(snapshot({
    conventions: [{ id: 'day-count-basis', value: '365', statement: 'x', citationIds: ['si'] }],
  }));
  assert.deepEqual(codes(cited), ['convention_has_citation']);

  for (const value of ['365.25', '0', '-1', 'a year', '']) {
    const result = validateSnapshot(snapshot({
      conventions: [{ id: 'day-count-basis', value, statement: 'x', citationIds: [] }],
    }));
    assert.ok(codes(result).includes('convention_malformed'), `${value} gave ${codes(result)}`);
  }
});

test('only https URLs on the allowlist are accepted', () => {
  assert.deepEqual(ALLOWED_SOURCE_DOMAINS, ['legislation.gov.uk', 'bankofengland.co.uk', 'gov.uk', 'justice.gov.uk']);

  const accepted = [
    'https://legislation.gov.uk/x',
    'https://www.legislation.gov.uk/x',
    'https://www.bankofengland.co.uk/x',
    'https://www.justice.gov.uk/x',
  ];
  for (const url of accepted) {
    const result = validateSnapshot(snapshot({ citations: [{ id: 'si', title: 't', url }] }));
    assert.equal(result.usable, true, url);
  }

  const rejected = [
    'http://www.legislation.gov.uk/x',
    'https://legislation.gov.uk.example.com/x',
    'https://notlegislation.gov.uk.evil.test/x',
    'https://example.com/legislation.gov.uk',
    'not a url',
    '',
  ];
  for (const url of rejected) {
    const result = validateSnapshot(snapshot({ citations: [{ id: 'si', title: 't', url }] }));
    assert.equal(result.usable, false, url);
    assert.ok(codes(result).includes('citation_source_not_allowlisted'), `${url} gave ${codes(result)}`);
  }
});

test('an unreal date anywhere in the snapshot is refused', () => {
  assert.ok(codes(validateSnapshot(snapshot({ fetchedAt: 'last Tuesday' }))).includes('dates_unusable'));
  assert.ok(codes(validateSnapshot(withFact('statutory-interest-margin', { asOf: '2026-02-30' }))).includes('dates_unusable'));
});

test('a usable snapshot maps to exactly what the calculator consumes', () => {
  const lawInputs = toLawInputs(snapshot());
  assert.deepEqual(Object.keys(lawInputs).sort(), [
    'asOf', 'compensationBands', 'dayCountBasis', 'marginPercent', 'referencePeriods',
  ]);
  // A snapshot is only as fresh as its stalest required fact.
  assert.equal(lawInputs.asOf, '2026-08-20');
  assert.equal(lawInputs.marginPercent, '8');
  assert.equal(lawInputs.dayCountBasis, 365);
  assert.deepEqual(lawInputs.referencePeriods, [
    { start: '2026-01-01', end: '2026-06-30', baseRatePercent: '3.75' },
    { start: '2026-07-01', end: '2026-12-31', baseRatePercent: '3.75' },
  ]);
  assert.deepEqual(lawInputs.compensationBands, [
    { upToMinorUnits: '99999', amountMinorUnits: '4000' },
    { upToMinorUnits: '999999', amountMinorUnits: '7000' },
    { upToMinorUnits: null, amountMinorUnits: '10000' },
  ]);
});

test('an unusable snapshot yields no law inputs at all', () => {
  for (const input of [undefined, null, {}, snapshot({ approvedBy: null }), snapshot({ conventions: [] })]) {
    assert.equal(toLawInputs(input), null);
  }
});

test('snapshot age is whole days and refuses an unreal date', () => {
  assert.equal(snapshotAgeDays(snapshot(), '2026-09-02'), 0);
  assert.equal(snapshotAgeDays(snapshot(), '2026-12-01'), 90);
  assert.equal(snapshotAgeDays(snapshot(), '2026-02-30'), null);
  assert.equal(snapshotAgeDays(undefined, '2026-09-02'), null);
});

test('every problem code has a summary and none states a legal conclusion', () => {
  const forbidden = /\b(entitled|enforceable|unenforceable|you should|owes you|barred|must pay)\b/i;
  for (const [code, summary] of Object.entries(PROBLEMS)) {
    assert.ok(summary.length > 0, code);
    assert.doesNotMatch(summary, forbidden, `${code} states a conclusion.`);
  }
});
