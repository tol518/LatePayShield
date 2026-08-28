/* Contract state -> UI status.
 *
 * The contract enum has five values; the UI has eight. The difference is not an
 * inconsistency, it is where each state comes from:
 *
 *   DRAFT             local only, before any transaction
 *   CHECKING_PAYMENT  off-chain only, while an FDC proof is in flight — the
 *                     contract has no representation for it, so it can never be
 *                     derived from a chain read
 *   OVERDUE_PENDING   derived: Active && now > dueAt. LatePayShield.sol notes
 *                     this is deliberately absent on-chain because it carries
 *                     no evidence.
 *
 * Everything else maps one-to-one.
 */

import { CONTRACT_STATUS } from './abi.js';

/**
 * @param {number} statusOrdinal `Agreement.status` as returned by the contract.
 * @param {bigint|number} dueAt Unix deadline from the agreement.
 * @param {number} [nowSeconds] Current time; injectable for testing.
 * @returns {string|null} A key in STATUSES, or null for an unknown agreement.
 */
export function deriveUiStatus(statusOrdinal, dueAt, nowSeconds = Math.floor(Date.now() / 1000)) {
  switch (CONTRACT_STATUS[Number(statusOrdinal)]) {
    case 'Active':
      // Deadline passed is NOT a non-payment result: it stays pending until a
      // nonexistence proof is accepted.
      return nowSeconds > Number(dueAt) ? 'OVERDUE_PENDING' : 'AWAITING_PAYMENT';
    case 'PaidVerified':
      return 'PAID_VERIFIED';
    case 'OverdueVerified':
      return 'OVERDUE_VERIFIED';
    case 'Disputed':
      return 'DISPUTED';
    default:
      return null; // Status.None — agreement does not exist
  }
}
