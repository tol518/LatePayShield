/* Display formatting.
 *
 * Amounts are XRP drops, not fiat. The contract stores drops and canonical.js
 * requires currency "XRP_TESTNET"; a fiat figure would need FTSO conversion,
 * which is not implemented. Never render a £/$ amount as if it came from chain.
 */

const DROPS_PER_XRP = 1_000_000n;

/** 2000000 -> "2 XRP" ; 2500000 -> "2.5 XRP" */
export function formatDrops(drops) {
  const value = BigInt(drops);
  const whole = value / DROPS_PER_XRP;
  const fraction = value % DROPS_PER_XRP;

  if (fraction === 0n) return `${whole.toLocaleString('en-GB')} XRP`;

  const decimals = fraction.toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole.toLocaleString('en-GB')}.${decimals} XRP`;
}

/** Exact drops, for the technical-detail rows. */
export function formatDropsExact(drops) {
  return `${BigInt(drops).toLocaleString('en-GB')} drops`;
}

/** 0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1 -> 0x4A49…78B1 */
export function shortenId(value, lead = 6, tail = 4) {
  const text = String(value);
  if (text.length <= lead + tail + 1) return text;
  return `${text.slice(0, lead)}…${text.slice(-tail)}`;
}

/** Unix seconds -> "04 September 2026" */
export function formatDate(unixSeconds) {
  return new Date(Number(unixSeconds) * 1000).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
