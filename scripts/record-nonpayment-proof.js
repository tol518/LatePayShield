const fs = require("fs");
const path = require("path");
const { network, ethers } = require("hardhat");
const {
  EVIDENCE_DIR,
  latestEvidence,
  decodeProof,
  describeRevert,
} = require("../lib/fdc-proof");

const STATUS = ["None", "Active", "PaidVerified", "OverdueVerified", "Disputed"];
const RECORD_FUNCTION = "recordVerifiedNonPayment";

async function main() {
  if (network.config.chainId !== 114) {
    throw new Error("Refusing to submit a proof outside Coston2 (chain ID 114).");
  }

  const address = process.env.LATEPAY_SHIELD_ADDRESS;
  if (!address || !ethers.isAddress(address)) {
    throw new Error("Set LATEPAY_SHIELD_ADDRESS in .env to the deployed Coston2 contract.");
  }

  const agreementId = Number(process.env.AGREEMENT_ID);
  if (!Number.isInteger(agreementId) || agreementId <= 0) {
    throw new Error("Set AGREEMENT_ID to the agreement this proof belongs to.");
  }

  const evidence = process.env.FDC_PROOF_FILE
    ? {
        file: process.env.FDC_PROOF_FILE,
        ...JSON.parse(fs.readFileSync(process.env.FDC_PROOF_FILE, "utf8")),
      }
    : latestEvidence("fdc-nonpayment-proof-");
  if (!evidence) {
    throw new Error("No non-payment proof found. Run `npm run fdc:proof` first.");
  }
  if (!evidence.responseHex || !evidence.merkleProof) {
    throw new Error(`${evidence.file} does not contain responseHex and merkleProof.`);
  }

  const [submitter] = await ethers.getSigners();
  if (!submitter) {
    throw new Error("Set COSTON2_PRIVATE_KEY in .env for a throwaway, faucet-funded account.");
  }

  const proof = decodeProof(evidence.responseHex, evidence.merkleProof, RECORD_FUNCTION);
  const q = proof.data.requestBody;

  const shield = await ethers.getContractAt("LatePayShield", address, submitter);
  const agreement = await shield.getAgreement(agreementId);
  const now = Math.floor(Date.now() / 1000);

  console.log(`Proof file:   ${evidence.file}`);
  console.log(`Contract:     ${address}`);
  console.log(`Agreement:    #${agreementId} (${STATUS[Number(agreement.status)]})`);
  console.log(`\n                      agreement                                                          proof`);
  console.log(`destination hash      ${agreement.xrplDestinationHash}  ${q.destinationAddressHash}`);
  console.log(`destination tag       ${agreement.destinationTag}  ${q.destinationTag}`);
  console.log(`drops threshold       ${agreement.expectedDrops - 1n} (exact)  ${q.amount}`);
  console.log(`window from           ${agreement.startLedger} (at or before)  ${q.minimalBlockNumber}`);
  console.log(`window until          ${agreement.dueAt} (at or after)  ${q.deadlineTimestamp}`);
  console.log(`\ndeadline passed:      ${now > Number(agreement.dueAt)} (now ${now})`);

  const tx = await shield.recordVerifiedNonPayment(agreementId, proof);
  console.log(`\nSubmitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);

  const after = await shield.getAgreement(agreementId);
  const body = proof.data.responseBody;
  console.log(`\n✅ Agreement #${agreementId} is now ${STATUS[Number(after.status)]}`);
  console.log(`   Evidence ID:      ${after.evidenceId}`);
  console.log(`   Searched ledgers: ${q.minimalBlockNumber} to ${body.firstOverflowBlockNumber} (exclusive)`);
  console.log(`   Explorer: https://coston2-explorer.flare.network/tx/${tx.hash}`);

  const outPath = path.join(EVIDENCE_DIR, `coston2-overdue-agreement-${agreementId}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        network: "flare-testnet-coston2",
        chainId: 114,
        contractAddress: address,
        agreementId,
        status: STATUS[Number(after.status)],
        evidenceId: after.evidenceId,
        votingRoundId: evidence.votingRoundId,
        searchedFromLedger: q.minimalBlockNumber.toString(),
        firstOverflowBlockNumber: body.firstOverflowBlockNumber.toString(),
        firstOverflowBlockTimestamp: body.firstOverflowBlockTimestamp.toString(),
        dropsThreshold: q.amount.toString(),
        submissionTransaction: tx.hash,
        blockNumber: receipt.blockNumber,
        proofEvidenceFile: path.basename(evidence.file),
        explorer: `https://coston2-explorer.flare.network/tx/${tx.hash}`,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`\nSaved: ${outPath}`);
}

main().catch((error) => {
  console.error(
    `\n❌ Non-payment submission failed: ${
      describeRevert(error) || error.shortMessage || error.message
    }`
  );
  process.exitCode = 1;
});
