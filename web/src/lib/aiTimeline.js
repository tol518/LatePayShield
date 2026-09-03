/* Browser client and form mapping for S6, the evidence timeline skill.
 *
 * The model itself is never addressed from here. This calls the same-origin
 * loopback service, which is the only process that knows where the model runs
 * and the only place its output is schema-validated (docs/ai/SKILLS.md §1, D-008).
 *
 * Everything this module returns is a *proposal*. It lives in browser state
 * only. A proposal becomes a case-file entry when the operator confirms that
 * one event, and never before (D-014).
 */

import { apiFetch, describeApiFailure } from './apiRequest.js';
import { documentPayload, DEFAULT_MAX_DOCUMENT_BYTES } from './aiAssistant.js';

export const TIMELINE_CHANNELS = ['email', 'letter', 'phone', 'meeting', 'note'];
export const TIMELINE_DIRECTIONS = ['inbound', 'outbound', 'internal'];

const CHANNEL_LABELS = {
  email: 'Email',
  letter: 'Letter',
  phone: 'Phone call',
  meeting: 'Meeting',
  note: 'Note',
};

const DIRECTION_LABELS = {
  inbound: 'From payer',
  outbound: 'To payer',
  internal: 'Internal note',
};

export function channelLabel(channel) {
  return CHANNEL_LABELS[channel] ?? channel;
}

export function directionLabel(direction) {
  return DIRECTION_LABELS[direction] ?? direction;
}

async function request(path, options) {
  const response = await apiFetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(describeApiFailure(response.status, payload.error, 'The assistant service'));
    error.status = response.status;
    throw error;
  }
  return payload;
}

/**
 * Ask the local model to propose dated events from correspondence.
 *
 * @returns {Promise<object>} A validated `timeline` or `refusal` envelope, plus
 *   the source fingerprint and model name a confirmation must carry.
 */
export async function requestTimeline({
  documentText = '',
  file = null,
  maxDocumentBytes = DEFAULT_MAX_DOCUMENT_BYTES,
} = {}) {
  const body = file
    ? { document: await documentPayload(file, maxDocumentBytes) }
    : { documentText };
  return request('/api/ai/timelines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Turn a validated timeline envelope into editable, unconfirmed proposals.
 *
 * Each proposal keeps the quote it was grounded in and the fingerprint of the
 * document it came from, because confirming one stores both. The date arrives
 * as a calendar date — that is all a document states — so the time defaults to
 * midnight and stays editable rather than being invented.
 */
export function toTimelineProposals(envelope) {
  if (envelope?.skill !== 'timeline') return [];
  return (envelope.events ?? []).map((event, index) => ({
    key: `${envelope.sourceSha256 ?? 'document'}-${index}`,
    occurredAtLocal: `${event.occurredAt}T00:00`,
    dateOnlyInSource: true,
    channel: event.channel,
    direction: event.direction,
    subject: event.subject ?? '',
    summary: event.summary,
    sourceQuote: event.sourceQuote,
    confidence: event.confidence,
    sourceSha256: envelope.sourceSha256 ?? null,
    modelName: envelope.modelName ?? null,
  }));
}

/**
 * The body that confirms one proposal as a case-file entry.
 *
 * `authorType: 'local_llm'` is the honest record: a person confirmed it, but
 * the model drafted it, and the case file shows both. The service refuses this
 * shape without its quote and fingerprint.
 */
export function toConfirmationBody(proposal) {
  return {
    occurredAt: new Date(proposal.occurredAtLocal).toISOString(),
    channel: proposal.channel,
    direction: proposal.direction,
    subject: proposal.subject?.trim() ? proposal.subject.trim() : null,
    summary: proposal.summary,
    authorType: 'local_llm',
    sourceQuote: proposal.sourceQuote,
    sourceSha256: proposal.sourceSha256,
    modelName: proposal.modelName,
  };
}

/** Is this proposal complete enough to confirm? */
export function proposalProblem(proposal) {
  if (!proposal.summary?.trim()) return 'Add a summary before confirming this event.';
  if (!TIMELINE_CHANNELS.includes(proposal.channel)) return 'Choose how this event happened.';
  if (!TIMELINE_DIRECTIONS.includes(proposal.direction)) return 'Choose the direction of this event.';
  if (Number.isNaN(new Date(proposal.occurredAtLocal).getTime())) return 'Give this event a valid date and time.';
  if (!proposal.sourceQuote || !proposal.sourceSha256) {
    return 'This event lost the quote it was grounded in. Ask for suggestions again, or add it manually.';
  }
  return null;
}
