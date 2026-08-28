"use strict";

/**
 * Ask the hosted XRP verifier for the request bytes that assert no qualifying
 * payment reached an agreement's destination before its deadline.
 *
 * The window is taken from the agreement itself rather than chosen here. A
 * window that starts later than the agreement or ends before its deadline would
 * be evidence about some other question, and the contract rejects it.
 */

const fs = require("fs");
const path = require("path");
const { encodeBytes32String, ZeroHash } = require("ethers");
const {
  EVIDENCE_DIR,
  latestEvidence,
  resolveProofOwner,
} = require("../lib/fdc-proof");
require("dotenv").config();

const BASE_URL =
  process.env.FDC_VERIFIER_BASE_URL || "https://fdc-verifiers-testnet.flare.network";
const ROUTE = "/verifier/xrp/XRPPaymentNonexistence/prepareRequest";

const ATTESTATION_TYPE = encodeBytes32String("XRPPaymentNonexistence");
const SOURCE_ID = encodeBytes32String("testXRP");

function loadAgreement() {
  const id = process.env.AGREEMENT_ID;
  if (id) {
    const file = path.join(EVIDENCE_DIR, `coston2-agreement-${Number(id)}.json`);
    if (!fs.existsSync(file)) {
      throw new Error(`No evidence for agreement ${id}. Expected ${file}.`);
    }
    return { file, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  const latest = latestEvidence("coston2-agreement-");
  if (!latest) {
    throw new Error("No agreement evidence found. Run `npm run create:agreement` first.");
  }
  return latest;
}

async function main() {
  const apiKey = process.env.FDC_VERIFIER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Set FDC_VERIFIER_API_KEY in .env to the published public test key for the XRP verifier."
    );
  }

  const agreement = loadAgreement();
  const now = Math.floor(Date.now() / 1000);
  if (now <= agreement.dueAt) {
    const wait = agreement.dueAt - now;
    throw new Error(
      `Agreement ${agreement.agreementId} is not overdue yet. Its deadline passes in ` +
        `${Math.ceil(wait / 60)} minute(s), at ${new Date(agreement.dueAt * 1000).toISOString()}. ` +
        `The attestation cannot close a window that is still open.`
    );
  }

  // The contract pins the request to one drop below the expected amount and
  // rejects anything else, so this is not a free choice. Note that the live
  // verifier matches payments at or above this value rather than strictly
  // above it, which makes the bound one drop wider than the interface docs
  // imply. It stays safe against a false overdue either way.
  const threshold = (BigInt(agreement.terms.amountDrops) - 1n).toString();

  const requestBody = {
    minimalBlockNumber: String(agreement.startLedger),
    deadlineBlockNumber: String(agreement.startLedger),
    deadlineTimestamp: String(agreement.dueAt),
    destinationAddressHash: agreement.xrplDestinationHash,
    amount: threshold,
    checkFirstMemoData: false,
    firstMemoDataHash: ZeroHash,
    checkDestinationTag: true,
    destinationTag: String(agreement.terms.destinationTag),
    proofOwner: resolveProofOwner(),
  };

  console.log(`Agreement:        #${agreement.agreementId} (${agreement.file})`);
  console.log(`XRPL destination: ${agreement.xrplDestination}`);
  console.log(`Search from:      ledger ${requestBody.minimalBlockNumber}`);
  console.log(
    `Search until:     after ${requestBody.deadlineTimestamp} ` +
      `(${new Date(agreement.dueAt * 1000).toISOString()})`
  );
  console.log(`Above drops:      ${threshold} (expected ${agreement.terms.amountDrops} minus one)`);
  console.log(`Destination tag:  ${requestBody.destinationTag}`);
  console.log(`Proof owner:      ${requestBody.proofOwner}`);

  const res = await fetch(`${BASE_URL}${ROUTE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({
      attestationType: ATTESTATION_TYPE,
      sourceId: SOURCE_ID,
      requestBody,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("401 from the verifier: FDC_VERIFIER_API_KEY is missing or wrong.");
    }
    throw new Error(`Verifier returned ${res.status}: ${text.slice(0, 300)}`);
  }

  const payload = JSON.parse(text);
  if (payload.status !== "VALID" || !payload.abiEncodedRequest) {
    throw new Error(
      `Verifier did not return a valid request: ${JSON.stringify(payload).slice(0, 300)}. ` +
        `A payment matching the destination, tag, and amount inside the window would ` +
        `make this assertion false.`
    );
  }

  const outPath = path.join(
    EVIDENCE_DIR,
    `fdc-request-NONPAYMENT-${agreement.agreementId}.json`
  );
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        attestationType: "XRPPaymentNonexistence",
        sourceId: "testXRP",
        verifier: `${BASE_URL}${ROUTE}`,
        agreementId: agreement.agreementId,
        xrplDestination: agreement.xrplDestination,
        requestBody,
        requestBytes: payload.abiEncodedRequest,
      },
      null,
      2
    ) + "\n"
  );

  console.log(`\n✅ ${payload.status}`);
  console.log(`   abiEncodedRequest: ${payload.abiEncodedRequest}`);
  console.log(`\nSaved: ${outPath}`);
  console.log(`\nNext: npm run fdc:submit`);
}

main().catch((error) => {
  console.error(`\n❌ Non-payment request preparation failed: ${error.message}`);
  process.exitCode = 1;
});
