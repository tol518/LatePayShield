const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { Interface, keccak256 } = require("ethers");

const { decodeProof, encodeResponse, proofAbiInput } = require("../lib/fdc-proof");
const { standardAddressHash } = require("../lib/canonical");

const EVIDENCE_DIR = path.join(__dirname, "..", "evidence");
const XRPL_TX = "A0DA3E670AE35143F45E50717E9409241B53DF9A18A6EEF8A6C44E8F9ADF3565";

const evidence = JSON.parse(
  fs.readFileSync(path.join(EVIDENCE_DIR, `fdc-proof-1437032-${XRPL_TX}.json`), "utf8")
);
const payment = JSON.parse(
  fs.readFileSync(path.join(EVIDENCE_DIR, `xrpl-payment-${XRPL_TX}.json`), "utf8")
);

describe("FDC proof serialization", function () {
  it("decodes the real DA response into the struct the contract accepts", function () {
    const proof = decodeProof(evidence.responseHex, evidence.merkleProof);

    expect(proof.data.requestBody.transactionId).to.equal(evidence.transactionId);
    expect(proof.data.responseBody.status).to.equal(0n);
    expect(proof.data.responseBody.blockNumber).to.equal(BigInt(payment.ledgerIndex));
    expect(proof.data.responseBody.receivedAmount).to.equal(BigInt(payment.amountDrops));
    expect(proof.data.responseBody.destinationTag).to.equal(BigInt(payment.destinationTag));
  });

  it("re-encodes to the exact DA bytes", function () {
    const proof = decodeProof(evidence.responseHex, evidence.merkleProof);
    expect(encodeResponse(proof.data).toLowerCase()).to.equal(
      evidence.responseHex.toLowerCase()
    );
  });

  it("changes the Merkle leaf if any field is altered", function () {
    const proof = decodeProof(evidence.responseHex, evidence.merkleProof);
    const tampered = {
      ...proof.data,
      responseBody: { ...proof.data.responseBody, receivedAmount: 1n },
    };
    expect(keccak256(encodeResponse(tampered))).to.not.equal(
      keccak256(evidence.responseHex)
    );
  });

  it("carries the destination hash the agreement is created with", function () {
    const proof = decodeProof(evidence.responseHex, evidence.merkleProof);
    expect(proof.data.responseBody.receivingAddressHash).to.equal(
      standardAddressHash(payment.destinationAddress)
    );
  });

  it("encodes a recordVerifiedPayment call without reshaping", async function () {
    const { abi } = await hre.artifacts.readArtifact("LatePayShield");
    const proof = decodeProof(evidence.responseHex, evidence.merkleProof);
    const calldata = new Interface(abi).encodeFunctionData("recordVerifiedPayment", [
      1,
      proof,
    ]);
    expect(calldata.startsWith("0x")).to.equal(true);
  });

  it("reads the proof struct from the compiled ABI rather than a copy", function () {
    const input = proofAbiInput();
    expect(input.components.map((c) => c.name)).to.deep.equal(["merkleProof", "data"]);
  });
});
