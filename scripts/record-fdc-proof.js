const fs = require("fs");
const path = require("path");
const { network, ethers } = require("hardhat");
const { decodeProof, describeRevert } = require("../lib/fdc-proof");

const EVIDENCE_DIR = path.join(__dirname, "..", "evidence");
const STATUS = ["None", "Active", "PaidVerified", "OverdueVerified", "Disputed"];

function latestProofFile() {
  if (process.env.FDC_PROOF_FILE) return process.env.FDC_PROOF_FILE;
  if (!fs.existsSync(EVIDENCE_DIR)) return null;
  const files = fs
    .readdirSync(EVIDENCE_DIR)
    .filter((f) => f.startsWith("fdc-proof-") && f.endsWith(".json"))
    .map((f) => path.join(EVIDENCE_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

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

  const proofFile = latestProofFile();
  if (!proofFile || !fs.existsSync(proofFile)) {
    throw new Error("No proof evidence found. Run `npm run fdc:proof` first.");
  }
  const evidence = JSON.parse(fs.readFileSync(proofFile, "utf8"));
  if (!evidence.responseHex || !evidence.merkleProof) {
    throw new Error(`${proofFile} does not contain responseHex and merkleProof.`);
  }

  const [submitter] = await ethers.getSigners();
  if (!submitter) {
    throw new Error("Set COSTON2_PRIVATE_KEY in .env for a throwaway, faucet-funded account.");
  }

  const proof = decodeProof(evidence.responseHex, evidence.merkleProof);
  const body = proof.data.responseBody;

  const shield = await ethers.getContractAt("LatePayShield", address, submitter);
  const agreement = await shield.getAgreement(agreementId);

  console.log(`Proof file:   ${proofFile}`);
  console.log(`Contract:     ${address}`);
  console.log(`Agreement:    #${agreementId} (${STATUS[Number(agreement.status)]})`);
  console.log(`\n                      agreement                                                          proof`);
  console.log(`destination hash      ${agreement.xrplDestinationHash}  ${body.receivingAddressHash}`);
  console.log(`destination tag       ${agreement.destinationTag}  ${body.destinationTag}`);
  console.log(`drops                 ${agreement.expectedDrops} (min)  ${body.receivedAmount}`);
  console.log(`ledger                ${agreement.startLedger} (from)  ${body.blockNumber}`);
  console.log(`deadline              ${agreement.dueAt} (by)  ${body.blockTimestamp}`);

  // The contract re-checks every one of these; a mismatch reverts with a named
  // error rather than recording a weaker outcome, so it is submitted as-is.
  const tx = await shield.recordVerifiedPayment(agreementId, proof);
  console.log(`\nSubmitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);

  const after = await shield.getAgreement(agreementId);
  console.log(`\n✅ Agreement #${agreementId} is now ${STATUS[Number(after.status)]}`);
  console.log(`   XRPL transaction: ${after.xrplTxHash}`);
  console.log(`   Evidence ID:      ${after.evidenceId}`);
  console.log(`   Explorer: https://coston2-explorer.flare.network/tx/${tx.hash}`);

  const outPath = path.join(EVIDENCE_DIR, `coston2-paid-agreement-${agreementId}.json`);
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
        xrplTxHash: after.xrplTxHash,
        evidenceId: after.evidenceId,
        votingRoundId: evidence.votingRoundId,
        submissionTransaction: tx.hash,
        blockNumber: receipt.blockNumber,
        proofEvidenceFile: path.basename(proofFile),
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
    `\n❌ Proof submission failed: ${
      describeRevert(error) || error.shortMessage || error.message
    }`
  );
  process.exitCode = 1;
});
