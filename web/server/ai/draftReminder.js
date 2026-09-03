/* S2 payment reminder drafting: assemble facts, call, validate, retry once.
 *
 * The model writes prose. Everything that could be wrong in a way that matters
 * is decided before it is called:
 *
 *   - the facts come from the confirmed case file, never from a document;
 *   - days late and the money figures come from web/shared/latePayment.js, the
 *     deterministic task 3 calculator, so the model never does arithmetic;
 *   - whether a legal sentence may appear at all is decided by task 2's
 *     eligibility outcome and task 4's snapshot approval, and the sentence is
 *     handed over verbatim with its citations. No approved snapshot means the
 *     option is withheld rather than improvised (SKILLS.md §7.6).
 *
 * Generation is not approval. The caller stores the result as an unapproved
 * `local_llm` draft through the existing task 7 gate, where a human must
 * approve the exact version before anything may be handed to a transport.
 */

import { chatCompletion } from './client.js';
import { ModelReplyError, parseJsonObject } from './text.js';
import { validateDraft } from './draftSchema.js';
import { detectInstructionText } from './extract.js';
import { DRAFT_TONES, DRAFT_SYSTEM_PROMPT, buildDraftPrompt, buildDraftRetryPrompt } from './draftPrompts.js';
import { calculate } from '../../shared/latePayment.js';
import { toLawInputs } from '../../shared/lawSnapshot.js';

/* Drafting is the one place a little variation helps the prose read naturally,
 * so SKILLS.md §8 sets 0.3 here. Thinking stays off: §8 turns it off for S2
 * because it adds latency and drift to drafting. */
const DRAFT_SETTINGS = {
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 900,
  chatTemplateKwargs: { enable_thinking: false },
};

/** A problem with the case or the request, not with the model. */
export class DraftInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DraftInputError';
  }
}

/* The only legal sentence S2 may carry, and only when an approved snapshot
 * supports it. Phrased as a possibility with a signpost to advice, exactly as
 * SKILLS.md §S2 requires, and deliberately carrying no figure: a figure would
 * be an applied conclusion about this debt (§5). */
const STATUTORY_INTEREST_SENTENCE =
  'Statutory interest and a fixed sum of compensation may be available on a late commercial payment under the Late Payment of Commercial Debts (Interest) Act 1998; this is general information, not advice, and you may wish to take advice on your own position.';

/* The citations that sentence rests on, resolved against the snapshot so a
 * stored draft records which approved sources supported it. */
const STATUTORY_INTEREST_CITATION_IDS = ['lpcda-1998-s6', 'lpcda-1998-s5a'];

/** Minor units plus a currency to a display string: 125000 GBP -> "£1,250.00". */
export function formatAmount(minorUnits, currency) {
  if (!/^\d+$/.test(String(minorUnits ?? ''))) return null;
  const major = Number(minorUnits) / 100;
  if (!Number.isFinite(major)) return null;
  try {
    return major.toLocaleString('en-GB', { style: 'currency', currency: currency || 'GBP' });
  } catch {
    return `${major.toLocaleString('en-GB', { minimumFractionDigits: 2 })} ${currency ?? ''}`.trim();
  }
}

/**
 * Decide whether a legal sentence may appear, and resolve its citations.
 *
 * Three gates, all deterministic and all outside the model: the operator asked
 * for it, task 2 reached a supported outcome, and task 4's snapshot is approved
 * and produced usable inputs.
 */
export function resolveLegalMention({ requested, eligibilityOutcome, snapshot }) {
  if (!requested) return { sentence: null, citations: [], withheldReason: null };
  if (eligibilityOutcome !== 'supported') {
    return {
      sentence: null,
      citations: [],
      withheldReason: 'The eligibility questionnaire has not reached a supported outcome, so no legal information may be included.',
    };
  }

  const lawInputs = toLawInputs(snapshot);
  if (!lawInputs) {
    return {
      sentence: null,
      citations: [],
      // The exact situation today: the committed snapshot is valid but nobody
      // has approved it, so there is no approved source to cite.
      withheldReason: 'No approved UK-law snapshot is available, so no legal information may be included. A person must approve the snapshot first.',
    };
  }

  const available = new Map((snapshot?.citations ?? []).map((citation) => [citation.id, citation]));
  const citations = [];
  for (const id of STATUTORY_INTEREST_CITATION_IDS) {
    const citation = available.get(id);
    if (!citation) {
      return {
        sentence: null,
        citations: [],
        withheldReason: 'The approved snapshot does not carry the citations this statement needs, so no legal information may be included.',
      };
    }
    citations.push({
      label: String(citation.title),
      sourceId: String(citation.id),
      sourceVersion: `snapshot-v${snapshot.snapshotVersion}`,
    });
  }

  return { sentence: STATUTORY_INTEREST_SENTENCE, citations, withheldReason: null };
}

/**
 * The confirmed facts a reminder may use, and nothing else.
 *
 * Names come from the case file. Dates, the amount and the days-late count come
 * from the deterministic calculator's echo of those same facts, so the number
 * in the prompt is the number code computed.
 */
