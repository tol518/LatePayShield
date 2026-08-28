"use strict";

/**
 * Ask the hosted XRP verifier to turn a real XRPL Testnet transaction into the
 * request bytes an FDC attestation is made with. This replaces the manual
 * Swagger step so the whole chain can be run unattended.
 *
 * Testnet only. The API key here is the published public test key, not a secret,
 * but it still lives in the ignored .env rather than in the repository.
 */

const fs = require("fs");
const path = require("path");
const { encodeBytes32String } = require("ethers");
const {
  EVIDENCE_DIR,
  latestEvidence,
  resolveProofOwner,
} = require("../lib/fdc-proof");
require("dotenv").config();

const BASE_URL =
  process.env.FDC_VERIFIER_BASE_URL || "https://fdc-verifiers-testnet.flare.network";

// The generic /Payment route answers for XRPL too, but returns a differently
// shaped response that LatePayShield cannot consume.
const ROUTE = "/verifier/xrp/XRPPayment/prepareRequest";

const ATTESTATION_TYPE = encodeBytes32String("XRPPayment");
const SOURCE_ID = encodeBytes32String("testXRP");

async function main() {
  const apiKey = process.env.FDC_VERIFIER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Set FDC_VERIFIER_API_KEY in .env to the published public test key for the XRP verifier."
    );
  }

  const latest = latestEvidence("xrpl-payment-");
  const rawHash = (process.argv[2] || process.env.XRPL_TX_HASH || latest?.txHash || "").trim();
  const txHash = rawHash.startsWith("0x") ? rawHash.slice(2) : rawHash;
  if (!/^[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error(
      "Pass an XRPL transaction hash (64 hex characters), set XRPL_TX_HASH, or run `npm run spike:xrpl` first."
    );
  }

  const proofOwner = resolveProofOwner();
  if (latest?.txHash?.toUpperCase() === txHash.toUpperCase()) {
    console.log(`XRPL payment:  ${latest.file}`);
  }
  console.log(`Transaction:   ${txHash.toUpperCase()}`);
  console.log(`Proof owner:   ${proofOwner}`);

  const res = await fetch(`${BASE_URL}${ROUTE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({
      attestationType: ATTESTATION_TYPE,
      sourceId: SOURCE_ID,
      requestBody: { transactionId: `0x${txHash}`, proofOwner },
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
      `Verifier did not return a valid request: ${JSON.stringify(payload).slice(0, 300)}`
    );
  }

  const outPath = path.join(EVIDENCE_DIR, `fdc-request-${txHash.toUpperCase()}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        attestationType: "XRPPayment",
        sourceId: "testXRP",
        verifier: `${BASE_URL}${ROUTE}`,
        transactionId: `0x${txHash.toLowerCase()}`,
        proofOwner,
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
  console.error(`\n❌ FDC request preparation failed: ${error.message}`);
  process.exitCode = 1;
});
