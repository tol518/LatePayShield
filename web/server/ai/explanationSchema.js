/* Schema validation for the S3 explanation and refusal envelopes.
 *
 * docs/ai/SKILLS.md §0: "Every agent output that matters is a JSON object
 * validated by code before anything reaches the UI."
 *
 * The decisive check here is the status. S3's whole risk is a model that
 * promotes a pending state to a verified one, or softens a failure — so a
 * response whose `status` is not character-for-character the status the
 * contract read supplied is rejected outright. Nothing about the reply is
 * repaired: a model that changed the status has broken the one rule that
 * matters, and a repaired reply would hide that.
 *
 * The four mandatory limitation clauses are not validated here because they are
 * not requested from the model. `explain.js` appends them from
 * web/shared/statusLimitations.js after validation, so they are guaranteed
 * rather than checked (SKILLS.md §9, acceptance check 5).
 */

import { isKnownStatus } from '../../shared/statusLimitations.js';

const CONFIDENCE = new Set(['high', 'medium', 'low']);
const REFUSAL_REASONS = new Set([
  'out_of_scope',
  'needs_human',
  'insufficient_evidence',
  'stale_snapshot',
  'unsafe_request',
]);

const MAX_SENTENCE_LENGTH = 400;
const MAX_LIST_ITEMS = 6;
const MAX_WARNING_LENGTH = 400;

/* Claims only the contract or an adviser may make. A status explanation is
 * about one specific agreement, so an applied legal conclusion here is exactly
 * the advice SKILLS.md §5 forbids. */
const FORBIDDEN_CLAIMS = [
  /\bis\s+(now\s+)?(legally\s+)?(owed|due\s+as\s+a\s+matter\s+of\s+law)/i,
  /\bdebt\s+is\s+(established|proven|enforceable)/i,
  /\benforceable\b/i,
  /\bunenforceable\b/i,
  /entitled\s+to/i,
  /statutory\s+interest/i,
  /fixed\s+(sum\s+)?compensation/i,
  /breach\s+of\s+contract/i,
  /\bliable\s+for\b/i,
  /(a\s+)?court\s+(would|will|is\s+likely|order)/i,
  /\b(sue|litigation|county\s+court|small\s+claims)\b/i,
  /debt\s+collect(ion|or)/i,
  /\bbailiff/i,
  /credit\s+(score|rating|report)/i,
  /\bmainnet\b/i,
  /real\s+money/i,
];

/* Identifier shapes. The interface renders identifiers from the chain read; the
 * model is given none and may emit none (SKILLS.md §4.5). */
const IDENTIFIER_SHAPES = [
  /0x[0-9a-f]{6,}/i,
  /\b[0-9A-F]{40,}\b/,
  /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/,
];

/* Promotion language: treating a non-final state as a settled outcome. */
const PROMOTION_TERMS = [
  /\bhas\s+been\s+paid\b/i,
  /\bwas\s+paid\b/i,
  /\bpayment\s+is\s+(confirmed|verified|complete)/i,
  /\bproven\s+unpaid\b/i,
  /\bdid\s+not\s+pay\b/i,
  /\bnever\s+paid\b/i,
  /\bfailed\s+to\s+pay\b/i,
];

/* Which statuses may legitimately describe a finalised outcome. For every other
 * status, promotion language is a defect rather than a description. */
const FINALISED_STATUSES = new Set(['PAID_VERIFIED', 'OVERDUE_VERIFIED']);

class SchemaError extends Error {
  constructor(message, detail = null) {
    super(message);
    this.detail = detail;
  }
}

/* `message` is the category, safe to log. `detail` may quote the model's own
 * words and is used only to brief the single retry (SKILLS.md §1 and §8). */
function reject(message, detail = null) {
  throw new SchemaError(message, detail);
}

function confidenceOf(value, fallback = 'low') {
  return CONFIDENCE.has(value) ? value : fallback;
}

function cleanText(value, limit) {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, limit);
}

function matchedPhrase(text, patterns) {
  for (const pattern of patterns) {
    const found = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(text);
    if (found) return found[0];
  }
  return null;
}

function cleanWarnings(warnings) {
  if (warnings === undefined) return [];
  if (!Array.isArray(warnings)) reject('warnings must be an array of strings');
  return warnings
    .filter((warning) => typeof warning === 'string')
    .map((warning) => cleanText(warning, MAX_WARNING_LENGTH))
    .filter(Boolean)
    .slice(0, 8);
}

function cleanList(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) reject(`${label} must be an array of strings`);
  return value
    .filter((entry) => typeof entry === 'string')
    .map((entry) => cleanText(entry, MAX_SENTENCE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);
}

