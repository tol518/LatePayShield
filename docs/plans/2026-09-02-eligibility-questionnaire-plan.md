# Eligibility Questionnaire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship task 2 of the legal-assistance build order: a deterministic eligibility questionnaire whose outcome routes unsupported or uncertain late-payment cases away from the automated path.

**Architecture:** One pure ESM module, `web/shared/eligibility.js`, owns the question list, the reason catalogue, and `assess()`. The Node service stores and validates answers only. `assess()` runs in the browser, where the stored answers meet a fresh Coston2 registry read, because the invoice-due-date-versus-contract-deadline rule needs the agreement's on-chain `dueAt` and the service never reads the chain. No outcome is ever persisted, so a rules change cannot leave a stale verdict behind.

**Tech Stack:** Node 22+ (`node:sqlite`, `node:test`), plain ESM, React 19, Vite 7. No new dependencies.

**Design document:** [`2026-09-02-eligibility-questionnaire-design.md`](2026-09-02-eligibility-questionnaire-design.md)

## Global Constraints

- **Branch and commit policy.** All work happens on `feat/eligibility-questionnaire`. The user has approved exactly one commit per task on that branch, and nothing else: never amend, never push, never tag, never merge, and never touch `main`. Merging remains the user's decision.
- **Commit messages.** Short, plain, human sounding, no em dashes. No `Co-Authored-By` trailer, no "Generated with" line, and no mention of Claude, Anthropic, or AI anywhere in the message.
- No new npm dependencies. Everything here uses Node built-ins, React, and what `web/package.json` already declares.
- `web/shared/eligibility.js` must stay pure: no `node:` imports, no `import.meta.env`, no `fetch`, no `Date.now()` outside an explicitly passed argument. Both Node and the browser bundle import it unchanged.
- No model involvement anywhere in this task. No prompt, no skill, no `web/server/ai/` change.
- No legal conclusion in any string. An escalation says the automated path stops here. It never says a claim is barred, that terms are unenforceable, that a debt is owed, or what a court would do.
- Answer values are exactly `"yes"`, `"no"`, `"unknown"`. `unknown` is a real answer, never a missing one.
- Outcome codes are exactly `"supported"`, `"needs_information"`, `"escalate"`. `escalate` outranks `needs_information`, and the reasons list still carries both.
- Reason `route` values are exactly `"professional_review"` and `"operator_action"`.
- Case reads and writes stay scoped to the authenticated operator's `owner_id`. A missing owner id is a programming error and throws, never a permissive default.
- Follow the file's existing comment style: explain a non-obvious why. Never reference a doc path, a spec, or a task number in a code comment.
- Test command for every task: `npm --prefix web test`.

---

### Task 1: The pure rules module

**Files:**
- Create: `web/shared/eligibility.js`
- Create: `web/shared/eligibility.test.js`
- Modify: `web/package.json:15` (the `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `QUESTIONS` — frozen array of `{ id, prompt, escalatingAnswer, reason }`, eight entries, in display order.
  - `ANSWER_VALUES` — `['yes', 'no', 'unknown']`.
  - `REASONS` — object keyed by reason code, each `{ route, outcome, summary }`.
  - `DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS` — `5000000`.
  - `assess(answers, context)` → `{ outcome, reasons, answeredCount, requiredCount }` where `reasons` is an array of `{ code, route, summary }`. `context` is `{ invoiceAmountMinorUnits, invoiceCurrency, invoiceDueDate, agreementDueAtSeconds, highValueThresholdMinorUnits }`, all optional.
  - `answerProblem(answers)` → a human-readable string describing the first problem with an answer map, or `null` when the map is usable. Task 2's store consumes this.

- [ ] **Step 1: Write the failing test**

Create `web/shared/eligibility.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANSWER_VALUES, QUESTIONS, REASONS, answerProblem, assess } from './eligibility.js';

/** Every question answered in the way that keeps a case inside scope. */
function clearAnswers(overrides = {}) {
  const answers = {};
  for (const question of QUESTIONS) {
    answers[question.id] = question.escalatingAnswer === 'yes' ? 'no' : 'yes';
  }
  return { ...answers, ...overrides };
}

function clearContext(overrides = {}) {
  return {
    invoiceAmountMinorUnits: '125000',
    invoiceCurrency: 'GBP',
    invoiceDueDate: '2026-09-29',
    // 2026-09-29T00:00:00Z, so the invoice date and the registered deadline agree.
    agreementDueAtSeconds: Math.floor(Date.parse('2026-09-29T00:00:00Z') / 1000),
    ...overrides,
  };
}

function codes(assessment) {
  return assessment.reasons.map((reason) => reason.code);
}

test('a fully answered in-scope case is supported with no reasons', () => {
  const assessment = assess(clearAnswers(), clearContext());
  assert.equal(assessment.outcome, 'supported');
  assert.deepEqual(assessment.reasons, []);
  assert.equal(assessment.answeredCount, QUESTIONS.length);
  assert.equal(assessment.requiredCount, QUESTIONS.length);
});

test('each question escalates with its own reason code and route', () => {
  const expected = {
    partiesActingInBusiness: ['consumer_matter', 'professional_review'],
    payerBasedInUk: ['cross_border', 'professional_review'],
    invoiceDelivered: ['invoice_not_delivered', 'operator_action'],
    debtDisputed: ['dispute', 'professional_review'],
    payerInsolvencyProcess: ['insolvency', 'professional_review'],
    courtProceedings: ['court_proceedings', 'professional_review'],
    contractTermsOver60Days: ['long_payment_terms', 'professional_review'],
    debtOlderThanSixYears: ['limitation_risk', 'professional_review'],
  };
  assert.equal(Object.keys(expected).length, QUESTIONS.length);

  for (const question of QUESTIONS) {
    const [code, route] = expected[question.id];
    const assessment = assess(
      clearAnswers({ [question.id]: question.escalatingAnswer }),
      clearContext(),
    );
    assert.equal(assessment.outcome, 'escalate', `${question.id} did not escalate.`);
    assert.deepEqual(codes(assessment), [code]);
    assert.equal(assessment.reasons[0].route, route);
    assert.ok(assessment.reasons[0].summary.length > 0);
  }
});

