# Approved UK-law source library — design

**Date:** 2 September 2026
**Status:** Implemented and tested; the committed snapshot is awaiting human approval
**Covers:** Task 4 of [`legal-assistance-build-order.md`](legal-assistance-build-order.md)
**Owner:** Tolga — application and AI

## Purpose

Hold the UK late-payment legal values the calculator needs in one versioned,
citable file, so that every figure the product can produce resolves to a primary
source a human approved. Until that file exists and is approved, legal
information and calculation stay disabled.

## Scope boundary

This task delivers the snapshot file, its validator, and the bridge that turns
it into the calculator's `lawInputs`. It does **not** build the automated
`law:refresh` fetcher, the diff-and-review workflow, or the regression suite for
source changes: the build order assigns those to task 9. It builds no route and
no UI; task 6 renders and narrates.

## How the values were obtained

Every value in the snapshot was retrieved from a primary source on the
allowlist [`SKILLS.md`](../ai/SKILLS.md) §7.4 already defines, and each
retrieval is recorded with its URL and date. Two findings from that retrieval
shaped this design, and both contradict what a plausible guess would have said:

**The 8% margin cannot cite s.6 of the Act.** Section 6 sets no rate. It
requires the Secretary of State to set one by order made with Treasury consent.
The margin and the half-yearly fixing rule both come from article 4 of the Late
Payment of Commercial Debts (Rate of Interest) (No. 3) Order 2002.

That same article is also the primary source for the rate rule task 3 already
implements. It fixes the rate by "the official dealing rate in force on the 30th
June ... or the 31st December ... immediately before the day on which statutory
interest starts to run" — one rate, fixed by the date the debt became late, for
that debt. Task 3 chose that reading; it is now sourced rather than inferred.

**No primary source prescribes a day-count convention.** Section 6 is silent,
and nothing else consulted supplies one. So the 365-day basis is not a legal
fact and must not sit among them. It goes in a separate `conventions` block,
with no citation and an explicit statement that the operator chose it.

## Files

| File | Responsibility |
|---|---|
| `data/uk-law/snapshot.json` | The versioned snapshot. Committed, non-secret, reviewable as a diff. |
| `web/shared/lawSnapshot.js` | Pure ESM. `validateSnapshot`, `toLawInputs`, `snapshotAgeDays`, the problem catalogue, and the source allowlist. No `node:` imports, no I/O, no clock. |
| `web/shared/lawSnapshot.test.js` | Fixture suite, plus one test that loads the real snapshot. |

The module takes an already-parsed snapshot object, exactly as the calculator
takes plain arguments. Reading the file is the caller's job, which keeps the
module importable by both the service and the browser bundle. In this task only
the tests load it, using `node:fs`.

## Snapshot shape

Following [`SKILLS.md`](../ai/SKILLS.md) §7.2, with two additions this design
introduces — `approvedBy`/`approvedAt` and `conventions`. §7.2 is updated to
match on completion.

```json
{
  "snapshotVersion": 1,
  "fetchedAt": "2026-09-02T00:00:00Z",
  "nextRefreshDue": "2026-10-02T00:00:00Z",
  "approvedBy": null,
  "approvedAt": null,
  "sources": [
    { "id": "lpcda-1998-s5a", "url": "https://www.legislation.gov.uk/ukpga/1998/20/section/5A", "fetchedAt": "2026-09-02T00:00:00Z", "status": "ok" }
  ],
  "facts": [
    {
      "id": "statutory-interest-margin",
      "volatility": "low",
      "statement": "Statutory interest on a qualifying commercial debt runs at 8 percentage points over the official dealing rate.",
      "values": { "marginPercent": "8" },
      "citationIds": ["si-2002-1675-a4"],
      "asOf": "2026-09-02"
    }
  ],
  "conventions": [
    {
      "id": "day-count-basis",
      "value": "365",
      "statement": "Interest is illustrated on a 365-day year. No primary source consulted prescribes a day-count convention for statutory interest, so this is a calculation convention the operator chose.",
      "citationIds": []
    }
  ],
  "citations": [
    { "id": "si-2002-1675-a4", "title": "Late Payment of Commercial Debts (Rate of Interest) (No. 3) Order 2002, article 4", "url": "https://www.legislation.gov.uk/uksi/2002/1675/made" }
  ]
}
```

`sources[]` records what was retrieved and when. §7.2 also shows a `sha256` per
source; it is deliberately omitted here, because nothing in this task fetches
content and a hash nobody computed would be decoration. Task 9's fetcher adds it
when it can produce one honestly.

`snapshotVersion` must be exactly `1`. A future shape change increments it, and
this module refuses a version it was not written to read rather than guessing at
an unfamiliar layout.

### The three required facts

| `id` | Volatility | Supplies | Citations |
|---|---|---|---|
| `statutory-interest-margin` | low | `marginPercent` | SI 2002/1675 art.4 |
| `statutory-interest-reference-rate` | high | `referencePeriods` | SI 2002/1675 art.4 for the rule, Bank of England for each rate |
| `fixed-sum-compensation` | medium | `bands` | LPCDA 1998 s.5A |

`statutory-interest-reference-rate` is the perishable one. It carries one entry
per half-year with the official dealing rate in force on the preceding 30 June
or 31 December. A debt becoming late outside every period supplied is refused by
the calculator rather than estimated, which is already its behaviour.