function validateRefusal(raw) {
  const reason = REFUSAL_REASONS.has(raw.reason) ? raw.reason : null;
  if (!reason) reject('refusal.reason must be one of the documented reasons');
  if (typeof raw.explanation !== 'string' || !raw.explanation.trim()) {
    reject('refusal.explanation must be a non-empty string');
  }
  return {
    skill: 'refusal',
    confidence: confidenceOf(raw.confidence, 'high'),
    needs_human_confirmation: false,
    reason,
    explanation: cleanText(raw.explanation, MAX_WARNING_LENGTH),
    offer: typeof raw.offer === 'string' && raw.offer.trim() ? cleanText(raw.offer, MAX_WARNING_LENGTH) : null,
    warnings: cleanWarnings(raw.warnings),
  };
}

function validateExplanationBody(raw, expectedStatus) {
  // The rule S3 exists to enforce. A model that reports a different status has
  // asserted an outcome the contract did not, so the reply fails whole.
  if (typeof raw.status !== 'string' || raw.status.trim() !== expectedStatus) {
    reject(
      'explanation.status must repeat the status the contract read supplied',
      `You reported the status "${cleanText(raw.status ?? '', 60)}" but the contract read supplied "${expectedStatus}". Copy that key exactly. You may never change, soften or promote a status.`,
    );
  }
  if (!isKnownStatus(expectedStatus)) {
    // A programming error rather than a model one: the caller passed something
    // outside the eight documented statuses.
    reject('explanation.status is not one of the documented statuses');
  }

  const plainMeaning = typeof raw.plainMeaning === 'string' ? cleanText(raw.plainMeaning, MAX_SENTENCE_LENGTH) : '';
  if (!plainMeaning) reject('explanation.plainMeaning must be a non-empty string');

  const proves = cleanList(raw.whatThisProves, 'explanation.whatThisProves');
  const doesNotProve = cleanList(raw.whatThisDoesNotProve, 'explanation.whatThisDoesNotProve');
  // SKILLS.md §3.3: this list must never be empty. The mandatory clauses are
  // appended later, but a model that offers nothing here has not done the more
  // important half of the job.
  if (doesNotProve.length === 0) {
    reject(
      'explanation.whatThisDoesNotProve must not be empty',
      'You left whatThisDoesNotProve empty. State at least one thing this status does not establish; that half matters more than what it does establish.',
    );
  }

  const nextAction = typeof raw.nextAction === 'string' && raw.nextAction.trim()
    ? cleanText(raw.nextAction, MAX_SENTENCE_LENGTH)
    : null;

  const inspected = [plainMeaning, ...proves, ...doesNotProve, nextAction ?? ''].join(' ');

  const claim = matchedPhrase(inspected, FORBIDDEN_CLAIMS);
  if (claim) {
    reject(
      'explanation states a legal, collection, or mainnet claim it may not make',
      `You used the phrase "${claim}". An explanation may not assert a debt, entitlement, enforceability, court action, collection, credit consequence, or anything involving mainnet or real money. Describe only what the status means.`,
    );
  }
  const identifier = matchedPhrase(inspected, IDENTIFIER_SHAPES);
  if (identifier) {
    reject(
      'explanation contains an identifier',
      `You wrote the identifier "${identifier}". The interface renders identifiers itself. Remove it and describe the status in words.`,
    );
  }
  // Promotion is only a defect where the contract has not finalised an outcome.
  // On a finalised status the same words can be an accurate description.
  if (!FINALISED_STATUSES.has(expectedStatus)) {
    const promotion = matchedPhrase(inspected, PROMOTION_TERMS);
    if (promotion) {
      reject(
        `explanation treats ${expectedStatus} as a settled outcome`,
        `You used the phrase "${promotion}" while the status is ${expectedStatus}, which is not a finalised outcome. A submitted or pending payment is not verified, and a passed deadline is not proof of non-payment.`,
      );
    }
  }

  return {
    skill: 'explanation',
    confidence: confidenceOf(raw.confidence),
    // SKILLS.md §3.3: S3 is read-only narration, so this is false by contract
    // whatever the model returned.
    needs_human_confirmation: false,
    status: expectedStatus,
    plainMeaning,
    whatThisProves: proves,
    whatThisDoesNotProve: doesNotProve,
    nextAction,
    warnings: cleanWarnings(raw.warnings),
  };
}

/**
 * Validate a parsed model reply for the explanation skill.
 *
 * @param {object} raw Parsed JSON object from the model.
 * @param {string} expectedStatus The status the contract read supplied.
 * @returns {{ok: true, value: object} | {ok: false, error: string, detail: ?string}}
 *   `error` is the log-safe category; `detail`, when present, may quote the
 *   model's own words and is only for briefing the retry.
 */
export function validateExplanation(raw, expectedStatus) {
  try {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) reject('response must be a JSON object');
    if (raw.skill === 'refusal') return { ok: true, value: validateRefusal(raw) };
    if (raw.skill !== 'explanation') reject('skill must be "explanation" or "refusal"');
    return { ok: true, value: validateExplanationBody(raw, expectedStatus) };
  } catch (error) {
    if (error instanceof SchemaError) return { ok: false, error: error.message, detail: error.detail };
    throw error;
  }
}
