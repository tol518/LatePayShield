/* Network and contract targets.
 *
 * Frontend-owned config. The deployed address is the one recorded in
 * evidence/coston2-deployment-0x1863Ee87a6C66c8a37F481B55c3acEcF3C506dfa.json
 * at the repository root; it is duplicated here rather than imported so the
 * frontend build has no dependency on files outside web/.
 *
 * Override it without editing this file by setting VITE_LATEPAY_SHIELD_ADDRESS
 * in web/.env.local — see web/.env.example.
 */

export const COSTON2 = {
  chainId: 114,
  chainIdHex: '0x72',
  name: 'Flare Coston2',
  label: 'Coston2 testnet',
  rpcUrl: import.meta.env?.VITE_COSTON2_RPC_URL ?? 'https://coston2-api.flare.network/ext/C/rpc',
  explorer: 'https://coston2-explorer.flare.network',
};

export const XRPL_TESTNET = {
  label: 'XRPL Testnet',
  rpcUrl: import.meta.env?.VITE_XRPL_TESTNET_RPC_URL ?? 'https://s.altnet.rippletest.net:51234',
  explorer: 'https://testnet.xrpl.org',
};

/* The corrected deployment of 3 September 2026. The previous contract at
 * 0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1 pinned its non-payment request to
 * `expectedDrops - 1`; agreements 1 to 15 and the recorded paid/overdue evidence
 * belong to it and remain valid for it, but it is no longer the address this
 * application reads. */
export const CONTRACT_ADDRESS =
  import.meta.env?.VITE_LATEPAY_SHIELD_ADDRESS ?? '0x1863Ee87a6C66c8a37F481B55c3acEcF3C506dfa';

export function addressUrl(address) {
  return `${COSTON2.explorer}/address/${address}`;
}

export function txUrl(hash) {
  return `${COSTON2.explorer}/tx/${hash}`;
}

export function xrplTxUrl(hash) {
  return `${XRPL_TESTNET.explorer}/transactions/${hash}`;
}
