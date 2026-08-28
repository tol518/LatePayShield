/* Read-only access to the deployed LatePayShield contract.
 *
 * Reads go over the public Coston2 RPC and need no wallet. Nothing here writes.
 */

import { Contract, JsonRpcProvider, ZeroAddress } from 'ethers';
import { LATEPAY_SHIELD_ABI } from './abi.js';
import { COSTON2, CONTRACT_ADDRESS } from './network.js';
import { deriveUiStatus } from './agreementStatus.js';

function readContract() {
  // staticNetwork: the chain id is known, so skip the discovery round-trip.
  const provider = new JsonRpcProvider(
    COSTON2.rpcUrl,
    { chainId: COSTON2.chainId, name: COSTON2.name },
    { staticNetwork: true },
  );
  return new Contract(CONTRACT_ADDRESS, LATEPAY_SHIELD_ABI, provider);
}

/**
 * Registry-level facts: is the contract there, which verifier does it trust,
 * and how many agreements exist.
 *
 * `verifierIsEnshrined` is worth surfacing in the UI: a non-zero override would
 * mean outcomes came from a verifier the deployer chose, not the enshrined FDC.
 * The constructor forbids that off the local chain, so reading zero here is a
 * positive confirmation rather than a mere absence.
 */
export async function fetchRegistry() {
  const contract = readContract();

  const [nextAgreementId, verifierOverride, blockNumber] = await Promise.all([
    contract.nextAgreementId(),
    contract.fdcVerificationOverride(),
    contract.runner.provider.getBlockNumber(),
  ]);

  return {
    chainId: COSTON2.chainId,
    contractAddress: CONTRACT_ADDRESS,
    blockNumber,
    verifierOverride,
    verifierIsEnshrined: verifierOverride === ZeroAddress,
    nextAgreementId: Number(nextAgreementId),
    agreementCount: Number(nextAgreementId) - 1,
  };
}

/** Normalise one on-chain agreement into the shape the UI renders. */
function toViewModel(id, raw) {
  return {
    id,
    reference: `Agreement #${String(id).padStart(3, '0')}`,
    uiStatus: deriveUiStatus(raw.status, raw.dueAt),
    contractStatusOrdinal: Number(raw.status),
    supplier: raw.supplier,
    invoiceHash: raw.invoiceHash,
    // The destination address itself is NOT recoverable: the contract stores
    // only its hash. Anything needing the r-address must hold it off-chain.
    xrplDestinationHash: raw.xrplDestinationHash,
    destinationTag: Number(raw.destinationTag),
    expectedDrops: raw.expectedDrops,
    // Creator-supplied and not checkable on-chain; present it as a claim.
    startLedger: Number(raw.startLedger),
    dueAt: Number(raw.dueAt),
    evidenceId: raw.evidenceId,
    xrplTxHash: raw.xrplTxHash,
  };
}

/** One agreement by id, for refreshing a newly created agreement's outcome. */
export async function fetchAgreement(id) {
  const contract = readContract();
  const raw = await contract.getAgreement(id);
  return toViewModel(Number(id), raw);
}

/** Every agreement currently registered, oldest first. */
export async function fetchAgreements(nextAgreementId) {
  if (nextAgreementId <= 1) return [];

  const contract = readContract();
  const ids = Array.from({ length: nextAgreementId - 1 }, (_, i) => i + 1);

  const results = await Promise.all(
    ids.map((id) => contract.getAgreement(id).then((raw) => toViewModel(id, raw))),
  );
  return results;
}
