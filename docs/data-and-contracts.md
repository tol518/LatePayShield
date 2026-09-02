# Data and Contract Boundaries

**Current status:** Canonicalization and the local agreement contract are implemented
and tested. Coston2 deployment and FDC address-hash compatibility are externally
verified; a real FDC proof has not yet been accepted by a LatePayShield agreement.

## Canonical terms

`lib/canonical.js` is the sole implementation. It returns fields in this exact order:

```json
{
  "termsVersion": 1,
  "invoiceNumber": "INV-2026-001",
  "supplierName": "Maya Design Studio",
  "payerName": "Acme Ltd",
  "currency": "XRP_TESTNET",
  "amountDrops": "2000000",
  "xrplDestination": "r...",
  "destinationTag": "2026001",
  "dueAt": "1788264000"
}
```

### Normalization rules

- `termsVersion` is forced to numeric `1`; caller input cannot select another version.
- `invoiceNumber`, `supplierName`, `payerName`, and `xrplDestination` are stringified, trimmed, and required to be non-empty.
- `currency` must equal `XRP_TESTNET`.
- `amountDrops` is an integer string in `[1, 2^64 - 1]`.
- `destinationTag` is an integer string in `[0, 2^32 - 1]`.
- `dueAt` is a positive integer string within `uint64`.
- Unsafe JavaScript numeric integers are rejected before `BigInt` conversion.
- Unknown input fields are excluded from serialization.

The hash is:

```text
invoiceHash = keccak256(UTF8(JSON.stringify(canonicalObject)))
```

`JSON.stringify` has no whitespace and the object is rebuilt in the fixed field order. Any semantic change to these rules requires a terms-version decision, shared fixtures, and coordinated migration.

## FDC address hash

`standardAddressHash(xrplAddress)` currently returns:

```text
keccak256(UTF8(trimmedAddress))
```

This was externally verified against the `XRPPayment` FDC response for XRPL Testnet
transaction `A0DA3E67...ADF3565`: destination `rUCR23Ys3TWFMqdNDzFehUjyxj8ZfUYo9V`
returned `receivingAddressHash` `0x4abeacf6...9ddbfb8f`.

## Agreement storage

Each `Agreement` contains:

| Field | Solidity type | Meaning |
|---|---|---|
| `invoiceHash` | `bytes32` | Commitment to canonical confirmed terms. |
| `supplier` | `address` | EVM caller that created the agreement. |
| `xrplDestinationHash` | `bytes32` | FDC-format destination commitment. |
| `destinationTag` | `uint256` | Required XRPL destination tag. |
| `expectedDrops` | `uint64` | Minimum accepted payment amount. |
| `startLedger` | `uint64` | Creator-claimed lower evidence bound. |
| `dueAt` | `uint64` | Unix deadline. |
| `status` | `Status` | Authoritative on-chain state. |
| `evidenceId` | `bytes32` | `keccak256(abi.encode(proof.data))` for a finalized outcome. |
| `xrplTxHash` | `bytes32` | FDC request transaction ID for a paid outcome. |

Invoice text, names, documents, email addresses, wallet seeds, and private keys stay off-chain.

## Status ownership

| Contract status | Value | UI status |
|---|---:|---|
| `None` | 0 | No agreement |
| `Active` | 1 | `ACTIVE`; derive `OVERDUE_PENDING` after the deadline |
| `PaidVerified` | 2 | `PAID_VERIFIED` |
| `OverdueVerified` | 3 | `OVERDUE_VERIFIED` |
| `Disputed` | 4 | `DISPUTED` |

`DRAFT` and `PAYMENT_SUBMITTED` are UI-only. `OVERDUE_PENDING` is also UI-only and carries no proof.

## Creation rules

`createAgreement` rejects:

- zero invoice hash;
- zero destination hash;
- zero expected amount;
- zero start ledger;
- deadline at or before the current EVM timestamp.

The caller becomes the supplier and the initial status is `Active`.

## Paid-proof rules

