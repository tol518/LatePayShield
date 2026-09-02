# UK-Law Source Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship task 4 of the legal-assistance build order: a versioned, citable UK-law snapshot plus the validator and bridge that feed the deterministic calculator, so every figure the product can produce resolves to a primary source a human approved.

**Architecture:** A committed `data/uk-law/snapshot.json` holding sourced legal values, and `web/shared/lawSnapshot.js`, a pure ESM module that validates a parsed snapshot and maps it to the `lawInputs` shape `web/shared/latePayment.js` already consumes. The module reads no file and no clock; callers supply the parsed object. Staleness is not reimplemented — the calculator already owns that gate.

**Tech Stack:** Node 22+ (`node:test`), plain ESM. No new dependencies. No route, no UI, no persistence, no fetcher.

**Design document:** [`2026-09-02-uk-law-source-library-design.md`](2026-09-02-uk-law-source-library-design.md)

## Global Constraints

- **Branch and commit policy.** All work happens on `feat/uk-law-source-library`. The user has approved one commit per task on that branch: never amend, never push, never tag, never merge, never touch `main`.
- **Commit messages.** Short, plain, human sounding, no em dashes. No `Co-Authored-By` trailer, no "Generated with" line, and no mention of Claude, Anthropic, or AI anywhere.
- No new npm dependencies.
- `web/shared/lawSnapshot.js` must stay pure: no `node:` imports, no `import.meta.env`, no `fetch`, no `fs`, and no reading of the current time. `URL` is a platform global available in both Node and the browser and is permitted.
- **The committed snapshot ships unapproved.** `approvedBy` and `approvedAt` are `null`. Setting them is a separate, deliberate human act and is NOT part of this plan.
- **No legal value may be invented, adjusted, or added.** Every value in the snapshot comes from the retrieval recorded in the design document. Do not add a fact, a citation, a reference period, or a band that the design does not specify, and do not alter a figure.
- Every citation and source URL must be `https` and on the allowlist `legislation.gov.uk`, `bankofengland.co.uk`, `gov.uk`, `justice.gov.uk`.
- No string may state a legal conclusion. The library supplies values and citations; it draws no conclusion about any debt.
- Follow the conventions already in `web/shared/eligibility.js` and `web/shared/latePayment.js`: frozen catalogues, `{ code, summary }` entries, comments that explain a non-obvious why. Never reference a doc path, a spec, or a task number in a code comment, and never write a comment that reads as machine-generated.
- Test command: `npm --prefix web test`. The `shared/*.test.js` glob already covers the new test file.

---

### Task 1: The snapshot module

**Files:**
- Create: `web/shared/lawSnapshot.js`
- Create: `web/shared/lawSnapshot.test.js`

**Interfaces:**
- Consumes: nothing at runtime. The `lawInputs` shape it produces is the one `web/shared/latePayment.js` `calculate` already accepts: `{ asOf, marginPercent, dayCountBasis, referencePeriods, compensationBands }`.
- Produces:
  - `SNAPSHOT_VERSION` — `1`.
  - `ALLOWED_SOURCE_DOMAINS` — frozen array of the four allowlisted domains.
  - `PROBLEMS` — frozen object mapping problem code to summary string.
  - `validateSnapshot(snapshot)` → `{ usable, problems }` where each problem is `{ code, summary }`.
  - `toLawInputs(snapshot)` → the `lawInputs` object, or `null` when the snapshot is not usable.
  - `snapshotAgeDays(snapshot, asAtDate)` → whole days, or `null`.

- [ ] **Step 1: Write the failing test**

Create `web/shared/lawSnapshot.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/shared/lawSnapshot.test.js`
Expected: FAIL with `Cannot find module` for `./lawSnapshot.js`.

- [ ] **Step 3: Write the module**

Create `web/shared/lawSnapshot.js`:

