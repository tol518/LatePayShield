/* The link a supplier sends to their payer.
 *
 * Supplier and payer are different people on different devices, so the payer
 * never sees the creation screen. This link is how they arrive at an agreement
 * that is awaiting payment.
 *
 * The contract stores only the destination *hash*, so the payer's browser has
 * no way to reconstruct the r-address on its own. The link therefore carries
 * it. That address is a *claim*, never a trusted value: LiveRegistry checks it
 * against the on-chain xrplDestinationHash before it is saved or paid, so a
 * tampered link fails the same check a mistyped address would.
 */

const AGREEMENT_PARAM = 'agreement';
const DESTINATION_PARAM = 'destination';

/** Absolute link to an agreement's payment panel, for sending to the payer. */
export function buildPayerLink(agreementId, destination, href) {
  const url = new URL(href);
  url.search = '';
  url.searchParams.set(AGREEMENT_PARAM, String(agreementId));
  if (destination) url.searchParams.set(DESTINATION_PARAM, destination);
  url.hash = 'registry';
  return url.toString();
}

/**
 * Read an incoming payer link.
 *
 * @returns {{agreementId: number, destination: string}|null} null when this is
 * an ordinary visit, so the app only changes behaviour for a real payer link.
 */
export function readPayerLink(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const agreementId = url.searchParams.get(AGREEMENT_PARAM);
  if (!agreementId || !/^\d+$/.test(agreementId)) return null;

  return {
    agreementId: Number(agreementId),
    // Unverified until it matches the agreement's on-chain destination hash.
    destination: (url.searchParams.get(DESTINATION_PARAM) ?? '').trim(),
  };
}
