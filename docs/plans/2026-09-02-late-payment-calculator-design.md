# Deterministic late-payment calculator — design

**Date:** 2 September 2026
**Status:** Implemented as designed. `web/shared/latePayment.js` and its 15
fixtures in `web/shared/latePayment.test.js` are complete; `npm --prefix web
test` passes 77 of 77 executions.
**Covers:** Task 3 of [`legal-assistance-build-order.md`](legal-assistance-build-order.md)
**Owner:** Tolga — application and AI

## Purpose

Compute late-payment dates and figures in code, so that no language model ever
performs authoritative arithmetic. The model may later narrate a figure this
module produced; it may never produce, adjust, or recompute one.

## Scope boundary

This slice is a pure module and its fixture suite. No route, no storage, no UI,
no snapshot, and no model involvement. Task 4 supplies the approved law inputs,
and task 6 renders and narrates the result.

Every figure is an illustration. Nothing here establishes that a sum is owed,
that a debt is recoverable, or what a court would award.

## Why the law is an input, not a constant

The approved UK-law source library is task 4 and does not exist yet.
[`AGENTS.md`](../../AGENTS.md) forbids stating a legal fact without an
inspectable source, so this module embeds no legal value: not the margin over
base rate, not the fixed-compensation bands, not the day-count basis.

That is what makes task 3 buildable before task 4. It also removes a whole
class of defect permanently: a snapshot value and a hardcoded copy can never
drift apart, because there is no copy. The fixture suite supplies its own law
inputs, so the module is fully testable today.

## Module layout

| File | Responsibility |
|---|---|
| `web/shared/latePayment.js` | Pure ESM. `calculate(caseFacts, lawInputs)`, the reason catalogue, and `STALE_AFTER_DAYS`. No node imports, no I/O, no clock. |
| `web/shared/latePayment.test.js` | Fixture suite. |

Nothing imports the module yet except its tests. It sits beside
`web/shared/eligibility.js` and follows the same conventions, so both are
imported unchanged by the Node service and the browser bundle when needed.

## Inputs

```js
calculate(
  {
    eligibilityOutcome: 'supported',
    debtMinorUnits: '125000',
    currency: 'GBP',
    dueDate: '2026-09-29',
    asAtDate: '2026-11-15',
  },
  {
    asOf: '2026-10-01',
    marginPercent: '8',
    dayCountBasis: 365,
    referencePeriods: [
      { start: '2026-01-01', end: '2026-06-30', baseRatePercent: '4.75' },
      { start: '2026-07-01', end: '2026-12-31', baseRatePercent: '4.25' },
    ],
    compensationBands: [
      { upToMinorUnits: '99999',  amountMinorUnits: '4000' },
      { upToMinorUnits: '999999', amountMinorUnits: '7000' },
      { upToMinorUnits: null,     amountMinorUnits: '10000' },
    ],
  },
)
```

`asAtDate` is always supplied by the caller. The module never reads a clock, so
the same inputs always produce the same output and every fixture is stable.

`eligibilityOutcome` is the string task 2's `assess` returns. The module takes
it as a plain parameter rather than importing the eligibility module, so the two
stay independently testable.

## Money and date arithmetic

**Money is integer minor units in `BigInt`, end to end.** No float ever touches
a monetary value. Amounts cross the boundary as decimal strings so a caller
cannot lose precision either.

**Percentages are parsed into a scaled integer** with four decimal places, so
`4.25` and `8` combine to `12.25` exactly. A percentage that is not a plain
decimal is an invalid law input, not a value to coerce.

**Interest** is simple, not compounded: `debt × rate × days ÷ dayCountBasis`,
evaluated as one integer expression and rounded half up to the nearest penny
exactly once, at the end. Rounding each day and summing would drift.

**Dates are `YYYY-MM-DD` strings parsed from their year, month and day
components** and differenced in UTC. Both values are calendar dates with no time
and no zone, which makes this exact. The module never calls `new Date(string)`,
whose result depends on the runtime's zone — the defect the task 2 review found
in the eligibility module's deadline comparison. A date that does not exist,
such as `2026-02-30`, is rejected rather than rolled forward.

**Interest runs from the day after the due date.** `daysLate` is the whole-day
difference between the due date and the as-at date.

## The rate rule

The reference rate is fixed half-yearly, as
[`SKILLS.md`](../ai/SKILLS.md) §7.3 records: the base rate at 31 December
governs 1 January to 30 June, and the rate at 30 June governs 1 July to
31 December.

Where a debt accrues across a boundary, this module applies **one rate for the
whole accrual**: the rate of the reference period containing the date the debt
became late, which is the day after the due date. The chosen period is named in
the output, so the assumption is visible to the operator rather than buried in
the arithmetic.

If no supplied period contains that date, the module refuses. It never
extrapolates a rate, and it never falls back to the nearest period.

## Output

