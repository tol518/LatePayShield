/* The controlled update process for the UK-law snapshot (task 9).
 *
 * Three decisions shape this module, and each one is a refusal to automate
 * something that should not be automated.
 *
 * **It does not read legal values out of a web page.** A refresh records
 * whether each allowlisted source's content has changed since it was last
 * checked, and flags the facts that depend on it for human re-verification. It
 * never parses a statutory rate or a compensation band out of HTML. Scraping a
 * figure and feeding it to the calculator would put an unverified number behind
 * every downstream statement, which is the whole failure `docs/ai/SKILLS.md` §7
 * exists to prevent. The committed figures were checked against the source text
 * by a person on 2 September 2026; this process tells the operator when that
 * check needs redoing, and no more.
 *
 * **It never overwrites the approved snapshot.** It produces a proposal and a
 * diff. SKILLS.md §7.5 requires that "nothing auto-merges", and the plainest
 * implementation of that is a process with no write path to the live file.
 *
 * **Any content change clears approval in the proposal.** If the Bank of
 * England page changed, the human-verified rate behind it may no longer match,
 * so the proposal arrives unapproved and the calculator stays silent until a
 * person re-verifies and signs it. Approval is never carried across a change.
 *
 * Pure: no clock, no network, no filesystem. The caller supplies the current
 * time and the fetch results, so the same inputs always produce the same
 * proposal.
 */

import { ALLOWED_SOURCE_DOMAINS, isAllowedSourceUrl } from './lawSnapshot.js';

export { ALLOWED_SOURCE_DOMAINS, isAllowedSourceUrl };

/** SKILLS.md §7.5: at most once per calendar month, so 28 days is the floor. */
export const REFRESH_MIN_INTERVAL_DAYS = 28;

const DAY_MS = 86_400_000;

export const REFRESH_SKIPPED = Object.freeze({
  too_recent: 'The snapshot was checked less than 28 days ago. Pass --force to check anyway.',
  unreadable: 'The snapshot could not be read, so there is nothing to refresh against. Restore or recreate it first.',
});

function parseInstant(value) {
  const time = Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? time : null;
}

/**
 * Should a refresh fetch anything right now?
 *
 * @returns {{shouldFetch: boolean, reason: ?string, ageDays: ?number}}
 */
export function refreshDecision({ snapshot, nowIso, force = false } = {}) {
  const now = parseInstant(nowIso);
  const fetchedAt = parseInstant(snapshot?.fetchedAt);

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { shouldFetch: false, reason: 'unreadable', ageDays: null };
  }
  // An unreadable or absent timestamp is not a reason to refuse: a snapshot
  // that cannot say when it was checked is exactly one worth checking.
  if (now === null || fetchedAt === null) {
    return { shouldFetch: true, reason: null, ageDays: null };
  }

  const ageDays = Math.floor((now - fetchedAt) / DAY_MS);
  if (force) return { shouldFetch: true, reason: null, ageDays };
  if (ageDays < REFRESH_MIN_INTERVAL_DAYS) {
    return { shouldFetch: false, reason: 'too_recent', ageDays };
  }
  return { shouldFetch: true, reason: null, ageDays };
}

/** The facts and conventions that cite a given source. */
export function dependentFactIds(snapshot, sourceId) {
  const entries = [...(snapshot?.facts ?? []), ...(snapshot?.conventions ?? [])];
  return entries
    .filter((entry) => (entry?.citationIds ?? []).includes(sourceId))
    .map((entry) => entry.id);
}

/**
 * Fold fetch results into a proposed snapshot.
 *
 * A source that returned gets its new timestamp, status and content digest. A
 * source that failed **keeps its previous values** and is marked `failed`: its
 * `fetchedAt` does not advance, because a partial refresh must never let stale
 * data pass as freshly checked (SKILLS.md §7.4).
 *
 * @param {object} input `snapshot`, `results` (one per source), `nowIso`.
 * @returns {{proposed: object, changed: object[], failed: object[],
 *   unchanged: string[], baselined: object[], approvalCleared: boolean,
 *   rejected: object[]}}
 *   `baselined` is a source digested for the first time: nothing about the law
 *   changed, but the digest must be committed or change detection never starts.
 */
