/* Schema validation for the S6 timeline and refusal envelopes.
 *
 * docs/ai/SKILLS.md §0: "Every agent output that matters is a JSON object
 * validated by code before anything reaches the UI. An unparseable or
 * schema-invalid response is a failure, not a partial success."
 *
 * Two kinds of check live here, and the difference matters:
 *
 *   REJECT  — the response breaks a hard prohibition or is structurally wrong.
 *             The caller retries once, then falls back to manual entry. A
 *             prohibition breach is rejected whole rather than repaired,
 *             because a repaired response hides that the model ignored a rule.
 *   DROP    — one event is unsupported by the document. It is removed with a
 *             warning naming it, because a partial, well-grounded timeline is
 *             exactly what SKILLS.md asks for and the operator confirms every
 *             event individually anyway.
 *
 * Nothing here persists. The caller returns proposals to the browser, and only
 * an explicit per-event confirmation writes a row (D-014).
 */

import { isGroundedQuote, normalizeForMatch } from './text.js';
import { TIMELINE_CHANNELS, TIMELINE_DIRECTIONS, TIMELINE_NOT_SUPPLIED } from './timelinePrompts.js';

const CONFIDENCE = new Set(['high', 'medium', 'low']);
const REFUSAL_REASONS = new Set([
  'out_of_scope',
  'needs_human',
  'insufficient_evidence',
  'stale_snapshot',
  'unsafe_request',
]);
const CHANNELS = new Set(TIMELINE_CHANNELS);
const DIRECTIONS = new Set(TIMELINE_DIRECTIONS);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_EVENTS = 40;
const MAX_SUBJECT_LENGTH = 300;
const MAX_SUMMARY_LENGTH = 600;
const MAX_QUOTE_LENGTH = 400;
const MAX_WARNING_LENGTH = 400;

/* Terms that describe verified application state. Only the contract read and
 * the application layer may produce these, so a model that writes one into a
 * case event has asserted an outcome it cannot establish (SKILLS.md §4.1). */
const APPLICATION_TRUTH_TERMS = [
  /paid[_\s-]?verified/i,
  /overdue[_\s-]?verified/i,
  /awaiting[_\s-]?payment/i,
  /operational[_\s-]?failure/i,
  /evidence\s+id/i,
  /voting\s+round/i,
  /\bfdc\b/i,
  /flare\s+data\s+connector/i,
  /\battestation\b/i,
  /ledger\s+(index|number)/i,
  /destination\s+tag/i,
  /invoice\s+hash/i,
  /\bcoston2?\b/i,
  /\bxrpl\b/i,
];

/* Identifier shapes. An agreement, transaction, or evidence identifier reaches
 * a case file from a chain read, never from a document the model read
 * (SKILLS.md §4.5), so any of these in a proposed event is a fabrication risk
 * the operator should not have to spot. */
const IDENTIFIER_SHAPES = [
  /0x[0-9a-f]{6,}/i,
  /\b[0-9A-F]{40,}\b/,
  /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/,
];

/* Applied legal conclusions. SKILLS.md §5 draws the line at general rule versus
 * applied conclusion, and a case event is inherently about this specific debt,
 * so none of these belongs in one. */
const LEGAL_CONCLUSION_TERMS = [
  /entitled\s+to/i,
  /\bunenforceable\b/i,
  /\benforceable\b/i,
  /breach\s+of\s+contract/i,
  /\bunlawful\b/i,
  /\bliable\s+for\b/i,
  /legally\s+(obliged|required|binding)/i,
  /statutory\s+interest/i,
  /fixed\s+(sum\s+)?compensation/i,
  /late\s+payment\s+act/i,
  /\b1998\s+act\b/i,
  /(a\s+)?court\s+(would|will|is\s+likely)/i,
  /you\s+should\s+(sue|claim|escalate)/i,
  /(is|are)\s+(legally\s+)?(due|owed)\s+as\s+a\s+matter\s+of\s+law/i,
];

/* A money amount written by the model. Restricted to shapes that are
 * unambiguously an amount — symbol-prefixed, decimal, or currency-qualified —
 * so an ordinary date or invoice number is never mistaken for one. */
