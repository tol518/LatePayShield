/* Agreement statuses.
 *
 * Keys match the state names in docs/design.md so a contract-derived state maps
 * straight onto a label. Two rules are encoded here on purpose:
 *
 *   - `tone: 'positive'` (green) is used only where the contract has finalised an
 *     outcome. A submitted, detected, or pending payment never gets it.
 *   - Every status carries both an icon and text, so colour is never the only signal.
 */

export const STATUSES = {
  DRAFT: {
    label: 'Draft',
    tone: 'neutral',
    icon: 'document',
    meaning: 'Terms are editable and not registered.',
  },
  AWAITING_PAYMENT: {
    label: 'Awaiting payment',
    tone: 'primary',
    icon: 'clock',
    meaning: 'Agreement recorded; no final outcome yet.',
  },
  CHECKING_PAYMENT: {
    label: 'Checking payment',
    tone: 'testnet',
    icon: 'progress',
    meaning: 'A candidate payment or proof is being checked.',
  },
  PAID_VERIFIED: {
    label: 'Payment verified',
    tone: 'positive',
    icon: 'check-circle',
    meaning: 'The contract accepted payment evidence matching its implemented rules.',
  },
  OVERDUE_PENDING: {
    label: 'Deadline passed — verification pending',
    tone: 'attention',
    icon: 'clock',
    meaning: 'The deadline has passed. This is not yet a non-payment result.',
  },
  OVERDUE_VERIFIED: {
    label: 'No qualifying payment found',
    tone: 'positive',
    icon: 'check-circle',
    meaning: 'The contract accepted the relevant non-payment proof for the defined window.',
  },
  DISPUTED: {
    label: 'Needs human review',
    tone: 'attention',
    icon: 'person',
    meaning: 'This prototype does not adjudicate a disagreement between the two parties.',
  },
  OPERATIONAL_FAILURE: {
    label: 'Operational failure',
    tone: 'danger',
    icon: 'warning',
    meaning: 'A service or proof request failed. This is not proof of non-payment.',
  },
};

/* Display order for the legend and any future filter control. */
export const STATUS_ORDER = [
  'DRAFT',
  'AWAITING_PAYMENT',
  'CHECKING_PAYMENT',
  'PAID_VERIFIED',
  'OVERDUE_PENDING',
  'OVERDUE_VERIFIED',
  'DISPUTED',
  'OPERATIONAL_FAILURE',
];
