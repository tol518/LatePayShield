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
 * A rejected model reply, carrying two descriptions of the same problem.
 *
 * `message` is safe to log: structural facts only. `detail` may quote the
 * model's own bytes and is used solely to brief the one retry SKILLS.md §8
 * allows. Keeping them apart is what lets the retry be specific without
 * putting document-derived text in the service log (SKILLS.md §1).
 */
export class ModelReplyError extends Error {
  constructor(message, detail = null) {
    super(message);
    this.name = 'ModelReplyError';
    this.detail = detail;
  }
}

/* V8 reports a parse failure in one of two shapes:
 *
 *   "Expected double-quoted property name in JSON at position 30 (line 3 column 3)"
 *   "Unexpected token '}', \"{\"a\": 1, \"b\": }\" is not valid JSON"
 *
 * The first is purely structural. The second embeds a snippet of the input,
 * which for these skills is document-derived text that must not reach a log.
 * So the location is extracted for the log line and the raw message is kept
 * for the retry only.
 */
function safeParseSummary(rawMessage) {
  const location = /at position (\d+)(?: \(line (\d+) column (\d+)\))?/.exec(String(rawMessage));
  if (!location) return 'The model response was not valid JSON.';
  const [, position, line, column] = location;
  return line
    ? `The model response was not valid JSON (parse failed at line ${line}, column ${column}).`
    : `The model response was not valid JSON (parse failed at position ${position}).`;
}

/**
 * Extract the single top-level JSON object from a cleaned reply.
 *
 * Small models occasionally add a sentence before or after the object. Slicing
 * to the outermost braces recovers those replies without accepting prose as
 * output; anything that still fails to parse is a failure, not a partial
 * success (SKILLS.md §8). Nothing here repairs malformed JSON: guessing at what
 * the model meant is exactly the partial success that rule forbids. What it
 * does instead is say precisely what was wrong, so the retry can fix it.
 */
export function parseJsonObject(content) {
  const text = stripThinking(content);
  if (!text) throw new ModelReplyError('The model returned an empty response.');

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? text.slice(start, end + 1) : text;

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new ModelReplyError(safeParseSummary(error?.message), String(error?.message ?? ''));
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ModelReplyError('The model response was not a JSON object.');
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
