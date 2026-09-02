import { apiFetch, describeApiFailure } from './apiRequest.js';

async function request(path, options) {
  const response = await apiFetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(describeApiFailure(response.status, payload.error, 'The case-file service'));
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function fetchCases() {
  return request('/api/cases').then((payload) => payload.cases);
}

export function fetchCase(id) {
  return request(`/api/cases/${encodeURIComponent(id)}`).then((payload) => payload.case);
}

export function createCase(input) {
  return request('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((payload) => payload.case);
}

export function addCaseCommunication(caseId, input) {
  return request(`/api/cases/${encodeURIComponent(caseId)}/communications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((payload) => payload.case);
}

/**
 * Convert schema-validated model output into an unconfirmed case-file draft.
 * The caller still requires a human confirmation before persistence.
 */
export function toCaseDraft(extraction) {
  if (extraction?.skill !== 'extraction') return null;
  const fields = extraction.fields ?? {};
  const sourceQuotes = {};
  for (const [name, field] of Object.entries(fields)) {
    if (field?.value != null && field?.sourceQuote) sourceQuotes[name] = field.sourceQuote;
  }
  return {
    invoiceNumber: fields.invoiceNumber?.value ?? '',
    supplierName: fields.supplierName?.value ?? '',
    payerName: fields.payerName?.value ?? '',
    invoiceCurrency: fields.currency?.value ?? '',
    invoiceAmountMinorUnits: fields.amountMinorUnits?.value ?? '',
    invoiceDueDate: fields.dueAt?.value ?? '',
    paymentTermsText: fields.paymentTermsText?.value ?? '',
    invoiceSourceName: extraction.document?.name ?? 'Pasted invoice text',
    invoiceSourceSha256: extraction.sourceSha256 ?? '',
    sourceQuotes,
  };
}

/**
 * Link an invoice-derived draft to the agreement that was just registered.
 *
 * The confirmed on-chain review wins for the descriptive fields included in
 * the terms hash. Invoice-only facts (currency, invoice total, original due
 * date and payment terms) remain sourced from the extraction. Nothing is
 * marked confirmed here; persistence still requires the case confirmation.
 */
export function toRegisteredCaseDraft({ agreementId, review, caseDraft = null, agreementDeadlineDate }) {
  const canonical = review?.canonical;
  if (!Number.isSafeInteger(Number(agreementId)) || Number(agreementId) <= 0 || !canonical) return null;

  const confirmedValues = {
    invoiceNumber: canonical.invoiceNumber ?? '',
    supplierName: canonical.supplierName ?? '',
    payerName: canonical.payerName ?? '',
  };
  const sourceQuotes = { ...(caseDraft?.sourceQuotes ?? {}) };

  // A quote must never be presented as support for a value the user changed
  // after extraction and before agreement registration.
  for (const [field, confirmedValue] of Object.entries(confirmedValues)) {
    if (caseDraft?.[field] !== confirmedValue) delete sourceQuotes[field];
  }

  return {
    ...(caseDraft ?? {}),
    ...confirmedValues,
    agreementId: String(agreementId),
    invoiceDueDate: caseDraft?.invoiceDueDate || agreementDeadlineDate || '',
    sourceQuotes,
    factsConfirmed: false,
  };
}