```js
/*
 * The approved UK-law snapshot: what it must contain to be usable, and how it
 * becomes the values the late-payment calculator consumes.
 *
 * Retrieval and approval are separate. A value fetched from a primary source is
 * sourced; only a person setting the approval fields makes it approved, and an
 * unapproved snapshot yields nothing at all.
 *
 * Nothing here reads a file or a clock, so the same module serves the local
 * service and the browser bundle. Callers supply the parsed snapshot.
 */

export const SNAPSHOT_VERSION = 1;

export const ALLOWED_SOURCE_DOMAINS = Object.freeze([
  'legislation.gov.uk',
  'bankofengland.co.uk',
  'gov.uk',
  'justice.gov.uk',
]);

const REQUIRED_FACTS = Object.freeze([
  'statutory-interest-margin',
  'statutory-interest-reference-rate',
  'fixed-sum-compensation',
]);
const REQUIRED_CONVENTIONS = Object.freeze(['day-count-basis']);
const VOLATILITY = Object.freeze(['high', 'medium', 'low']);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERCENT = /^\d{1,3}(\.\d{1,4})?$/;
const WHOLE_MINOR_UNITS = /^\d+$/;
const DAY_MS = 86_400_000;

export const PROBLEMS = Object.freeze({
  snapshot_missing: 'No snapshot was supplied, so no legal values are available.',
  snapshot_malformed: 'The snapshot is not an object carrying the expected top-level lists.',
  unsupported_version: 'The snapshot is not a version this build knows how to read.',
  not_approved: 'The snapshot has not been approved by a person, so its values may not be used.',
  dates_unusable: 'The snapshot carries a timestamp or as-of value that is not a real date.',
  citation_unresolved: 'A fact cites a citation the snapshot does not define.',
  citation_source_not_allowlisted: 'A citation or source URL is not an https address on the approved-source allowlist.',
  fact_missing: 'A fact the calculator requires is absent from the snapshot.',
  fact_malformed: 'A required fact does not carry usable values.',
  convention_missing: 'A convention the calculator requires is absent from the snapshot.',
  convention_malformed: 'A required convention does not carry a usable value.',
  convention_has_citation: 'A convention carries a citation, so it is a sourced fact filed in the wrong place.',
});

/** Midnight UTC of a calendar date, or null when the text is not one. */
function parseDate(value) {
  const match = ISO_DATE.exec(String(value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls an impossible day forward, so the round trip is the check.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.getTime();
}

function parseInstant(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * A host matches only as itself or as a subdomain, so a lookalike host that
 * merely contains an allowlisted domain is refused.
 */
function allowlisted(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? ''));
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_SOURCE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function text(value) {
  return String(value ?? '').trim();
}

function readMargin(facts) {
  const value = text(facts.get('statutory-interest-margin')?.values?.marginPercent);
  return PERCENT.test(value) ? value : null;
}

function readPeriods(facts) {
  const periods = facts.get('statutory-interest-reference-rate')?.values?.referencePeriods;
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const clean = [];
  for (const period of periods) {
    const start = text(period?.start);
    const end = text(period?.end);
    const baseRatePercent = text(period?.baseRatePercent);
    if (parseDate(start) === null || parseDate(end) === null || !PERCENT.test(baseRatePercent)) return null;
    clean.push({ start, end, baseRatePercent });
  }
  return clean;
}

function readBands(facts) {
  const bands = facts.get('fixed-sum-compensation')?.values?.bands;
  if (!Array.isArray(bands) || bands.length === 0) return null;
  const clean = [];
  for (const band of bands) {
    const amountMinorUnits = text(band?.amountMinorUnits);
    if (!WHOLE_MINOR_UNITS.test(amountMinorUnits)) return null;
    const upTo = band?.upToMinorUnits;
    if (upTo === null || upTo === undefined) {
      clean.push({ upToMinorUnits: null, amountMinorUnits });
      continue;
    }
    const upToMinorUnits = text(upTo);
    if (!WHOLE_MINOR_UNITS.test(upToMinorUnits)) return null;
    clean.push({ upToMinorUnits, amountMinorUnits });
  }
  return clean;
}

function readDayCount(conventions) {
  const value = Number(text(conventions.get('day-count-basis')?.value));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function indexById(entries) {
  return new Map(entries.map((entry) => [text(entry?.id), entry]));
}

/**
 * Check a snapshot end to end.
 *
 * One entry per problem code however many times it occurs: an operator fixing a
 * malformed file needs to know which kinds of thing are wrong, not how many.
 */
export function validateSnapshot(snapshot) {
  const problems = [];
  const add = (code) => {
    if (!problems.some((problem) => problem.code === code)) {
      problems.push({ code, summary: PROBLEMS[code] });
    }
  };
  const done = () => ({ usable: problems.length === 0, problems });

  if (snapshot === null || snapshot === undefined) {
    add('snapshot_missing');
    return done();
  }
  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    add('snapshot_malformed');
    return done();
  }
  for (const key of ['sources', 'facts', 'conventions', 'citations']) {
    if (!Array.isArray(snapshot[key])) add('snapshot_malformed');
  }
  // Nothing below can be read from a snapshot missing its lists.
  if (problems.length > 0) return done();

  if (snapshot.snapshotVersion !== SNAPSHOT_VERSION) add('unsupported_version');
  if (parseInstant(snapshot.fetchedAt) === null || parseInstant(snapshot.nextRefreshDue) === null) {
    add('dates_unusable');
  }
  if (!text(snapshot.approvedBy) || parseInstant(snapshot.approvedAt) === null) add('not_approved');

  const citations = indexById(snapshot.citations);
  for (const citation of snapshot.citations) {
    if (!citation || typeof citation !== 'object' || !text(citation.id) || !text(citation.title)) {
      add('snapshot_malformed');
      continue;
    }
    if (!allowlisted(citation.url)) add('citation_source_not_allowlisted');
  }
  for (const source of snapshot.sources) {
    if (!source || typeof source !== 'object' || !allowlisted(source.url)) {
      add('citation_source_not_allowlisted');
      continue;
    }
    if (parseInstant(source.fetchedAt) === null) add('dates_unusable');
  }

  const facts = indexById(snapshot.facts);
  for (const fact of snapshot.facts) {
    if (!fact || typeof fact !== 'object' || !text(fact.id)) {
      add('snapshot_malformed');
      continue;
    }
    if (!VOLATILITY.includes(fact.volatility) || !text(fact.statement)
      || !fact.values || typeof fact.values !== 'object' || Array.isArray(fact.values)) {
      add('fact_malformed');
    }
    if (parseDate(fact.asOf) === null) add('dates_unusable');
    if (!Array.isArray(fact.citationIds) || fact.citationIds.length === 0) add('fact_malformed');
    else for (const citationId of fact.citationIds) {
      if (!citations.has(text(citationId))) add('citation_unresolved');
    }
  }

  const conventions = indexById(snapshot.conventions);
  for (const convention of snapshot.conventions) {
    if (!convention || typeof convention !== 'object' || !text(convention.id) || !text(convention.statement)) {
      add('snapshot_malformed');
      continue;
    }
    if (Array.isArray(convention.citationIds) && convention.citationIds.length > 0) {
      add('convention_has_citation');
    }
  }

  for (const id of REQUIRED_FACTS) if (!facts.has(id)) add('fact_missing');
  for (const id of REQUIRED_CONVENTIONS) if (!conventions.has(id)) add('convention_missing');

  if (facts.has('statutory-interest-margin') && readMargin(facts) === null) add('fact_malformed');
  if (facts.has('statutory-interest-reference-rate') && readPeriods(facts) === null) add('fact_malformed');
  if (facts.has('fixed-sum-compensation') && readBands(facts) === null) add('fact_malformed');
  if (conventions.has('day-count-basis') && readDayCount(conventions) === null) add('convention_malformed');

  return done();
}

/**
 * The values the calculator consumes, or null when the snapshot may not be used.
 *
 * `asOf` is the oldest required fact's date: a snapshot is only as fresh as its
 * stalest fact, and the calculator's staleness gate should see that rather than
 * the newest one.
 */
export function toLawInputs(snapshot) {
  if (!validateSnapshot(snapshot).usable) return null;
  const facts = indexById(snapshot.facts);
  const conventions = indexById(snapshot.conventions);
  return {
    asOf: REQUIRED_FACTS.map((id) => text(facts.get(id).asOf)).sort()[0],
    marginPercent: readMargin(facts),
    dayCountBasis: readDayCount(conventions),
    referencePeriods: readPeriods(facts),
    compensationBands: readBands(facts),
  };
}

/** Whole days between the snapshot's retrieval date and a supplied date. */
export function snapshotAgeDays(snapshot, asAtDate) {
  const fetched = parseDate(text(snapshot?.fetchedAt).slice(0, 10));
  const asAt = parseDate(asAtDate);
  if (fetched === null || asAt === null) return null;
  return Math.round((asAt - fetched) / DAY_MS);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test web/shared/lawSnapshot.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm --prefix web test`
