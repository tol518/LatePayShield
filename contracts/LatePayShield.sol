// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {IFdcVerification} from "@flarenetwork/flare-periphery-contracts/coston2/IFdcVerification.sol";
import {IXRPPayment} from "@flarenetwork/flare-periphery-contracts/coston2/IXRPPayment.sol";
import {IXRPPaymentNonexistence} from "@flarenetwork/flare-periphery-contracts/coston2/IXRPPaymentNonexistence.sol";

/**
 * @title LatePayShield
 * @notice Minimal agreement registry. It records a commitment to confirmed invoice
 *         terms and accepts an outcome ONLY when backed by an FDC-verified XRPL
 *         attestation proof.
 *
 * Scope and honest limitations:
 *  - Testnet prototype. Not legally binding, not a collection mechanism, not audited.
 *  - Holds and moves no funds. Interest/penalty figures are display-only, off-chain.
 *  - Stores no invoice text, names, or documents. Only hashes and identifiers.
 *  - An OverdueVerified outcome proves only that no qualifying payment matching the
 *    recorded destination, amount, and destination tag appeared in the explicitly
 *    recorded XRPL ledger range. It does not prove the payer never paid by any means.
 *  - On any network other than the local test chain the enshrined FdcVerification is the
 *    only verifier that can be used; the constructor rejects a verifier override.
 *  - `startLedger` is supplied by the creator and cannot be checked on-chain. It
 *    defines the lower bound of the evidence window and must be read as a claim by
 *    the creator, corroborated off-chain against the agreement's creation block.
 */