export function applyFetchResults({ snapshot, results = [], nowIso } = {}) {
  const byId = new Map(results.map((result) => [String(result?.id), result]));
  const changed = [];
  const failed = [];
  const unchanged = [];
  const baselined = [];
  const rejected = [];

  const sources = (snapshot?.sources ?? []).map((source) => {
    const result = byId.get(String(source.id));
    if (!result) return { ...source };

    // Enforced again here, not only in the script: a result for a URL outside
    // the allowlist is discarded rather than recorded.
    if (!isAllowedSourceUrl(source.url)) {
      rejected.push({ id: source.id, url: source.url, reason: 'not_allowlisted' });
      return { ...source };
    }

    if (!result.ok) {
      failed.push({ id: source.id, url: source.url, detail: String(result.detail ?? 'unreachable') });
      // Previous values retained on purpose; only the status changes.
      return { ...source, status: 'failed' };
    }

    const previousDigest = source.sha256 ?? null;
    const digest = String(result.sha256 ?? '');
    const next = { ...source, status: 'ok', fetchedAt: nowIso, sha256: digest };

    if (!previousDigest) {
      /* First time this source has been digested. Not a change in the law, so
       * it must not invalidate approval — but it does have to be *kept*, or the
       * next run has no baseline either and change detection never starts. So
       * it counts as something to commit, distinctly from a content change. */
      baselined.push({ id: source.id, url: source.url, sha256: digest });
    } else if (previousDigest !== digest) {
      changed.push({
        id: source.id,
        url: source.url,
        previousSha256: previousDigest,
        sha256: digest,
        dependentFactIds: dependentFactIds(snapshot, source.id),
      });
    } else {
      unchanged.push(source.id);
    }
    return next;
  });

  const approvalCleared = changed.length > 0;
  const everySourceOk = sources.every((source) => source.status === 'ok');

  const proposed = {
    ...snapshot,
    // Only advances when every source actually returned, so the snapshot's own
    // freshness never overstates a partial refresh.
    fetchedAt: everySourceOk && results.length > 0 ? nowIso : snapshot?.fetchedAt,
    sources,
    // A changed source means the human-verified figures behind it are no longer
    // known to match. Approval is never carried across a change.
    ...(approvalCleared ? { approvedBy: null, approvedAt: null } : {}),
  };

  return { proposed, changed, failed, unchanged, baselined, approvalCleared, rejected };
}

/**
 * A human-readable account of what a refresh found.
 *
 * Written for someone deciding whether to re-verify and commit, so it says what
 * changed, which facts rest on it, and what is required next.
 */
export function describeRefresh({
  changed = [], failed = [], unchanged = [], baselined = [], rejected = [], approvalCleared = false,
} = {}) {
  const lines = [];

  if (changed.length === 0 && failed.length === 0 && rejected.length === 0 && baselined.length === 0) {
    lines.push(`No source content changed. ${unchanged.length} source(s) checked and identical.`);
    lines.push('Nothing to review. The snapshot keeps its current approval state.');
    return lines;
  }

  for (const entry of changed) {
    lines.push(`CHANGED  ${entry.id}  ${entry.url}`);
    lines.push(`         digest ${String(entry.previousSha256).slice(0, 12)}… -> ${String(entry.sha256).slice(0, 12)}…`);
    lines.push(entry.dependentFactIds.length > 0
      ? `         re-verify: ${entry.dependentFactIds.join(', ')}`
      : '         no fact cites this source');
  }
  for (const entry of failed) {
    lines.push(`FAILED   ${entry.id}  ${entry.url}`);
    lines.push(`         ${entry.detail}. Previous values kept; fetchedAt not advanced.`);
  }
  for (const entry of rejected) {
    lines.push(`REFUSED  ${entry.id}  ${entry.url}`);
    lines.push('         Not on the source allowlist, so no result was recorded.');
  }
  for (const entry of baselined) {
    lines.push(`BASELINE ${entry.id}  ${entry.url}`);
    lines.push(`         first digest ${String(entry.sha256).slice(0, 12)}… recorded`);
  }
  if (unchanged.length > 0) lines.push(`UNCHANGED ${unchanged.join(', ')}`);

  if (baselined.length > 0 && changed.length === 0) {
    lines.push('');
    lines.push('Nothing about the law changed: these sources had no recorded digest, so this run');
    lines.push('established the baseline that later runs compare against. Approval is unaffected.');
    lines.push('Commit the proposal so the next check can detect a real change.');
  }

  if (approvalCleared) {
    lines.push('');
    lines.push('Approval has been cleared in the proposal because source content changed.');
    lines.push('Re-check each listed fact against its source text, then set approvedBy and');
    lines.push('approvedAt yourself and commit. Until you do, the calculator produces no');
    lines.push('figures and the legal skills stay disabled — which is the intended state.');
  }
  return lines;
}
