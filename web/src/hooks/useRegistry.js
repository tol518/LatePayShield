import { useEffect, useState } from 'react';
import { fetchRegistry, fetchAgreements } from '../lib/registry.js';

/* Loads live contract state.
 *
 * Four distinct outcomes, because an RPC failure must never be shown as
 * "no agreements": one is missing information, the other is a real empty
 * registry. See docs/ui-language.md — "Truthful states are part of the
 * experience".
 *
 *   phase: 'loading' | 'ready' | 'failed'
 */
export function useRegistry(refreshKey = 0) {
  const [state, setState] = useState({ phase: 'loading', registry: null, agreements: [], error: null });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const registry = await fetchRegistry();
        const agreements = await fetchAgreements(registry.nextAgreementId);
        if (!cancelled) setState({ phase: 'ready', registry, agreements, error: null });
      } catch (error) {
        if (!cancelled) {
          setState({
            phase: 'failed',
            registry: null,
            agreements: [],
            error: error?.shortMessage ?? error?.message ?? 'The contract could not be reached.',
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [refreshKey]);

  return state;
}
