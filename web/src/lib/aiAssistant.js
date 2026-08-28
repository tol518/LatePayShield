/* Browser client for the local AI assistant.
 *
 * The model itself is never addressed from here. This calls the same-origin
 * loopback service, which is the only process that knows where the model runs
 * and the only place its output is schema-validated (docs/ai/SKILLS.md §1).
 *
 * Everything this module returns is a *suggestion*. It is unconfirmed until a
 * human reads it in the form and registers the agreement (D-003).
 */

/* Fields the assistant may prefill. The agreement's payment criteria are
 * deliberately absent: SKILLS.md §3.1 lists xrplDestination, destinationTag,
 * amountDrops and startLedger as values the model must never supply, and the
 * invoice currency is never converted into XRP (§4.8). */
const APPLICABLE_FIELDS = ['invoiceNumber', 'supplierName', 'payerName'];

const FIELD_LABELS = {
  invoiceNumber: 'Invoice number',
  supplierName: 'Supplier name',
  payerName: 'Payer name',
  currency: 'Invoice currency',
  amountMinorUnits: 'Invoice total',
  dueAt: 'Due date',
  paymentTermsText: 'Payment terms',
};

async function request(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error ?? `The assistant service returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function fetchAssistantAvailability() {
  return request('/api/xaman/health');
}

export function requestExtraction(invoiceText) {
  return request('/api/ai/extractions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceText }),
  });
}

export function fieldLabel(name) {
  return FIELD_LABELS[name] ?? name;
}

/** 200000 + GBP -> "£2,000.00". Display only; never applied to the XRP amount. */
export function formatMinorUnits(minorUnits, currency) {
  if (!minorUnits) return null;
  const value = Number(minorUnits) / 100;
  if (!Number.isFinite(value)) return null;
  try {
    return value.toLocaleString('en-GB', { style: 'currency', currency: currency ?? 'GBP' });
  } catch {
    return `${value.toLocaleString('en-GB', { minimumFractionDigits: 2 })} ${currency ?? ''}`.trim();
  }
}

/**
 * Turn a validated extraction into values the agreement form can accept.
 *
 * `notes` carries anything the user must know about a converted value, so the
 * form never silently receives something the invoice did not literally say.
 *
 * @returns {{values: object, notes: string[], count: number}}
 */
export function toFormSuggestions(extraction) {
  const values = {};
  const notes = [];

  for (const name of APPLICABLE_FIELDS) {
    const field = extraction.fields?.[name];
    if (field?.value) values[name] = field.value;
  }

  const dueAt = extraction.fields?.dueAt?.value;
  if (dueAt) {
    // The invoice states a date; the contract deadline is a moment. End of the
    // stated day is the only reading that does not shorten the payer's terms,
    // but it is still a choice the user has to confirm.
    values.dueAtLocal = `${dueAt}T23:59`;
    notes.push('The deadline was set to the end of the stated due date. Confirm the exact time.');
    if (new Date(`${dueAt}T23:59`).getTime() <= Date.now()) {
      notes.push('That due date has already passed, so the deadline must be changed before the agreement can be registered.');
    }
  }

  if (extraction.fields?.amountMinorUnits?.value) {
    notes.push('The invoice total is shown for reference only. Enter the XRP amount yourself: this prototype does not convert currency.');
  }

  return { values, notes, count: Object.keys(values).length };
}
