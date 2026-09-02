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

/**
 * Seconds for a local datetime, the way AgreementCreator turns a
 * `datetime-local` field into the on-chain `dueAt`. Building fixtures this way
 * keeps the suite passing under any machine timezone, because the module under
 * test reads the deadline back in local time too.
 */
function localSeconds(year, month, day, hour = 0, minute = 0) {
  return Math.floor(new Date(year, month - 1, day, hour, minute, 0, 0).getTime() / 1000);
}

function clearContext(overrides = {}) {
  return {
    invoiceAmountMinorUnits: '125000',
    invoiceCurrency: 'GBP',
    invoiceDueDate: '2026-09-29',
    // Local midnight on 29 September 2026, so the invoice date and the
    // registered deadline agree regardless of the machine's timezone.
    agreementDueAtSeconds: localSeconds(2026, 9, 29),
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

  // A deadline later the same local day is the same date, not a mismatch.
  const sameDay = assess(clearAnswers(), clearContext({
    agreementDueAtSeconds: localSeconds(2026, 9, 29, 17, 45),
  }));
  assert.equal(sameDay.outcome, 'supported');

  // An unreadable agreement cannot be compared, so no verdict is offered.
  const unreadable = assess(clearAnswers(), clearContext({ agreementDueAtSeconds: undefined }));
  assert.equal(unreadable.outcome, 'needs_information');
  assert.deepEqual(codes(unreadable), ['agreement_deadline_unreadable']);
});

test('a late-evening local deadline round-trips to the invoice date the application stores for it', () => {
  // Mirrors AgreementCreator and the AI extraction default: the deadline's
  // date portion becomes invoiceDueDate, and the full local instant becomes
  // agreementDueAtSeconds, in whatever timezone the operator is in.
  const assessment = assess(clearAnswers(), clearContext({
    invoiceDueDate: '2026-09-30',
    agreementDueAtSeconds: localSeconds(2026, 9, 30, 23, 59),
  }));
  assert.equal(assessment.outcome, 'supported');
  assert.deepEqual(codes(assessment), []);
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

test('an out-of-range agreement deadline needs information rather than throwing', () => {
  const assessment = assess(clearAnswers(), clearContext({
    agreementDueAtSeconds: 18446744073709551615,
  }));
  assert.equal(assessment.outcome, 'needs_information');
  assert.deepEqual(codes(assessment), ['agreement_deadline_unreadable']);
});

test('a non-numeric or blank high-value threshold falls back to the default rather than throwing', () => {
  for (const highValueThresholdMinorUnits of ['50,000', '']) {
    const assessment = assess(clearAnswers(), clearContext({
      invoiceAmountMinorUnits: '5000000',
      highValueThresholdMinorUnits,
    }));
    assert.equal(assessment.outcome, 'escalate', `threshold ${JSON.stringify(highValueThresholdMinorUnits)} did not fall back.`);
    assert.deepEqual(codes(assessment), ['high_value']);
  }
});

test('mutating a REASONS entry does not change the classification', () => {
  assert.throws(() => {
    REASONS.dispute.outcome = 'supported';
  });
  const assessment = assess(clearAnswers({ debtDisputed: 'yes' }), clearContext());
  assert.equal(assessment.outcome, 'escalate');
  assert.deepEqual(codes(assessment), ['dispute']);
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
