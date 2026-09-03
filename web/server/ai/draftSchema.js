/* Schema validation for the S2 draft and refusal envelopes.
 *
 * docs/ai/SKILLS.md §0: "Every agent output that matters is a JSON object
 * validated by code before anything reaches the UI."
 *
 * S2's risk is not a malformed field, it is a *tone*: a reminder that drifts
 * into debt collection. docs/project-context.md draws that line as a product
 * boundary — "verifiable payment compliance, not an AI debt collector" — so the
 * checks here are mostly about what a reminder may not say. A breach rejects
 * the whole reply rather than being edited out, because a drafted threat means
 * the model ignored the boundary and the next sentence cannot be trusted
 * either.
 *
 * Legal content is never the model's to write. The application appends its own
 * approved sentence afterwards when the gates permit it (D-021), so any legal
 * content in a model reply is a rejection without exception — there is no
 * "permitted" case to weigh.
 */

import { DRAFT_TONES } from './draftPrompts.js';

const CONFIDENCE = new Set(['high', 'medium', 'low']);
const REFUSAL_REASONS = new Set([
  'out_of_scope',
  'needs_human',
  'insufficient_evidence',
  'stale_snapshot',
  'unsafe_request',
]);
const TONES = new Set(DRAFT_TONES);

const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 2_400;
const MIN_BODY_LENGTH = 40;
const MAX_WARNING_LENGTH = 400;

/* Debt-collection and legal-consequence language. The product is not a
 * collector, and a reminder is not a letter before action (SKILLS.md §S2). */
const COLLECTION_TERMS = [
  /\bcourt\b/i,
  /\bclaim\b/i,
  /\blitigation\b/i,
  /\blegal\s+(action|proceedings|advice)\b/i,
  /\bsolicitor\b/i,
  /\bbailiff/i,
  /debt\s+collect(ion|or|ing)/i,
  /\bcollections?\s+agency/i,
  /credit\s+(score|rating|report|reference|file)/i,
  /\bblacklist/i,
  /\bdefault\s+notice\b/i,
  /\bstatutory\s+demand\b/i,
  /\bwinding[-\s]?up\b/i,
  /\binsolvency\b/i,
  /\benforce(ment|able)?\b/i,
  /\blegal\s+position\b/i,
  /\bliable\b/i,
  /\bbreach\b/i,
  /\bfurther\s+action\b/i,
  /\bescalate/i,
  /\bfailure\s+to\s+(pay|respond)\s+will\b/i,
  /\bif\s+we\s+do\s+not\s+(hear|receive)[^.]{0,60}\bwe\s+will\b/i,
];

/* Claims about payment truth or about the system acting on its own. */
const OVERREACH_TERMS = [
  /\bproven\s+(unpaid|non[-\s]?payment)\b/i,
  /\bhas\s+been\s+proven\b/i,
  /\bverified\s+as\s+unpaid\b/i,
  /latepay\s*shield\s+will\b/i,
  /\b(the\s+)?(system|assistant|platform)\s+will\s+(chase|report|escalate|enforce|act)/i,
  /automatically\s+(chase|report|escalate|enforce)/i,
  /\bwe\s+have\s+(recorded|proven)\s+that\s+you\s+did\s+not\s+pay/i,
];

/* Legal content of any kind. Permitted only as a verbatim supplied sentence. */
const LEGAL_CONTENT_TERMS = [
  /statutory\s+interest/i,
  /fixed\s+(sum\s+)?compensation/i,
  /late\s+payment\s+of\s+commercial\s+debts/i,
  /\b1998\s+act\b/i,
  /entitled\s+to/i,
  /\binterest\s+(may|will|is)\s+(be\s+)?(charge|charged|added|applied|accrue)/i,
  /\bcompensation\s+(may|will|is)\b/i,
];

/* Identifier shapes. None is supplied to the model, so none may appear. */
const IDENTIFIER_SHAPES = [
  /0x[0-9a-f]{6,}/i,
  /\b[0-9A-F]{40,}\b/,
  /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/,
];

/* Unfilled placeholders. A draft the sender has to complete is not a draft. */
const PLACEHOLDER_SHAPES = [
  /\[[^\]]{1,40}\]/,
  /\{\{?[^}]{1,40}\}?\}/,
  /<[a-z][a-z\s_-]{1,30}>/i,
  /\bTBD\b/,
  /\bTBC\b/i,
  /\bXX+\b/,
  /\binsert\s+(the\s+)?[a-z]+/i,
  /\byour\s+name\s+here\b/i,
];

