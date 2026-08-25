const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const XRP_PAYMENT_TYPE = ethers.encodeBytes32String("XRPPayment");
const XRP_NONEXISTENCE_TYPE = ethers.encodeBytes32String("XRPPaymentNonexistence");
const TEST_XRP_SOURCE = ethers.encodeBytes32String("testXRP");

const INVOICE_HASH = ethers.keccak256(ethers.toUtf8Bytes("canonical-terms-v1"));
const DEST_HASH = ethers.keccak256(ethers.toUtf8Bytes("rTestDestinationAddress"));
const OTHER_DEST_HASH = ethers.keccak256(ethers.toUtf8Bytes("rSomeoneElse"));
const TX_ID = ethers.keccak256(ethers.toUtf8Bytes("xrpl-tx-1"));

const DEST_TAG = 2026001n;
const EXPECTED_DROPS = 2_000_000n;
const START_LEDGER = 5_000_000n;

function paymentProof(overrides = {}) {
  const body = {
    blockNumber: 5_000_010n,
    blockTimestamp: 0n, // set by caller
    sourceAddress: "rPayerAddress",
    sourceAddressHash: ethers.keccak256(ethers.toUtf8Bytes("rPayerAddress")),
    receivingAddressHash: DEST_HASH,
    intendedReceivingAddressHash: DEST_HASH,
    spentAmount: EXPECTED_DROPS,
    intendedSpentAmount: EXPECTED_DROPS,
    receivedAmount: EXPECTED_DROPS,
    intendedReceivedAmount: EXPECTED_DROPS,
    hasMemoData: false,
    firstMemoData: "0x",
    hasDestinationTag: true,
    destinationTag: DEST_TAG,
    status: 0,
    ...overrides,
  };
  return {
    merkleProof: [],
    data: {
      attestationType: XRP_PAYMENT_TYPE,
      sourceId: TEST_XRP_SOURCE,
      votingRound: 1n,
      lowestUsedTimestamp: 0n,
      requestBody: { transactionId: TX_ID, proofOwner: ethers.ZeroAddress },
      responseBody: body,
    },
  };
}

function nonexistenceProof(overrides = {}) {
  const requestBody = {
    minimalBlockNumber: START_LEDGER,
    deadlineBlockNumber: START_LEDGER + 1000n,
    deadlineTimestamp: 0n, // set by caller
    destinationAddressHash: DEST_HASH,
    // strictly-greater-than semantics: threshold is one drop below expected
    amount: EXPECTED_DROPS - 1n,
    checkFirstMemoData: false,
    firstMemoDataHash: ethers.ZeroHash,
    checkDestinationTag: true,
    destinationTag: DEST_TAG,
    proofOwner: ethers.ZeroAddress,
    ...overrides,
  };
  return {
    merkleProof: [],
    data: {
      attestationType: XRP_NONEXISTENCE_TYPE,
      sourceId: TEST_XRP_SOURCE,
      votingRound: 1n,
      lowestUsedTimestamp: 0n,
      requestBody,
      responseBody: {
        minimalBlockTimestamp: 0n,
        firstOverflowBlockNumber: START_LEDGER + 1001n,
        firstOverflowBlockTimestamp: 0n,
      },
    },
  };
}

