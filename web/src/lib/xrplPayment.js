import { apiFetch } from './apiRequest.js';

const RIPPLE_EPOCH_UNIX_OFFSET = 946684800;
export const XAMAN_VALIDATION_ATTEMPTS = 45;
export const XAMAN_VALIDATION_INTERVAL_MS = 3_000;

export function normalizeXrplTransactionHash(value) {
  return String(value ?? '').trim().replace(/^0x/i, '').toUpperCase();
}

export function isPendingXrplPaymentError(error) {
  return /not found|not validated/i.test(error?.message ?? String(error));
}

function transactionBody(result) {
  return result.tx_json ?? result.tx ?? result;
}

function deliveredDrops(result, tx) {
  const delivered = result.meta?.delivered_amount ?? result.meta?.DeliveredAmount ?? tx.Amount;
  if (typeof delivered !== 'string' || !/^\d+$/.test(delivered)) {
    throw new Error('This transaction did not deliver a plain XRP amount.');
  }
  return BigInt(delivered);
}

/** Validate public XRPL transaction data against one agreement's exact criteria. */
export function validateXrplPayment(result, criteria) {
  const tx = transactionBody(result);
  const resultCode = result.meta?.TransactionResult ?? result.meta?.transaction_result;

  if (result.validated !== true) throw new Error('The XRPL transaction is not validated yet.');
  if (resultCode !== 'tesSUCCESS') throw new Error(`The XRPL transaction did not succeed (${resultCode ?? 'unknown result'}).`);
  if (tx.TransactionType !== 'Payment') throw new Error('The XRPL transaction is not a Payment.');
  if (tx.Destination !== criteria.destination) throw new Error('The payment destination does not match this agreement.');
  if (Number(tx.DestinationTag) !== Number(criteria.destinationTag)) throw new Error('The destination tag does not match this agreement.');

  const receivedDrops = deliveredDrops(result, tx);
  if (receivedDrops < BigInt(criteria.expectedDrops)) throw new Error('The delivered XRP amount is below this agreement’s minimum.');

  const ledgerIndex = Number(result.ledger_index ?? tx.ledger_index);
  if (!Number.isSafeInteger(ledgerIndex) || ledgerIndex < Number(criteria.startLedger)) {
    throw new Error('The payment occurred before this agreement’s evidence window.');
  }

  const rippleDate = Number(tx.date);
  if (!Number.isSafeInteger(rippleDate)) throw new Error('The transaction has no usable XRPL close time.');
  const paidAt = rippleDate + RIPPLE_EPOCH_UNIX_OFFSET;
  if (paidAt > Number(criteria.dueAt)) throw new Error('The payment was validated after this agreement’s deadline.');

  return {
    hash: String(tx.hash ?? result.hash ?? criteria.hash).toUpperCase(),
    ledgerIndex,
    paidAt,
    receivedDrops,
  };
}

/** Read one transaction from the public XRPL Testnet JSON-RPC endpoint. */
export async function fetchAndValidateXrplPayment(hash, criteria) {
  const normalizedHash = normalizeXrplTransactionHash(hash);
  if (!/^[A-F0-9]{64}$/.test(normalizedHash)) {
    throw new Error('Enter the 64-character XRPL transaction hash.');
  }

  // The browser cannot reliably call public XRPL RPC nodes due to CORS. The
  // same-origin service proxies this read-only request; it never signs or
  // submits the transaction itself.
  const response = await apiFetch(`/api/xrpl/transactions/${normalizedHash}`);

  if (!response.ok) throw new Error(`XRPL Testnet returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.result?.error) {
    if (payload.result.error === 'txnNotFound') throw new Error('That transaction was not found on XRPL Testnet.');
    throw new Error(payload.result.error_message ?? payload.result.error_exception ?? payload.result.error);
  }

  return validateXrplPayment(payload.result, { ...criteria, hash: normalizedHash });
}

/** Keep checking a newly submitted Xaman payment while Testnet indexes it. */
export async function waitForValidatedXrplPayment(
  hash,
  criteria,
  {
    attempts = XAMAN_VALIDATION_ATTEMPTS,
    intervalMs = XAMAN_VALIDATION_INTERVAL_MS,
    fetchPayment = fetchAndValidateXrplPayment,
    wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration)),
  } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchPayment(hash, criteria);
    } catch (error) {
      if (!isPendingXrplPaymentError(error) || attempt === attempts - 1) throw error;
      await wait(intervalMs);
    }
  }
  throw new Error('XRPL Testnet validation did not complete.');
}
