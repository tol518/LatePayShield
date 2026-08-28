"use strict";

/**
 * Shared plumbing for the FDC command chain and the tests.
 *
 * The Proof struct is read out of the compiled LatePayShield ABI rather than
 * restated here. A hand-copied struct drifts the moment the Solidity interface
 * moves, and a drifted struct re-encodes to a different Merkle leaf, so the
 * verifier rejects a proof that is actually valid.
 */

const fs = require("fs");
const path = require("path");
const { AbiCoder, Interface, ParamType, Wallet, isAddress } = require("ethers");

const ARTIFACT_PATH = path.join(
  __dirname,
  "..",
  "artifacts",
  "contracts",
  "LatePayShield.sol",
  "LatePayShield.json"
);

/** Same address on every Flare network; resolves the enshrined FDC contracts. */
const FLARE_CONTRACT_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

const REGISTRY_ABI = [
  "function getContractAddressByName(string calldata _name) external view returns (address)",
];

function proofAbiInput(recordFunction = "recordVerifiedPayment") {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    throw new Error("LatePayShield is not compiled. Run `npm run compile` first.");
  }
  const { abi } = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
  const fn = abi.find((f) => f.type === "function" && f.name === recordFunction);
  if (!fn) {
    throw new Error(`${recordFunction} is not in the compiled LatePayShield ABI.`);
  }
  const proof = fn.inputs.find((i) => i.name === "proof");
  if (!proof) {
    throw new Error(`${recordFunction} has no "proof" parameter.`);
  }
  return proof;
}

/**
 * Turn a DA-layer leaf into the exact struct the contract expects.
 * The ABI-encoded response is decoded rather than the JSON one, because
 * `JSON.parse` silently rounds uint64 values above 2^53 and a rounded field
 * changes the leaf hash.
 */
function decodeProof(responseHex, merkleProof, recordFunction) {
  const input = proofAbiInput(recordFunction);
  const dataType = ParamType.from(
    input.components.find((c) => c.name === "data")
  );
  const [decoded] = AbiCoder.defaultAbiCoder().decode([dataType], responseHex);

  // Decoded Results are frozen, and ethers mutates the value while re-encoding.
  return { merkleProof: [...merkleProof], data: decoded.toObject(true) };
}

/** Re-encoding must reproduce the DA bytes exactly or the leaf will not match. */
function encodeResponse(data, recordFunction) {
  const input = proofAbiInput(recordFunction);
  const dataType = ParamType.from(
    input.components.find((c) => c.name === "data")
  );
  return AbiCoder.defaultAbiCoder().encode([dataType], [data]);
}

/**
 * Minimal ABI for the enshrined verifier, built from the same struct definition
 * the contract compiles against.
 */
function verifierAbi(verifyFunction, recordFunction) {
  return [
    {
      type: "function",
      name: verifyFunction,
      stateMutability: "view",
      inputs: [{ ...proofAbiInput(recordFunction), name: "_proof" }],
      outputs: [{ type: "bool", name: "" }],
    },
  ];
}

async function fdcVerificationAddress(ethers) {
  const registry = new ethers.Contract(
    FLARE_CONTRACT_REGISTRY,
    REGISTRY_ABI,
    ethers.provider
  );
  return registry.getContractAddressByName("FdcVerification");
}

/**
 * Name a rejection using the contract's own error, given a failure from either
 * ethers or Hardhat. Hardhat's provider throws before ethers can decode the
 * revert, so both report only "execution reverted" and the raw selector is the
 * one thing they reliably agree on.
 */
function describeRevert(error) {
  const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data;
  if (typeof data !== "string" || !data.startsWith("0x") || data.length < 10) {
    return null;
  }
  try {
    const { abi } = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
    const parsed = new Interface(abi).parseError(data);
    return parsed ? `${parsed.name}(${parsed.args.join(", ")})` : null;
  } catch {
    return null;
  }
}

const EVIDENCE_DIR = path.join(__dirname, "..", "evidence");

/**
 * Newest evidence file with the given name prefix, parsed, with its path under
 * `file`. This is how each command in the chain picks up what the previous one
 * produced without anything being retyped.
 */
function latestEvidence(prefix) {
  if (!fs.existsSync(EVIDENCE_DIR)) return null;
  const files = fs
    .readdirSync(EVIDENCE_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .map((f) => path.join(EVIDENCE_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!files.length) return null;
  return { file: files[0], ...JSON.parse(fs.readFileSync(files[0], "utf8")) };
}

/**
 * Public EVM address the proof is issued to. Defaults to the account that pays
 * for and submits the request, so the proof is owned by the same address that
 * later calls the contract.
 */
function resolveProofOwner() {
  if (process.env.FDC_PROOF_OWNER) {
    if (!isAddress(process.env.FDC_PROOF_OWNER)) {
      throw new Error("FDC_PROOF_OWNER must be a 20-byte 0x… EVM address.");
    }
    return process.env.FDC_PROOF_OWNER;
  }
  if (process.env.COSTON2_PRIVATE_KEY) {
    return new Wallet(process.env.COSTON2_PRIVATE_KEY).address;
  }
  throw new Error(
    "Set FDC_PROOF_OWNER to your public Coston2 address, or COSTON2_PRIVATE_KEY to derive it."
  );
}

/** ABI decoding yields BigInts, which JSON.stringify refuses to serialize. */
function jsonSafe(value) {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

module.exports = {
  FLARE_CONTRACT_REGISTRY,
  EVIDENCE_DIR,
  latestEvidence,
  resolveProofOwner,
  proofAbiInput,
  decodeProof,
  encodeResponse,
  verifierAbi,
  fdcVerificationAddress,
  describeRevert,
  jsonSafe,
};
