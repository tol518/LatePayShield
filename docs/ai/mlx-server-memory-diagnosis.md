# MLX Server Memory Diagnosis and Recovery Plan

**Observed:** 30 August 2026  
**Scope:** The operator-hosted `mlx-community/Qwen3-8B-4bit` model on a Mac mini, reached from the LatePay Shield web service over a private Tailscale network.

## Summary

The original local-model failure was a Metal-memory exhaustion. The latest
failure is different: its request processed 8,174 prompt tokens, then attempted
to reply about 206 seconds after it began. The LatePay Shield client correctly
timed out at 180 seconds and disconnected, producing MLX's `BrokenPipeError`.
No new Metal OOM was recorded and idle cleanup returned active MLX memory to
4.608 GB; a later completion succeeded in 0.56 seconds.

Treat the latest incident as a response-time overrun, not proof of fresh memory
pressure. The application now caps the extraction completion at 1,024 tokens and
explicitly disables Qwen thinking, while logging only request settings, token
counts, finish reason, and duration.

## Evidence

The supplied MLX server log shows all of the following:

| Observation | Interpretation |
|---|---|
| `POST /v1/chat/completions` reached the server and returned HTTP `200` headers | The MacBook can reach the model endpoint over Tailscale. |
| A long request processed `7082/7082` prompt tokens | The model accepted and processed the extracted invoice context. |
| Prompt cache grew from 2.42 GB to 5.74 GB across 10 sequences | Retained/overlapping work consumed an increasing amount of unified memory. |
| `RuntimeError: [METAL] ... Insufficient Memory` in MLX's generation thread | The generator, not the network route, failed. |
| `BrokenPipeError` after a request | The client had already timed out and disconnected when MLX later tried to write a response. |
| `Bad HTTP/0.9` entries containing TLS bytes | Separate HTTPS traffic reached an HTTP-only MLX port; it is not the extraction failure. |

The LatePay Shield service also reached `/v1/models` successfully, but a minimal
one-word completion produced no output within 60 seconds. That is consistent
with a reachable HTTP server whose generation worker is blocked or has crashed.

## Immediate recovery

1. Stop the current MLX server on the Mac mini using the normal process or
   terminal that launched it.
2. Start it again with the existing model and private-network binding.
3. Wait for the model to finish loading before retrying LatePay Shield.
4. Test one short pasted-text invoice before uploading a large PDF/XML/UBL file.
5. Do not repeatedly submit the same large invoice while a request is pending.

If a very short prompt cannot complete after the restart, inspect the Mac mini's
available unified memory and the MLX server's own startup/runtime output before
changing the LatePay Shield timeout again.

## Proposed operating limits

Start with one active extraction at a time. LatePay Shield already rate-limits
requests from a client, but that is not a substitute for a single-generation
limit on the model host.

Use these limits as a practical first operating envelope and tune against the
Mac mini's actual memory:

| Layer | Current/available boundary | Proposed use |
|---|---|---|
| Uploaded document bytes | 10 MB | Keep; this controls transfer and parser memory, not LLM context. |
| Extracted text | 25,000 characters | Treat as a maximum, not a target. Prefer short invoices first. |
| Model requests | Local service accepts requests serially from the user flow | Configure or operate MLX so only one generation is active. |
| Request timeout | 180 seconds | Keep while testing after restart; reduce only after stable measurements. |
| Prompt cache | 10 retained sequences observed | Clear it by restarting after an OOM, then configure a smaller cache/sequence limit if the installed MLX server version exposes one. |

The MLX command-line options vary by installed version. On the Mac mini, inspect
the supported options before changing server settings:

```bash
mlx_lm.server --help
```

Look specifically for settings that limit concurrent requests, maximum context
length, batch size, and prompt-cache/sequence retention. Do not copy flags from
an unrelated MLX version without checking this output first.

## Application follow-up

If the server remains memory-bound after being configured for one active
generation, add an application-side context budget before calling the model:

1. Preserve the existing 25,000-character upload/extraction safety ceiling.
2. Add a lower, configurable LLM prompt budget suitable for the Mac mini.
3. When a document exceeds that budget, ask the user to paste/select the
   relevant invoice pages or extract deterministic invoice fields from UBL
   before invoking the model.
4. Return a clear "document is too large for the configured local model" result
   while keeping the manual agreement form usable.
5. Record prompt-token count, completion-token count, latency, and finish
   reason only—never invoice text or customer data.

This preserves the existing product rule: the assistant is optional, proposes
only quoted descriptive terms, and manual entry remains authoritative.

## Verification after recovery

1. From the MacBook, verify `GET /v1/models` responds.
2. Send one minimal, non-invoice completion and record its latency.
3. Run one short pasted-text invoice through the LatePay Shield assistant.
4. Run one representative UBL invoice and compare the MLX log's prompt-cache
   memory before and after the request.
5. Only then test a larger searchable PDF.

Success means the model returns a schema-valid result within the configured
timeout without Metal memory errors, and the manual path remains available if
it does not.
