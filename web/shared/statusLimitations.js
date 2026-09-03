/* What each agreement status does not establish.
 *
 * docs/ai/SKILLS.md §S3 makes four limitation clauses mandatory on any paid or
 * overdue explanation. They live here as fixed application text rather than as
 * model prose, for one reason: a clause the model is merely *asked* to include
 * is a clause it can omit. Holding them in code makes SKILLS.md §9 acceptance
 * check 5 true by construction, and leaves the model only the job it is good
 * at — plain-language narration.
 *
 * Pure module: no clock, no IO, no platform API. The service appends these to
 * every explanation and the browser may show them on their own.
 */

import { STATUSES } from '../src/lib/statuses.js';

/** The four clauses SKILLS.md §S3 names, in the order it names them. */
export const MANDATORY_CLAUSES = Object.freeze({
  memo_not_checked:
    'The payment discriminator the contract checks is the destination tag. It does not inspect the XRPL memo or reference text, so a memo cannot be treated as verified.',
  window_bounded:
    'A non-payment result is bounded to a defined ledger range and time window on XRPL Testnet only. It does not show that the payer used no other payment method, and it is not proof of a debt.',
  testnet_prototype:
    'Everything here is testnet, prototype, and unaudited. It carries no legal or financial standing.',
  start_ledger_unverifiable:
    'The evidence window start is supplied by whoever created the agreement and cannot be corroborated on-chain.',
});

/* Which clauses each status must carry. A finalised outcome carries all four,
 * because that is where a reader is most likely to over-read the result. The
 * pending and failure states carry the ones that stop a reader treating them as
 * an outcome at all. */
const REQUIRED_BY_STATUS = Object.freeze({
  DRAFT: ['testnet_prototype'],
  AWAITING_PAYMENT: ['testnet_prototype', 'memo_not_checked'],
  CHECKING_PAYMENT: ['testnet_prototype', 'memo_not_checked'],
  PAID_VERIFIED: ['memo_not_checked', 'window_bounded', 'testnet_prototype', 'start_ledger_unverifiable'],
  OVERDUE_PENDING: ['window_bounded', 'testnet_prototype'],
  OVERDUE_VERIFIED: ['memo_not_checked', 'window_bounded', 'testnet_prototype', 'start_ledger_unverifiable'],
  DISPUTED: ['testnet_prototype'],
  OPERATIONAL_FAILURE: ['window_bounded', 'testnet_prototype'],
});

/** Is this one of the eight statuses the application recognises? */
export function isKnownStatus(status) {
  return Object.prototype.hasOwnProperty.call(STATUSES, String(status));
}

/**
 * The clauses that must appear on an explanation of this status.
 *
 * @param {string} status One of the eight keys in `src/lib/statuses.js`.
 * @returns {string[]} Fixed sentences, or an empty array for an unknown status.
 */
export function mandatoryClauses(status) {
  const codes = REQUIRED_BY_STATUS[String(status)];
  if (!codes) return [];
  return codes.map((code) => MANDATORY_CLAUSES[code]);
}

/** The clause codes for this status, for tests and for auditing coverage. */
export function mandatoryClauseCodes(status) {
  return [...(REQUIRED_BY_STATUS[String(status)] ?? [])];
}

/**
 * The application's own one-line meaning for a status.
 *
 * Supplied to the model as context so its narration cannot drift from the label
 * the interface shows beside it.
 */
export function statusMeaning(status) {
  return isKnownStatus(status) ? STATUSES[String(status)].meaning : null;
}

/** The label the interface shows, so an explanation names the same thing. */
export function statusLabel(status) {
  return isKnownStatus(status) ? STATUSES[String(status)].label : null;
}
