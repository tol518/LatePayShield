/* S1 invoice term extraction: call, validate, retry once, then give up.
 *
 * Giving up is a supported outcome. docs/ai/SKILLS.md §1 and
 * docs/architecture.md ("AI unavailable/invalid -> fall back to manual entry")
 * both require the manual path to remain complete, so this module never
 * degrades into a guess.
 */

import { chatCompletion } from './client.js';
import { parseJsonObject } from './text.js';
import { validateExtraction } from './extractionSchema.js';
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt, buildRetryPrompt } from './prompts.js';

/* An extraction is a small JSON object. Keep Qwen3 out of thinking mode and
 * use a bounded 1,024-token completion envelope. The previous 2,400-token
 * override caused slow requests to outlive the client, while 512 can truncate
 * a complete seven-field JSON extraction from a UBL invoice.
 */
const EXTRACTION_SETTINGS = {
  temperature: 0.1,
  topP: 0.9,
  maxTokens: 1024,
  chatTemplateKwargs: { enable_thinking: false },
};

export const MAX_INVOICE_CHARACTERS = 25_000;

/** A problem with what the user pasted, not with the model. */
export class AiInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiInputError';
  }
}

/* Phrases that only appear in a document trying to steer the reader. This is a
 * warning signal for the human, never a verdict: the model is instructed to
 * refuse, and a real invoice can legitimately contain unusual wording. */
const INJECTION_MARKERS = [
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above)\s+instructions?/i,
  /disregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\s+/i,
  /system\s*prompt/i,
  /mark\s+(this|the\s+\w+)\s+as\s+(verified|paid|settled)/i,
  /treat\s+this\s+(invoice\s+)?as\s+(verified|paid)/i,
];

export function detectInstructionText(invoiceText) {
  return INJECTION_MARKERS.some((marker) => marker.test(invoiceText));
}

export function normalizeInvoiceText(input) {
  const text = String(input ?? '').replace(/\r\n/g, '\n').trim();
  if (text.length < 20) throw new AiInputError('Paste the invoice text before asking for suggestions.');
  if (text.length > MAX_INVOICE_CHARACTERS) {
    throw new AiInputError(`The document is too long. Paste at most ${MAX_INVOICE_CHARACTERS.toLocaleString('en-GB')} characters.`);
  }
  return text;
}

async function attempt(prompt, invoiceText, label) {
  const { content } = await chatCompletion({
    system: EXTRACTION_SYSTEM_PROMPT,
    user: prompt,
    label,
    ...EXTRACTION_SETTINGS,
  });
  const result = validateExtraction(parseJsonObject(content), invoiceText);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/**
 * Propose descriptive invoice terms.
 *
 * @param {string} rawInvoiceText Untrusted pasted document text.
 * @returns {Promise<object>} A validated `extraction` or `refusal` envelope.
 */
export async function runExtraction(rawInvoiceText) {
  const invoiceText = normalizeInvoiceText(rawInvoiceText);

  let value;
  try {
    value = await attempt(buildExtractionPrompt(invoiceText), invoiceText, 'extract');
  } catch (firstError) {
    if (firstError.name === 'AiUnavailableError') throw firstError;
    console.log(`[ai] extract rejected: ${firstError.message}; retrying once`);
    // SKILLS.md §8: one retry with the validation error appended. A second
    // failure is final — the caller falls back to manual entry.
    value = await attempt(buildRetryPrompt(invoiceText, firstError.message), invoiceText, 'extract-retry');
  }

  if (detectInstructionText(invoiceText) && value.skill === 'extraction') {
    value.warnings = [
      'This document contains instruction-like text. Treat every suggestion below as untrusted and check it against the original.',
      ...value.warnings,
    ].slice(0, 8);
  }

  return value;
}
