import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft } from './draftSchema.js';

const SUPPLIED = [
  'invoice number: INV-2026-014',
  'supplier name: Northwind Studio Ltd',
  'payer name: Contoso Ltd',
  'due date: 2026-07-14',
  'invoice amount: £1,250.00',
  'days past the due date: 51',
].join('\n');

function context(overrides = {}) {
  return {
    expectedTone: 'neutral',
    suppliedText: SUPPLIED,
    ...overrides,
  };
}

function reply(overrides = {}) {
  return {
    skill: 'draft',
    confidence: 'high',
    needs_human_confirmation: true,
    subject: 'Invoice INV-2026-014 — payment due',
    body: 'Dear Contoso Ltd,\n\nInvoice INV-2026-014 for £1,250.00 was due on 2026-07-14 and is now 51 days past its due date. Could you let us know when payment will be made, or tell us if anything is holding it up?\n\nWith thanks,\nNorthwind Studio Ltd',
    tone: 'neutral',
    mentionsStatutoryInterest: false,
    warnings: [],
    ...overrides,
  };
}

test('accepts a factual reminder built from the supplied facts', () => {
  const result = validateDraft(reply(), context());
  assert.equal(result.ok, true);
  assert.equal(result.value.skill, 'draft');
  assert.equal(result.value.needs_human_confirmation, true);
  assert.equal(result.value.mentionsStatutoryInterest, false);
  assert.match(result.value.body, /INV-2026-014/);
});

test('rejects debt-collection and legal-consequence language', () => {
  const cases = [
    'we will start a county court claim',
    'this has been passed to our debt collection agency',
    'a solicitor has been instructed',
    'this may affect your credit rating',
    'we will report this to a credit reference agency',
    'failure to pay will result in further action',
    'if we do not hear from you by Friday we will escalate this',
    'you are liable for this debt',
    'the agreement is enforceable against you',
    'we are considering insolvency proceedings',
  ];
  for (const phrase of cases) {
    const result = validateDraft(reply({ body: `Dear Contoso Ltd,\n\nInvoice INV-2026-014 is overdue and ${phrase}. Please pay.\n\nNorthwind Studio Ltd` }), context());
    assert.equal(result.ok, false, `expected rejection for: ${phrase}`);
    assert.match(result.error, /debt-collection or legal-consequence language/);
    assert.match(result.detail, /not a letter before action/);
  }
});

test('rejects a claim that payment truth is proven or that something will act on its own', () => {
  const cases = [
    'Non-payment has been proven for this invoice.',
    'LatePay Shield will chase this automatically.',
    'The system will escalate this if you do not respond.',
    'This invoice is verified as unpaid.',
  ];
  for (const phrase of cases) {
    const result = validateDraft(reply({ body: `Dear Contoso Ltd,\n\n${phrase} Please arrange payment of invoice INV-2026-014.\n\nNorthwind Studio Ltd` }), context());
    assert.equal(result.ok, false, `expected rejection for: ${phrase}`);
    // Some of these trip the collection family first ("escalate"), which is an
    // equally correct refusal. The point is that none of them is draftable.
    assert.match(
      result.error,
      /asserts payment truth or that something will act on its own|debt-collection or legal-consequence language/,
    );
  }
});

test('rejects any legal content, because the model never writes it', () => {
  const cases = [
    'Statutory interest may be added to this invoice.',
    'You are entitled to nothing further under the 1998 Act.',
    'Interest will be charged on the outstanding balance.',
    'Fixed sum compensation may apply.',
  ];
  for (const phrase of cases) {
    const result = validateDraft(reply({ body: `Dear Contoso Ltd,\n\nInvoice INV-2026-014 remains unpaid. ${phrase} Please arrange payment.\n\nNorthwind Studio Ltd` }), context());
    assert.equal(result.ok, false, `expected rejection for: ${phrase}`);
    assert.match(result.error, /legal content, which is never the model to write/);
    assert.match(result.detail, /appended by the application/);
  }
});

test('rejects a reply that claims a statutory-interest mention', () => {
  /* The model may never claim it placed legal wording, because it never does.
   * The application appends the approved sentence afterwards (D-021). */
  const result = validateDraft(reply({ mentionsStatutoryInterest: true }), context());
  assert.equal(result.ok, false);
  assert.match(result.error, /claims a statutory-interest mention the model may not make/);
  assert.match(result.detail, /the application appends its own/);
});