`recordVerifiedPayment` is permissionless but finalizes only when all checks pass:

1. Agreement exists and is active.
2. `IFdcVerification.verifyXRPPayment(proof)` returns true.
3. XRPL response status is success (`0`).
4. Receiving address hash equals the agreement value.
5. Received amount is positive and **at least** `expectedDrops`; overpayment is accepted.
6. Destination tag is present and equal.
7. Payment ledger is not before `startLedger`.
8. Payment timestamp is not after `dueAt`.

The current contract does not inspect the XRPL memo or `invoiceNumber`. The committed payment evidence contains `INV-2026-001`, but that reference is not an on-chain/FDC matching condition.

## Non-payment-proof rules

`recordVerifiedNonPayment` requires an active agreement and an EVM time after `dueAt`, then verifies the FDC proof and pins its request body:

- `amount == expectedDrops - 1`. The interface documents the search as strictly greater than the requested amount, but the live verifier matches at or above it, so this bound is one drop wider than intended. It stays safe against a false overdue and is recorded as a known issue;
- destination address hash equals the agreement value;
- destination-tag checking is enabled and the tag matches;
- minimal ledger is no later than the creator-supplied `startLedger`;
- request deadline is at least the agreement deadline.

The outcome proves only that no qualifying payment matching those conditions appeared in the proof's ledger/time window.

## Dispute behavior

Only the recorded supplier may call `markDisputed`. It can move active or finalized agreements into `Disputed`; the MVP does not resolve or reverse disputes. Calling it twice fails.

## Verifier boundary

- On local chain ID `31337`, tests may inject `MockFdcVerification`.
- On any other chain, a non-zero override reverts with `VerifierOverrideNotAllowed`.
- With a zero override, the contract resolves Flare's enshrined verifier through `ContractRegistry`.
- Outcome functions are permissionless because the verified proof is intended to be the authority.

Local mock tests prove contract checks and transitions, not live FDC compatibility.

## Events

- `AgreementCreated`
- `PaymentVerified`
- `NonPaymentVerified`
- `Disputed`

Future application types must be generated from the actual ABI and must preserve enum/event semantics rather than restating them independently.

## Case storage

`web/server/cases/store.js` owns a local SQLite database, independent of the
canonical terms and the on-chain agreement above. It has not previously been
documented here; this section records it alongside the new `case_eligibility`
table it gained in this task.

| Table | Key columns | Meaning |
|---|---|---|
| `case_files` | `id` (primary key), `owner_id`, `agreement_id` (unique), `invoice_number`, `supplier_name`, `payer_name`, `invoice_currency`, `invoice_amount_minor_units`, `invoice_due_date`, `payment_terms_text`, `invoice_source_name`, `invoice_source_sha256`, `source_quotes_json`, `facts_confirmed_at`, `created_at`, `updated_at` | One row per human-confirmed case, joined one-to-one to a Coston2 `agreement_id`. Raw invoice text is not stored. |
| `case_communications` | `id`, `case_id` (references `case_files(id)` `ON DELETE CASCADE`), `occurred_at`, `channel`, `direction`, `subject`, `summary`, `created_at` | Human-entered communication timeline notes. |
| `case_eligibility` | `case_id` (primary key, references `case_files(id)` `ON DELETE CASCADE`), `answers_json`, `assessed_at` | One row per case, replaced on every save. Holds the operator's answers to the eight `web/shared/eligibility.js` questions and nothing else — no outcome is stored (D-011). |

All three tables are scoped by `owner_id` on `case_files`; every read and write
resolves the case through `getCase(id, ownerId)` first, so an operator can
neither read nor write another operator's rows.

## Eligibility enumerations

`web/shared/eligibility.js` is the sole implementation of the eligibility
rules. It is imported unchanged by `web/server/cases/store.js` and by the
browser bundle.

**Answers** — exactly `yes`, `no`, `unknown`. `unknown` is a real answer, not a
missing one.

