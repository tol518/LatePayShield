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
].map(Object.freeze));

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
    summary: "The invoice total is at or above this workspace's configured high-value threshold.",
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

// Object.freeze is shallow, so each entry is frozen too: assess reads an
// entry's outcome live on every call, and a stray write would quietly change
// what a reason code routes to for the rest of the process.
Object.values(REASONS).forEach(Object.freeze);

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
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Checks that read the case and the agreement instead of asking, so they
 * cannot be answered wrongly by clicking.
 */
function derivedReasons(context) {
  const reasons = [];
  const amount = String(context.invoiceAmountMinorUnits ?? '').trim();
  const currency = String(context.invoiceCurrency ?? '').trim().toUpperCase();
  const configuredThreshold = Number(context.highValueThresholdMinorUnits);
  const threshold = Number.isInteger(configuredThreshold) && configuredThreshold >= 0
    ? configuredThreshold
    : DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS;

  if (!WHOLE_MINOR_UNITS.test(amount)) reasons.push(reason('invoice_amount_missing'));
  else if (currency && currency !== 'GBP') reasons.push(reason('currency_not_gbp'));
  else if (BigInt(amount) >= BigInt(threshold)) reasons.push(reason('high_value'));

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