```js
{
  status: 'calculated',
  reasons: [],
  dueDate: '2026-09-29',
  asAtDate: '2026-11-15',
  daysLate: 47,
  debtMinorUnits: '125000',
  currency: 'GBP',
  interest: {
    ratePercent: '12.25',
    baseRatePercent: '4.25',
    marginPercent: '8',
    referencePeriod: { start: '2026-07-01', end: '2026-12-31' },
    dayCountBasis: 365,
    amountMinorUnits: '1972',
  },
  fixedCompensationMinorUnits: '7000',
  additionalMinorUnits: '8972',
  lawAsOf: '2026-10-01',
  illustrative: true,
}
```

`additionalMinorUnits` is statutory interest plus fixed compensation, and
excludes the debt itself. No grand total including the debt is produced: a
single figure combining debt, interest and compensation reads as a demand, and
this module produces an illustration.

`illustrative` is always `true`. Every consumer must carry that through.

The figures above are the arithmetic this design specifies, not an invented
example: £1,250 at 12.25% for 47 days on a 365-day basis is 1971.7465… pence,
which rounds half up to 1972, and £1,250 falls in the £70 band.

## Status and reasons

`status` is `calculated` or `unavailable`. `reasons` uses the same
`{ code, summary }` shape as the eligibility module, and carries informational
reasons as well as refusals, so a partial result always explains itself.

| `code` | `status` | Effect |
|---|---|---|
| `not_eligible` | `unavailable` | The eligibility outcome is not `supported`. |
| `law_inputs_missing` | `unavailable` | No law inputs were supplied. |
| `law_inputs_invalid` | `unavailable` | Malformed margin, period, band, or day count. |
| `no_reference_period` | `unavailable` | No supplied period covers the date the debt became late. |
| `currency_not_gbp` | `unavailable` | The bands and the rate are sterling figures. |
| `debt_amount_unusable` | `unavailable` | Missing, non-integer, or non-positive debt. |
| `dates_unusable` | `unavailable` | A due date or as-at date that is not a real calendar date. |
| `law_inputs_stale` | `calculated` | Interest withheld; fixed compensation still computed. |
| `not_yet_late` | `calculated` | The as-at date is on or before the due date. |

`unavailable` yields no figures at all: `interest`, `fixedCompensationMinorUnits`
and `additionalMinorUnits` are `null`. A caller cannot read a number out of a
refusal.

`not_yet_late` is the one case that reports zero rather than nothing: `daysLate`
is `0`, `interest` and `fixedCompensationMinorUnits` are `null`, and
`additionalMinorUnits` is `'0'`. A debt that is not yet late has no
late-payment relief to illustrate, and saying so is more useful than refusing.

## Staleness

`STALE_AFTER_DAYS` is `90`, the threshold
[`SKILLS.md`](../ai/SKILLS.md) §7.5 already defines. It is repository policy
rather than a legal fact, which is why it may live in the module while legal
values may not.

When `asOf` is more than 90 days before the as-at date, the statutory rate is
treated as too perishable to state: `interest` is `null` and
`law_inputs_stale` is reported, while the fixed compensation still computes
because it is not a high-volatility fact. The result stays `calculated`, and
`lawAsOf` is present on every output so no consumer can render a figure without
its date.

## Tests

`web/shared/latePayment.test.js`, run by the existing `node --test` script:

1. A worked example end to end, with every output field asserted.
2. Compensation bands at exactly £999.99, £1,000, £9,999.99 and £10,000.
3. An accrual spanning 29 February in a leap year.
4. An as-at date equal to the due date, and one before it, both `not_yet_late`.
5. Reference-period selection for a debt going late in each half-year, and a
   late date no period covers.
6. A snapshot 91 days old withholding interest while still giving compensation,
   and one exactly 90 days old still giving interest.
7. Each ineligible outcome yielding `unavailable` with no figures readable.
8. An exact half-penny asserting round-half-up.
9. A debt large enough that floating-point arithmetic would drift, asserting an
   exact figure.
10. Each invalid law input: missing, a malformed percentage, bands with no open
    top band, and a non-positive day count.
11. A non-sterling currency, and an unusable debt amount.
12. A due date of `2026-02-30` and other impossible dates.
13. Determinism: the same inputs twice produce a deep-equal result.
14. No reason summary states a legal conclusion, checked the way the
    eligibility suite checks its own.

## Documents to update on completion

`docs/issue-board.md`, `docs/plans/legal-assistance-build-order.md`,
`docs/project-status.md`, `docs/data-and-contracts.md` (the input and output
shapes, the reason codes, and the money and date conventions),
`docs/testing-and-demo.md` (the fixture suite), `docs/ai/SKILLS.md` (§6 already
assigns the arithmetic to the application layer; record that the module now
exists and that S5 narrates only figures it produced), and `docs/decisions.md` —
a new entry recording that legal values are inputs rather than constants.

## Explicitly out of scope

- The approved law snapshot and any real rate, margin, or band value (task 4).
- Any UI, route, or persistence for the result (task 6 and later).
- Any model involvement. No prompt, no skill, no narration.
- Compound interest, court fees, recovery costs beyond the fixed sum, currency
  conversion, and any figure the build order has not reached.
- Deciding a debt is owed or recoverable. The module illustrates; it does not
  conclude.