Expected: PASS, 90 tests.

- [ ] **Step 6: Confirm the module is pure**

Run:

```bash
grep -nE "require\(|from 'node:|import\.meta|fetch\(|Date\.now|new Date\(\)|readFile" web/shared/lawSnapshot.js
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add web/shared/lawSnapshot.js web/shared/lawSnapshot.test.js
git commit -m "Add the UK law snapshot validator and calculator bridge"
git log --oneline -1
```

---

### Task 2: The snapshot itself

**Files:**
- Create: `data/uk-law/snapshot.json`
- Modify: `web/shared/lawSnapshot.test.js` (append two tests)

**Interfaces:**
- Consumes: `validateSnapshot` and `toLawInputs` from Task 1; `calculate` from `web/shared/latePayment.js`.
- Produces: the committed snapshot, shipping unapproved.

**Every value below was retrieved from the primary source named beside it. Do not alter a figure, add a fact, or invent a citation.** If you believe a value is wrong, stop and report it rather than changing it.

- [ ] **Step 1: Write the snapshot**

Create `data/uk-law/snapshot.json`:

```json
{
  "snapshotVersion": 1,
  "fetchedAt": "2026-09-02T00:00:00Z",
  "nextRefreshDue": "2026-10-02T00:00:00Z",
  "approvedBy": null,
  "approvedAt": null,
  "sources": [
    {
      "id": "lpcda-1998-s5a",
      "url": "https://www.legislation.gov.uk/ukpga/1998/20/section/5A",
      "fetchedAt": "2026-09-02T00:00:00Z",
      "status": "ok"
    },
    {
      "id": "lpcda-1998-s6",
      "url": "https://www.legislation.gov.uk/ukpga/1998/20/section/6",
      "fetchedAt": "2026-09-02T00:00:00Z",
      "status": "ok"
    },
    {
      "id": "si-2002-1675-a4",
      "url": "https://www.legislation.gov.uk/uksi/2002/1675/made",
      "fetchedAt": "2026-09-02T00:00:00Z",
      "status": "ok"
    },
    {
      "id": "boe-bank-rate",
      "url": "https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp",
      "fetchedAt": "2026-09-02T00:00:00Z",
      "status": "ok"
    }
  ],
  "facts": [
    {
      "id": "statutory-interest-margin",
      "volatility": "low",
      "statement": "Statutory interest on a qualifying commercial debt runs at 8 percentage points over the official dealing rate. The Act itself sets no rate; section 6 requires the Secretary of State to set one by order made with Treasury consent, and article 4 of the 2002 order is that order.",
      "values": { "marginPercent": "8" },
      "citationIds": ["si-2002-1675-a4", "lpcda-1998-s6"],
      "asOf": "2026-09-02"
    },
    {
      "id": "statutory-interest-reference-rate",
      "volatility": "high",
      "statement": "The official dealing rate is fixed half-yearly: the rate in force on 30 June applies where statutory interest starts to run between 1 July and 31 December, and the rate in force on 31 December applies where it starts to run between 1 January and 30 June. The Bank of England official Bank Rate was 3.75 per cent on 31 December 2025 and 3.75 per cent on 30 June 2026. Periods outside those listed are not covered by this snapshot.",
      "values": {
        "referencePeriods": [
          { "start": "2026-01-01", "end": "2026-06-30", "baseRatePercent": "3.75" },
          { "start": "2026-07-01", "end": "2026-12-31", "baseRatePercent": "3.75" }
        ]
      },
      "citationIds": ["si-2002-1675-a4", "boe-bank-rate"],
      "asOf": "2026-09-02"
    },
    {
      "id": "fixed-sum-compensation",
      "volatility": "medium",
      "statement": "A fixed sum is due alongside statutory interest, banded by the size of the debt: 40 pounds for a debt under 1,000 pounds, 70 pounds for a debt of 1,000 pounds or more but less than 10,000 pounds, and 100 pounds for a debt of 10,000 pounds or more.",
      "values": {
        "bands": [
          { "upToMinorUnits": "99999", "amountMinorUnits": "4000" },
          { "upToMinorUnits": "999999", "amountMinorUnits": "7000" },
          { "upToMinorUnits": null, "amountMinorUnits": "10000" }
        ]
      },
      "citationIds": ["lpcda-1998-s5a"],
      "asOf": "2026-09-02"
    }
  ],
  "conventions": [
    {
      "id": "day-count-basis",
      "value": "365",
      "statement": "Interest is illustrated on a 365-day year. No primary source consulted prescribes a day-count convention for statutory interest, so this is a calculation convention the operator chose rather than a legal fact.",
      "citationIds": []
    }
  ],
  "citations": [
    {
      "id": "lpcda-1998-s5a",
      "title": "Late Payment of Commercial Debts (Interest) Act 1998, section 5A",
      "url": "https://www.legislation.gov.uk/ukpga/1998/20/section/5A"
    },
    {
      "id": "lpcda-1998-s6",
      "title": "Late Payment of Commercial Debts (Interest) Act 1998, section 6",
      "url": "https://www.legislation.gov.uk/ukpga/1998/20/section/6"
    },
    {
      "id": "si-2002-1675-a4",
      "title": "Late Payment of Commercial Debts (Rate of Interest) (No. 3) Order 2002, article 4",
      "url": "https://www.legislation.gov.uk/uksi/2002/1675/made"
    },
    {
      "id": "boe-bank-rate",
      "title": "Bank of England official Bank Rate",
      "url": "https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp"
    }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

Append to `web/shared/lawSnapshot.test.js`. Add these two imports at the top of the file, beside the existing ones:

```js
import { readFileSync } from 'node:fs';
import { calculate } from './latePayment.js';
```

Then append:

```js
/** The committed snapshot, read from disk rather than fixtured. */
function committedSnapshot() {
  return JSON.parse(readFileSync(new URL('../../data/uk-law/snapshot.json', import.meta.url), 'utf8'));
}