export function buildFacts({ caseFile, calculation }) {
  const facts = [
    { name: 'invoice number', value: caseFile.invoiceNumber },
    { name: 'supplier name', value: caseFile.supplierName },
    { name: 'payer name', value: caseFile.payerName },
    { name: 'due date', value: calculation.dueDate ?? caseFile.invoiceDueDate },
  ];

  const amount = formatAmount(caseFile.invoiceAmountMinorUnits, caseFile.invoiceCurrency);
  if (amount) facts.push({ name: 'invoice amount', value: amount });
  if (typeof calculation.daysLate === 'number') {
    facts.push({
      name: 'days past the due date',
      value: String(calculation.daysLate),
    });
  }
  if (caseFile.paymentTermsText) {
    facts.push({ name: 'agreed payment terms', value: caseFile.paymentTermsText });
  }
  return facts;
}

async function attempt(context, label) {
  const prompt = label === 'draft' ? buildDraftPrompt(context) : context.retryPrompt;
  const { content } = await chatCompletion({
    system: DRAFT_SYSTEM_PROMPT,
    user: prompt,
    label,
    ...DRAFT_SETTINGS,
  });
  const result = validateDraft(parseJsonObject(content), {
    expectedTone: context.tone,
    suppliedText: context.suppliedText,
  });
  if (!result.ok) throw new ModelReplyError(result.error, result.detail);
  return result.value;
}

/**
 * Draft one payment reminder for a confirmed case.
 *
 * @param {object} input `caseFile` (a confirmed case record), `asAtDate`
 *   (YYYY-MM-DD, supplied so the result is reproducible), `tone`,
 *   `mentionStatutoryInterest`, `eligibilityOutcome`, and `snapshot`.
 * @returns {Promise<object>} A validated `draft` or `refusal` envelope, plus the
 *   citations and the deterministic figures it was built from.
 */
export async function runReminderDraft({
  caseFile,
  asAtDate,
  tone = 'neutral',
  mentionStatutoryInterest = false,
  eligibilityOutcome = null,
  snapshot = null,
}) {
  if (!caseFile || typeof caseFile !== 'object') {
    throw new DraftInputError('A confirmed case file is required before a reminder can be drafted.');
  }
  const requestedTone = String(tone).trim().toLowerCase();
  if (!DRAFT_TONES.includes(requestedTone)) {
    throw new DraftInputError('A reminder tone must be neutral or firm.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asAtDate ?? ''))) {
    throw new DraftInputError('An as-at date is required so the same case always produces the same figures.');
  }

  const legal = resolveLegalMention({
    requested: Boolean(mentionStatutoryInterest),
    eligibilityOutcome,
    snapshot,
  });

  // The calculator owns every date and figure. It is called even when no law
  // inputs exist, because its echo of the confirmed facts is still the
  // authoritative days-late count.
  const calculation = calculate(
    {
      dueDate: caseFile.invoiceDueDate,
      asAtDate,
      debtMinorUnits: caseFile.invoiceAmountMinorUnits,
      currency: caseFile.invoiceCurrency,
      eligibilityOutcome,
    },
    legal.sentence ? toLawInputs(snapshot) : null,
  );

  const facts = buildFacts({ caseFile, calculation });
  const context = {
    facts,
    tone: requestedTone,
    suppliedText: facts.map((fact) => `${fact.name}: ${fact.value}`).join('\n'),
  };

  let value;
  try {
    value = await attempt(context, 'draft');
  } catch (firstError) {
    if (firstError.name === 'AiUnavailableError') throw firstError;
    // Only the log-safe message is logged; `detail` may quote model text and
    // goes to the model alone (SKILLS.md §1).
    console.log(`[ai] draft rejected: ${firstError.message}; retrying once`);
    value = await attempt(
      { ...context, retryPrompt: buildDraftRetryPrompt(context, firstError.detail ?? firstError.message) },
      'draft-retry',
    );
  }

  if (value.skill === 'refusal') return value;

  const warnings = [...value.warnings];
  // An option the operator asked for and did not get must say so plainly,
  // rather than silently producing a draft without it.
  if (legal.withheldReason) warnings.unshift(legal.withheldReason);
  if (detectInstructionText(context.suppliedText)) {
    warnings.unshift('The confirmed case facts contain instruction-like text. Read this draft against the case file before approving it.');
  }

  /* The application appends the approved sentence; the model never places it
   * (D-021). Asking it to copy 200 characters verbatim into prose it was also
   * composing failed 3 times in 3 on a live run — safely, because the validator
   * caught it, but the feature did not work. Appending here makes the wording
   * exact by construction, and the citations always match the body. */
  const includesLegal = Boolean(legal.sentence);
  const body = includesLegal ? `${value.body}\n\n${legal.sentence}` : value.body;

  return {
    ...value,
    body,
    mentionsStatutoryInterest: includesLegal,
    warnings: warnings.slice(0, 8),
    /* Citations describe the legal statement the draft actually makes, so a
     * factual reminder carries none. Citing a source for a sentence that is not
     * there would make the stored draft, and any later approval of it, claim
     * support for something it never said. */
    citations: includesLegal ? legal.citations : [],
    basis: {
      asAtDate,
      daysLate: calculation.daysLate,
      calculationStatus: calculation.status,
      calculationReasons: calculation.reasons.map((entry) => entry.code),
      lawAsOf: calculation.lawAsOf,
      // Only the version a legal statement actually rested on.
      snapshotVersion: includesLegal ? snapshot?.snapshotVersion ?? null : null,
    },
  };
}