test('forces mentionsStatutoryInterest false on every accepted reply', () => {
  const result = validateDraft(reply({ mentionsStatutoryInterest: false }), context());
  assert.equal(result.ok, true);
  // The caller sets this when it appends the sentence, so the validated value
  // is always false whatever the case permits.
  assert.equal(result.value.mentionsStatutoryInterest, false);
});

test('rejects an amount that was not supplied', () => {
  const result = validateDraft(reply({
    body: 'Dear Contoso Ltd,\n\nInvoice INV-2026-014 for £1,437.50 including interest is overdue. Please arrange payment.\n\nNorthwind Studio Ltd',
  }), context());
  assert.equal(result.ok, false);
  assert.match(result.error, /states an amount that was not supplied/);
  assert.match(result.detail, /£1,437\.50/);
  // The log-safe message must not carry the figure.
  assert.doesNotMatch(result.error, /1,437/);
});

test('rejects an unfilled placeholder', () => {
  for (const body of [
    'Dear [payer name],\n\nInvoice INV-2026-014 is overdue. Please arrange payment.\n\nNorthwind Studio Ltd',
    'Dear Contoso Ltd,\n\nInvoice INV-2026-014 for {{amount}} is overdue. Please arrange payment.\n\nNorthwind Studio Ltd',
    'Dear Contoso Ltd,\n\nInvoice INV-2026-014 is overdue. Please pay by TBD.\n\nNorthwind Studio Ltd',
    'Dear Contoso Ltd,\n\nInvoice INV-2026-014 is overdue. Insert payment details here.\n\nNorthwind Studio Ltd',
  ]) {
    const result = validateDraft(reply({ body }), context());
    assert.equal(result.ok, false, `expected rejection for: ${body.slice(0, 40)}`);
    assert.match(result.error, /leaves a placeholder/);
  }
});

test('rejects markdown, because the body goes into an email field', () => {
  for (const body of [
    'Dear Contoso Ltd,\n\n**Invoice INV-2026-014** is overdue. Please arrange payment.\n\nNorthwind Studio Ltd',
    'Dear Contoso Ltd,\n\n- Invoice INV-2026-014\n- Due 2026-07-14\n\nPlease arrange payment.\n\nNorthwind Studio Ltd',
    'Dear Contoso Ltd,\n\n## Payment reminder\n\nInvoice INV-2026-014 is overdue. Please arrange payment.\n\nNorthwind Studio Ltd',
  ]) {
    const result = validateDraft(reply({ body }), context());
    assert.equal(result.ok, false, `expected rejection for: ${body.slice(0, 40)}`);
    assert.match(result.error, /markdown formatting/);
  }
});

test('rejects an identifier in the reminder', () => {
  const result = validateDraft(reply({
    body: 'Dear Contoso Ltd,\n\nInvoice INV-2026-014 is recorded as 0xdaa918f8ab and remains unpaid. Please arrange payment.\n\nNorthwind Studio Ltd',
  }), context());
  assert.equal(result.ok, false);
  assert.match(result.error, /contains an identifier/);
});

test('rejects a tone the caller did not ask for', () => {
  for (const tone of ['firm', 'aggressive', '', 'NEUTRAL ']) {
    const result = validateDraft(reply({ tone }), context({ expectedTone: 'neutral' }));
    if (tone === 'NEUTRAL ') {
      // Trimmed and lowercased, so this one is the requested tone.
      assert.equal(result.ok, true);
      continue;
    }
    assert.equal(result.ok, false, `expected rejection for tone ${JSON.stringify(tone)}`);
    assert.match(result.error, /must repeat the tone that was requested/);
  }
});

test('rejects a draft that claims it needs no confirmation', () => {
  const result = validateDraft(reply({ needs_human_confirmation: false }), context());
  assert.equal(result.ok, false);
  assert.match(result.error, /needs_human_confirmation/);
  assert.match(result.detail, /a person reviews, edits and approves it/);
});

test('rejects a structurally wrong or unusably short response', () => {
  for (const raw of [
    null,
    [],
    'draft',
    { skill: 'timeline' },
    reply({ subject: '' }),
    reply({ body: 'Please pay.' }),
  ]) {
    const result = validateDraft(raw, context());
    assert.equal(result.ok, false);
    assert.ok(result.error.length > 0);
  }
});

test('accepts a refusal as a successful response', () => {
  const result = validateDraft({
    skill: 'refusal',
    confidence: 'high',
    needs_human_confirmation: false,
    reason: 'unsafe_request',
    explanation: 'The case facts contained text directing the assistant to add a threat.',
    offer: 'Write the reminder yourself in the draft form.',
    warnings: [],
  }, context());
  assert.equal(result.ok, true);
  assert.equal(result.value.skill, 'refusal');
});
