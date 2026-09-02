# Eligibility questionnaire and escalation rules — design

**Date:** 2 September 2026
**Status:** Implemented as described
**Covers:** Task 2 of [`legal-assistance-build-order.md`](legal-assistance-build-order.md)
**Owner:** Tolga — application and AI

## Purpose

Decide, in deterministic code, whether a saved case file falls inside the
supported UK business-to-business late-payment scope, or whether it must leave
the automated path. The local model takes no part in this decision and receives
no eligibility question. Task 3's calculator and tasks 4–6's legal information
gate on the outcome this module produces.

## Scope boundary

This task produces an outcome code, the reasons behind it, and routing copy. It
does not build the professional-review handoff itself; that is task 8. It states
no legal conclusion — an escalation says the automated path stops here, never
that a claim is barred, that terms are unenforceable, or that a debt is owed.

## Module layout

| File | Responsibility |
|---|---|
| `web/shared/eligibility.js` | Pure ESM. `QUESTIONS`, `assess(answers, context)`, reason catalogue. No node imports, no I/O, no network. |
| `web/shared/eligibility.test.js` | Fixture suite over `assess`. |
| `web/server/cases/store.js` | Stores and validates answers. Never evaluates them. |
| `web/server/index.js` | One new route: `PUT /api/cases/:id/eligibility`. |
| `web/src/lib/casePack.js` | `saveCaseEligibility(caseId, answers)`. |
| `web/src/components/CasePack.jsx` | Questionnaire card inside `CaseDetail`, plus the outcome banner. |

`web/shared/` is new. The module is imported directly by both the service and
the bundle, so the question list and the rules exist in exactly one place. It
needs no Vite module-format bridge, unlike the CommonJS `@latepay/canonical`
alias, because the web package is already `type: module`.

## Where the assessment runs

`assess` runs in the browser. The due-date-mismatch rule needs the agreement's
on-chain `dueAt`, which only the live Coston2 read holds, and the service does
not read the chain. The service therefore stores and validates answers only,
and the assessment is computed where the stored answers and a fresh registry
read meet.

Running it client-side is not a weakening of the guardrail: the rules are
deterministic code with no model involvement, and the same module and the same
fixtures cover it. Nothing computed is persisted, so a later rules change cannot
leave a stale verdict in the database.

## Answers

Every question takes one of three values:

```text
"yes" | "no" | "unknown"
```

`unknown` is a first-class answer, not a missing one. An operator who does not
know whether the payer has entered an insolvency process must be able to say so
and see the assessment refuse to conclude, rather than guess.

## Question set

Eight questions. Each is one boolean fact an operator can answer from the case
file, the contract, or a phone call — none requires legal judgement.

| # | `id` | Question | Escalating answer |
|---:|---|---|---|
| 1 | `partiesActingInBusiness` | Were both the supplier and the payer acting in the course of a business? | `no` |
| 2 | `payerBasedInUk` | Is the payer established in the United Kingdom? | `no` |
| 3 | `invoiceDelivered` | Has the invoice been delivered to, or received by, the payer? | `no` |
| 4 | `debtDisputed` | Has the payer disputed the debt, the goods, the services, or raised a set-off? | `yes` |
| 5 | `payerInsolvencyProcess` | Is the payer in, or facing, an insolvency process — administration, liquidation, a voluntary arrangement, or a winding-up petition? | `yes` |
| 6 | `courtProceedings` | Have court proceedings been issued, or is a claim being contemplated? | `yes` |
| 7 | `contractTermsOver60Days` | Do the agreed payment terms exceed 60 days? | `yes` |
| 8 | `debtOlderThanSixYears` | Did the debt fall due more than six years ago? | `yes` |

All eight are required. Question 1 carries the consumer-matter trigger, so no
separate consumer question exists.

## Derived checks

Two checks read case and agreement facts rather than asking the operator, and
so cannot be answered incorrectly by clicking.

**High value.** The invoice total is compared against
`VITE_ELIGIBILITY_HIGH_VALUE_MINOR_UNITS`, default `5000000` — £50,000 in
pence. A total at or above the threshold escalates; a total exactly one minor
unit below it does not. The `VITE_` prefix is required because `assess` runs in
the browser, and Vite exposes no other variables to the bundle.

**Invoice due date versus contract deadline.** The case file's `invoiceDueDate`
is compared against the UTC calendar date of the linked agreement's on-chain
`dueAt`. A difference is surfaced as a blocking finding: which date governs is
a question for a human, and until it is settled the task 3 calculator has no
defensible date to count from. This is the rule the build order names
explicitly, and it is always visible in the outcome banner when it fires — never
folded silently into a generic message.

When the agreement cannot be read at all, the comparison is impossible rather
than clear, so the case reports `agreement_deadline_unreadable` instead of
passing as supported.

## Outcome codes

```text
"supported" | "needs_information" | "escalate"
```

- `supported` — every question answered, no trigger fired, both derived checks
  clear. Downstream legal-information and calculator features may run.
- `needs_information` — the assessment cannot be completed: a required answer is
  `unknown`, the invoice total is missing, the invoice currency is not GBP, or
  the two dates disagree.
