/* What a registry read does to what is already on screen.
 *
 * This is separated from the hook because the interesting decision is not
 * "fetch on a timer", it is what a *failed* background poll may do to data the
 * user is already looking at. docs/architecture.md requires "Retain
 * identifiers; show retryable network failure" for an RPC outage, and
 * docs/ui-language.md requires that a failure never read as an empty registry.
 *
 * So the rule is asymmetric on purpose:
 *
 *   - a successful read always replaces the data and clears any error;
 *   - a failed read blanks the data only when there was none to begin with.
 *     Otherwise the last good read stays visible, marked stale, with the error
 *     alongside it. A live agreement list is more useful than an error page,
 *     provided the reader is told it may be out of date.
 *
 * Pure: no clock, no fetch, no React.
 */

export const INITIAL_REGISTRY_STATE = Object.freeze({
  phase: 'loading',
  registry: null,
  agreements: [],
  error: null,
  stale: false,
});

/**
 * Fold one read outcome into the current state.
 *
 * @param {object} previous Current state.
 * @param {object} outcome `{ ok: true, registry, agreements }` or
 *   `{ ok: false, error }`.
 * @returns {object} The next state.
 */
export function nextRegistryState(previous = INITIAL_REGISTRY_STATE, outcome) {
  if (outcome?.ok) {
    return {
      phase: 'ready',
      registry: outcome.registry,
      agreements: outcome.agreements ?? [],
      error: null,
      stale: false,
    };
  }

  const error = outcome?.error ?? 'The contract could not be reached.';
  const hadData = previous?.phase === 'ready' && previous.registry !== null;

  // Nothing good to fall back on, so this is a genuine failure state.
  if (!hadData) {
    return {
      phase: 'failed',
      registry: null,
      agreements: [],
      error,
      stale: false,
    };
  }

  // Keep what the user is reading, but stop implying it is current.
  return { ...previous, error, stale: true };
}

/* How often to re-read, decided by whether anything can actually change.
 *
 * Only an `Active` agreement (contract status 1) can move: paid, overdue and
 * disputed are terminal on chain. So when every agreement has settled there is
 * nothing a faster poll could discover, and each poll is not free — it costs
 * `3 + N` RPC calls against public infrastructure, one per agreement, growing
 * for the life of the contract.
 *
 * The fast interval is still not chosen for latency's sake: an outcome needs an
 * FDC voting round to finalise, which takes minutes. It is chosen so a change
 * that has already happened appears promptly without hammering the endpoint.
 */
export const POLL_ACTIVE_MS = 5_000;
export const POLL_SETTLED_MS = 60_000;

/** The contract's `Active` ordinal: the only state that can still change. */
const STATUS_ACTIVE = 1;

/**
 * The interval to use for the next poll.
 *
 * @param {object[]} agreements The agreements from the last good read.
 * @returns {number} Milliseconds.
 */
export function pollIntervalFor(agreements) {
  if (!Array.isArray(agreements) || agreements.length === 0) return POLL_SETTLED_MS;
  const anyActive = agreements.some((agreement) => agreement?.contractStatusOrdinal === STATUS_ACTIVE);
  return anyActive ? POLL_ACTIVE_MS : POLL_SETTLED_MS;
}

/** Should a poll run now? Kept here so the hook has no policy of its own. */
export function shouldPoll({ phase, documentHidden }) {
  // A hidden tab has nobody to inform, and the first read has its own path.
  if (documentHidden) return false;
  return phase === 'ready' || phase === 'failed';
}
