"use strict";

/**
 * Canonical agreement terms — the single source of truth for hashing.
 *
 * Both the frontend and the backend MUST import this module. If either side
 * reimplements serialization, the hashes diverge and the on-chain commitment
 * stops matching the invoice the supplier confirmed.
 */

const { keccak256, toUtf8Bytes } = require("ethers");

const TERMS_VERSION = 1;
const UINT32_MAX = (1n << 32n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;

/** Field order is fixed. Changing it changes every hash, so bump TERMS_VERSION too. */
const FIELD_ORDER = [
  "termsVersion",
  "invoiceNumber",
  "supplierName",
  "payerName",
  "currency",
  "amountDrops",
  "xrplDestination",
  "destinationTag",
  "dueAt",
];

function boundedInteger(name, value, min, max) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error(`canonicalizeTerms: ${name} must be a safe integer or integer string`);
  }

  let parsed;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`canonicalizeTerms: ${name} must be an integer`);
  }

  if (parsed < min || parsed > max) {
    throw new Error(
      `canonicalizeTerms: ${name} must be between ${min} and ${max}`
    );
  }
  return parsed.toString();
}

/**
 * Normalize confirmed terms into a deterministic object.
 * Numeric values become strings so that JS number precision can never alter a hash.
 */
function canonicalizeTerms(terms) {
  const missing = FIELD_ORDER.filter(
    (k) => k !== "termsVersion" && terms[k] === undefined
  );
  if (missing.length) {
    throw new Error(`canonicalizeTerms: missing fields: ${missing.join(", ")}`);
  }
  if (terms.currency !== "XRP_TESTNET") {
    throw new Error(
      `canonicalizeTerms: currency must be "XRP_TESTNET" (testnet only), got ${terms.currency}`
    );
  }

  const text = {
    invoiceNumber: String(terms.invoiceNumber).trim(),
    supplierName: String(terms.supplierName).trim(),
    payerName: String(terms.payerName).trim(),
    xrplDestination: String(terms.xrplDestination).trim(),
  };
  const empty = Object.entries(text)
    .filter(([, value]) => value.length === 0)
    .map(([key]) => key);
  if (empty.length) {
    throw new Error(`canonicalizeTerms: empty fields: ${empty.join(", ")}`);
  }

  return {
    termsVersion: TERMS_VERSION,
    invoiceNumber: text.invoiceNumber,
    supplierName: text.supplierName,
    payerName: text.payerName,
    currency: "XRP_TESTNET",
    amountDrops: boundedInteger("amountDrops", terms.amountDrops, 1n, UINT64_MAX),
    xrplDestination: text.xrplDestination,
    destinationTag: boundedInteger("destinationTag", terms.destinationTag, 0n, UINT32_MAX),
    dueAt: boundedInteger("dueAt", terms.dueAt, 1n, UINT64_MAX),
  };
}

/** Deterministic serialization: fixed key order, no whitespace. */
function serializeTerms(canonical) {
  return JSON.stringify(
    Object.fromEntries(FIELD_ORDER.map((k) => [k, canonical[k]]))
  );
}

/** keccak256 over the UTF-8 canonical JSON. This is the on-chain `invoiceHash`. */
function invoiceHash(terms) {
  return keccak256(toUtf8Bytes(serializeTerms(canonicalizeTerms(terms))));
}

/**
 * FDC "standard address hash" for an XRPL r-address.
 * Flare defines this as keccak256 over the UTF-8 bytes of the standard address,
 * not ABI encoding of a Solidity string.
 */
function standardAddressHash(xrplAddress) {
  return keccak256(toUtf8Bytes(String(xrplAddress).trim()));
}

module.exports = {
  TERMS_VERSION,
  FIELD_ORDER,
  canonicalizeTerms,
  serializeTerms,
  invoiceHash,
  standardAddressHash,
};
