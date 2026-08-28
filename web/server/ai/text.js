/* Turning a local model's raw reply into a candidate JSON object.
 *
 * docs/ai/SKILLS.md §3: thinking blocks are stripped by the application layer
 * before parsing, and nothing inside a thinking block is ever shown to a user
 * or treated as output. The MLX server for Qwen3 already returns reasoning in a
 * separate `message.reasoning` field, which this layer simply never reads — but
 * a runner that inlines <think> tags must not break the parser either, so both
 * shapes are handled here.
 */

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi;
const UNCLOSED_THINK = /<think>[\s\S]*$/i;
const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

/** Remove inline reasoning and code fences. Never returns reasoning text. */
export function stripThinking(content) {
  const withoutThinking = String(content ?? '')
    .replace(THINK_BLOCK, '')
    .replace(UNCLOSED_THINK, '')
    .trim();

  const fenced = withoutThinking.match(FENCE);
  return (fenced ? fenced[1] : withoutThinking).trim();
}

/**
 * Extract the single top-level JSON object from a cleaned reply.
 *
 * Small models occasionally add a sentence before or after the object. Slicing
 * to the outermost braces recovers those replies without accepting prose as
 * output; anything that still fails to parse is a failure, not a partial
 * success (SKILLS.md §8).
 */
export function parseJsonObject(content) {
  const text = stripThinking(content);
  if (!text) throw new Error('The model returned an empty response.');

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? text.slice(start, end + 1) : text;

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error('The model response was not valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The model response was not a JSON object.');
  }
  return parsed;
}

/** Collapse whitespace and case so a quote can be checked against its source. */
export function normalizeForMatch(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Is `quote` a verbatim span of `source`?
 *
 * SKILLS.md §3.1: a field with no quotable source must be null. Matching is
 * whitespace- and case-insensitive because a paste loses line breaks, but it is
 * otherwise literal: the model may not paraphrase its own evidence.
 */
export function isGroundedQuote(quote, source) {
  const needle = normalizeForMatch(quote);
  if (needle.length < 2) return false;
  return normalizeForMatch(source).includes(needle);
}