### The one required convention

`day-count-basis`, value `365`, no citations. A convention carrying a citation
is a fact filed in the wrong place, and the validator rejects it as such.

## The approval gate

`approvedBy` and `approvedAt` are `null` in the committed file. While they are,
`validateSnapshot` reports the snapshot unusable with `not_approved`,
`toLawInputs` returns `null`, and the calculator reports `law_inputs_missing`.
Calculation stays disabled, which is what the build order requires of an
unapproved source.

Approval is a separate, deliberate act: each figure is checked against the
source URL and quoted text, and only then are the fields set and committed.
Retrieval makes a value *sourced*; a human makes it *approved*. The library
exists to keep those two things distinct.

## Module interface

```js
validateSnapshot(snapshot) -> { usable: boolean, problems: [{ code, summary }] }
toLawInputs(snapshot)      -> lawInputs object, or null when not usable
snapshotAgeDays(snapshot, asAtDate) -> whole days, or null
```

`toLawInputs` produces exactly the shape `calculate` consumes: `asOf`,
`marginPercent`, `dayCountBasis`, `referencePeriods`, `compensationBands`. Its
`asOf` is the **oldest** `asOf` across the required facts, because a snapshot is
only as fresh as its stalest fact, and the calculator's staleness gate should
see that rather than the newest.

Staleness is deliberately **not** reimplemented here. The calculator already
owns `STALE_AFTER_DAYS` and is tested against it, and a second copy of the
ladder is exactly the drift D-012 exists to prevent. `snapshotAgeDays` exposes
the age so task 6 can render the §7.5 warning tier without duplicating the gate.

## Problem codes

| `code` | Meaning |
|---|---|
| `snapshot_missing` | No snapshot object was supplied. |
| `snapshot_malformed` | Not an object, or a required top-level key is missing or the wrong type. |
| `unsupported_version` | `snapshotVersion` is not a version this module reads. |
| `not_approved` | `approvedBy` or `approvedAt` is unset. |
| `dates_unusable` | A timestamp or `asOf` value is not a real date. |
| `citation_unresolved` | A fact cites an id no citation defines. |
| `citation_source_not_allowlisted` | A citation or source URL is not on the allowlist. |
| `fact_missing` | A required fact id is absent. |
| `fact_malformed` | A fact's shape, volatility, or values are unusable. |
| `convention_missing` | A required convention id is absent. |
| `convention_malformed` | A required convention's value is unusable. |
| `convention_has_citation` | A convention carries a citation, so it is a fact in the wrong place. |

Every problem makes the snapshot unusable. There is no partial-use state: a
source library that half-works is one that produces an unsourced figure.

## The allowlist

`legislation.gov.uk`, `bankofengland.co.uk`, `gov.uk`, `justice.gov.uk`, taken
from [`SKILLS.md`](../ai/SKILLS.md) §7.4. A URL matches when its host equals an
allowlisted domain or ends with a dot followed by one, so `www.legislation.gov.uk`
passes while `legislation.gov.uk.example.com` does not. Only `https` is
accepted.

## Tests

`web/shared/lawSnapshot.test.js`:

1. A well-formed, approved fixture validates as usable with no problems.
2. Each problem code, one fixture apiece, asserting the exact code.
3. A convention carrying a citation is rejected.
4. A citation URL that merely contains an allowlisted domain as a prefix of a
   longer host is rejected; `www.` subdomains are accepted; `http` is rejected.
5. `toLawInputs` on an approved fixture produces exactly the keys `calculate`
   consumes, with `asOf` equal to the oldest required fact's `asOf`.
6. `toLawInputs` returns `null` for every unusable snapshot.
7. `snapshotAgeDays` counts whole days and returns `null` for an unusable date.
8. **The real committed snapshot**, loaded from `data/uk-law/snapshot.json`,
   contains only structural correctness: every problem it reports must be
   `not_approved`, and nothing else. This test passes both before and after
   approval, so it never has to be edited when the fields are set.
9. **End to end**: the real snapshot with approval fields injected into a copy,
   through `toLawInputs`, into `calculate`, asserting a specific figure. This is
   the test that proves the two modules actually connect rather than merely
   agreeing on paper.

## Documents to update on completion

`docs/issue-board.md`, `docs/plans/legal-assistance-build-order.md`,
`docs/project-status.md`, `docs/data-and-contracts.md` (the snapshot shape, the
problem codes, and the allowlist rule), `docs/testing-and-demo.md`,
`docs/ai/SKILLS.md` (§7.2 for the two schema additions, §7.6 to record what now
exists, and the S4/S5 gating), and `docs/decisions.md` — a new entry recording
that retrieval and approval are separate, and that an unsourced convention is
held apart from sourced facts.

## Explicitly out of scope

- The `law:refresh` fetcher, the diff-and-review workflow, and source-change
  regression fixtures (task 9).
- Any route, UI, or persistence (task 6 and later).
- Any model involvement. The snapshot is data the application reads; no prompt
  and no model output takes part in producing or approving it.
- Facts beyond the three the calculator needs. The schema accepts more, and
  task 6 may add what S4 requires, but nothing speculative is added now.
- Deciding what a figure means for a particular debt. The library supplies
  values and citations; it draws no conclusion.
