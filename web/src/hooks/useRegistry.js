import { useEffect, useRef, useState } from 'react';
import { fetchRegistry, fetchAgreements } from '../lib/registry.js';
import {
  INITIAL_REGISTRY_STATE,
  nextRegistryState,
  pollIntervalFor,
  shouldPoll,
} from '../lib/registryState.js';

/* Loads live contract state, and keeps it live.
 *
 * Distinct outcomes, because an RPC failure must never be shown as "no
 * agreements": one is missing information, the other is a real empty registry.
 * See docs/ui-language.md — "Truthful states are part of the experience".
 *
 *   phase: 'loading' | 'ready' | 'failed'
 *   stale: true when the data shown is the last good read and a later poll failed
 *
 * The contract remains the source of truth; polling only re-reads it. A status
 * therefore changes on screen when the chain changes, never before, so nothing
 * here can make a pending outcome look verified.
 *
 * The interval adapts to whether anything can change: see `pollIntervalFor`.
 * A poll costs `3 + N` RPC calls, one per agreement, so a flat fast interval
 * would grow into real load on public infrastructure for no benefit once every
 * agreement has settled.
 */

export function useRegistry(refreshKey = 0) {
  const [state, setState] = useState(INITIAL_REGISTRY_STATE);

  /* Read inside the timer without making these dependencies, so a state change
   * does not tear the timer down and rebuild it. `intervalRef` is what the
   * timer compares against to notice the cadence should change. */
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;
  const intervalRef = useRef(pollIntervalFor(state.agreements));
  intervalRef.current = pollIntervalFor(state.agreements);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let timer = null;
    let armedFor = null;

    async function read() {
      // One read at a time: a slow RPC must not queue up behind itself.
      if (inFlight) return;
      inFlight = true;
      try {
        const registry = await fetchRegistry();
        const agreements = await fetchAgreements(registry.nextAgreementId);
        if (!cancelled) setState((previous) => nextRegistryState(previous, { ok: true, registry, agreements }));
      } catch (error) {
        if (!cancelled) {
          setState((previous) => nextRegistryState(previous, {
            ok: false,
            error: error?.shortMessage ?? error?.message ?? 'The contract could not be reached.',
          }));
        }
      } finally {
        inFlight = false;
        // The cadence may have changed with the result — an agreement settling
        // is exactly when the fast interval stops being worth paying for.
        if (!cancelled) arm();
      }
    }

    /* Re-arm only when the interval actually changed, so a settled registry is
     * not re-timed every minute for nothing. */
    function arm() {
      const next = intervalRef.current;
      if (timer !== null && armedFor === next) return;
      if (timer !== null) clearInterval(timer);
      armedFor = next;
      timer = setInterval(() => {
        if (shouldPoll({ phase: phaseRef.current, documentHidden: document.hidden })) read();
      }, next);
    }

    read();
    arm();

    // Coming back to the tab should not mean waiting out the interval.
    function onVisible() {
      if (!document.hidden) read();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshKey]);

  return state;
}
