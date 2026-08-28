/* Schema validation for the S1 extraction and refusal envelopes.
 *
 * docs/ai/SKILLS.md §0: "Every agent output that matters is a JSON object
 * validated by code before anything reaches the UI. An unparseable or
 * schema-invalid response is a failure, not a partial success."
 *
 * Two kinds of check live here, and the difference matters:
 *
 *   REJECT  — the response is structurally wrong or breaks a prohibition. The
 *             caller retries once, then falls back to manual entry.
 *   DEGRADE — one field is unsupported by the document. The field becomes null
 *             with a warning, because a nulled field is exactly what SKILLS.md
 *             §3.1 asks for and the user is confirming every value anyway.
 */

import { isGroundedQuote } from './text.js';
import { EXTRACTION_FIELDS, PAYMENT_RAIL_FIELDS } from './prompts.js';

const CONFIDENCE = new Set(['high', 'medium', 'low']);
const REFUSAL_REASONS = new Set([
  'out_of_scope',
  'needs_human',
  'insufficient_evidence',
  'stale_snapshot',
  'unsafe_request',
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const MAX_VALUE_LENGTH = 200;
const MAX_WARNING_LENGTH = 400;

class SchemaError extends Error {}

function reject(message) {
  throw new SchemaError(message);
}

function confidenceOf(value, fallback = 'low') {
  return CONFIDENCE.has(value) ? value : fallback;
}

/** Free-text the model wrote, trimmed to a displayable length. */
function cleanText(value, limit = MAX_VALUE_LENGTH) {
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

/**
 * Normalize one field value, or return null with a reason.
 *
 * `currency` and `amountMinorUnits` are format-checked because the application
 * layer reads them; a malformed one is dropped rather than shown.
 */
function normalizeFieldValue(name, rawValue) {
  // An explicit null is the documented answer for a field the document does not
  // support, so it is a correct response and never warned about.
  if (rawValue === null || rawValue === undefined) return { value: null, reason: null };

  const value = typeof rawValue === 'number' ? String(rawValue) : rawValue;
  if (typeof value !== 'string') return { value: null, reason: `${name} was not a string` };

  const text = cleanText(value);
  if (!text) return { value: null, reason: null };

  if (name === 'currency') {
    const code = text.toUpperCase();
    if (!ISO_CURRENCY.test(code)) return { value: null, reason: 'the invoice currency was not a three-letter ISO code' };
    return { value: code, reason: null };
  }

  if (name === 'amountMinorUnits') {
    const digits = text.replace(/[\s,]/g, '');
    // A decimal point here means the model emitted major units, not minor. It
    // is not this layer's job to guess a scale factor: code does arithmetic,
    // and a wrong total is worse than an absent one.
    if (!/^\d{1,20}$/.test(digits)) return { value: null, reason: 'the invoice total was not a whole number of minor units' };
    return { value: digits, reason: null };
  }

  if (name === 'dueAt') {
    if (!ISO_DATE.test(text)) return { value: null, reason: 'the due date was not an ISO-8601 YYYY-MM-DD date' };
    const parsed = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(text)) {
      return { value: null, reason: 'the due date was not a real calendar date' };
    }
    return { value: text, reason: null };
  }

  return { value: text, reason: null };
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

function validateExtractionBody(raw, invoiceText) {
  // SKILLS.md §3: a response that sets this false for S1 is rejected outright.
  if (raw.needs_human_confirmation !== true) {
    reject('extraction must set needs_human_confirmation to true');
  }
  if (raw.fields === null || typeof raw.fields !== 'object' || Array.isArray(raw.fields)) {
    reject('extraction.fields must be an object');
  }

  // SKILLS.md §4.5 and acceptance check 2. A populated payment-rail field is a
  // fabricated identifier, so the whole response is rejected rather than
  // repaired: it means the model ignored a hard prohibition.
  for (const field of PAYMENT_RAIL_FIELDS) {
    const supplied = raw.fields[field];
    const value = supplied && typeof supplied === 'object' ? supplied.value : supplied;
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      reject(`extraction must never populate ${field}; it is supplied by the user, not the model`);
    }
  }

  const warnings = cleanWarnings(raw.warnings);
  const fields = {};

  for (const name of EXTRACTION_FIELDS) {
    const supplied = raw.fields[name];
    if (supplied === undefined || supplied === null) {
      fields[name] = { value: null, sourceQuote: null, confidence: 'low' };
      continue;
    }
    if (typeof supplied !== 'object' || Array.isArray(supplied)) {
      reject(`extraction.fields.${name} must be an object with value, sourceQuote and confidence`);
    }

    const { value, reason } = normalizeFieldValue(name, supplied.value);
    const sourceQuote = typeof supplied.sourceQuote === 'string' ? supplied.sourceQuote.trim() : null;

    if (value === null) {
      if (reason) warnings.push(`${name} was not used because ${reason}.`);
      fields[name] = { value: null, sourceQuote: null, confidence: 'low' };
      continue;
    }

    // Grounding, SKILLS.md §3.1: a field with no quotable source must be null.
    // This is the check that catches an invented supplier or invoice number.
    if (!sourceQuote || !isGroundedQuote(sourceQuote, invoiceText)) {
      warnings.push(`${name} was dropped because the model could not quote it from the document.`);
      fields[name] = { value: null, sourceQuote: null, confidence: 'low' };
      continue;
    }

    fields[name] = {
      value,
      sourceQuote: cleanText(sourceQuote, MAX_WARNING_LENGTH),
      confidence: confidenceOf(supplied.confidence),
    };
  }

  const grounded = EXTRACTION_FIELDS.filter((name) => fields[name].value !== null);
  if (grounded.length === 0) {
    reject('extraction grounded no field in the document');
  }

  return {
    skill: 'extraction',
    confidence: confidenceOf(raw.confidence),
    needs_human_confirmation: true,
    fields,
    // Always the documented four, whatever the model returned: this list is a
    // statement about the product boundary, not a model opinion.
    notSupplied: [...PAYMENT_RAIL_FIELDS],
    warnings: warnings.slice(0, 8),
  };
}

/**
 * Validate a parsed model reply for the extraction skill.
 *
 * @param {object} raw Parsed JSON object from the model.
 * @param {string} invoiceText The exact text sent to the model, for quote grounding.
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
export function validateExtraction(raw, invoiceText) {
  try {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) reject('response must be a JSON object');
    if (raw.skill === 'refusal') return { ok: true, value: validateRefusal(raw) };
    if (raw.skill !== 'extraction') reject('skill must be "extraction" or "refusal"');
    return { ok: true, value: validateExtractionBody(raw, invoiceText) };
  } catch (error) {
    if (error instanceof SchemaError) return { ok: false, error: error.message };
    throw error;
  }
}
