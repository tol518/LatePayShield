/* S6 evidence timeline extraction: call, validate, retry once, then give up.
 *
 * Giving up is a supported outcome. docs/ai/SKILLS.md §1 and
 * docs/architecture.md ("AI unavailable/invalid -> fall back to manual entry")
 * both require the manual path to remain complete, so this module never
 * degrades into a guess. The case file's own communication form stays fully
 * usable with the model stopped.
 *
 * Nothing here writes to the database. Proposals are returned to the browser
 * and stay unconfirmed until the operator accepts each one (D-014).
 */

import { chatCompletion } from './client.js';
import { ModelReplyError, parseJsonObject } from './text.js';
import { validateTimeline } from './timelineSchema.js';
import { AiInputError, detectInstructionText } from './extract.js';
import {
  TIMELINE_SYSTEM_PROMPT,
  buildTimelinePrompt,
  buildTimelineRetryPrompt,
} from './timelinePrompts.js';

/* A timeline is a list of short objects, so it needs a larger envelope than a
 * seven-field extraction but still a bounded one: a truncated JSON reply is a
 * failure, not a partial success (SKILLS.md §8). Thinking stays off — the task
 * is reading and quoting, not reasoning, and the operator-hosted model's
 * response-time overrun is a recorded operational risk
 * (docs/ai/mlx-server-memory-diagnosis.md).
 */
const TIMELINE_SETTINGS = {
  temperature: 0.1,
  topP: 0.9,
  maxTokens: 2048,
  chatTemplateKwargs: { enable_thinking: false },
  /* SKILLS.md §8 asks for JSON mode where the runner supports it. Measured on
   * 3 September 2026, the operator's MLX server accepts `response_format` and
   * ignores it: with a prompt shape that produced malformed JSON, enabling this
   * changed nothing (0 of 3 either way). It is kept for runners that do honour
   * it, but it is NOT what makes this skill reliable and must not be described
   * as a safeguard. The prompt shape does that, and the validator decides. */
  responseFormat: { type: 'json_object' },
};

export const MAX_DOCUMENT_CHARACTERS = 25_000;

export function normalizeDocumentText(input) {
  const text = String(input ?? '').replace(/\r\n/g, '\n').trim();
  if (text.length < 20) throw new AiInputError('Paste the correspondence before asking for timeline suggestions.');
  if (text.length > MAX_DOCUMENT_CHARACTERS) {
    throw new AiInputError(`The document is too long. Paste at most ${MAX_DOCUMENT_CHARACTERS.toLocaleString('en-GB')} characters.`);
  }
  return text;
}

async function attempt(prompt, documentText, label) {
  const { content } = await chatCompletion({
    system: TIMELINE_SYSTEM_PROMPT,
    user: prompt,
    label,
    ...TIMELINE_SETTINGS,
  });
  const result = validateTimeline(parseJsonObject(content), documentText);
  if (!result.ok) throw new ModelReplyError(result.error, result.detail);
  return result.value;
}

/**
 * Propose dated case events from correspondence the operator supplied.
 *
 * @param {string} rawDocumentText Untrusted pasted or locally extracted text.
 * @returns {Promise<object>} A validated `timeline` or `refusal` envelope.
 */
export async function runTimelineExtraction(rawDocumentText) {
  const documentText = normalizeDocumentText(rawDocumentText);

  let value;
  try {
    value = await attempt(buildTimelinePrompt(documentText), documentText, 'timeline');
  } catch (firstError) {
    if (firstError.name === 'AiUnavailableError') throw firstError;
    // Only the log-safe message is logged; `detail` may quote document-derived
    // text and goes to the model alone (SKILLS.md §1).
    console.log(`[ai] timeline rejected: ${firstError.message}; retrying once`);
    // SKILLS.md §8: one retry, briefed with what was actually wrong. A generic
    // "not valid JSON" wastes the single retry the spec allows.
    value = await attempt(
      buildTimelineRetryPrompt(documentText, firstError.detail ?? firstError.message),
      documentText,
      'timeline-retry',
    );
  }

  // A warning for the human, never a verdict: the model is instructed to refuse
  // an instruction-bearing document, and real correspondence can legitimately
  // contain unusual wording.
  if (detectInstructionText(documentText) && value.skill === 'timeline') {
    value.warnings = [
      'This document contains instruction-like text. Treat every event below as untrusted and check it against the original before confirming.',
      // The model often volunteers the same observation in its own words. Ours
      // says strictly more, so keep one line rather than showing the fact twice.
      ...value.warnings.filter((warning) => !/instruction[-\s]?like text/i.test(warning)),
    ].slice(0, 8);
  }

  return value;
}