test('an unknown or missing answer needs information rather than a verdict', () => {
  const unknown = assess(clearAnswers({ debtDisputed: 'unknown' }), clearContext());
  assert.equal(unknown.outcome, 'needs_information');
  assert.deepEqual(codes(unknown), ['unanswered_questions']);
  assert.equal(unknown.answeredCount, QUESTIONS.length - 1);

  const missing = clearAnswers();
  delete missing.payerBasedInUk;
  assert.equal(assess(missing, clearContext()).outcome, 'needs_information');

  // A value outside the permitted set is not an answer either.
  assert.equal(assess(clearAnswers({ debtDisputed: 'probably' }), clearContext()).outcome, 'needs_information');
});

test('a fired trigger outranks missing information and both reasons survive', () => {
  const assessment = assess(
    clearAnswers({ debtDisputed: 'yes', payerBasedInUk: 'unknown' }),
    clearContext(),
  );
  assert.equal(assessment.outcome, 'escalate');
  assert.deepEqual(codes(assessment).sort(), ['dispute', 'unanswered_questions']);
});

test('the invoice due date is checked against the registered agreement deadline', () => {
  const mismatch = assess(clearAnswers(), clearContext({ invoiceDueDate: '2026-09-30' }));
  assert.equal(mismatch.outcome, 'needs_information');
  assert.deepEqual(codes(mismatch), ['due_date_mismatch']);
  assert.equal(mismatch.reasons[0].route, 'operator_action');

  // A deadline later in the same UTC day is the same date, not a mismatch.
  const sameDay = assess(clearAnswers(), clearContext({
    agreementDueAtSeconds: Math.floor(Date.parse('2026-09-29T17:45:00Z') / 1000),
  }));
  assert.equal(sameDay.outcome, 'supported');

  // An unreadable agreement cannot be compared, so no verdict is offered.
  const unreadable = assess(clearAnswers(), clearContext({ agreementDueAtSeconds: undefined }));
  assert.equal(unreadable.outcome, 'needs_information');
  assert.deepEqual(codes(unreadable), ['agreement_deadline_unreadable']);
});

test('the high-value threshold escalates at the boundary and not below it', () => {
  const at = assess(clearAnswers(), clearContext({ invoiceAmountMinorUnits: '5000000' }));
  assert.equal(at.outcome, 'escalate');
  assert.deepEqual(codes(at), ['high_value']);
  assert.equal(at.reasons[0].route, 'professional_review');

  const below = assess(clearAnswers(), clearContext({ invoiceAmountMinorUnits: '4999999' }));
  assert.equal(below.outcome, 'supported');

  const configured = assess(clearAnswers(), clearContext({
    invoiceAmountMinorUnits: '200000',
    highValueThresholdMinorUnits: 200000,
  }));
  assert.deepEqual(codes(configured), ['high_value']);
});

test('an amount that cannot be compared needs information', () => {
  for (const invoiceAmountMinorUnits of ['', null, undefined, '1,250.00']) {
    const assessment = assess(clearAnswers(), clearContext({ invoiceAmountMinorUnits }));
    assert.equal(assessment.outcome, 'needs_information');
    assert.deepEqual(codes(assessment), ['invoice_amount_missing']);
  }

  const euro = assess(clearAnswers(), clearContext({ invoiceCurrency: 'EUR' }));
  assert.equal(euro.outcome, 'needs_information');
  assert.deepEqual(codes(euro), ['currency_not_gbp']);
});

test('an answer map with an unknown question or an out-of-range value is rejected', () => {
  assert.equal(answerProblem(clearAnswers()), null);
  assert.equal(answerProblem({}), null);
  assert.match(answerProblem({ isTheClaimStrong: 'yes' }), /not an eligibility question/);
  assert.match(answerProblem({ debtDisputed: 'probably' }), /yes, no, or unknown/);
  assert.match(answerProblem({ debtDisputed: true }), /yes, no, or unknown/);
  assert.match(answerProblem(null), /must be an object/);
  assert.match(answerProblem([]), /must be an object/);
  assert.deepEqual(ANSWER_VALUES, ['yes', 'no', 'unknown']);
});