**Outcomes** — exactly `supported`, `needs_information`, `escalate`.
`escalate` outranks `needs_information`: a fired trigger is a definite fact
that more answers cannot soften, but the reasons list still carries every
`needs_information` reason alongside it, so the precedence rule hides nothing.

**Routes** — exactly `professional_review` (needs a qualified adviser) and
`operator_action` (an operator can resolve it in the case file).

**Reason codes** — fourteen, each contributing one outcome on one route:

| `code` | `route` | Outcome contribution |
|---|---|---|
| `consumer_matter` | `professional_review` | `escalate` |
| `cross_border` | `professional_review` | `escalate` |
| `dispute` | `professional_review` | `escalate` |
| `insolvency` | `professional_review` | `escalate` |
| `court_proceedings` | `professional_review` | `escalate` |
| `long_payment_terms` | `professional_review` | `escalate` |
| `limitation_risk` | `professional_review` | `escalate` |
| `high_value` | `professional_review` | `escalate` |
| `invoice_not_delivered` | `operator_action` | `escalate` |
| `unanswered_questions` | `operator_action` | `needs_information` |
| `due_date_mismatch` | `operator_action` | `needs_information` |
| `agreement_deadline_unreadable` | `operator_action` | `needs_information` |
| `invoice_amount_missing` | `operator_action` | `needs_information` |
| `currency_not_gbp` | `operator_action` | `needs_information` |

`invoice_not_delivered` escalates but still routes to `operator_action`: the
payment period may not have started, and the fix is to send the invoice, not
to take advice.

The high-value threshold defaults to `DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS`
(5,000,000 minor units, £50,000) and is overridable per workspace by
`VITE_ELIGIBILITY_HIGH_VALUE_MINOR_UNITS`, read from the repository-root
`.env` by Vite's `envDir`; a missing, blank, non-integer, or zero-or-below
value falls back to the default, since zero is not a meaningful routing
threshold. The due-date check compares the case file's `invoiceDueDate`
against the local calendar date of the linked agreement's on-chain `dueAt`,
read in the same convention the deadline was created in so an operator in any
timezone gets a like-for-like comparison; an agreement whose deadline cannot
be read contributes `agreement_deadline_unreadable` rather than being treated
as clear.

No outcome is ever persisted (D-011): `assess(answers, context)` recomputes it
from the stored answers and a fresh registry read every time a case is opened.

## Late-payment calculator

`web/shared/latePayment.js` is the sole implementation. It is a pure ESM
module — no route, no storage, no UI, no model involvement — imported
unchanged wherever the local service and the browser bundle need it. It
exports `calculate(caseFacts, lawInputs)`, the frozen `REASONS` catalogue, and
`STALE_AFTER_DAYS` (`90`), the only number the module holds in code: it is
this repository's own currency policy, not a fact about the law. No legal
value — the margin over base rate, the reference rates, the fixed-compensation
bands, the day-count basis — appears in the module; every one of them arrives
in `lawInputs` (D-012).

**`caseFacts`:**

| Field | Shape | Meaning |
|---|---|---|
| `eligibilityOutcome` | string | The outcome string `web/shared/eligibility.js` `assess()` returns. The module takes it as a plain parameter rather than importing that module. |
| `debtMinorUnits` | decimal string | Whole, positive minor units. Must be a string; a `Number` is rejected (`debt_amount_unusable`) rather than converted, since a large enough `Number` loses precision before it ever reaches `BigInt`. |
| `currency` | string | Must be `GBP`. |
| `dueDate` | `YYYY-MM-DD` | The invoice due date. |
| `asAtDate` | `YYYY-MM-DD` | Supplied by the caller; the module never reads a clock. |

**`lawInputs`:**

