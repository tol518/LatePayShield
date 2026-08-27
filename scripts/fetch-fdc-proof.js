const fs = require("fs");
const path = require("path");
const { network, ethers } = require("hardhat");
const {
  decodeProof,
  encodeResponse,
  verifierAbi,
  fdcVerificationAddress,
  jsonSafe,
} = require("../lib/fdc-proof");

const DA_BASE_URL =
  process.env.FDC_DA_LAYER_BASE_URL || "https://ctn2-data-availability.flare.network";

const EVIDENCE_DIR = path.join(__dirname, "..", "evidence");
const POLL_INTERVAL_MS = 20_000;
const POLL_TIMEOUT_MS = 15 * 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pick up whatever `npm run fdc:submit` last recorded so the round is not retyped. */
function latestSubmittedRequest() {
  if (!fs.existsSync(EVIDENCE_DIR)) return null;
  const files = fs
    .readdirSync(EVIDENCE_DIR)
    .filter((f) => f.startsWith("fdc-request-") && f.endsWith(".json"))
    .map((f) => path.join(EVIDENCE_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!files.length) return null;
  return { file: files[0], ...JSON.parse(fs.readFileSync(files[0], "utf8")) };
}

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

  const submitted = latestSubmittedRequest();
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
  if (submitted) console.log(`Request source: ${submitted.file}`);
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

  const proof = decodeProof(leaf.response_hex, leaf.proof);

  // A silent re-encoding difference is the one failure mode that still produces a
  // plausible-looking proof, so it is checked before the network is asked anything.
  if (encodeResponse(proof.data).toLowerCase() !== leaf.response_hex.toLowerCase()) {
    throw new Error("Re-encoded response does not match the DA bytes; refusing to save.");
  }

  const fdcAddress = await fdcVerificationAddress(ethers);
  const verifier = new ethers.Contract(
    fdcAddress,
    verifierAbi("verifyXRPPayment"),
    ethers.provider
  );
  const verified = await verifier.verifyXRPPayment(proof);
  if (!verified) {
    throw new Error(
      `FdcVerification at ${fdcAddress} rejected this proof. It cannot be submitted to LatePayShield.`
    );
  }

  const response = jsonSafe(proof.data);
  const transactionId = response.requestBody.transactionId;
  const evidence = {
    capturedAt: new Date().toISOString(),
    network: "flare-testnet-coston2",
    chainId: 114,
    attestationType: "XRPPayment",
    votingRoundId,
    transactionId,
    requestBytes,
    responseHex: leaf.response_hex,
    merkleProof: leaf.proof,
    response,
    fdcVerification: fdcAddress,
    verifyXRPPayment: verified,
    systemsExplorer: `https://coston2-systems-explorer.flare.network/voting-round/${votingRoundId}?tab=fdc`,
  };

  const outPath = path.join(
    EVIDENCE_DIR,
    `fdc-proof-${votingRoundId}-${transactionId.slice(2).toUpperCase()}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n");

  const body = response.responseBody;
  console.log(`\n✅ verifyXRPPayment returned true (${fdcAddress})`);
  console.log(`   XRPL transaction:  ${transactionId}`);
  console.log(`   ledger / status:   ${body.blockNumber} / ${body.status}`);
  console.log(`   received drops:    ${body.receivedAmount}`);
  console.log(`   destination tag:   ${body.destinationTag} (present: ${body.hasDestinationTag})`);
  console.log(`   receiving hash:    ${body.receivingAddressHash}`);
  console.log(`\nSaved: ${outPath}`);
  console.log(
    `\nNext: submit it against a matching agreement with\n` +
      `  AGREEMENT_ID=<id> npm run fdc:record`
  );
}

main().catch((error) => {
  console.error(`\n❌ FDC proof retrieval failed: ${error.message}`);
  process.exitCode = 1;
});
