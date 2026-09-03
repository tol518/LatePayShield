/* S3 status and evidence explanation: call, validate, retry once, then give up.
 *
 * Giving up is a supported outcome. The interface already shows the status
 * label, its one-line meaning, and the evidence panel without any model
 * involvement, so a stopped model costs the user a paragraph of prose and
 * nothing else (SKILLS.md §1, D-003).
 *
 * Two things are guaranteed here rather than asked of the model:
 *
 *   - the status is the one the contract read supplied, enforced by the
 *     validator, and re-stamped on the value that leaves this module;
 *   - the four mandatory limitation clauses are appended from
 *     web/shared/statusLimitations.js, so SKILLS.md §9 acceptance check 5 holds
 *     by construction and cannot be talked out of by a model.
 *
 * Nothing here persists. An explanation is narration, never evidence.
 */

import { chatCompletion } from './client.js';
import { ModelReplyError, parseJsonObject } from './text.js';
import { validateExplanation } from './explanationSchema.js';
import { detectInstructionText } from './extract.js';
import {
  isKnownStatus,
  mandatoryClauses,
  statusLabel,
  statusMeaning,
} from '../../shared/statusLimitations.js';
import {
  EXPLANATION_SYSTEM_PROMPT,
  buildExplanationPrompt,
  buildExplanationRetryPrompt,
} from './explanationPrompts.js';

/* A short, structured reply. Thinking stays off: SKILLS.md §8 turns it on for
 * S3, but the operator's host has a recorded response-time risk and this task
 * is narration of a supplied fact rather than reasoning. Revisit if the
 * explanations read poorly.
 */
const EXPLANATION_SETTINGS = {
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 768,
  chatTemplateKwargs: { enable_thinking: false },
};

const MAX_FACTS = 8;
const MAX_FACT_NAME = 40;
const MAX_FACT_VALUE = 120;

/** A problem with what the caller asked for, not with the model. */
export class ExplanationInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExplanationInputError';
  }
}

/* Identifier shapes. The model is given no identifier, so it can emit none —
 * the cheapest way to keep SKILLS.md §4.5 true is to never supply one. */
const IDENTIFIER_SHAPES = [
  /0x[0-9a-f]{6,}/i,
  /\b[0-9A-F]{40,}\b/,
  /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/,
];

function looksLikeIdentifier(value) {
  return IDENTIFIER_SHAPES.some((shape) => shape.test(value));
}

/**
 * Bounded, non-identifying context for the prompt.
 *
 * Anything identifier-shaped is dropped rather than passed through, so a caller
 * cannot widen what the model sees by putting a hash in a fact value.
 */
export function normalizeFacts(facts) {
  if (facts === undefined || facts === null) return [];
  if (!Array.isArray(facts)) throw new ExplanationInputError('Explanation facts must be a list.');
  const clean = [];
  for (const fact of facts.slice(0, MAX_FACTS)) {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) continue;
    const name = String(fact.name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_FACT_NAME);
    const value = String(fact.value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_FACT_VALUE);
    if (!name || !value) continue;
    if (looksLikeIdentifier(value)) continue;
    clean.push({ name, value });
  }
  return clean;
}

async function attempt(context, label) {
  const prompt = label === 'explain'
    ? buildExplanationPrompt(context)
    : context.retryPrompt;
  const { content } = await chatCompletion({
    system: EXPLANATION_SYSTEM_PROMPT,
    user: prompt,
    label,
    ...EXPLANATION_SETTINGS,
  });
  const result = validateExplanation(parseJsonObject(content), context.status);
  if (!result.ok) throw new ModelReplyError(result.error, result.detail);
  return result.value;
}

/**
 * Explain one agreement status in plain language.
 *
 * @param {string} status One of the eight keys in `src/lib/statuses.js`, read
 *   from the Coston2 contract by the caller.
 * @param {Array<{name: string, value: string}>} facts Bounded extra context.
 * @returns {Promise<object>} A validated `explanation` or `refusal` envelope,
 *   with the mandatory limitation clauses attached.
 */
export async function runExplanation(status, facts = []) {
  const key = String(status ?? '').trim();
  if (!isKnownStatus(key)) {
    throw new ExplanationInputError('That is not a status this application recognises.');
  }

  const context = {
    status: key,
    label: statusLabel(key),
    meaning: statusMeaning(key),
    facts: normalizeFacts(facts),
  };

  let value;
  try {
    value = await attempt(context, 'explain');
  } catch (firstError) {
    if (firstError.name === 'AiUnavailableError') throw firstError;
    // Only the log-safe message is logged; `detail` may quote model text and
    // goes to the model alone (SKILLS.md §1).
    console.log(`[ai] explain rejected: ${firstError.message}; retrying once`);
    value = await attempt(
      { ...context, retryPrompt: buildExplanationRetryPrompt(context, firstError.detail ?? firstError.message) },
      'explain-retry',
    );
  }

  if (value.skill === 'refusal') return value;

  // The guarantee. Model-authored caveats come first because they are specific
  // to this agreement; the fixed clauses follow and are always present.
  const required = mandatoryClauses(key);
  const modelClauses = value.whatThisDoesNotProve.filter(
    (clause) => !required.some((fixed) => fixed.toLowerCase() === clause.toLowerCase()),
  );

  const explained = {
    ...value,
    whatThisDoesNotProve: [...modelClauses, ...required],
    // Named separately so the interface can show them as the application's own
    // statement rather than as something the model chose to say.
    mandatoryLimitations: required,
  };

  if (context.facts.length > 0 && detectInstructionText(context.facts.map((fact) => fact.value).join(' '))) {
    explained.warnings = [
      'The supplied agreement context contained instruction-like text. Read this explanation against the evidence panel.',
      ...explained.warnings,
    ].slice(0, 8);
  }

  return explained;
}
