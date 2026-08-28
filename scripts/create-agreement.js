const fs = require("fs");
const path = require("path");
const xrpl = require("xrpl");
const { network, ethers } = require("hardhat");
const {
  canonicalizeTerms,
  invoiceHash,
  standardAddressHash,
} = require("../lib/canonical");
const { describeRevert } = require("../lib/fdc-proof");

const EVIDENCE_DIR = path.join(__dirname, "..", "evidence");

const WSS = process.env.XRPL_WSS_URL || "wss://s.altnet.rippletest.net:51233";
const SUPPLIER = process.env.XRPL_SUPPLIER_ADDRESS;
const INVOICE_REFERENCE = process.env.INVOICE_REFERENCE || "INV-2026-001";
const DESTINATION_TAG = Number(process.env.DESTINATION_TAG || 2026001);
const AMOUNT_DROPS = process.env.AMOUNT_DROPS || "2000000";
const SUPPLIER_NAME = process.env.SUPPLIER_NAME || "Maya Design Studio";
const PAYER_NAME = process.env.PAYER_NAME || "Acme Ltd";
const DUE_IN_MINUTES = Number(process.env.DUE_IN_MINUTES || 120);

/**
 * The ledger read here is the agreement's evidence floor. Reading it before the
 * transaction is sent keeps the floor at or below the true creation ledger, so a
 * payment made immediately afterwards still lands inside the window.
 */
async function currentValidatedLedger() {
  if (!WSS.includes("altnet") && !WSS.includes("testnet")) {
    throw new Error(`Refusing to read a non-testnet XRPL endpoint: ${WSS}`);
  }
  const client = new xrpl.Client(WSS);
  await client.connect();
  try {
    return await client.getLedgerIndex();
  } finally {
    await client.disconnect();
  }
}

async function main() {
  if (network.config.chainId !== 114) {
    throw new Error("Refusing to create an agreement outside Coston2 (chain ID 114).");
  }

  const address = process.env.LATEPAY_SHIELD_ADDRESS;
  if (!address || !ethers.isAddress(address)) {
    throw new Error("Set LATEPAY_SHIELD_ADDRESS in .env to the deployed Coston2 contract.");
  }
  if (!SUPPLIER || !xrpl.isValidAddress(SUPPLIER)) {
    throw new Error(
      "Set XRPL_SUPPLIER_ADDRESS in .env to the XRPL Testnet address that will receive payment."
    );
  }
  if (!Number.isInteger(DUE_IN_MINUTES) || DUE_IN_MINUTES <= 0) {
    throw new Error("DUE_IN_MINUTES must be a positive whole number of minutes.");
  }

  const [supplier] = await ethers.getSigners();
  if (!supplier) {
    throw new Error("Set COSTON2_PRIVATE_KEY in .env for a throwaway, faucet-funded account.");
  }

  const startLedger = await currentValidatedLedger();
  const dueAt = Math.floor(Date.now() / 1000) + DUE_IN_MINUTES * 60;

  const terms = canonicalizeTerms({
    invoiceNumber: INVOICE_REFERENCE,
    supplierName: SUPPLIER_NAME,
    payerName: PAYER_NAME,
    currency: "XRP_TESTNET",
    amountDrops: AMOUNT_DROPS,
    xrplDestination: SUPPLIER,
    destinationTag: DESTINATION_TAG,
    dueAt,
  });

  const hash = invoiceHash(terms);
  const destinationHash = standardAddressHash(SUPPLIER);

  console.log(`Contract:          ${address}`);
  console.log(`Supplier (signer): ${supplier.address}`);
  console.log(`XRPL destination:  ${SUPPLIER}`);
  console.log(`Destination hash:  ${destinationHash}`);
  console.log(`Invoice hash:      ${hash}`);
  console.log(`Expected drops:    ${terms.amountDrops}`);
  console.log(`Destination tag:   ${terms.destinationTag}`);
  console.log(`Start ledger:      ${startLedger}`);
  console.log(`Due at:            ${dueAt} (${new Date(dueAt * 1000).toISOString()})`);

  const shield = await ethers.getContractAt("LatePayShield", address, supplier);
  const tx = await shield.createAgreement(
    hash,
    destinationHash,
    terms.destinationTag,
    terms.amountDrops,
    startLedger,
    dueAt
  );
  console.log(`\nSubmitted: ${tx.hash}`);
  const receipt = await tx.wait();

  const created = receipt.logs
    .map((log) => {
      try {
        return shield.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "AgreementCreated");
  if (!created) {
    throw new Error(`No AgreementCreated event in ${tx.hash}.`);
  }
  const agreementId = Number(created.args.agreementId);

  const outPath = path.join(EVIDENCE_DIR, `coston2-agreement-${agreementId}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        network: "flare-testnet-coston2",
        chainId: 114,
        contractAddress: address,
        agreementId,
        supplier: supplier.address,
        terms,
        invoiceHash: hash,
        xrplDestination: SUPPLIER,
        xrplDestinationHash: destinationHash,
        startLedger,
        dueAt,
        creationTransaction: tx.hash,
        blockNumber: receipt.blockNumber,
        explorer: `https://coston2-explorer.flare.network/tx/${tx.hash}`,
      },
      null,
      2
    ) + "\n"
  );

  console.log(`Confirmed in block ${receipt.blockNumber}`);
  console.log(`\n✅ Agreement #${agreementId} is Active`);
  console.log(`   Explorer: https://coston2-explorer.flare.network/tx/${tx.hash}`);
  console.log(`\nSaved: ${outPath}`);
  console.log(
    `\nNext, in this order:\n` +
      `  npm run spike:xrpl                       pays ${SUPPLIER} after this agreement\n` +
      `  npm run fdc:prepare\n` +
      `  npm run fdc:submit\n` +
      `  npm run fdc:proof\n` +
      `  AGREEMENT_ID=${agreementId} npm run fdc:record`
  );
}

main().catch((error) => {
  console.error(
    `\n❌ Agreement creation failed: ${
      describeRevert(error) || error.shortMessage || error.message
    }`
  );
  process.exitCode = 1;
});