test('the committed snapshot is structurally correct and awaiting approval', () => {
  const result = validateSnapshot(committedSnapshot());
  // Passes before and after a person sets the approval fields, so this test
  // never needs editing when the snapshot is approved.
  assert.deepEqual(codes(result).filter((code) => code !== 'not_approved'), []);
});

test('the committed snapshot drives the calculator once approved', () => {
  const approved = {
    ...committedSnapshot(),
    approvedBy: 'fixture approval, not a real sign-off',
    approvedAt: '2026-09-02T00:00:00Z',
  };
  const lawInputs = toLawInputs(approved);
  assert.equal(lawInputs.marginPercent, '8');
  assert.equal(lawInputs.dayCountBasis, 365);

  const result = calculate({
    eligibilityOutcome: 'supported',
    debtMinorUnits: '125000',
    currency: 'GBP',
    dueDate: '2026-09-29',
    asAtDate: '2026-11-15',
  }, lawInputs);

  assert.equal(result.status, 'calculated');
  assert.equal(result.daysLate, 47);
  // 3.75 base plus the 8 point margin, for 47 days on a 365-day basis.
  assert.equal(result.interest.ratePercent, '11.75');
  assert.equal(result.interest.amountMinorUnits, '1891');
  assert.equal(result.fixedCompensationMinorUnits, '7000');
  assert.equal(result.additionalMinorUnits, '8891');
});

