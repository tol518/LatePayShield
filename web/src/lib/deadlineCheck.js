/* Comparing the contract deadline against the invoice's own due date.
 *
 * These are two different things and the interface has always shown both, but
 * until now nothing said anything when they disagreed. Task 2's questionnaire
 * reports a `due_date_mismatch` once a case file exists, which is after
 * registration — and registration is the moment the deadline becomes immutable
 * on chain. So the warning belongs here too (known issue 6).
 *
 * The asymmetry matters. A deadline *earlier* than the invoice due date means
 * the contract can accept a non-payment proof while the payer is still inside
 * the terms they were given, which is the case worth stopping to think about. A
 * later deadline is merely a difference worth noticing.
 *
 * This warns and never blocks. The deadline is a deliberate choice the operator
 * confirms, and there are legitimate reasons to set it later — or, with a
 * revised invoice, earlier. Refusing would be the application deciding a
 * question that is the operator's.
 *
 * Pure: no clock, no IO.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEADLINE_CHECKS = Object.freeze({
  deadline_before_due_date: {
    severity: 'attention',
    message: 'The agreement deadline is earlier than the invoice due date. A non-payment proof could then be accepted while the payer is still inside the payment terms they were given. Confirm which date governs before registering.',
  },
  deadline_after_due_date: {
    severity: 'info',
    message: 'The agreement deadline is later than the invoice due date. That is allowed, but the two dates will disagree in the case file, and any date arithmetic needs to know which one governs.',
  },
});

/** The calendar date part of a `datetime-local` value, or null. */
export function deadlineDate(deadlineLocal) {
  const text = String(deadlineLocal ?? '').trim();
  if (text.length < 10) return null;
  const date = text.slice(0, 10);
  if (!ISO_DATE.test(date)) return null;
  // A real calendar date, so 2026-02-30 does not compare as if it existed.
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(date)) return null;
  return date;
}

/**
 * Compare the two dates, if both are known.
 *
 * @param {object} input `invoiceDueDate` (YYYY-MM-DD) and `deadlineLocal`
 *   (a `datetime-local` value).
 * @returns {{code: string, severity: string, message: string,
 *   invoiceDueDate: string, deadlineDate: string} | null}
 *   `null` when the dates agree, or when either is unknown — there is nothing
 *   truthful to say about a comparison that cannot be made.
 */
export function checkDeadlineAgainstDueDate({ invoiceDueDate, deadlineLocal } = {}) {
  const invoice = String(invoiceDueDate ?? '').trim();
  if (!ISO_DATE.test(invoice)) return null;
  const deadline = deadlineDate(deadlineLocal);
  if (!deadline) return null;
  if (deadline === invoice) return null;

  // ISO dates compare correctly as strings.
  const code = deadline < invoice ? 'deadline_before_due_date' : 'deadline_after_due_date';
  return {
    code,
    ...DEADLINE_CHECKS[code],
    invoiceDueDate: invoice,
    deadlineDate: deadline,
  };
}