/* Markdown the prompt forbids, because this body goes into an email field. */
const MARKDOWN_SHAPES = [
  /\*\*[^*]+\*\*/,
  /^\s*[*\-+]\s+/m,
  /^\s*#{1,6}\s+/m,
  /\[[^\]]+\]\([^)]+\)/,
  /`[^`]+`/,
];

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
  return String(value).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, limit);
}

function matchedPhrase(text, patterns) {
  for (const pattern of patterns) {
    const found = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(text);
    if (found) return found[0].trim();
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

/** Digits only, so "£1,250.00" and "1250.00" compare equal. */
function amountDigits(value) {
  return String(value).replace(/[^\d]/g, '');
}

const MONEY_SHAPES = [
  /[£$€]\s?\d[\d,]*(?:\.\d+)?/g,
  /\b\d[\d,]*\.\d{2}\b/g,
  /\b\d[\d,]*\s?(?:GBP|EUR|USD|pounds?|pence)\b/gi,
];

/** Every amount in the draft must be one the caller supplied. */
function ungroundedAmount(text, suppliedText) {
  const supplied = new Set();
  for (const shape of MONEY_SHAPES) {
    for (const match of String(suppliedText).matchAll(shape)) supplied.add(amountDigits(match[0]));
  }
  for (const shape of MONEY_SHAPES) {
    for (const match of String(text).matchAll(shape)) {
      if (!supplied.has(amountDigits(match[0]))) return match[0].trim();
    }
  }
  return null;
}

function validateDraftBody(raw, { expectedTone, suppliedText }) {
  // SKILLS.md §3: a draft that claims it needs no confirmation is rejected.
  if (raw.needs_human_confirmation !== true) {
    reject(
      'draft must set needs_human_confirmation to true',
      'You set needs_human_confirmation to false. A reminder is always a draft: a person reviews, edits and approves it before it can go anywhere.',
    );
  }

  const subject = typeof raw.subject === 'string' ? cleanText(raw.subject, MAX_SUBJECT_LENGTH) : '';
  if (!subject) reject('draft.subject must be a non-empty string');

  const body = typeof raw.body === 'string' ? cleanText(raw.body, MAX_BODY_LENGTH) : '';
  if (body.length < MIN_BODY_LENGTH) {
    reject('draft.body is too short to be a usable reminder');
  }

  const tone = typeof raw.tone === 'string' ? raw.tone.trim().toLowerCase() : '';
  if (!TONES.has(tone) || tone !== expectedTone) {
    reject(
      'draft.tone must repeat the tone that was requested',
      `You returned the tone "${cleanText(raw.tone ?? '', 40)}" but "${expectedTone}" was requested. Copy it exactly.`,
    );
  }

  const inspected = `${subject}\n${body}`;

  const collection = matchedPhrase(inspected, COLLECTION_TERMS);
  if (collection) {
    reject(
      'draft contains debt-collection or legal-consequence language',
      `You used the phrase "${collection}". This is a payment reminder, not a letter before action. Remove every mention of court, a claim, a solicitor, collection, credit consequences, insolvency, enforceability or further action, including as a possibility.`,
    );
  }
  const overreach = matchedPhrase(inspected, OVERREACH_TERMS);
  if (overreach) {
    reject(
      'draft asserts payment truth or that something will act on its own',
      `You used the phrase "${overreach}". Nothing has been proven about non-payment, and no system chases, reports or enforces anything. The supplier sends this reminder themselves.`,
    );
  }

  // Never the model's to write, whatever the case permits.
  const legal = matchedPhrase(inspected, LEGAL_CONTENT_TERMS);
  if (legal) {
    reject(
      'draft contains legal content, which is never the model to write',
      `You wrote "${legal}". Legal wording is appended by the application, not by you. Write the factual reminder only, and set mentionsStatutoryInterest to false.`,
    );
  }

  const identifier = matchedPhrase(inspected, IDENTIFIER_SHAPES);
  if (identifier) {
    reject(
      'draft contains an identifier',
      `You wrote the identifier "${identifier}". A reminder names the invoice, not a chain identifier. Remove it.`,
    );
  }
  const placeholder = matchedPhrase(inspected, PLACEHOLDER_SHAPES);
  if (placeholder) {
    reject(
      'draft leaves a placeholder for the sender to fill in',
      `You left the placeholder "${placeholder}". Every fact you need was supplied; write it out in full.`,
    );
  }
  const markdown = matchedPhrase(inspected, MARKDOWN_SHAPES);
  if (markdown) {
    reject(
      'draft contains markdown formatting',
      `You used the markdown "${markdown}". This body goes into an email field, so write plain text with no asterisks, headings, bullets, links or backticks.`,
    );
  }
  const amount = ungroundedAmount(inspected, suppliedText);
  if (amount) {
    reject(
      'draft states an amount that was not supplied',
      `You wrote the amount ${amount}, which was not among the confirmed facts. Never compute, convert or estimate a figure; use the amount exactly as supplied.`,
    );
  }

  // The model never places legal wording, so it may never claim to have.
  if (raw.mentionsStatutoryInterest === true) {
    reject(
      'draft claims a statutory-interest mention the model may not make',
      'You set mentionsStatutoryInterest to true. You never write legal wording; the application appends its own where a case permits it. Set it to false.',
    );
  }

  return {
    skill: 'draft',
    confidence: confidenceOf(raw.confidence),
    needs_human_confirmation: true,
    subject,
    body,
    tone,
    // Always false from the model. The caller sets it when it appends the
    // approved sentence itself.
    mentionsStatutoryInterest: false,
    warnings: cleanWarnings(raw.warnings),
  };
}

/**
 * Validate a parsed model reply for the reminder-draft skill.
 *
 * @param {object} raw Parsed JSON object from the model.
 * @param {object} context `expectedTone` and `suppliedText` — the exact facts
 *   given to the model, for grounding amounts.
 * @returns {{ok: true, value: object} | {ok: false, error: string, detail: ?string}}
 *   `error` is the log-safe category; `detail`, when present, may quote the
 *   model's own words and is only for briefing the retry.
 */
export function validateDraft(raw, context) {
  try {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) reject('response must be a JSON object');
    if (raw.skill === 'refusal') return { ok: true, value: validateRefusal(raw) };
    if (raw.skill !== 'draft') reject('skill must be "draft" or "refusal"');
    return { ok: true, value: validateDraftBody(raw, context) };
  } catch (error) {
    if (error instanceof SchemaError) return { ok: false, error: error.message, detail: error.detail };
    throw error;
  }
}
