import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proposalProblem,
  toConfirmationBody,
  toTimelineProposals,
} from './aiTimeline.js';

function envelope(overrides = {}) {
  return {
    skill: 'timeline',
    confidence: 'medium',
    needs_human_confirmation: true,
    events: [
      {
        occurredAt: '2026-07-14',
        channel: 'email',
        direction: 'outbound',
        subject: 'Invoice INV-2026-014 now due',
        summary: 'Supplier sent a first payment reminder by email.',
        sourceQuote: '14 July 2026 — Reminder sent to accounts@contoso.example',
        confidence: 'high',
      },
    ],
    notSupplied: ['paymentStatus', 'evidenceId', 'agreementId', 'legalConclusion', 'interestAmount'],
    warnings: [],
    sourceSha256: 'f'.repeat(64),
    modelName: 'mlx-community/Qwen3-8B-4bit',
    ...overrides,
  };
}

test('turns a validated timeline into editable, unconfirmed proposals', () => {
  const proposals = toTimelineProposals(envelope());

  assert.equal(proposals.length, 1);
  const [proposal] = proposals;
  assert.equal(proposal.channel, 'email');
  assert.equal(proposal.direction, 'outbound');
  assert.equal(proposal.summary, 'Supplier sent a first payment reminder by email.');
  // A document states a date, not a moment, so the time is midnight and stays
  // editable rather than being invented.
  assert.equal(proposal.occurredAtLocal, '2026-07-14T00:00');
  assert.equal(proposal.dateOnlyInSource, true);
  // The grounding travels with the proposal: confirming it stores both.
  assert.equal(proposal.sourceQuote, '14 July 2026 — Reminder sent to accounts@contoso.example');
  assert.equal(proposal.sourceSha256, 'f'.repeat(64));
  assert.equal(proposal.modelName, 'mlx-community/Qwen3-8B-4bit');
});

test('makes no proposal from a refusal or an unexpected envelope', () => {
  assert.deepEqual(toTimelineProposals({ skill: 'refusal', reason: 'unsafe_request' }), []);
  assert.deepEqual(toTimelineProposals({ skill: 'extraction', fields: {} }), []);
  assert.deepEqual(toTimelineProposals(null), []);
  assert.deepEqual(toTimelineProposals(envelope({ events: [] })), []);
});

test('a confirmation records that a person accepted a model-authored entry', () => {
  const [proposal] = toTimelineProposals(envelope());
  const body = toConfirmationBody({ ...proposal, occurredAtLocal: '2026-07-14T09:30' });

  assert.equal(body.authorType, 'local_llm');
  assert.equal(body.summary, 'Supplier sent a first payment reminder by email.');
  assert.equal(body.sourceQuote, '14 July 2026 — Reminder sent to accounts@contoso.example');
  assert.equal(body.sourceSha256, 'f'.repeat(64));
  assert.equal(body.modelName, 'mlx-community/Qwen3-8B-4bit');
  assert.equal(body.occurredAt, new Date('2026-07-14T09:30').toISOString());
  // The confirmation carries no payment status, identifier, or figure: the
  // service would refuse those, and there is nowhere here to put them.
  assert.deepEqual(Object.keys(body).sort(), [
    'authorType', 'channel', 'direction', 'modelName', 'occurredAt',
    'sourceQuote', 'sourceSha256', 'subject', 'summary',
  ]);
});

test('an empty subject is stored as absent rather than as an empty string', () => {
  const [proposal] = toTimelineProposals(envelope());
  assert.equal(toConfirmationBody({ ...proposal, subject: '   ' }).subject, null);
  assert.equal(toConfirmationBody({ ...proposal, subject: 'Reminder' }).subject, 'Reminder');
});

test('refuses to confirm a proposal the operator has emptied or broken', () => {
  const [proposal] = toTimelineProposals(envelope());

  assert.equal(proposalProblem(proposal), null);
  assert.match(proposalProblem({ ...proposal, summary: '  ' }), /Add a summary/);
  assert.match(proposalProblem({ ...proposal, channel: 'whatsapp' }), /how this event happened/);
  assert.match(proposalProblem({ ...proposal, direction: 'sideways' }), /direction of this event/);
  assert.match(proposalProblem({ ...proposal, occurredAtLocal: 'not-a-date' }), /valid date and time/);
  // Losing the grounding means it can no longer be confirmed as a proposal.
  assert.match(proposalProblem({ ...proposal, sourceQuote: '' }), /lost the quote/);
  assert.match(proposalProblem({ ...proposal, sourceSha256: null }), /lost the quote/);
});
