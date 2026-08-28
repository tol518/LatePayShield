/* Network and contract targets.
 *
 * Frontend-owned config. The deployed address is the one recorded in
 * evidence/coston2-deployment-0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1.json
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

export const CONTRACT_ADDRESS =
  import.meta.env?.VITE_LATEPAY_SHIELD_ADDRESS ?? '0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1';

export function addressUrl(address) {
  return `${COSTON2.explorer}/address/${address}`;
}

export function txUrl(hash) {
  return `${COSTON2.explorer}/tx/${hash}`;
}

export function xrplTxUrl(hash) {
  return `${XRPL_TESTNET.explorer}/transactions/${hash}`;
}
