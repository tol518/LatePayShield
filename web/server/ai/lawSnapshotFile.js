/* Reading the committed UK-law snapshot from disk.
 *
 * `web/shared/lawSnapshot.js` is deliberately pure — it reads no file and no
 * clock, so the same validator serves the service and the browser bundle
 * (D-013). This module is the one place that touches the filesystem for it.
 *
 * The snapshot is committed, non-secret, and small, so it is read once and
 * cached for the life of the process. Approving it is a human act that edits
 * the file, and the operator restarts the service afterwards — the same
 * restart any other `.env` or data change already needs.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_SNAPSHOT_PATH = fileURLToPath(new URL('../../../data/uk-law/snapshot.json', import.meta.url));

let cached;

/**
 * The parsed snapshot, or null when it is absent or unreadable.
 *
 * Returning null rather than throwing is deliberate: SKILLS.md §7.5 says a
 * missing or schema-invalid snapshot disables the legal features and leaves
 * everything else working. The caller treats null as "no approved law inputs",
 * which is the same path an unapproved snapshot takes.
 */
export function readLawSnapshot({ path = DEFAULT_SNAPSHOT_PATH, reload = false } = {}) {
  if (!reload && cached !== undefined) return cached;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    cached = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    // No log line: an absent snapshot is a configuration state, not an error,
    // and its path is not interesting enough to print on every start.
    cached = null;
  }
  return cached;
}

/** Drop the cache. Used by tests that write a scratch snapshot. */
export function resetLawSnapshotCache() {
  cached = undefined;
}