const MONEY_SHAPES = [
  /[£$€]\s?\d[\d,]*(?:\.\d+)?/g,
  /\b\d[\d,]*\.\d{2}\b/g,
  /\b\d[\d,]*\s?(?:GBP|EUR|USD|pounds?|pence)\b/gi,
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
  return String(value).replace(/\s+/g, ' ').trim().slice(0, limit);
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

/** The offending phrase, so a retry can be told what to remove. */
function matchedPhrase(text, patterns) {
  for (const pattern of patterns) {
    // A /g regex carries lastIndex between calls; match with a fresh one.
    const found = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(text);
    if (found) return found[0];
  }
  return null;
}

/** Digits only, so "£1,250.00" and "1250.00" compare equal. */
function amountDigits(value) {
  return String(value).replace(/[^\d]/g, '');
}

/**
 * Every amount the model wrote must appear in the document.
 *
 * SKILLS.md §4.6 and §6: the model never computes. An amount the document does
 * not contain was either calculated or invented, and both are defects.
 */
function ungroundedAmount(text, documentText) {
  const sourceDigits = new Set();
  for (const shape of MONEY_SHAPES) {
    for (const match of String(documentText).matchAll(shape)) {
      sourceDigits.add(amountDigits(match[0]));
    }
  }
  for (const shape of MONEY_SHAPES) {
    for (const match of String(text).matchAll(shape)) {
      if (!sourceDigits.has(amountDigits(match[0]))) return match[0].trim();
    }
  }
  return null;
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

/** A real calendar date, or null. */
function normalizedDate(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!ISO_DATE.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(text)) return null;
  return text;
}

function validateTimelineBody(raw, documentText) {
  // SKILLS.md §3: a response that sets this false for a proposing skill is
  // rejected outright.
  if (raw.needs_human_confirmation !== true) {
    reject('timeline must set needs_human_confirmation to true');
  }
  if (!Array.isArray(raw.events)) reject('timeline.events must be an array');
  if (raw.events.length > MAX_EVENTS) {
    reject(`timeline.events must contain at most ${MAX_EVENTS} events`);
  }

  const warnings = cleanWarnings(raw.warnings);
  const events = [];
  const seen = new Set();

  raw.events.forEach((supplied, index) => {
    const position = index + 1;
    if (supplied === null || typeof supplied !== 'object' || Array.isArray(supplied)) {
      reject(`timeline.events[${index}] must be an object`);
    }

    const summary = typeof supplied.summary === 'string' ? cleanText(supplied.summary, MAX_SUMMARY_LENGTH) : '';
    const subject = typeof supplied.subject === 'string' ? cleanText(supplied.subject, MAX_SUBJECT_LENGTH) : null;
    const sourceQuote = typeof supplied.sourceQuote === 'string' ? supplied.sourceQuote.trim() : '';
    /* The prohibitions below scan what the *model wrote* — the summary and the
     * subject. `sourceQuote` is deliberately exempt: it is the document's own
     * words, and an instruction-bearing email that says "mark this PAID_VERIFIED"
     * is itself a case fact worth recording. Censoring the quote would remove
     * the very thing the reviewer checks the summary against. */
    const inspected = [summary, subject ?? ''].join(' ');

    // Hard prohibitions first: these mean a rule was ignored, so the whole
    // response fails rather than losing one event and keeping the rest.
    const truthTerm = matchedPhrase(inspected, APPLICATION_TRUTH_TERMS);
    if (truthTerm) {
      reject(
        `event ${position} states application or payment-evidence truth the model cannot establish; payment status comes from the contract`,
        `Event ${position} used the phrase "${truthTerm}". Payment status, FDC evidence and chain state come from the contract, not from you. Remove that phrase, or report only what the document says a party claimed.`,
      );
    }
    const identifier = matchedPhrase(inspected, IDENTIFIER_SHAPES);
    if (identifier) {
      reject(
        `event ${position} contains an identifier; identifiers come from a chain read, not from a document`,
        `Event ${position} contained the identifier "${identifier}". Never write a transaction hash, agreement ID, evidence ID, 0x value or XRPL address into an event. Remove it.`,
      );
    }
    const legalTerm = matchedPhrase(inspected, LEGAL_CONCLUSION_TERMS);
    if (legalTerm) {
      reject(
        `event ${position} states a legal conclusion; the assistant may not apply the law to this debt`,
        `Event ${position} used the phrase "${legalTerm}". You may not state entitlement, enforceability, breach, liability, what a court would do, or an interest or compensation figure. Describe only what happened.`,
      );
    }
    const amount = ungroundedAmount(inspected, documentText);
    if (amount) {
      reject(
        `event ${position} states an amount the document does not contain; the model never computes a figure`,
        `Event ${position} stated the amount ${amount}, which does not appear in the document. Never total, convert or estimate a figure. Quote an amount only if the document writes it.`,
      );
    }

    // Per-event grounding and shape: drop, with a warning naming what went.
    if (!summary) {
      warnings.push(`Event ${position} was dropped because it had no summary.`);
      return;
    }
    const occurredAt = normalizedDate(supplied.occurredAt);
    if (!occurredAt) {
      warnings.push(`Event ${position} was dropped because the document did not give it a usable YYYY-MM-DD date.`);
      return;
    }
    const channel = typeof supplied.channel === 'string' ? supplied.channel.trim().toLowerCase() : '';
    if (!CHANNELS.has(channel)) {
      warnings.push(`Event ${position} was dropped because "${cleanText(supplied.channel ?? '', 40)}" is not a supported channel.`);
      return;
    }
    const direction = typeof supplied.direction === 'string' ? supplied.direction.trim().toLowerCase() : '';
    if (!DIRECTIONS.has(direction)) {
      warnings.push(`Event ${position} was dropped because "${cleanText(supplied.direction ?? '', 40)}" is not a supported direction.`);
      return;
    }
    // The check that catches an invented event. SKILLS.md §3.1: an item with no
    // quotable source must not survive.
    if (!sourceQuote || !isGroundedQuote(sourceQuote, documentText)) {
      warnings.push(`Event ${position} was dropped because the model could not quote it from the document.`);
      return;
    }

    const fingerprint = `${occurredAt}|${normalizeForMatch(summary)}`;
    if (seen.has(fingerprint)) {
      warnings.push(`Event ${position} was dropped as a duplicate of an earlier event.`);
      return;
    }
    seen.add(fingerprint);

    events.push({
      occurredAt,
      channel,
      direction,
      subject: subject || null,
      summary,
      sourceQuote: cleanText(sourceQuote, MAX_QUOTE_LENGTH),
      confidence: confidenceOf(supplied.confidence),
    });
  });

  // Nothing survived, so there is nothing to propose. Failing here lets the
  // caller retry once and then hand the operator the manual form, rather than
  // showing an empty panel that looks like a working answer.
  if (events.length === 0) {
    reject('timeline grounded no event in the document');
  }

  events.sort((left, right) => (left.occurredAt < right.occurredAt ? -1 : left.occurredAt > right.occurredAt ? 1 : 0));

  return {
    skill: 'timeline',
    confidence: confidenceOf(raw.confidence),
    needs_human_confirmation: true,
    events,
    // Always the documented list, whatever the model returned: it is a
    // statement about the product boundary, not a model opinion.
    notSupplied: [...TIMELINE_NOT_SUPPLIED],
    warnings: warnings.slice(0, 8),
  };
}

/**
 * Validate a parsed model reply for the timeline skill.
 *
 * @param {object} raw Parsed JSON object from the model.
 * @param {string} documentText The exact text sent to the model, for grounding.
 * @returns {{ok: true, value: object} | {ok: false, error: string, detail: ?string}}
 *   `error` is the log-safe category; `detail`, when present, may quote the
 *   model's own words and is only for briefing the retry.
 */
export function validateTimeline(raw, documentText) {
  try {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) reject('response must be a JSON object');
    if (raw.skill === 'refusal') return { ok: true, value: validateRefusal(raw) };
    if (raw.skill !== 'timeline') reject('skill must be "timeline" or "refusal"');
    return { ok: true, value: validateTimelineBody(raw, documentText) };
  } catch (error) {
    if (error instanceof SchemaError) return { ok: false, error: error.message, detail: error.detail };
    throw error;
  }
}