describe("LatePayShield", function () {
  let shield, mock, supplier, other, dueAt;

  beforeEach(async function () {
    [supplier, other] = await ethers.getSigners();
    mock = await (await ethers.getContractFactory("MockFdcVerification")).deploy();
    shield = await (await ethers.getContractFactory("LatePayShield")).deploy(
      await mock.getAddress()
    );
    dueAt = BigInt(await time.latest()) + 3600n;
  });

  async function create(overrides = {}) {
    const t = {
      invoiceHash: INVOICE_HASH,
      xrplDestinationHash: DEST_HASH,
      destinationTag: DEST_TAG,
      expectedDrops: EXPECTED_DROPS,
      startLedger: START_LEDGER,
      dueAt,
      ...overrides,
    };
    await shield.createAgreement(
      t.invoiceHash,
      t.xrplDestinationHash,
      t.destinationTag,
      t.expectedDrops,
      t.startLedger,
      t.dueAt
    );
    return 1n;
  }

  describe("createAgreement", function () {
    it("records the confirmed terms and emits the event", async function () {
      await expect(
        shield.createAgreement(
          INVOICE_HASH, DEST_HASH, DEST_TAG, EXPECTED_DROPS, START_LEDGER, dueAt
        )
      )
        .to.emit(shield, "AgreementCreated")
        .withArgs(
          1n, supplier.address, INVOICE_HASH, DEST_HASH,
          DEST_TAG, EXPECTED_DROPS, START_LEDGER, dueAt
        );

      const a = await shield.getAgreement(1n);
      expect(a.status).to.equal(1); // Active
      expect(a.supplier).to.equal(supplier.address);
      expect(a.expectedDrops).to.equal(EXPECTED_DROPS);
      expect(a.xrplTxHash).to.equal(ethers.ZeroHash);
      expect(a.evidenceId).to.equal(ethers.ZeroHash);
    });

    it("starts a new agreement as Active", async function () {
      expect((await shield.getAgreement(await create())).status).to.equal(1);
    });

    it("rejects a zero amount, which would underflow the nonexistence threshold", async function () {
      await expect(create({ expectedDrops: 0n })).to.be.revertedWithCustomError(
        shield, "InvalidTerms"
      );
    });

    it("rejects a deadline in the past", async function () {
      await expect(
        create({ dueAt: BigInt(await time.latest()) - 1n })
      ).to.be.revertedWithCustomError(shield, "InvalidTerms");
    });

    it("rejects empty commitments", async function () {
      await expect(create({ invoiceHash: ethers.ZeroHash }))
        .to.be.revertedWithCustomError(shield, "InvalidTerms");
      await expect(create({ xrplDestinationHash: ethers.ZeroHash }))
        .to.be.revertedWithCustomError(shield, "InvalidTerms");
      await expect(create({ startLedger: 0n }))
        .to.be.revertedWithCustomError(shield, "InvalidTerms");
    });

    it("reverts reading an unknown agreement", async function () {
      await expect(shield.getAgreement(99n)).to.be.revertedWithCustomError(
        shield, "UnknownAgreement"
      );
    });
  });

  describe("recordVerifiedPayment", function () {
    it("moves Active to PaidVerified on an exact matching payment", async function () {
      const id = await create();
      const proof = paymentProof({ blockTimestamp: dueAt - 60n });

      await expect(shield.recordVerifiedPayment(id, proof))
        .to.emit(shield, "PaymentVerified");

      const a = await shield.getAgreement(id);
      expect(a.status).to.equal(2); // PaidVerified
      expect(a.xrplTxHash).to.equal(TX_ID);
      expect(a.evidenceId).to.not.equal(ethers.ZeroHash);
    });

    it("accepts an overpayment", async function () {
      const id = await create();
      await shield.recordVerifiedPayment(
        id,
        paymentProof({ blockTimestamp: dueAt - 60n, receivedAmount: EXPECTED_DROPS + 1n })
      );
      expect((await shield.getAgreement(id)).status).to.equal(2);
    });

    it("is permissionless: the proof is the authority, not the caller", async function () {
      const id = await create();
      await shield
        .connect(other)
        .recordVerifiedPayment(id, paymentProof({ blockTimestamp: dueAt - 60n }));
      expect((await shield.getAgreement(id)).status).to.equal(2);
    });

    it("rejects a proof the verifier does not accept", async function () {
      const id = await create();
      await mock.setProofsValid(false);
      await expect(
        shield.recordVerifiedPayment(id, paymentProof({ blockTimestamp: dueAt - 60n }))
      ).to.be.revertedWithCustomError(shield, "ProofNotVerified");
    });

    it("rejects the wrong destination", async function () {
      const id = await create();
      await expect(
        shield.recordVerifiedPayment(
          id,
          paymentProof({ blockTimestamp: dueAt - 60n, receivingAddressHash: OTHER_DEST_HASH })
        )
      ).to.be.revertedWithCustomError(shield, "DestinationMismatch");
    });

    it("rejects an underpayment", async function () {
      const id = await create();
      await expect(
        shield.recordVerifiedPayment(
          id,
          paymentProof({ blockTimestamp: dueAt - 60n, receivedAmount: EXPECTED_DROPS - 1n })
        )
      )
        .to.be.revertedWithCustomError(shield, "AmountBelowExpected")
        .withArgs(EXPECTED_DROPS - 1n, EXPECTED_DROPS);
    });

    it("rejects a wrong or missing destination tag", async function () {
      const id = await create();
      await expect(
        shield.recordVerifiedPayment(
          id, paymentProof({ blockTimestamp: dueAt - 60n, destinationTag: 999n })
        )
      ).to.be.revertedWithCustomError(shield, "DestinationTagMismatch");

      await expect(
        shield.recordVerifiedPayment(
          id, paymentProof({ blockTimestamp: dueAt - 60n, hasDestinationTag: false })
        )
      ).to.be.revertedWithCustomError(shield, "DestinationTagMismatch");
    });

    it("rejects a matching payment from before the agreement's evidence window", async function () {
      const id = await create();
      await expect(
        shield.recordVerifiedPayment(
          id,
          paymentProof({ blockNumber: START_LEDGER - 1n, blockTimestamp: dueAt - 60n })
        )
      )
        .to.be.revertedWithCustomError(shield, "PaymentBeforeWindow")
        .withArgs(START_LEDGER - 1n, START_LEDGER);
      expect((await shield.getAgreement(id)).status).to.equal(1); // still Active
    });

    it("rejects a failed XRPL transaction", async function () {
      const id = await create();
      await expect(
        shield.recordVerifiedPayment(id, paymentProof({ blockTimestamp: dueAt - 60n, status: 2 }))
      )
        .to.be.revertedWithCustomError(shield, "PaymentUnsuccessful")
        .withArgs(2);
    });

    it("does not silently count a late payment as on-time", async function () {
      const id = await create();
      await expect(
        shield.recordVerifiedPayment(id, paymentProof({ blockTimestamp: dueAt + 1n }))
      )
        .to.be.revertedWithCustomError(shield, "PaidAfterDeadline")
        .withArgs(dueAt + 1n, dueAt);
      expect((await shield.getAgreement(id)).status).to.equal(1); // still Active
    });

    it("rejects a duplicate submission", async function () {
      const id = await create();
      const proof = paymentProof({ blockTimestamp: dueAt - 60n });
      await shield.recordVerifiedPayment(id, proof);
      await expect(shield.recordVerifiedPayment(id, proof))
        .to.be.revertedWithCustomError(shield, "InvalidTransition")
        .withArgs(2);
    });

    it("reverts on an unknown agreement", async function () {
      await expect(
        shield.recordVerifiedPayment(99n, paymentProof({ blockTimestamp: dueAt - 60n }))
      ).to.be.revertedWithCustomError(shield, "UnknownAgreement");
    });
  });

  describe("recordVerifiedNonPayment", function () {
    it("moves Active to OverdueVerified after the deadline", async function () {
      const id = await create();
      await time.increaseTo(dueAt + 1n);

      await expect(
        shield.recordVerifiedNonPayment(id, nonexistenceProof({ deadlineTimestamp: dueAt }))
      ).to.emit(shield, "NonPaymentVerified");

      const a = await shield.getAgreement(id);
      expect(a.status).to.equal(3); // OverdueVerified
      expect(a.evidenceId).to.not.equal(ethers.ZeroHash);
    });

    it("refuses before the deadline has passed", async function () {
      const id = await create();
      await expect(
        shield.recordVerifiedNonPayment(id, nonexistenceProof({ deadlineTimestamp: dueAt }))
      )
        .to.be.revertedWithCustomError(shield, "DeadlineNotReached")
        .withArgs(dueAt);
    });

    it("rejects a threshold of expectedDrops, which would ignore an exact payment", async function () {
      const id = await create();
      await time.increaseTo(dueAt + 1n);
      await expect(
        shield.recordVerifiedNonPayment(
          id, nonexistenceProof({ deadlineTimestamp: dueAt, amount: EXPECTED_DROPS })
        )
      ).to.be.revertedWithCustomError(shield, "EvidenceWindowMismatch");
    });

    it("rejects a window that starts after the agreement", async function () {
      const id = await create();
      await time.increaseTo(dueAt + 1n);
      await expect(
        shield.recordVerifiedNonPayment(
          id,
          nonexistenceProof({ deadlineTimestamp: dueAt, minimalBlockNumber: START_LEDGER + 1n })
        )
      ).to.be.revertedWithCustomError(shield, "EvidenceWindowMismatch");
    });

    it("rejects a window that ends before the deadline", async function () {
      const id = await create();
      await time.increaseTo(dueAt + 1n);
      await expect(
        shield.recordVerifiedNonPayment(
          id, nonexistenceProof({ deadlineTimestamp: dueAt - 1n })
        )
      ).to.be.revertedWithCustomError(shield, "EvidenceWindowMismatch");
    });

    it("rejects a proof about a different destination or tag", async function () {
      const id = await create();
      await time.increaseTo(dueAt + 1n);
      await expect(
        shield.recordVerifiedNonPayment(
          id,
          nonexistenceProof({ deadlineTimestamp: dueAt, destinationAddressHash: OTHER_DEST_HASH })
        )
      ).to.be.revertedWithCustomError(shield, "DestinationMismatch");

      await expect(
        shield.recordVerifiedNonPayment(
          id, nonexistenceProof({ deadlineTimestamp: dueAt, checkDestinationTag: false })
        )
      ).to.be.revertedWithCustomError(shield, "DestinationTagMismatch");
    });

    it("rejects a proof the verifier does not accept", async function () {
      const id = await create();
      await time.increaseTo(dueAt + 1n);
      await mock.setProofsValid(false);
      await expect(
        shield.recordVerifiedNonPayment(id, nonexistenceProof({ deadlineTimestamp: dueAt }))
      ).to.be.revertedWithCustomError(shield, "ProofNotVerified");
    });
  });

  describe("state machine", function () {
    it("cannot move PaidVerified to OverdueVerified", async function () {
      const id = await create();
      await shield.recordVerifiedPayment(id, paymentProof({ blockTimestamp: dueAt - 60n }));
      await time.increaseTo(dueAt + 1n);
      await expect(
        shield.recordVerifiedNonPayment(id, nonexistenceProof({ deadlineTimestamp: dueAt }))
      )
        .to.be.revertedWithCustomError(shield, "InvalidTransition")
        .withArgs(2);
    });

    it("cannot record a payment once OverdueVerified", async function () {
      const id = await create();
      await time.increaseTo(dueAt + 1n);
      await shield.recordVerifiedNonPayment(id, nonexistenceProof({ deadlineTimestamp: dueAt }));
      await expect(
        shield.recordVerifiedPayment(id, paymentProof({ blockTimestamp: dueAt - 60n }))
      )
        .to.be.revertedWithCustomError(shield, "InvalidTransition")
        .withArgs(3);
    });

    it("cannot record an outcome once Disputed", async function () {
      const id = await create();
      await shield.markDisputed(id);
      await expect(
        shield.recordVerifiedPayment(id, paymentProof({ blockTimestamp: dueAt - 60n }))
      )
        .to.be.revertedWithCustomError(shield, "InvalidTransition")
        .withArgs(4);
    });
  });

  describe("markDisputed", function () {
    it("is restricted to the supplier", async function () {
      const id = await create();
      await expect(shield.connect(other).markDisputed(id))
        .to.be.revertedWithCustomError(shield, "NotSupplier");
    });

    it("lets the supplier flag for review and emits the event", async function () {
      const id = await create();
      await expect(shield.markDisputed(id))
        .to.emit(shield, "Disputed")
        .withArgs(id, supplier.address);
      expect((await shield.getAgreement(id)).status).to.equal(4);
    });

    it("rejects a duplicate dispute", async function () {
      const id = await create();
      await shield.markDisputed(id);
      await expect(shield.markDisputed(id))
        .to.be.revertedWithCustomError(shield, "InvalidTransition")
        .withArgs(4);
    });
  });
});