test('no question or reason states a legal position', () => {
  const forbidden = /\b(entitled|enforceable|unenforceable|you should|will win|owes you|barred)\b/i;
  for (const question of QUESTIONS) {
    assert.doesNotMatch(question.prompt, forbidden, `${question.id} prompt states a position.`);
  }
  for (const [code, entry] of Object.entries(REASONS)) {
    assert.doesNotMatch(entry.summary, forbidden, `${code} summary states a position.`);
    assert.ok(['professional_review', 'operator_action'].includes(entry.route), `${code} has an unknown route.`);
    assert.ok(['escalate', 'needs_information'].includes(entry.outcome), `${code} has an unknown outcome.`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/shared/eligibility.test.js`
Expected: FAIL with `Cannot find module` for `./eligibility.js`.

- [ ] **Step 3: Write the module**

Create `web/shared/eligibility.js`:

```js
/*
 * Deterministic eligibility rules for the supported UK business-to-business
 * late-payment scope.
 *
 * Nothing here asks a model anything, and nothing here takes a legal position.
 * An escalation means the automated path stops and a human decides; it is not a
 * statement that a debt is owed, that terms are unenforceable, or that a claim
 * is out of time.
 *
 * This module is imported unchanged by the local service and by the browser
 * bundle, so it stays free of platform APIs.
 */

export const ANSWER_VALUES = ['yes', 'no', 'unknown'];

// £50,000 in pence. Overridable per workspace; the value is a routing
// threshold, not a legal boundary.
export const DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS = 5_000_000;

const WHOLE_MINOR_UNITS = /^\d+$/;

/**
 * Each question is one fact an operator can answer from the case file, the
 * contract, or a phone call. None of them requires legal judgement, which is
 * why the answers can be trusted to route the case.
 */
export const QUESTIONS = Object.freeze([
  {
    id: 'partiesActingInBusiness',
    prompt: 'Were both the supplier and the payer acting in the course of a business?',
    escalatingAnswer: 'no',
    reason: 'consumer_matter',
  },
  {
    id: 'payerBasedInUk',
    prompt: 'Is the payer established in the United Kingdom?',
    escalatingAnswer: 'no',
    reason: 'cross_border',
  },
  {
    id: 'invoiceDelivered',
    prompt: 'Has the invoice been delivered to, or received by, the payer?',
    escalatingAnswer: 'no',
    reason: 'invoice_not_delivered',
  },
  {
    id: 'debtDisputed',
    prompt: 'Has the payer disputed the debt, the goods, the services, or raised a set-off?',
    escalatingAnswer: 'yes',
    reason: 'dispute',
  },
  {
    id: 'payerInsolvencyProcess',
    prompt: 'Is the payer in, or facing, an insolvency process such as administration, liquidation, a voluntary arrangement, or a winding-up petition?',
    escalatingAnswer: 'yes',
    reason: 'insolvency',
  },
  {
    id: 'courtProceedings',
    prompt: 'Have court proceedings been issued, or is a claim being contemplated?',
    escalatingAnswer: 'yes',
    reason: 'court_proceedings',
  },
  {
    id: 'contractTermsOver60Days',
    prompt: 'Do the agreed payment terms exceed 60 days?',
    escalatingAnswer: 'yes',
    reason: 'long_payment_terms',
  },
  {
    id: 'debtOlderThanSixYears',
    prompt: 'Did the debt fall due more than six years ago?',
    escalatingAnswer: 'yes',
    reason: 'limitation_risk',
  },
]);

/**
 * `route` separates the two kinds of stop: one needs a qualified adviser, the
 * other needs the operator to finish the case file. Presenting an unsent
 * invoice as a matter for a solicitor would be both wrong and alarming.
 */
export const REASONS = Object.freeze({
  consumer_matter: {
    route: 'professional_review',
    outcome: 'escalate',
    summary: 'One of the parties was not acting in the course of a business, so this falls outside the supported business-to-business scope.',
  },
  cross_border: {
    route: 'professional_review',
    outcome: 'escalate',
    summary: 'The payer is not established in the United Kingdom, so this falls outside the supported scope.',
  },
  dispute: {
    route: 'professional_review',
    outcome: 'escalate',
    summary: 'The payer has disputed the debt or raised a set-off.',
  },
  insolvency: {
    route: 'professional_review',
    outcome: 'escalate',
    summary: 'The payer is in, or facing, an insolvency process.',
  },
  court_proceedings: {
    route: 'professional_review',
    outcome: 'escalate',
    summary: 'Court proceedings have been issued, or a claim is being contemplated.',
  },
  long_payment_terms: {
    route: 'professional_review',
    outcome: 'escalate',
    summary: 'The agreed payment terms exceed 60 days.',
  },
  limitation_risk: {
    route: 'professional_review',
    outcome: 'escalate',
    summary: 'The debt fell due more than six years ago.',
  },
  high_value: {
    route: 'professional_review',
    outcome: 'escalate',
    summary: 'The invoice total is at or above this workspace configured high-value threshold.',
  },
  invoice_not_delivered: {
    route: 'operator_action',
    outcome: 'escalate',
    summary: 'The invoice has not been delivered to the payer, so the payment period may not have started.',
  },
  unanswered_questions: {
    route: 'operator_action',
    outcome: 'needs_information',
    summary: 'One or more questions are unanswered or answered "unknown".',
  },
  due_date_mismatch: {
    route: 'operator_action',
    outcome: 'needs_information',
    summary: 'The invoice due date and the registered agreement deadline are different dates. Settle which one governs before relying on any date arithmetic.',
  },
  agreement_deadline_unreadable: {
    route: 'operator_action',
    outcome: 'needs_information',
    summary: 'The registered agreement deadline could not be read, so the invoice due date could not be checked against it.',
  },
  invoice_amount_missing: {
    route: 'operator_action',
    outcome: 'needs_information',
    summary: 'The case file records no whole-minor-unit invoice total, so the high-value check could not run.',
  },
  currency_not_gbp: {
    route: 'operator_action',
    outcome: 'needs_information',
    summary: 'The invoice is not in sterling, so it could not be compared with the sterling high-value threshold.',
  },
});

function reason(code) {
  const { route, summary } = REASONS[code];
  return { code, route, summary };
}

/** Returns the first problem with an answer map, or null when it is usable. */
export function answerProblem(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return 'Eligibility answers must be an object.';
  }
  const entries = Object.entries(answers);
  if (entries.length > QUESTIONS.length) {
    return 'Eligibility answers contain more entries than there are questions.';
  }
  const known = new Set(QUESTIONS.map((question) => question.id));
  for (const [id, value] of entries) {
    if (!known.has(id)) return `"${id}" is not an eligibility question.`;
    if (!ANSWER_VALUES.includes(value)) return `The answer to "${id}" must be yes, no, or unknown.`;
  }
  return null;
}

/** The UTC calendar date of an on-chain deadline, or null when unreadable. */
function deadlineDate(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString().slice(0, 10);
}

/**
 * Checks that read the case and the agreement instead of asking, so they
 * cannot be answered wrongly by clicking.
 */
function derivedReasons(context) {
  const reasons = [];
  const amount = String(context.invoiceAmountMinorUnits ?? '').trim();
  const currency = String(context.invoiceCurrency ?? '').trim().toUpperCase();
  const threshold = Number(context.highValueThresholdMinorUnits ?? DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS);

  if (!WHOLE_MINOR_UNITS.test(amount)) reasons.push(reason('invoice_amount_missing'));
  else if (currency && currency !== 'GBP') reasons.push(reason('currency_not_gbp'));
  else if (BigInt(amount) >= BigInt(Math.trunc(threshold))) reasons.push(reason('high_value'));

  const deadline = deadlineDate(context.agreementDueAtSeconds);
  const invoiceDueDate = String(context.invoiceDueDate ?? '').trim();
  if (!deadline) reasons.push(reason('agreement_deadline_unreadable'));
  else if (invoiceDueDate && invoiceDueDate !== deadline) reasons.push(reason('due_date_mismatch'));

  return reasons;
}

/**
 * Route a case from its answers and its own facts.
 *
 * A fired trigger outranks missing information: it is a definite fact that more
 * answers cannot soften. The reasons list still carries everything that fired,
 * so the precedence rule hides nothing from the operator.
 */
export function assess(answers, context = {}) {
  const reasons = [];
  let answeredCount = 0;

  for (const question of QUESTIONS) {
    const answer = answers?.[question.id];
    if (answer === question.escalatingAnswer) reasons.push(reason(question.reason));
    if (answer === 'yes' || answer === 'no') answeredCount += 1;
  }
  if (answeredCount < QUESTIONS.length) reasons.push(reason('unanswered_questions'));
  reasons.push(...derivedReasons(context));

  const escalates = reasons.some((entry) => REASONS[entry.code].outcome === 'escalate');
  const outcome = escalates ? 'escalate' : reasons.length > 0 ? 'needs_information' : 'supported';

  return { outcome, reasons, answeredCount, requiredCount: QUESTIONS.length };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test web/shared/eligibility.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Add the shared directory to the web test script**

In `web/package.json`, replace the `test` script:

```json
"test": "node --test src/lib/*.test.js server/*.test.js server/ai/*.test.js server/cases/*.test.js shared/*.test.js"
```

- [ ] **Step 6: Run the whole suite**

Run: `npm --prefix web test`
Expected: PASS, including the nine new eligibility tests.

- [ ] **Step 7: Stage and report**

```bash
git add web/shared/eligibility.js web/shared/eligibility.test.js web/package.json
git commit -m "Add deterministic eligibility rules and fixtures"
git log --oneline -1
```

Report the commit hash and the test count.

---

### Task 2: Persist the answers

**Files:**
- Modify: `web/server/cases/store.js` (imports, the `CREATE TABLE` block, `mapCase`, `getCase`, and a new `saveEligibility`)
- Modify: `web/server/cases/store.test.js` (new tests appended)

**Interfaces:**
- Consumes: `answerProblem` from `web/shared/eligibility.js` (Task 1).
- Produces: `CaseStore.saveEligibility(caseId, answers, ownerId)` → the updated case file, or `null` when the case does not exist or belongs to another operator. Throws `CaseInputError` on an invalid answer map. `CaseStore.getCase(id, ownerId)` gains an `eligibility` field: `{ answers, assessedAt }`, or `null` when unanswered.

- [ ] **Step 1: Write the failing tests**

Append to `web/server/cases/store.test.js`:

```js
test('stores, replaces, and scopes eligibility answers', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    assert.equal(created.eligibility, null);

    const saved = store.saveEligibility(created.id, { debtDisputed: 'no', payerBasedInUk: 'yes' }, OPERATOR);
    assert.deepEqual(saved.eligibility.answers, { debtDisputed: 'no', payerBasedInUk: 'yes' });
    assert.match(saved.eligibility.assessedAt, /^\d{4}-\d{2}-\d{2}T/);

    // Saving again replaces the single answer set rather than appending one.
    const replaced = store.saveEligibility(created.id, { debtDisputed: 'unknown' }, OPERATOR);
    assert.deepEqual(replaced.eligibility.answers, { debtDisputed: 'unknown' });
    assert.deepEqual(store.getCase(created.id, OPERATOR).eligibility.answers, { debtDisputed: 'unknown' });

    // No outcome is persisted; the row holds answers and a timestamp only.
    assert.deepEqual(Object.keys(replaced.eligibility).sort(), ['answers', 'assessedAt']);

    assert.equal(store.saveEligibility(created.id, { debtDisputed: 'no' }, OTHER_OPERATOR), null);
    assert.deepEqual(store.getCase(created.id, OPERATOR).eligibility.answers, { debtDisputed: 'unknown' });
  } finally {
    store.close();
  }
});

test('rejects an eligibility answer map it cannot trust', () => {
  const store = new CaseStore({ databasePath: ':memory:' });
  try {
    const created = store.createCase(confirmedCase(), OPERATOR);
    for (const answers of [{ isTheClaimStrong: 'yes' }, { debtDisputed: 'probably' }, 'yes', null]) {
      assert.throws(() => store.saveEligibility(created.id, answers, OPERATOR), CaseInputError);
    }
    assert.equal(store.getCase(created.id, OPERATOR).eligibility, null);
    assert.throws(() => store.saveEligibility(created.id, { debtDisputed: 'no' }), /authorized operator ID is required/);
  } finally {
    store.close();
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test web/server/cases/store.test.js`
Expected: FAIL with `store.saveEligibility is not a function`.

- [ ] **Step 3: Import the validator**

In `web/server/cases/store.js`, add below the existing `DEFAULT_OPERATOR_ID` import:

```js
import { answerProblem } from '../../shared/eligibility.js';
```

- [ ] **Step 4: Add the table**

In the `this.database.exec(...)` schema block in the `CaseStore` constructor, after the `case_communications_case_date` index, add:

```sql
      CREATE TABLE IF NOT EXISTS case_eligibility (
        case_id TEXT PRIMARY KEY REFERENCES case_files(id) ON DELETE CASCADE,
        answers_json TEXT NOT NULL,
        assessed_at TEXT NOT NULL
      );
```

`PRAGMA foreign_keys = ON` is already set in the constructor, so deleting a case removes its answers.

- [ ] **Step 5: Return the answers from `mapCase` and `getCase`**

Change the `mapCase` signature and add the field. Replace:

```js
function mapCase(row, communications = undefined) {
```

with:

```js
function mapCase(row, communications = undefined, eligibility = undefined) {
```

and replace the closing lines of `mapCase`:

```js
  if (communications) result.communications = communications;
  return result;
}
```

with:

```js
  if (communications) result.communications = communications;
  // Only the detail read carries eligibility, and it carries answers only: the
  // outcome is a function of the current rules and a live agreement read, so
  // storing one would let a rules change leave a stale verdict behind.
  if (communications) {
    result.eligibility = eligibility
      ? { answers: parseJsonObject(eligibility.answers_json), assessedAt: eligibility.assessed_at }
      : null;
  }
  return result;
}
```

In `getCase`, replace the final `return mapCase(row, communications);` with:

```js
    const eligibility = this.database.prepare(
      'SELECT answers_json, assessed_at FROM case_eligibility WHERE case_id = ?',
    ).get(id);
    return mapCase(row, communications, eligibility);
```

- [ ] **Step 6: Add `saveEligibility`**

In `web/server/cases/store.js`, add after `addCommunication`:

```js
  saveEligibility(caseId, answers, ownerId) {
    const owner = requiredOwnerId(ownerId);
    if (!this.getCase(caseId, owner)) return null;
    const problem = answerProblem(answers);
    if (problem) throw new CaseInputError(problem);
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO case_eligibility (case_id, answers_json, assessed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(case_id) DO UPDATE
        SET answers_json = excluded.answers_json, assessed_at = excluded.assessed_at
    `).run(caseId, JSON.stringify(answers), now);
    this.database.prepare('UPDATE case_files SET updated_at = ? WHERE id = ? AND owner_id = ?').run(now, caseId, owner);
    return this.getCase(caseId, owner);
  }
```

The owner check runs before the answer check, so an operator probing another operator's case learns nothing about whether it exists.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test web/server/cases/store.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 8: Run the whole suite**

Run: `npm --prefix web test`
Expected: PASS.

- [ ] **Step 9: Stage and report**

```bash
git add web/server/cases/store.js web/server/cases/store.test.js
git commit -m "Store eligibility answers against a case file"
git log --oneline -1
```

Report the commit hash and the test results.

---

### Task 3: The route

**Files:**
- Modify: `web/server/index.js:583-589` (a new route beside the communications route)
- Modify: `web/server/access.test.js` (a new test using the existing `startServer` harness)

**Interfaces:**
- Consumes: `CaseStore.saveEligibility` (Task 2).
- Produces: `PUT /api/cases/:id/eligibility`, body `{ answers }`, `200` with `{ case }`, `404` when the case is missing or owned by another operator, `400` on an invalid answer map, `401`/`403` from the existing access gate.

- [ ] **Step 1: Write the failing test**

Append to `web/server/access.test.js`:

```js
test('eligibility answers are authorized, scoped, and validated', async (t) => {
  const service = await startServer();
  t.after(() => service.stop());

  const created = await fetch(`${service.origin}/api/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: JSON.stringify(confirmedCase(105)),
  });
  const caseId = (await created.json()).case.id;
  const path = `/api/cases/${caseId}/eligibility`;

  function save(token, answers) {
    return fetch(`${service.origin}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { [TOKEN_HEADER]: token } : {}) },
      body: JSON.stringify({ answers }),
    });
  }

  assert.equal((await save(null, { debtDisputed: 'no' })).status, 401);
  assert.equal((await save(OTHER_TOKEN, { debtDisputed: 'no' })).status, 404);
  assert.equal((await save(OPERATOR_TOKEN, { isTheClaimStrong: 'yes' })).status, 400);

  const saved = await save(OPERATOR_TOKEN, { debtDisputed: 'no', payerBasedInUk: 'yes' });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).case.eligibility.answers, { debtDisputed: 'no', payerBasedInUk: 'yes' });

  // The service returns answers only. It cannot compute an outcome, because it
  // never reads the agreement deadline from Coston2.
  const detail = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  const eligibility = (await detail.json()).case.eligibility;
  assert.deepEqual(Object.keys(eligibility).sort(), ['answers', 'assessedAt']);

  // A cross-origin write is refused on the headers alone.
  const crossOrigin = await fetch(`${service.origin}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: 'https://mallory.example', [TOKEN_HEADER]: OPERATOR_TOKEN },
    body: JSON.stringify({ answers: { debtDisputed: 'yes' } }),
  });
  assert.equal(crossOrigin.status, 403);

  const unchanged = await fetch(`${service.origin}/api/cases/${caseId}`, { headers: { [TOKEN_HEADER]: OPERATOR_TOKEN } });
  assert.equal((await unchanged.json()).case.eligibility.answers.debtDisputed, 'no');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/server/access.test.js`
Expected: FAIL — the first `save` returns 404 from the API-route fallback rather than 401, or the `200` assertion fails, because no route matches `PUT`.

- [ ] **Step 3: Add the route**

In `web/server/index.js`, immediately after the `communicationMatch` block, add:

```js
    const eligibilityMatch = request.method === 'PUT' && url.pathname.match(/^\/api\/cases\/([0-9a-f-]{36})\/eligibility$/i);
    if (eligibilityMatch) {
      const { answers } = await readJson(request);
      const caseFile = caseStore.saveEligibility(eligibilityMatch[1], answers, operatorId);
      if (!caseFile) sendJson(response, 404, { error: 'Case file not found.' });
      else sendJson(response, 200, { case: caseFile });
      return;
    }
```

`PUT` rather than `POST`: saving replaces the single answer set, so repeating the request is harmless.

- [ ] **Step 4: Confirm `CaseInputError` already answers 400**

Read the `catch` block at the end of the request handler in `web/server/index.js`. It maps `CaseInputError` to `400`. If it does not, add the mapping there rather than in the route, so every case route reports an input problem the same way.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test web/server/access.test.js`
Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run: `npm --prefix web test`
Expected: PASS.

- [ ] **Step 7: Stage and report**

```bash
git add web/server/index.js web/server/access.test.js
git commit -m "Add the eligibility answers route"
git log --oneline -1
```

Report the commit hash and the test results.

---

### Task 4: The questionnaire panel

**Files:**
- Modify: `web/src/lib/casePack.js` (one new function)
- Modify: `web/src/components/CasePack.jsx` (a new `EligibilityQuestionnaire` component, rendered from `CaseDetail`)
- Modify: `web/src/styles/app.css` (new `.case-eligibility` rules, plus the narrow-screen fallback in the existing `@media (max-width: 780px)` block)

**Interfaces:**
- Consumes: `assess`, `QUESTIONS`, `DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS` from `web/shared/eligibility.js` (Task 1); `PUT /api/cases/:id/eligibility` (Task 3).
- Produces: `saveCaseEligibility(caseId, answers)` → the updated case file.

- [ ] **Step 1: Add the client call**

In `web/src/lib/casePack.js`, add after `addCaseCommunication`:

```js
export function saveCaseEligibility(caseId, answers) {
  return request(`/api/cases/${encodeURIComponent(caseId)}/eligibility`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  }).then((payload) => payload.case);
}
```

- [ ] **Step 2: Import it and the rules in `CasePack.jsx`**

Replace the first two import lines of `web/src/components/CasePack.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { addCaseCommunication, createCase, fetchCase, fetchCases } from '../lib/casePack.js';
```

with:

```jsx
import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS,
  QUESTIONS,
  assess,
} from '../../shared/eligibility.js';
import {
  addCaseCommunication,
  createCase,
  fetchCase,
  fetchCases,
  saveCaseEligibility,
} from '../lib/casePack.js';
```

- [ ] **Step 3: Add the presentation tables**

In `web/src/components/CasePack.jsx`, add below the existing `emptyCommunication` helper:

```jsx
const OUTCOME_PRESENTATION = {
  supported: {
    chip: 'chip--positive',
    title: 'Inside the supported scope',
    detail: 'The answers and the case facts raise nothing that has to leave the automated path. This is a routing result, not legal advice.',
  },
  needs_information: {
    chip: 'chip--attention',
    title: 'More information needed',
    detail: 'The questionnaire cannot be completed from what the case file records. Nothing downstream may rely on it yet.',
  },
  escalate: {
    chip: 'chip--danger',
    title: 'Leaves the automated path',
    detail: 'This case stops here. LatePay Shield offers source-grounded information and drafting support only, and takes no position on this case.',
  },
};

