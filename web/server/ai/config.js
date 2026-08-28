/* Local AI runtime configuration.
 *
 * The model runs as a separate process on the operator's own hardware, reached
 * over a private network. Two rules from docs/ai/SKILLS.md shape this file:
 *
 *   - The agent is opt-in and off by default (SKILLS.md §1, D-003). The whole
 *     lifecycle must work with the model switched off, so a missing or
 *     unreachable model is a disabled feature, never an error state.
 *   - The browser never learns the model's address. Only this loopback service
 *     talks to it, so the endpoint stays out of every client bundle.
 *
 * Values are read lazily: `dotenv` loads inside server/index.js, which runs
 * after this module's imports are evaluated.
 */

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MODEL = 'mlx-community/Qwen3-8B-4bit';

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Current AI configuration.
 *
 * `ready` means "configured well enough to attempt a request". It is not a
 * reachability claim: only an actual request proves the model is running.
 */
export function readAiConfig() {
  const enabled = process.env.AI_ASSISTANT_ENABLED === 'true';
  const baseUrl = (process.env.LOCAL_LLM_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const model = (process.env.LOCAL_LLM_MODEL ?? DEFAULT_MODEL).trim();
  const timeoutMs = positiveInteger(process.env.LOCAL_LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  let unavailableReason = null;
  if (!enabled) {
    unavailableReason = 'The AI assistant is disabled. Set AI_ASSISTANT_ENABLED=true in the repository-root .env, then restart the web service.';
  } else if (!baseUrl) {
    unavailableReason = 'The AI assistant is enabled but LOCAL_LLM_BASE_URL is not set in the repository-root .env.';
  } else if (!/^https?:\/\//i.test(baseUrl)) {
    unavailableReason = 'LOCAL_LLM_BASE_URL must be an http(s) URL ending in the OpenAI-compatible /v1 path.';
  } else if (!model) {
    unavailableReason = 'The AI assistant is enabled but LOCAL_LLM_MODEL is empty.';
  }

  return {
    enabled,
    ready: enabled && unavailableReason === null,
    baseUrl,
    model,
    timeoutMs,
    unavailableReason,
  };
}
