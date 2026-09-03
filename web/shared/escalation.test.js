import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS, QUESTIONS, REASONS } from './eligibility.js';
import {
  BLOCK_REASONS,
  PROFESSIONAL_REVIEW_CODES,
  deliveryDecision,
  describeCodes,
  resolveHighValueThreshold,
} from './escalation.js';

/** Every question answered in the non-escalating direction. */
function clearAnswers(overrides = {}) {
  const answers = {};
  for (const question of QUESTIONS) {
    answers[question.id] = question.escalatingAnswer === 'yes' ? 'no' : 'yes';
  }
  return { ...answers, ...overrides };
}

const SMALL_DEBT = { invoiceAmountMinorUnits: '125000', invoiceCurrency: 'GBP' };

test('a complete, in-scope case may be handled automatically', () => {
  const decision = deliveryDecision(clearAnswers(), SMALL_DEBT);
  assert.equal(decision.allowed, true);
  assert.equal(decision.route, null);
  assert.deepEqual(decision.codes, []);
});

test('every professional-review category blocks delivery', () => {
  // The categories task 8 names: disputes, insolvency, consumer, cross-border,
  // court proceedings, plus the long-terms and limitation triggers.
  const triggers = QUESTIONS.filter((question) => REASONS[question.reason].route === 'professional_review');
  assert.ok(triggers.length >= 5, 'expected the escalating questions to be present');

  for (const question of triggers) {
    const decision = deliveryDecision(
      clearAnswers({ [question.id]: question.escalatingAnswer }),
      SMALL_DEBT,
    );
    assert.equal(decision.allowed, false, `${question.reason} must block delivery`);
    assert.equal(decision.route, 'professional_review');
    assert.ok(decision.codes.includes(question.reason));
    assert.match(decision.summary, /qualified adviser/);
  }
});

test('a high-value invoice blocks delivery on the case facts alone', () => {
  const atThreshold = deliveryDecision(clearAnswers(), {
    invoiceAmountMinorUnits: String(DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS),
    invoiceCurrency: 'GBP',
  });
  assert.equal(atThreshold.allowed, false);
  assert.equal(atThreshold.route, 'professional_review');
  assert.ok(atThreshold.codes.includes('high_value'));

  const justBelow = deliveryDecision(clearAnswers(), {
    invoiceAmountMinorUnits: String(DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS - 1),
    invoiceCurrency: 'GBP',
  });
  assert.equal(justBelow.allowed, true);
});

test('a configured threshold is honoured, and an unusable one falls back', () => {
  const facts = { invoiceAmountMinorUnits: '200000', invoiceCurrency: 'GBP' };
  assert.equal(deliveryDecision(clearAnswers(), { ...facts, highValueThresholdMinorUnits: 100000 }).allowed, false);
  assert.equal(deliveryDecision(clearAnswers(), { ...facts, highValueThresholdMinorUnits: 300000 }).allowed, true);

  // A blank env value coerces to 0, which is not a routing boundary.
  for (const bad of ['', null, undefined, 0, -5, 1.5, 'abc', NaN]) {
    assert.equal(resolveHighValueThreshold(bad), DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS, String(bad));
  }
  assert.equal(resolveHighValueThreshold(250000), 250000);
});

test('a non-sterling or unrecorded amount does not trigger the high-value block', () => {
  // It cannot be compared with a sterling threshold, so it is not treated as
  // high value. Task 2 surfaces that separately as information needed.
  const euro = deliveryDecision(clearAnswers(), { invoiceAmountMinorUnits: '900000000', invoiceCurrency: 'EUR' });
  assert.equal(euro.allowed, true);
  const missing = deliveryDecision(clearAnswers(), { invoiceAmountMinorUnits: null, invoiceCurrency: 'GBP' });
  assert.equal(missing.allowed, true);
});

