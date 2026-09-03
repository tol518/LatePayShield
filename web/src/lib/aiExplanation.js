/* Browser client for S3 (status explanation) and S2 (reminder drafting).
 *
 * The model is never addressed from here. Both calls go to the same-origin
 * loopback service, which is the only process that knows where the model runs
 * and the only place its output is schema-validated (D-008).
 *
 * Neither result is evidence. An explanation is narration shown beside the real
 * status chip, which comes from a fresh Coston2 read; a reminder is stored as an
 * unapproved draft that a human must still approve (D-014, task 7).
 */

import { apiFetch, describeApiFailure } from './apiRequest.js';

export const DRAFT_TONES = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'firm', label: 'Firm' },
];

async function request(path, options) {
  const response = await apiFetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(describeApiFailure(response.status, payload.error, 'The assistant service'));
    error.status = response.status;
    throw error;
  }
  return payload;
}

/**
 * Ask for a plain-language explanation of one agreement status.
 *
 * @param {string} status The status key from a fresh Coston2 read.
 * @param {Array<{name: string, value: string}>} facts Bounded extra context.
 *   Identifiers are dropped by the service; do not rely on passing one.
 */
export function requestExplanation(status, facts = []) {
  return request('/api/ai/explanations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, facts }),
  });
}

/**
 * Ask for a reminder draft, which the service stores as unapproved.
 *
 * `asAtDate` is sent by the caller so the same case and the same day always
 * produce the same figures; the deterministic calculator owns them, not the
 * model.
 */
export function requestReminderDraft(caseId, {
  asAtDate,
  tone = 'neutral',
  mentionStatutoryInterest = false,
  eligibilityOutcome = null,
} = {}) {
  return request(`/api/cases/${encodeURIComponent(caseId)}/drafts/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asAtDate, tone, mentionStatutoryInterest, eligibilityOutcome }),
  });
}

/** Today as YYYY-MM-DD in the operator's own timezone. */
export function todayIsoDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

/**
 * Split an explanation's caveats into the model's own and the application's.
 *
 * The mandatory clauses are fixed text appended by the service, so showing them
 * separately keeps them readable as the product's own statement rather than as
 * something a model chose to say.
 */
export function splitLimitations(explanation) {
  const mandatory = explanation?.mandatoryLimitations ?? [];
  const all = explanation?.whatThisDoesNotProve ?? [];
  const specific = all.filter((clause) => !mandatory.includes(clause));
  return { specific, mandatory };
}
