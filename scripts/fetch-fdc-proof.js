const fs = require("fs");
const path = require("path");
const { network, ethers } = require("hardhat");
const {
  EVIDENCE_DIR,
  latestEvidence,
  decodeProof,
  encodeResponse,
  verifierAbi,
  fdcVerificationAddress,
  jsonSafe,
} = require("../lib/fdc-proof");

const DA_BASE_URL =
  process.env.FDC_DA_LAYER_BASE_URL || "https://ctn2-data-availability.flare.network";

const POLL_INTERVAL_MS = 20_000;
const POLL_TIMEOUT_MS = 15 * 60_000;

/**
 * The request bytes begin with the attestation type, so the proof shape is
 * derivable from the request itself rather than from a flag someone has to
 * remember to pass.
 */
const ATTESTATIONS = {
  XRPPayment: {
    record: "recordVerifiedPayment",
    verify: "verifyXRPPayment",
    prefix: "fdc-proof",
    discriminator: (r) => r.requestBody.transactionId.slice(2).toUpperCase(),
  },
  XRPPaymentNonexistence: {
    record: "recordVerifiedNonPayment",
    verify: "verifyXRPPaymentNonexistence",
    prefix: "fdc-nonpayment-proof",
    discriminator: (r) => r.requestBody.destinationAddressHash.slice(2, 18).toUpperCase(),
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function daPost(route, body) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.FDC_VERIFIER_API_KEY) {
    headers["x-api-key"] = process.env.FDC_VERIFIER_API_KEY;
  }
  const res = await fetch(`${DA_BASE_URL}${route}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* Error pages are HTML; the raw text is more useful than a parse failure. */
  }
  return { ok: res.ok, status: res.status, body: parsed, text };
}

async function latestFdcRound() {
  try {
    const res = await fetch(`${DA_BASE_URL}/api/v0/fsp/status`);
    if (!res.ok) return null;
    return (await res.json()).latest_fdc?.voting_round_id ?? null;
  } catch {
    return null;
  }
}

async function main() {
  if (network.config.chainId !== 114) {
    throw new Error("Refusing to fetch Coston2 proofs from another network (chain ID 114).");
  }

  const submitted = latestEvidence("fdc-request-");
  const requestBytes = process.env.FDC_ABI_ENCODED_REQUEST || submitted?.requestBytes;
  const votingRoundId = Number(process.env.FDC_VOTING_ROUND || submitted?.votingRoundId);

  if (!requestBytes || !ethers.isHexString(requestBytes)) {
    throw new Error(
      "No request bytes. Run `npm run fdc:submit`, or set FDC_ABI_ENCODED_REQUEST in .env."
    );
  }
  if (!Number.isInteger(votingRoundId) || votingRoundId <= 0) {
    throw new Error(
      "No voting round. Run `npm run fdc:submit`, or set FDC_VOTING_ROUND in .env."
    );
  }
  const typeName = ethers.decodeBytes32String(ethers.dataSlice(requestBytes, 0, 32));
  const attestation = ATTESTATIONS[typeName];
  if (!attestation) {
    throw new Error(`Unsupported attestation type in the request bytes: ${typeName}`);
  }

  if (submitted) console.log(`Request source: ${submitted.file}`);
  console.log(`Attestation:    ${typeName}`);
  console.log(`Voting round:   ${votingRoundId}`);

  const latest = await latestFdcRound();
  if (latest !== null) {
    console.log(`Latest finalized FDC round: ${latest}`);
    if (votingRoundId > latest) {
      console.log(`Waiting for ${votingRoundId - latest} more round(s) to finalize…`);
    }
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let leaf = null;
  for (let attempt = 1; !leaf; attempt++) {
    const res = await daPost("/api/v1/fdc/proof-by-request-round-raw", {
      votingRoundId,
      requestBytes,
    });

    if (res.ok && res.body?.response_hex) {
      leaf = res.body;
      break;
    }

    const reason = res.body?.error || res.text.slice(0, 120);
    if (Date.now() >= deadline) {
      throw new Error(
        `Proof not available after ${POLL_TIMEOUT_MS / 60_000} minutes (last: ${res.status} ${reason}). ` +
          `Re-run once the round shows as finalized.`
      );
    }
    console.log(`  attempt ${attempt}: not available yet (${res.status} ${reason})`);
    await sleep(POLL_INTERVAL_MS);
  }

  const proof = decodeProof(leaf.response_hex, leaf.proof, attestation.record);

  // A silent re-encoding difference is the one failure mode that still produces a
  // plausible-looking proof, so it is checked before the network is asked anything.
  if (
    encodeResponse(proof.data, attestation.record).toLowerCase() !==
    leaf.response_hex.toLowerCase()
  ) {
    throw new Error("Re-encoded response does not match the DA bytes; refusing to save.");
  }

  const fdcAddress = await fdcVerificationAddress(ethers);
  const verifier = new ethers.Contract(
    fdcAddress,
    verifierAbi(attestation.verify, attestation.record),
    ethers.provider
  );
  const verified = await verifier[attestation.verify](proof);
  if (!verified) {
    throw new Error(
      `FdcVerification at ${fdcAddress} rejected this proof. It cannot be submitted to LatePayShield.`
    );
  }

  const response = jsonSafe(proof.data);
  const evidence = {
    capturedAt: new Date().toISOString(),
    network: "flare-testnet-coston2",
    chainId: 114,
    attestationType: typeName,
    votingRoundId,
    requestBytes,
    responseHex: leaf.response_hex,
    merkleProof: leaf.proof,
    response,
    fdcVerification: fdcAddress,
    [attestation.verify]: verified,
    systemsExplorer: `https://coston2-systems-explorer.flare.network/voting-round/${votingRoundId}?tab=fdc`,
  };
  if (typeName === "XRPPayment") {
    evidence.transactionId = response.requestBody.transactionId;
  }

  const outPath = path.join(
    EVIDENCE_DIR,
    `${attestation.prefix}-${votingRoundId}-${attestation.discriminator(response)}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n");

  const body = response.responseBody;
  const q = response.requestBody;
  console.log(`\n✅ ${attestation.verify} returned true (${fdcAddress})`);
  if (typeName === "XRPPayment") {
    console.log(`   XRPL transaction:  ${q.transactionId}`);
    console.log(`   ledger / status:   ${body.blockNumber} / ${body.status}`);
    console.log(`   received drops:    ${body.receivedAmount}`);
    console.log(`   destination tag:   ${body.destinationTag} (present: ${body.hasDestinationTag})`);
    console.log(`   receiving hash:    ${body.receivingAddressHash}`);
  } else {
    console.log(`   searched ledgers:  ${q.minimalBlockNumber} to ${body.firstOverflowBlockNumber} (exclusive)`);
    console.log(`   window closed at:  ${body.firstOverflowBlockTimestamp}`);
    console.log(`   destination hash:  ${q.destinationAddressHash}`);
    console.log(`   destination tag:   ${q.destinationTag} (checked: ${q.checkDestinationTag})`);
    console.log(`   above drops:       ${q.amount}`);
  }
  console.log(`\nSaved: ${outPath}`);
  console.log(
    `\nNext: submit it against a matching agreement with\n` +
      `  AGREEMENT_ID=<id> npm run ${
        typeName === "XRPPayment" ? "fdc:record" : "fdc:record:overdue"
      }`
  );
}

main().catch((error) => {
  console.error(`\n❌ FDC proof retrieval failed: ${error.message}`);
  process.exitCode = 1;
});
