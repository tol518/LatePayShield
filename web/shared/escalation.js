/* Whether a case may be handled automatically at all.
 *
 * Task 2 routes a case for the operator's benefit: it shows an outcome and the
 * reasons behind it, recomputed in the browser on every read. Task 8 turns the
 * same rules into something a caller cannot skip — a server-side block on
 * handing any draft to a delivery transport.
 *
 * Two properties matter here and shape the whole module:
 *
 *   - **It reads no chain and no clock.** Every reason that routes to
 *     professional review is either answer-driven or derived from the case's own
 *     stored invoice total, so the gate reaches the same verdict whether or not
 *     Coston2 is reachable. A delivery block that fails open when an RPC is down
 *     would be worthless.
 *   - **Silence is not consent.** An unanswered questionnaire blocks delivery
 *     too. An unanswered dispute question is not the same as "no dispute", and
 *     inferring one from the other is exactly what docs/project-context.md
 *     forbids: "Unsupported or uncertain cases must escalate rather than be
 *     inferred by the model."
 *
 * The reason catalogue is not duplicated. It is imported from eligibility.js so
 * a reason's route cannot mean one thing in the panel and another at the gate.
 */

import { DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS, QUESTIONS, REASONS } from './eligibility.js';

const WHOLE_MINOR_UNITS = /^\d+$/;

/** Reasons that take a case out of automated handling entirely. */
export const PROFESSIONAL_REVIEW_CODES = Object.freeze(
  Object.entries(REASONS)
    .filter(([, entry]) => entry.route === 'professional_review')
    .map(([code]) => code)
    .sort(),
);

export const BLOCK_REASONS = Object.freeze({
  professional_review: {
    route: 'professional_review',
    summary: 'This case has left the automated path and needs a qualified adviser. LatePay Shield does not hand a reminder to a delivery service for a case in this category, and it takes no position on the case itself.',
  },
  questionnaire_incomplete: {
    route: 'operator_action',
    summary: 'The eligibility questionnaire is not complete, so whether this case may be handled automatically is unknown. An unanswered question is not a "no".',
  },
  operator_action: {
    route: 'operator_action',
    summary: 'The case file needs finishing before a reminder may be handed to a delivery service.',
  },
});

/** The configured threshold, or the documented default for an unusable value. */
export function resolveHighValueThreshold(configured) {
  const value = Number(configured);
  // A blank environment value coerces to 0, and a threshold of 0 is not a
  // meaningful routing boundary. Matches eligibility.js exactly.
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS;
}

/** Is the invoice total at or above the high-value threshold? */
function isHighValue({ invoiceAmountMinorUnits, invoiceCurrency, highValueThresholdMinorUnits }) {
  const amount = String(invoiceAmountMinorUnits ?? '').trim();
  const currency = String(invoiceCurrency ?? '').trim().toUpperCase();
  if (!WHOLE_MINOR_UNITS.test(amount)) return false;
  if (currency && currency !== 'GBP') return false;
  return BigInt(amount) >= BigInt(resolveHighValueThreshold(highValueThresholdMinorUnits));
}

/**
 * May this case's drafts be handed to a delivery transport?
 *
 * @param {object} answers The stored eligibility answers, or null/undefined.
 * @param {object} caseFacts `invoiceAmountMinorUnits`, `invoiceCurrency`, and
 *   optionally `highValueThresholdMinorUnits`.
 * @returns {{allowed: boolean, route: ?string, summary: ?string, codes: string[]}}
 *   `codes` lists every reason that fired, so the operator is told everything
 *   rather than only the first thing found.
 */
export function deliveryDecision(answers, caseFacts = {}) {
  const professional = [];
  const operator = [];
  let answered = 0;

  for (const question of QUESTIONS) {
    const answer = answers?.[question.id];
    if (answer === 'yes' || answer === 'no') answered += 1;
    if (answer !== question.escalatingAnswer) continue;
    const entry = REASONS[question.reason];
    if (entry.route === 'professional_review') professional.push(question.reason);
    else operator.push(question.reason);
  }

  if (isHighValue(caseFacts)) professional.push('high_value');

  const incomplete = answered < QUESTIONS.length;

  // A fired professional-review trigger outranks everything: it is a definite
  // fact that more answers cannot soften. Same precedence as assess().
  if (professional.length > 0) {
    return {
      allowed: false,
      route: BLOCK_REASONS.professional_review.route,
      summary: BLOCK_REASONS.professional_review.summary,
      codes: [...professional, ...operator, ...(incomplete ? ['unanswered_questions'] : [])].sort(),
    };
  }
  if (incomplete) {
    return {
      allowed: false,
      route: BLOCK_REASONS.questionnaire_incomplete.route,
      summary: BLOCK_REASONS.questionnaire_incomplete.summary,
      codes: [...operator, 'unanswered_questions'].sort(),
    };
  }
  if (operator.length > 0) {
    return {
      allowed: false,
      route: BLOCK_REASONS.operator_action.route,
      summary: BLOCK_REASONS.operator_action.summary,
      codes: [...operator].sort(),
    };
  }

  return { allowed: true, route: null, summary: null, codes: [] };
}

/** The per-reason summaries behind a decision, for display. */
export function describeCodes(codes) {
  return (codes ?? [])
    .filter((code) => Object.prototype.hasOwnProperty.call(REASONS, code))
    .map((code) => ({ code, route: REASONS[code].route, summary: REASONS[code].summary }));
}