const ROUTE_COPY = {
  professional_review: 'Needs a qualified adviser.',
  operator_action: 'An operator can resolve this in the case file.',
};

// Configured per workspace at build time; a routing threshold, not a legal one.
const HIGH_VALUE_THRESHOLD = Number(
  import.meta.env.VITE_ELIGIBILITY_HIGH_VALUE_MINOR_UNITS ?? DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS,
);
```

- [ ] **Step 4: Add the component**

In `web/src/components/CasePack.jsx`, add after the `CaseDetail` component:

```jsx
function EligibilityQuestionnaire({ caseFile, agreement, onSaved }) {
  const savedAnswers = caseFile.eligibility?.answers;
  const [answers, setAnswers] = useState(savedAnswers ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setAnswers(savedAnswers ?? {});
    setError('');
  }, [caseFile.id, savedAnswers]);

  const assessment = useMemo(() => assess(answers, {
    invoiceAmountMinorUnits: caseFile.invoiceAmountMinorUnits,
    invoiceCurrency: caseFile.invoiceCurrency,
    invoiceDueDate: caseFile.invoiceDueDate,
    agreementDueAtSeconds: agreement?.dueAt,
    highValueThresholdMinorUnits: HIGH_VALUE_THRESHOLD,
  }), [answers, caseFile, agreement]);

  const presentation = OUTCOME_PRESENTATION[assessment.outcome];

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      onSaved(await saveCaseEligibility(caseFile.id, answers));
    } catch (saveError) {
      setError(saveError?.message ?? 'The eligibility answers could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card case-eligibility" onSubmit={save}>
      <div className="case-detail__head">
        <span>
          <strong>Eligibility and escalation</strong>
          <small>Deterministic routing. The local AI takes no part in it.</small>
        </span>
        <span className={`chip ${presentation.chip}`}>{presentation.title}</span>
      </div>

      <div className="eligibility-questions" role="group" aria-label="Eligibility questions">
        {QUESTIONS.map((question) => (
          <div className="eligibility-question" key={question.id}>
            <span id={`eligibility-${question.id}`}>{question.prompt}</span>
            <span className="eligibility-question__answers" role="radiogroup" aria-labelledby={`eligibility-${question.id}`}>
              {['yes', 'no', 'unknown'].map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={question.id}
                    value={value}
                    checked={answers[question.id] === value}
                    onChange={() => {
                      setAnswers((current) => ({ ...current, [question.id]: value }));
                      setError('');
                    }}
                  />
                  <span>{value}</span>
                </label>
              ))}
            </span>
          </div>
        ))}
      </div>

      <div className={`state-panel${assessment.outcome === 'escalate' ? ' state-panel--danger' : ''}`} aria-live="polite">
        <strong>{presentation.title}</strong>
        <p>{presentation.detail}</p>
        <p>{assessment.answeredCount} of {assessment.requiredCount} questions answered.</p>
        {assessment.reasons.length > 0 ? (
          <ul className="eligibility-outcome__reasons">
            {assessment.reasons.map((item) => (
              <li key={item.code}>
                <strong>{item.summary}</strong>
                <span>{ROUTE_COPY[item.route]}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? <div className="form-error" role="alert"><Warning /><p>{error}</p></div> : null}

      <div className="form-actions">
        <button className="btn btn--quiet" type="submit" disabled={saving}>
          {saving ? <Progress className="is-spinning" /> : <CheckCircle />}
          {saving ? 'Saving answers…' : 'Save eligibility answers'}
        </button>
        {caseFile.eligibility ? (
          <p className="field__help">
            Answers saved {new Date(caseFile.eligibility.assessedAt).toLocaleString('en-GB')}. The outcome is recalculated
            from the current rules and a live agreement read every time this case is opened.
          </p>
        ) : null}
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Render it from `CaseDetail`**

In `web/src/components/CasePack.jsx`, extend the `CaseDetail` signature to accept `onEligibilitySaved`:

```jsx
function CaseDetail({ caseFile, agreement, communication, communicationError, onCommunicationChange, onCommunicationSubmit, onEligibilitySaved, saving }) {
```

and add, immediately after the closing `</div>` of the `case-evidence` card and before the `case-communications` card:

```jsx
      <EligibilityQuestionnaire
        caseFile={caseFile}
        agreement={agreement}
        onSaved={onEligibilitySaved}
      />
```

The panel sits below the live evidence so the on-chain deadline is on screen while the questions are answered.

- [ ] **Step 6: Wire the save handler in `CasePack`**

In the `CasePack` component, add above the `return`:

```jsx
  function eligibilitySaved(updated) {
    setSelectedCase(updated);
    setCases((current) => current.map((item) => item.id === updated.id ? updated : item));
  }
```

and pass it in the `<CaseDetail …>` element:

```jsx
            onEligibilitySaved={eligibilitySaved}
```

- [ ] **Step 7: Add the styles**

In `web/src/styles/app.css`, after the `.communication-form { … }` rule, add:

```css
.case-eligibility {
  grid-column: 1 / -1;
}

.eligibility-questions {
  display: grid;
  gap: 0;
  margin: 20px 0;
  border-top: 1px solid var(--border);
}

.eligibility-question {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 13px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.eligibility-question__answers {
  display: flex;
  gap: 14px;
}

.eligibility-question__answers label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--muted);
  text-transform: capitalize;
}

.eligibility-outcome__reasons {
  display: grid;
  gap: 10px;
  margin-top: var(--s2);
  padding: 0;
  list-style: none;
}

.eligibility-outcome__reasons li {
  display: grid;
  gap: 3px;
  font-size: 13px;
  color: var(--muted);
}

.eligibility-outcome__reasons strong {
  color: var(--ink);
  font-weight: 600;
}
```

Then, inside the existing `@media (max-width: 780px)` block, next to `.case-communications { grid-column: auto; }`, add:

```css
  .case-eligibility {
    grid-column: auto;
  }

  .eligibility-question {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
```

- [ ] **Step 8: Verify the bundle builds**

Run: `npm --prefix web run build`
Expected: a successful Vite build. A resolve error for `../../shared/eligibility.js` means Task 1's file is missing or misplaced; the path is `web/shared/eligibility.js`, and `vite.config.js` already allows the repository root under `server.fs.allow`.

- [ ] **Step 9: Run the whole suite**

Run: `npm --prefix web test`
Expected: PASS.

- [ ] **Step 10: Browser check**

Run `npm --prefix web run dev`, open the served page, and confirm one full pass on a saved case file:

1. The questionnaire card appears under **Live agreement evidence** with no answer preselected.
2. With nothing answered, the banner reads **More information needed** and lists the unanswered-questions reason.
3. Answering every question in scope, with the case's invoice due date equal to the agreement deadline and a total under the threshold, gives **Inside the supported scope** and no reasons.
4. Answering "yes" to the dispute question gives **Leaves the automated path**, the dispute reason, and "Needs a qualified adviser."
5. Save, reload the page, reopen the case, and confirm the answers and the recalculated outcome both return.
6. On a case whose `invoiceDueDate` differs from its agreement deadline, confirm the mismatch reason is visible in the banner.

Record what was seen; step 5 and step 6 are the two that prove persistence and the mismatch rule.

- [ ] **Step 11: Stage and report**

```bash
git add web/src/lib/casePack.js web/src/components/CasePack.jsx web/src/styles/app.css
git commit -m "Add the case eligibility questionnaire panel"
git log --oneline -1
```

Report the commit hash and the browser-check result. If the browser check could not be run, say so plainly rather than describing it as verified.

---

### Task 5: Documentation sync

**Files:**
- Modify: `docs/issue-board.md` (the legal-assistance build-order table row 2, and the Tolga application row)
- Modify: `docs/plans/legal-assistance-build-order.md` (task 2 status and the "Next task" section)
- Modify: `docs/project-status.md` (next priorities, and verified progress)
- Modify: `docs/data-and-contracts.md` (the `case_eligibility` table and the four enumerations)
- Modify: `docs/design.md` (the questionnaire card, its copy, and its states)
- Modify: `docs/testing-and-demo.md` (the fixture suite, the route test, the browser check)
- Modify: `docs/decisions.md` (append D-011)
- Modify: `docs/ai/SKILLS.md` (the implementation-order paragraph near the top)
- Modify: `README.md` **only if** the new `VITE_ELIGIBILITY_HIGH_VALUE_MINOR_UNITS` variable belongs in its setup section; check whether it documents other `VITE_`/`WEB_` variables first, and leave it alone if it does not.

**Interfaces:**
- Consumes: the finished implementation from Tasks 1–4.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Record the decision**

Append to `docs/decisions.md`, above the closing "Entry format" section:

```markdown
## D-011 - The eligibility outcome is computed at read time, never stored

**Date:** 2 September 2026
**Status:** Accepted for the local prototype

**Decision:** Persist only the operator's eligibility answers, in
`case_eligibility`, and compute the outcome in the browser from
`web/shared/eligibility.js` on every read, combining those answers with a live
Coston2 agreement read.

**Reason:** The invoice-due-date versus contract-deadline rule needs the
agreement's on-chain `dueAt`, which only the live registry read holds; the local
service never reads the chain, and copying a chain value into the case database
would make that database a second source of truth for an agreement term. An
outcome is also a function of the current rules, not a fact the operator
asserted: storing one would let a later rules change leave rows claiming an
outcome that those rules no longer produce, and task 3's calculator gates on
that outcome.

**Consequence:** The service validates and stores answers and returns no
outcome, because it cannot compute one. The same pure module and the same
fixtures cover the rules wherever they run. Recomputing costs nothing at this
size. A per-answer audit history is deliberately absent until task 7 defines
what an audit record must contain.
```

- [ ] **Step 2: Update the issue board**

In `docs/issue-board.md`, change the legal-assistance build-order row 2 status from `Not started` to `Done`, and replace its dependency cell with completion evidence naming: the eight questions and five derived and completeness checks in `web/shared/eligibility.js`, the thirteen reason codes across the two routes, the `case_eligibility` table storing answers only, the `PUT /api/cases/:id/eligibility` route, and the fixture and route tests. State that the outcome is recomputed from stored answers plus a live agreement read and is never persisted, and that the mismatch rule is visible in the outcome banner. Do not describe the browser check as verified unless step 10 of Task 4 was actually run and recorded.

Also update the "AI extraction and mandatory human-confirmation flow" and "Frontend, local application layer…" rows only if this work changed what they claim.

- [ ] **Step 3: Update the build-order plan**

In `docs/plans/legal-assistance-build-order.md`, change task 2 to **Done** with the same evidence in one or two sentences, and replace the "Next task" section with task 3: the deterministic late-payment calculator, noting that it gates on the `supported` outcome this task produces and that the LLM performs no arithmetic.

- [ ] **Step 4: Update the project status**

In `docs/project-status.md`, move the eligibility item out of "Next priorities" into the verified-progress section with the same evidence, and renumber the remaining priorities so the calculator is first.

- [ ] **Step 5: Update the data and contracts reference**

In `docs/data-and-contracts.md`, add the `case_eligibility` schema beside the existing case tables, and document the four enumerations verbatim: answers (`yes`, `no`, `unknown`), outcomes (`supported`, `needs_information`, `escalate`), routes (`professional_review`, `operator_action`), and the thirteen reason codes with the outcome each contributes. Record the precedence rule: `escalate` outranks `needs_information`, and the reasons list carries both.

- [ ] **Step 6: Update the design document**

In `docs/design.md`, document the questionnaire card: where it sits in the case detail, the three-way answer control with no preselected value, the three banner states and their copy, the routing copy per route, and the rule that the banner never states a legal position.

- [ ] **Step 7: Update testing and demo**

In `docs/testing-and-demo.md`, add the nine `web/shared/eligibility.test.js` fixtures, the two new store tests, the new `access.test.js` route test, and the Task 4 browser check with what was actually observed. Report anything not run as not run.

- [ ] **Step 8: Update the skills contract**

In `docs/ai/SKILLS.md`, update the "Implementation order" paragraph so it records that eligibility rules are complete and that the calculator and the approved source library remain before any legal-advice-style conversation. Add one sentence stating that eligibility routing is deterministic code and that no skill, prompt, or model output takes part in it.

- [ ] **Step 9: Check the links**

Run: `npm --prefix web test`
Expected: PASS, unchanged by documentation edits.

Then confirm every relative link added in this task resolves to a real file.

- [ ] **Step 10: Stage and report**

```bash
git add docs README.md
git commit -m "Record the eligibility questionnaire in the docs"
git log --oneline -1
```

Report the commit hash, what changed, what was actually verified, and what remains planned.

---

## Deviations from the design document

Two, both found while writing concrete code. Fold them into
`2026-09-02-eligibility-questionnaire-design.md` when Task 1 lands:

1. **A fourteenth reason code, `agreement_deadline_unreadable`.** The design
   listed thirteen and did not say what happens when the Coston2 read fails.
   Silently skipping the mismatch check there would let an unreadable agreement
   produce a `supported` outcome, which is exactly the false confidence the
   escalation rules exist to prevent. It routes to `operator_action` and
   contributes `needs_information`.
2. **The threshold variable is `VITE_ELIGIBILITY_HIGH_VALUE_MINOR_UNITS`.** The
   design named `ELIGIBILITY_HIGH_VALUE_MINOR_UNITS`, but `assess()` runs in the
   browser, and Vite only exposes variables carrying the `VITE_` prefix. The
   default in `web/shared/eligibility.js` is unchanged at £50,000.