test('an incomplete questionnaire blocks delivery: silence is not consent', () => {
  // An unanswered dispute question is not the same as "no dispute".
  for (const answers of [null, undefined, {}, clearAnswers({ debtDisputed: 'unknown' }), clearAnswers({ debtDisputed: undefined })]) {
    const decision = deliveryDecision(answers, SMALL_DEBT);
    assert.equal(decision.allowed, false, `expected a block for ${JSON.stringify(answers)}`);
    assert.equal(decision.route, 'operator_action');
    assert.ok(decision.codes.includes('unanswered_questions'));
    assert.match(decision.summary, /not complete/);
  }
});

test('a fired professional-review trigger outranks an incomplete questionnaire', () => {
  // More answers cannot soften a dispute, and the reader must be sent to an
  // adviser rather than told to finish a form.
  const decision = deliveryDecision({ debtDisputed: 'yes' }, SMALL_DEBT);
  assert.equal(decision.allowed, false);
  assert.equal(decision.route, 'professional_review');
  assert.ok(decision.codes.includes('dispute'));
  // Nothing is hidden: the incompleteness is still reported.
  assert.ok(decision.codes.includes('unanswered_questions'));
});

test('an operator-action trigger blocks delivery without invoking an adviser', () => {
  // An undelivered invoice is a case-file problem, not a matter for a
  // solicitor. Presenting it as one would be wrong and alarming.
  const decision = deliveryDecision(clearAnswers({ invoiceDelivered: 'no' }), SMALL_DEBT);
  assert.equal(decision.allowed, false);
  assert.equal(decision.route, 'operator_action');
  assert.deepEqual(decision.codes, ['invoice_not_delivered']);
  assert.doesNotMatch(decision.summary, /adviser/);
});

test('every reason that fired is reported, not just the first', () => {
  const decision = deliveryDecision({ debtDisputed: 'yes', payerInsolvencyProcess: 'yes' }, {
    invoiceAmountMinorUnits: String(DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS),
    invoiceCurrency: 'GBP',
  });
  assert.equal(decision.allowed, false);
  for (const code of ['dispute', 'insolvency', 'high_value', 'unanswered_questions']) {
    assert.ok(decision.codes.includes(code), `${code} missing`);
  }
});

test('the professional-review catalogue matches the shared reason table', () => {
  // One source of truth: a reason cannot route to an adviser in the panel and
  // to something else at the gate.
  for (const code of PROFESSIONAL_REVIEW_CODES) {
    assert.equal(REASONS[code].route, 'professional_review', code);
  }
  const expected = Object.entries(REASONS)
    .filter(([, entry]) => entry.route === 'professional_review')
    .map(([code]) => code)
    .sort();
  assert.deepEqual([...PROFESSIONAL_REVIEW_CODES], expected);
  // The categories task 8 names are all present.
  for (const code of ['dispute', 'insolvency', 'consumer_matter', 'cross_border', 'court_proceedings', 'high_value']) {
    assert.ok(PROFESSIONAL_REVIEW_CODES.includes(code), code);
  }
});

test('the block summaries never state a legal position', () => {
  for (const [name, entry] of Object.entries(BLOCK_REASONS)) {
    assert.doesNotMatch(entry.summary, /entitled|enforceable|liable|you (should|must) (sue|claim)/i, name);
  }
  assert.match(BLOCK_REASONS.professional_review.summary, /takes no position/i);
});

test('codes resolve to their shared summaries, and unknown codes are dropped', () => {
  const described = describeCodes(['dispute', 'not_a_real_code', 'high_value']);
  assert.deepEqual(described.map((entry) => entry.code), ['dispute', 'high_value']);
  assert.equal(described[0].summary, REASONS.dispute.summary);
  assert.deepEqual(describeCodes(undefined), []);
});

test('the decision reads no clock and no chain', async () => {
  // A delivery block that fails open when Coston2 is unreachable would be
  // worthless, so the module must not depend on either.
  const source = await (await import('node:fs/promises')).readFile(
    new URL('./escalation.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /Date\.now|new Date\(|fetch\(|require\(|from 'node:/);
});