| Field | Shape | Meaning |
|---|---|---|
| `asOf` | `YYYY-MM-DD` | Date the supplied law values were current. |
| `marginPercent` | decimal string | Margin over the base rate. |
| `dayCountBasis` | positive integer | Day-count denominator for simple interest. Must actually be of type `number`; a boolean, an array, or a numeric string is rejected (`law_inputs_invalid`) rather than coerced, since coercing `true` to `1` would silently change the interest by a factor of the true denominator. |
| `referencePeriods` | array of `{ start, end, baseRatePercent }` | Each a `YYYY-MM-DD` pair and a decimal-string rate; `end` must not be before `start`. No two periods may overlap, or the inputs are rejected (`law_inputs_invalid`); the periods are matched with `.find()`, so an overlap would let list order silently decide the rate. |
| `compensationBands` | array of `{ upToMinorUnits, amountMinorUnits }` | Ordered bands; the last entry's `upToMinorUnits` must be `null` (an open top band), and every earlier entry's `upToMinorUnits` must be a strictly ascending value, or the inputs are rejected. The bands are matched with `.find()`, so an out-of-order list would let the first listed match win instead of the smallest band that fits. |

**Result shape.** Every result carries exactly these twelve keys on every
path, so a caller can never read a figure out of a refusal: `status`,
`reasons`, `dueDate`, `asAtDate`, `daysLate`, `debtMinorUnits`, `currency`,
`interest`, `fixedCompensationMinorUnits`, `additionalMinorUnits`, `lawAsOf`,
`illustrative`. `illustrative` is `true` on every result, and `lawAsOf` is
always present so no consumer can render a figure without its date.
`additionalMinorUnits` is interest plus fixed compensation and deliberately
excludes the debt itself — a single combined figure would read as a demand.
When interest is withheld (`law_inputs_stale`), `additionalMinorUnits` is
`null` rather than the fixed compensation alone: reporting the fixed amount by
itself would read as though the withheld interest were zero, and a caller
must not be able to read a number out of a partial refusal.

**Status and reason codes.** `status` is exactly `calculated` or
`unavailable`. Nine reason codes:

| `code` | `status` | Meaning |
|---|---|---|
| `not_eligible` | `unavailable` | The eligibility outcome is not `supported`. |
| `law_inputs_missing` | `unavailable` | No law inputs were supplied. |
| `law_inputs_invalid` | `unavailable` | The supplied law inputs could not be read. |
| `no_reference_period` | `unavailable` | No supplied period covers the date the debt became late. |
| `currency_not_gbp` | `unavailable` | The debt is not in sterling. |
| `debt_amount_unusable` | `unavailable` | The debt is not a whole, positive number of minor units. |
| `dates_unusable` | `unavailable` | The due date or the as-at date is not a real calendar date. |
| `law_inputs_stale` | `calculated` | The law inputs are older than `STALE_AFTER_DAYS`; interest is withheld but fixed compensation is still computed. `additionalMinorUnits` is `null` on this path. |
| `not_yet_late` | `calculated` | The as-at date is on or before the due date; `daysLate` is `0` and `additionalMinorUnits` is `'0'`. |

**Money.** Whole minor units, carried across the boundary as decimal strings
and computed in `BigInt`. No float touches a monetary value. Interest is
simple, never compounded, and is rounded half up to the nearest penny exactly
once, at the end.

**Dates.** `YYYY-MM-DD` strings parsed from their year, month and day
components and differenced in UTC, never through `new Date(string)`. An
impossible date such as `2026-02-30` is rejected rather than rolled forward.

**Reference period selection.** The debt becomes late the day after the due
date, and that single date decides which supplied reference period governs
the whole accrual — one rate for the whole accrual, never a blend across a
boundary. The chosen period is named in the output. If no supplied period
covers that date, the module refuses (`no_reference_period`) rather than
extrapolating or falling back to the nearest period.

The calculator produces no figures in the running application today, because
no approved law inputs exist yet; that stays true until task 4 builds the
approved UK-law source library that supplies `lawInputs`.

## Update triggers

Update this file whenever canonical fields/order/normalization, hash/address encoding, storage, statuses, transitions, matching conditions, ABI, events, evidence ID semantics, or verifier trust changes.