- `escalate` — at least one trigger fired. The case leaves the automated path.

**Precedence:** `escalate` outranks `needs_information`. A fired trigger is a
definite fact that more answers cannot soften. The reasons list still carries
every `needs_information` reason alongside it, so nothing is hidden by the
precedence rule.

## Reason catalogue

Each reason carries a `route`, so "you have not sent the invoice yet" is never
presented as "see a solicitor".

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

`invoice_not_delivered` escalates but routes to the operator: the payment period
may not have started, and the fix is to send the invoice, not to take advice.

The six task 8 categories map onto `consumer_matter`, `cross_border`, `dispute`,
`insolvency`, `court_proceedings`, and `high_value`. Task 8 consumes the
`professional_review` route without needing to re-derive them.

## Return shape

```js
{
  outcome: 'escalate',
  reasons: [
    { code: 'dispute', route: 'professional_review', summary: 'The payer has disputed the debt.' },
  ],
  answeredCount: 8,
  requiredCount: 8,
}
```

`summary` is fixed English written in this module. No summary is generated, and
the UI adds no interpretation of its own beyond the routing copy attached to
each `route`.

## Storage

One table, one row per case, replaced on save:

```sql
CREATE TABLE case_eligibility (
  case_id TEXT PRIMARY KEY REFERENCES case_files(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL,
  assessed_at TEXT NOT NULL
);
```

Validation on write rejects an unknown question id, a value outside the three
permitted strings, and a payload larger than the question set. `answers_json`
holds nothing but the answer map.

Ownership follows the existing rule: the store resolves the case through
`getCase(id, ownerId)` before touching the eligibility row, so an operator can
neither read nor write another operator's answers, and a missing owner id is a
programming error rather than a permissive default.

`GET /api/cases/:id` gains an `eligibility` field — `{ answers, assessedAt }`,
or `null` when the questionnaire has not been answered. No outcome is returned
by the service, because the service cannot compute one.

## Route contract

`PUT /api/cases/:id/eligibility`

- Authorized like every other `/api/` route, through the operator token.
- Body: `{ answers: { <questionId>: "yes" | "no" | "unknown", … } }`.
- `200` with the updated case file, `404` when the case does not exist or
  belongs to another operator, `400` on an invalid answer map.
- `PUT` rather than `POST`: saving is a replacement of the single answer set,
  and repeating it is harmless.

## User interface

A questionnaire card in `CaseDetail`, below the live agreement evidence so the
operator has the on-chain deadline in view while answering.

- Each question renders as a three-way radio group from `QUESTIONS`, labelled
  by the question text. No question is pre-answered, and there is no default
  selection to accept by accident.
- One save button. Saving persists answers only.
- The outcome banner names the outcome in plain English and lists every reason
  with its routing copy. An `escalate` banner says the automated path stops and
  what kind of review is needed; it never states a legal position.
- A `needs_information` banner names precisely what is missing.
- The banner carries the prototype boundary already used elsewhere in the app:
  this is information and routing, not legal advice.

## Tests

`web/shared/eligibility.test.js`, run by the existing `node --test` script:

1. All eight answered clear, dates agreeing, amount under the threshold →
   `supported` with no reasons.
2. One fixture per question, asserting the exact reason code and route.
3. A required answer `unknown` → `needs_information` with
   `unanswered_questions`.
4. Invoice due date one day from the agreement deadline → `needs_information`
   with `due_date_mismatch`.
5. Amount exactly at the threshold → `escalate` with `high_value`; one minor
   unit below → `supported`.
6. Missing amount → `invoice_amount_missing`; `EUR` currency →
   `currency_not_gbp`.
7. A trigger plus an unknown answer → `escalate`, with both reasons present.
8. An unknown question id or an out-of-range value is rejected rather than
   ignored.

`web/server/cases/store.test.js` gains: saving answers, replacing them on a
second save, rejecting an invalid answer map, returning `null` for a case owned
by another operator, and the cascade delete leaving no orphan row.

A browser check confirms one full pass: answer the questionnaire on a saved
case, save, reload, and see the persisted answers and the recomputed outcome,
including a deliberately mismatched due date.

## Documents to update on completion

`docs/issue-board.md`, `docs/plans/legal-assistance-build-order.md`,
`docs/project-status.md`, `docs/data-and-contracts.md` (the new table and the
answer, outcome, reason and route enumerations), `docs/design.md` (the
questionnaire card and its copy), `docs/testing-and-demo.md` (the fixture suite
and the browser check), and `docs/decisions.md` — a new entry recording that the
eligibility outcome is computed at read time from stored answers plus a live
agreement read, and is never persisted.

## Explicitly out of scope

- Any model involvement in eligibility. No prompt, no skill, no narration.
- The professional-review handoff, referral records, and solicitor routing
  destinations (task 8).
- Interest, compensation, and date arithmetic (task 3).
- Citations and the law snapshot (task 4).
- A per-answer audit history. One current answer set per case is enough until
  task 7 defines what an audit record must contain.