test('the unapproved committed snapshot yields nothing to the calculator', () => {
  assert.equal(toLawInputs(committedSnapshot()), null);
  const result = calculate({
    eligibilityOutcome: 'supported',
    debtMinorUnits: '125000',
    currency: 'GBP',
    dueDate: '2026-09-29',
    asAtDate: '2026-11-15',
  }, toLawInputs(committedSnapshot()));
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.reasons.map((reason) => reason.code), ['law_inputs_missing']);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test web/shared/lawSnapshot.test.js`
Expected: FAIL — the snapshot file does not exist yet if Step 1 was skipped, otherwise the three new tests fail only if the module or the data is wrong.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test web/shared/lawSnapshot.test.js`
Expected: PASS, 16 tests.

The interest figure `1891` was computed with `BigInt` before this plan was written, and the whole test file was extracted and run against the plan's own module and snapshot: 125000 pence at 11.75% for 47 days on a 365-day basis is 1891.2671... pence, which rounds half up to 1891. If it fails, the defect is in the code or the data, not the fixture. Do not change the number; report it.

- [ ] **Step 5: Run the whole suite**

Run: `npm --prefix web test`
Expected: PASS, 93 tests.

- [ ] **Step 6: Confirm the snapshot ships unapproved**

Run:

```bash
grep -n '"approvedBy"\|"approvedAt"' data/uk-law/snapshot.json
```

Expected: both `null`. If either carries a value, the approval gate has been bypassed; stop and report it.

- [ ] **Step 7: Commit**

```bash
git add data/uk-law/snapshot.json web/shared/lawSnapshot.test.js
git commit -m "Add the sourced UK law snapshot, unapproved"
git log --oneline -1
```

---

### Task 3: Documentation sync

**Files:**
- Modify: `docs/issue-board.md` (build-order row 4)
- Modify: `docs/plans/legal-assistance-build-order.md` (task 4 status, header, and "Next task")
- Modify: `docs/project-status.md` (verified progress, renumbered priorities)
- Modify: `docs/data-and-contracts.md` (snapshot shape, problem codes, allowlist rule, the bridge)
- Modify: `docs/testing-and-demo.md` (fixtures and the new total)
- Modify: `docs/ai/SKILLS.md` (§7.2 for the two schema additions, §7.6 for what now exists, S4/S5 gating)
- Modify: `docs/decisions.md` (append D-013)
- Modify: `docs/plans/2026-09-02-uk-law-source-library-design.md` (the `**Status:**` line)

**Interfaces:**
- Consumes: the finished work from Tasks 1 and 2.
- Produces: nothing consumed later.

- [ ] **Step 1: Record the decision**

Append to `docs/decisions.md`, above the closing "Entry format" section:

```markdown
## D-013 - Retrieval and approval are separate, and an unsourced convention is held apart

**Date:** 2 September 2026
**Status:** Accepted

**Decision:** `data/uk-law/snapshot.json` holds each legal value beside the
primary source it was retrieved from, and carries `approvedBy` and `approvedAt`.
While those are unset the snapshot is unusable: `toLawInputs` returns null and
the calculator reports `law_inputs_missing`. The 365-day count basis is not
stored among the sourced facts. It sits in a separate `conventions` list, with
no citation and a statement that the operator chose it.

**Reason:** Retrieving a value from legislation.gov.uk makes it sourced, not
approved. Keeping the two distinct means the file records who accepted
responsibility for each figure, and a fetch that misread a page cannot reach a
user without a person having looked. The day-count basis has no primary source
at all: section 6 of the 1998 Act prescribes no day-count convention. Filing it
beside sourced values would imply a source that does not exist, which is the
confusion an approved-source library exists to prevent.

**Consequence:** The snapshot is committed unapproved and the calculator stays
disabled until a person approves it, which is what the build order requires. A
convention carrying a citation is rejected as a fact in the wrong place. The
snapshot covers only the reference periods actually retrieved, so a debt
becoming late outside them is refused rather than estimated.
```

- [ ] **Step 2: Update the issue board**

In `docs/issue-board.md`, change build-order row 4 from `Not started` to `Done`, with evidence naming: `data/uk-law/snapshot.json` and `web/shared/lawSnapshot.js`; that every value carries the primary source it came from; that the file ships unapproved so calculation stays disabled; the twelve problem codes; the allowlist rule; and the fixture count that actually passed.

State plainly that the snapshot is **not approved**, that no `law:refresh` fetcher was built, and that no route or UI was built.

- [ ] **Step 3: Update the build-order plan**

In `docs/plans/legal-assistance-build-order.md`, change task 4 to **Done** with the same evidence in one or two sentences, update the `**Status:**` header, and replace "Next task" with task 5, noting that tasks 1 to 4 are the foundation and that a legal-advice-style chat experience still must not be presented.

- [ ] **Step 4: Update the project status**

In `docs/project-status.md`, move the source library into verified progress and renumber the remaining priorities. Record the unapproved state as an explicit outstanding item, since it gates every downstream feature.

- [ ] **Step 5: Update the data and contracts reference**

In `docs/data-and-contracts.md`, add a snapshot section beside the calculator one: the file's shape including `approvedBy`/`approvedAt` and `conventions`; the three required facts and one required convention; the twelve problem codes; the allowlist rule that a host matches only as itself or a subdomain and must be https; and that `toLawInputs` takes the oldest required fact's `asOf`.

- [ ] **Step 6: Update testing and demo**

In `docs/testing-and-demo.md`, add the fixtures in `web/shared/lawSnapshot.test.js` and the new suite total, including the end-to-end test that drives the calculator from the committed snapshot. Record that there is no browser check because this task builds no UI.

- [ ] **Step 7: Update the skills contract**

In `docs/ai/SKILLS.md`: update §7.2 to show `approvedBy`, `approvedAt` and `conventions`, and to note that `sha256` is not yet populated; update §7.6, which currently says the snapshot and validator do not exist, to record what now does and what still does not; and update the S4 and S5 gating to say both stay disabled while the snapshot is unapproved.

- [ ] **Step 8: Correct the design document status**

In `docs/plans/2026-09-02-uk-law-source-library-design.md`, change the `**Status:**` line to reflect that it is implemented and awaiting approval.

- [ ] **Step 9: Check the suite and the links**

Run: `npm --prefix web test`
Expected: PASS, 93 tests, unchanged by documentation edits.

Then confirm every relative link added resolves to a real file.

- [ ] **Step 10: Commit**

```bash
git add docs
git commit -m "Record the UK law source library in the docs"
git log --oneline -1
```
