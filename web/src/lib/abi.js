/* Minimal human-readable ABI for the deployed LatePayShield contract.
 *
 * Hand-maintained on the frontend side on purpose: importing the Hardhat build
 * output would tie the web build to artifacts/, which is generated and
 * git-ignored. Only the members this app actually calls are listed.
 *
 * If contracts/LatePayShield.sol changes shape, update this file to match —
 * ethers will throw a decoding error rather than return wrong data, so a
 * mismatch surfaces immediately instead of silently.
 */

export const LATEPAY_SHIELD_ABI = [
  // Reads
  'function nextAgreementId() view returns (uint256)',
  'function fdcVerificationOverride() view returns (address)',
  'function getAgreement(uint256 agreementId) view returns (tuple(bytes32 invoiceHash, address supplier, bytes32 xrplDestinationHash, uint256 destinationTag, uint64 expectedDrops, uint64 startLedger, uint64 dueAt, uint8 status, bytes32 evidenceId, bytes32 xrplTxHash))',

  // Writes that need no FDC proof
  'function createAgreement(bytes32 invoiceHash, bytes32 xrplDestinationHash, uint256 destinationTag, uint64 expectedDrops, uint64 startLedger, uint64 dueAt) returns (uint256)',
  'function markDisputed(uint256 agreementId)',

  // Events — the source of the agreement list and the agreement timeline
  'event AgreementCreated(uint256 indexed agreementId, address indexed supplier, bytes32 invoiceHash, bytes32 xrplDestinationHash, uint256 destinationTag, uint64 expectedDrops, uint64 startLedger, uint64 dueAt)',
  'event PaymentVerified(uint256 indexed agreementId, bytes32 indexed xrplTxHash, uint64 blockTimestamp, uint256 receivedDrops, bytes32 evidenceId)',
  'event NonPaymentVerified(uint256 indexed agreementId, uint64 minimalBlockNumber, uint64 firstOverflowBlockNumber, uint64 firstOverflowBlockTimestamp, bytes32 evidenceId)',
  'event Disputed(uint256 indexed agreementId, address indexed by)',

  // Custom errors. Without these ethers reports only "unknown custom error",
  // which would leave the UI unable to say why a call was rejected.
  'error UnknownAgreement()',
  'error InvalidTransition(uint8 current)',
  'error InvalidTerms()',
  'error NotSupplier()',
  'error ProofNotVerified()',
  'error PaymentUnsuccessful(uint8 status)',
  'error DestinationMismatch()',
  'error AmountBelowExpected(uint256 received, uint64 expected)',
  'error DestinationTagMismatch()',
  'error PaymentBeforeWindow(uint64 paidBlock, uint64 startLedger)',
  'error PaidAfterDeadline(uint64 paidAt, uint64 dueAt)',
  'error DeadlineNotReached(uint64 dueAt)',
  'error EvidenceWindowMismatch()',
  'error VerifierOverrideNotAllowed(uint256 chainId)',
];

/* Solidity `enum Status` ordinals from contracts/LatePayShield.sol. */
export const CONTRACT_STATUS = {
  0: 'None',
  1: 'Active',
  2: 'PaidVerified',
  3: 'OverdueVerified',
  4: 'Disputed',
};