contract LatePayShield {
    /// @notice OVERDUE_PENDING is deliberately absent: it is derived off-chain from
    ///         (status == Active && block.timestamp > dueAt) and carries no evidence.
    enum Status {
        None,
        Active,
        PaidVerified,
        OverdueVerified,
        Disputed
    }

    struct Agreement {
        bytes32 invoiceHash;
        address supplier;
        bytes32 xrplDestinationHash;
        uint256 destinationTag;
        uint64 expectedDrops;
        uint64 startLedger;
        uint64 dueAt;
        Status status;
        bytes32 evidenceId;
        bytes32 xrplTxHash;
    }

    uint256 public nextAgreementId = 1;
    mapping(uint256 => Agreement) private _agreements;

    /// @dev Chain id of the local Hardhat network. The verifier override is accepted
    ///      only here, so no live deployment can be pointed at a fake verifier.
    uint256 private constant LOCAL_TEST_CHAIN_ID = 31337;

    /// @dev Always zero on any real network; see the constructor guard.
    address public immutable fdcVerificationOverride;

    event AgreementCreated(
        uint256 indexed agreementId,
        address indexed supplier,
        bytes32 invoiceHash,
        bytes32 xrplDestinationHash,
        uint256 destinationTag,
        uint64 expectedDrops,
        uint64 startLedger,
        uint64 dueAt
    );

    event PaymentVerified(
        uint256 indexed agreementId,
        bytes32 indexed xrplTxHash,
        uint64 blockTimestamp,
        uint256 receivedDrops,
        bytes32 evidenceId
    );

    event NonPaymentVerified(
        uint256 indexed agreementId,
        uint64 minimalBlockNumber,
        uint64 firstOverflowBlockNumber,
        uint64 firstOverflowBlockTimestamp,
        bytes32 evidenceId
    );

    event Disputed(uint256 indexed agreementId, address indexed by);

    error UnknownAgreement();
    error InvalidTransition(Status current);
    error InvalidTerms();
    error NotSupplier();
    error ProofNotVerified();
    error PaymentUnsuccessful(uint8 status);
    error DestinationMismatch();
    error AmountBelowExpected(uint256 received, uint64 expected);
    error DestinationTagMismatch();
    error PaymentBeforeWindow(uint64 paidBlock, uint64 startLedger);
    error PaidAfterDeadline(uint64 paidAt, uint64 dueAt);
    error DeadlineNotReached(uint64 dueAt);
    error EvidenceWindowMismatch();
    error VerifierOverrideNotAllowed(uint256 chainId);

    /**
     * @param _fdcVerificationOverride Test seam. MUST be the zero address on any real
     *        network, and the constructor enforces that rather than trusting the deployer.
     *        Without this guard a deployment could be pointed at a verifier that approves
     *        every proof, producing outcomes indistinguishable on-chain from real ones.
     */
    constructor(address _fdcVerificationOverride) {
        if (
            _fdcVerificationOverride != address(0) &&
            block.chainid != LOCAL_TEST_CHAIN_ID
        ) revert VerifierOverrideNotAllowed(block.chainid);

        fdcVerificationOverride = _fdcVerificationOverride;
    }

    function _fdc() internal view returns (IFdcVerification) {
        if (fdcVerificationOverride != address(0)) {
            return IFdcVerification(fdcVerificationOverride);
        }
        return ContractRegistry.getFdcVerification();
    }

    function getAgreement(uint256 agreementId) external view returns (Agreement memory) {
        Agreement memory a = _agreements[agreementId];
        if (a.status == Status.None) revert UnknownAgreement();
        return a;
    }

    /**
     * @notice Register confirmed canonical terms. Caller is recorded as supplier.
     * @param invoiceHash Hash of the canonical confirmed terms JSON, computed off-chain.
     * @param xrplDestinationHash FDC standard address hash of the XRPL destination.
     * @param destinationTag Destination tag used to disambiguate this invoice.
     * @param expectedDrops Exact minimum drops that must be received.
     * @param startLedger XRPL ledger index at creation; lower bound of the evidence window.
     * @param dueAt Unix deadline.
     */
    function createAgreement(
        bytes32 invoiceHash,
        bytes32 xrplDestinationHash,
        uint256 destinationTag,
        uint64 expectedDrops,
        uint64 startLedger,
        uint64 dueAt
    ) external returns (uint256 agreementId) {
        // expectedDrops must exceed zero: a zero minimum would make every payment,
        // and every absence of one, satisfy the amount test.
        if (
            invoiceHash == bytes32(0) ||
            xrplDestinationHash == bytes32(0) ||
            expectedDrops == 0 ||
            startLedger == 0 ||
            dueAt <= block.timestamp
        ) revert InvalidTerms();

        agreementId = nextAgreementId++;
        _agreements[agreementId] = Agreement({
            invoiceHash: invoiceHash,
            supplier: msg.sender,
            xrplDestinationHash: xrplDestinationHash,
            destinationTag: destinationTag,
            expectedDrops: expectedDrops,
            startLedger: startLedger,
            dueAt: dueAt,
            status: Status.Active,
            evidenceId: bytes32(0),
            xrplTxHash: bytes32(0)
        });

        emit AgreementCreated(
            agreementId,
            msg.sender,
            invoiceHash,
            xrplDestinationHash,
            destinationTag,
            expectedDrops,
            startLedger,
            dueAt
        );
    }

    /**
     * @notice Record a verified matching payment. Permissionless: the FDC proof, not
     *         the caller, is the authority. A non-matching proof reverts rather than
     *         producing a soft "unmatched" state, so a false PAID_VERIFIED is impossible.
     */
    function recordVerifiedPayment(uint256 agreementId, IXRPPayment.Proof calldata proof) external {
        Agreement storage a = _agreements[agreementId];
        if (a.status == Status.None) revert UnknownAgreement();
        if (a.status != Status.Active) revert InvalidTransition(a.status);

        if (!_fdc().verifyXRPPayment(proof)) revert ProofNotVerified();

        IXRPPayment.ResponseBody calldata r = proof.data.responseBody;

        // 0 == success; 1/2 are sender/receiver failures and never count as paid.
        if (r.status != 0) revert PaymentUnsuccessful(r.status);
        if (r.receivingAddressHash != a.xrplDestinationHash) revert DestinationMismatch();

        if (r.receivedAmount <= 0) revert AmountBelowExpected(0, a.expectedDrops);
        uint256 received = uint256(r.receivedAmount);
        if (received < a.expectedDrops) revert AmountBelowExpected(received, a.expectedDrops);

        if (!r.hasDestinationTag || r.destinationTag != a.destinationTag) {
            revert DestinationTagMismatch();
        }

        // A matching historic transaction must not be replayed against a newly created
        // agreement. startLedger is the agreement's declared lower evidence bound.
        if (r.blockNumber < a.startLedger) {
            revert PaymentBeforeWindow(r.blockNumber, a.startLedger);
        }

        // A late payment is real but not on-time. It must not silently satisfy the
        // agreement; the supplier resolves it through markDisputed instead.
        if (r.blockTimestamp > a.dueAt) revert PaidAfterDeadline(r.blockTimestamp, a.dueAt);

        a.status = Status.PaidVerified;
        a.xrplTxHash = proof.data.requestBody.transactionId;
        a.evidenceId = keccak256(abi.encode(proof.data));

        emit PaymentVerified(
            agreementId,
            a.xrplTxHash,
            r.blockTimestamp,
            received,
            a.evidenceId
        );
    }

    /**
     * @notice Record verified non-payment. Permissionless for the same reason as above.
     *         The request body is pinned to the agreement's terms so a proof about some
     *         other address, amount, tag, or window cannot be replayed here.
     */
    function recordVerifiedNonPayment(
        uint256 agreementId,
        IXRPPaymentNonexistence.Proof calldata proof
    ) external {
        Agreement storage a = _agreements[agreementId];
        if (a.status == Status.None) revert UnknownAgreement();
        if (a.status != Status.Active) revert InvalidTransition(a.status);
        if (block.timestamp <= a.dueAt) revert DeadlineNotReached(a.dueAt);

        if (!_fdc().verifyXRPPaymentNonexistence(proof)) revert ProofNotVerified();

        IXRPPaymentNonexistence.RequestBody calldata q = proof.data.requestBody;

        // The attestation's interface documents the search as STRICTLY GREATER than
        // `amount`, but the live Coston2 verifier was measured to match at or above it:
        // probing agreement 2's window, which contains a payment of exactly 2,000,000
        // drops, the verifier refused requests for 1,999,998 through 2,000,000 and
        // accepted 2,000,001, so the boundary is `receivedAmount >= amount`. See
        // evidence/fdc-nonexistence-threshold-probe.json.
        //
        // Requesting expectedDrops is therefore the correct threshold: a payment of
        // exactly expectedDrops still blocks an overdue verdict, and unlike the previous
        // `expectedDrops - 1` it no longer also blocks on a payment one drop short —
        // which used to leave such an agreement recordable as neither paid nor overdue,
        // with markDisputed its only exit.
        if (q.amount != uint256(a.expectedDrops)) revert EvidenceWindowMismatch();

        if (q.destinationAddressHash != a.xrplDestinationHash) revert DestinationMismatch();
        if (!q.checkDestinationTag || q.destinationTag != a.destinationTag) {
            revert DestinationTagMismatch();
        }

        // The window must be exactly the agreement's own window: it starts no later than
        // the recorded creation ledger and runs at least to the deadline.
        if (q.minimalBlockNumber > a.startLedger) revert EvidenceWindowMismatch();
        if (q.deadlineTimestamp < a.dueAt) revert EvidenceWindowMismatch();

        a.status = Status.OverdueVerified;
        a.evidenceId = keccak256(abi.encode(proof.data));

        emit NonPaymentVerified(
            agreementId,
            q.minimalBlockNumber,
            proof.data.responseBody.firstOverflowBlockNumber,
            proof.data.responseBody.firstOverflowBlockTimestamp,
            a.evidenceId
        );
    }

    /// @notice Supplier flags the agreement for human review. Informational only:
    ///         the MVP does not resolve disputes. Terminal in the contract.
    function markDisputed(uint256 agreementId) external {
        Agreement storage a = _agreements[agreementId];
        if (a.status == Status.None) revert UnknownAgreement();
        if (msg.sender != a.supplier) revert NotSupplier();
        if (a.status == Status.Disputed) revert InvalidTransition(a.status);

        a.status = Status.Disputed;
        emit Disputed(agreementId, msg.sender);
    }
}
