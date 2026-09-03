/* The only code in this repository that talks to the local model.
 *
 * The endpoint is OpenAI-compatible (`/v1/chat/completions`), which is what the
 * operator's MLX server exposes. Nothing here is model-specific beyond that
 * wire shape, so swapping the runner is a .env change.
 *
 * Privacy boundary (docs/ai/SKILLS.md §1): this module logs latency, token
 * counts, and outcome only. It never logs a prompt, a reply, or reasoning.
 */

import { readAiConfig } from './config.js';

export class AiUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/**
 * One chat completion against the local model.
 *
 * @returns {Promise<{content: string, finishReason: string, usage: object, latencyMs: number}>}
 */
export async function chatCompletion({
  system,
  user,
  temperature,
  topP,
  maxTokens,
  chatTemplateKwargs,
  responseFormat,
  label,
}) {
  const config = readAiConfig();
  if (!config.ready) throw new AiUnavailableError(config.unavailableReason);

  const startedAt = Date.now();
  // Deliberately log request metadata only. Invoice text, model output, and
  // reasoning must never appear in application logs.
  console.log(
    `[ai] ${label} request model=${config.model} max_tokens=${maxTokens ?? 'unset'} `
    + `max_completion_tokens=unset chat_template_kwargs=${JSON.stringify(chatTemplateKwargs ?? {})}`,
  );
  let upstream;
  try {
    upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        ...(chatTemplateKwargs ? { chat_template_kwargs: chatTemplateKwargs } : {}),
        // SKILLS.md §8: "Structured-output or JSON mode where the runner
        // supports it; schema validation regardless." The operator's MLX server
        // accepts this field and ignores it (measured 3 September 2026), so do
        // not treat sending it as a guarantee of well-formed output. The
        // validator decides.
        ...(responseFormat ? { response_format: responseFormat } : {}),
        stream: false,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    // A stopped model, a sleeping Mac mini, or a dropped tunnel all land here.
    // None of them is an application error: the caller falls back to manual entry.
    const detail = error?.name === 'TimeoutError'
      ? `The local model did not answer within ${Math.round(config.timeoutMs / 1000)} seconds.`
      : 'The local model could not be reached.';
    console.warn(
      `[ai] ${label} failed outcome=${error?.name === 'TimeoutError' ? 'timeout' : 'unreachable'} `
      + `duration_ms=${Date.now() - startedAt}`,
    );
    throw new AiUnavailableError(detail);
  }

  if (!upstream.ok) {
    throw new AiUnavailableError(`The local model returned HTTP ${upstream.status}.`);
  }

  const payload = await upstream.json();
  const choice = payload?.choices?.[0];
  const latencyMs = Date.now() - startedAt;
  const usage = payload?.usage ?? {};

  console.log(
    `[ai] ${label} model=${config.model} finish=${choice?.finish_reason ?? 'none'} `
    + `prompt_tokens=${usage.prompt_tokens ?? '?'} completion_tokens=${usage.completion_tokens ?? '?'} `
    + `reasoning_tokens=${usage.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? '?'} `
    + `total_tokens=${usage.total_tokens ?? '?'} duration_ms=${latencyMs}`,
  );

  if (!choice) throw new AiUnavailableError('The local model returned no completion.');

  // SKILLS.md §8: a truncated response is a failure, not a partial success. The
  // reply is JSON, so a cut-off object would otherwise parse as nothing at all.
  if (choice.finish_reason && choice.finish_reason !== 'stop') {
    throw new Error(`The model response was cut off (finish_reason: ${choice.finish_reason}).`);
  }

  // `message.reasoning` is deliberately not read. Only `content` is output.
  return { content: choice.message?.content ?? '', finishReason: choice.finish_reason, usage, latencyMs };
}
