import test from 'node:test';
import assert from 'node:assert/strict';
import { toCaseDraft, toRegisteredCaseDraft } from './casePack.js';

test('turns validated extraction output into an unconfirmed case draft with quotes', () => {
  const draft = toCaseDraft({
    skill: 'extraction',
    sourceSha256: 'b'.repeat(64),
    document: { name: 'invoice.pdf' },
    fields: {
      invoiceNumber: { value: 'INV-42', sourceQuote: 'Invoice INV-42' },
      supplierName: { value: 'Supplier Ltd', sourceQuote: 'Supplier Ltd' },
      payerName: { value: null, sourceQuote: null },
      dueAt: { value: '2026-09-30', sourceQuote: 'Due 30 September 2026' },
    },
  });

  assert.equal(draft.invoiceNumber, 'INV-42');
  assert.equal(draft.invoiceDueDate, '2026-09-30');
  assert.equal(draft.invoiceSourceName, 'invoice.pdf');
  assert.deepEqual(draft.sourceQuotes, {
    invoiceNumber: 'Invoice INV-42',
    supplierName: 'Supplier Ltd',
    dueAt: 'Due 30 September 2026',
  });
});

test('does not create a case draft from refusal output', () => {
  assert.equal(toCaseDraft({ skill: 'refusal' }), null);
});

test('links invoice-only facts to a newly registered agreement without confirming them', () => {
  const draft = toRegisteredCaseDraft({
    agreementId: 12,
    agreementDeadlineDate: '2026-10-05',
    review: {
      canonical: {
        invoiceNumber: 'INV-42',
        supplierName: 'Supplier Ltd',
        payerName: 'Corrected Payer Ltd',
      },
    },
    caseDraft: {
      invoiceNumber: 'INV-42',
      supplierName: 'Supplier Ltd',
      payerName: 'Original Payer Ltd',
      invoiceCurrency: 'GBP',
      invoiceAmountMinorUnits: '125000',
      invoiceDueDate: '2026-09-30',
      paymentTermsText: 'Payment due within 30 days.',
      invoiceSourceName: 'invoice.pdf',
      sourceQuotes: {
        invoiceNumber: 'Invoice INV-42',
        payerName: 'Bill to Original Payer Ltd',
        dueAt: 'Due 30 September 2026',
      },
    },
  });

  assert.equal(draft.agreementId, '12');
  assert.equal(draft.payerName, 'Corrected Payer Ltd');
  assert.equal(draft.invoiceCurrency, 'GBP');
  assert.equal(draft.invoiceDueDate, '2026-09-30');
  assert.equal(draft.factsConfirmed, false);
  assert.equal(draft.sourceQuotes.payerName, undefined);
  assert.equal(draft.sourceQuotes.invoiceNumber, 'Invoice INV-42');
});

test('builds a manual case draft from the confirmed agreement when no invoice extraction exists', () => {
  const draft = toRegisteredCaseDraft({
    agreementId: 13,
    agreementDeadlineDate: '2026-10-08',
    review: {
      canonical: {
        invoiceNumber: 'MANUAL-13',
        supplierName: 'Supplier Ltd',
        payerName: 'Payer Ltd',
      },
    },
  });

  assert.deepEqual(draft, {
    agreementId: '13',
    invoiceNumber: 'MANUAL-13',
    supplierName: 'Supplier Ltd',
    payerName: 'Payer Ltd',
    invoiceDueDate: '2026-10-08',
    sourceQuotes: {},
    factsConfirmed: false,
  });
});
