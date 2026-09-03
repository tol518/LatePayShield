/* npm run law:refresh — the only code in this repository that fetches a legal
 * source (task 9, docs/ai/SKILLS.md §7).
 *
 * What it does: reads the committed snapshot, checks the once-a-month cadence,
 * fetches each allowlisted source, and writes a *proposal* plus a diff. What it
 * does not do: parse a legal value out of a page, and write to the live
 * snapshot. Both refusals are explained in web/shared/lawRefresh.js.
 *
 * The model never triggers this and cannot reach it. It is an operator command,
 * and the only network access anywhere near the legal features.
 *
 * ESM, so it can import the same validator and allowlist the service and the
 * browser use rather than restating either.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  applyFetchResults,
  describeRefresh,
  isAllowedSourceUrl,
  REFRESH_MIN_INTERVAL_DAYS,
  REFRESH_SKIPPED,
  refreshDecision,
} from '../web/shared/lawRefresh.js';
import { validateSnapshot } from '../web/shared/lawSnapshot.js';

const SNAPSHOT_PATH = fileURLToPath(new URL('../data/uk-law/snapshot.json', import.meta.url));
const PROPOSAL_PATH = fileURLToPath(new URL('../data/uk-law/snapshot.proposed.json', import.meta.url));
const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = 'LatePayShield-law-refresh/1 (testnet prototype; contact the repository operator)';

const force = process.argv.includes('--force');

function readSnapshot() {
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  } catch (error) {
    console.error(`Could not read ${SNAPSHOT_PATH}: ${error.message}`);
    return null;
  }
}

/** Fetch one source and digest its bytes. Never throws. */
async function fetchSource(source) {
  // The allowlist is enforced before the request is made, not only when the
  // file is validated afterwards. SKILLS.md §7.4 allows no other host.
  if (!isAllowedSourceUrl(source.url)) {
    return { id: source.id, ok: false, detail: 'refused: not on the source allowlist' };
  }
  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { id: source.id, ok: false, detail: `HTTP ${response.status}` };
    }
    // A redirect could leave the allowlist, so check where we actually landed.
    if (!isAllowedSourceUrl(response.url)) {
      return { id: source.id, ok: false, detail: `redirected off the allowlist to ${response.url}` };
    }
    const body = Buffer.from(await response.arrayBuffer());
    return {
      id: source.id,
      ok: true,
      status: response.status,
      sha256: createHash('sha256').update(body).digest('hex'),
      bytes: body.length,
    };
  } catch (error) {
    const detail = error?.name === 'TimeoutError'
      ? `no response within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s`
      : (error?.message ?? 'unreachable');
    return { id: source.id, ok: false, detail };
  }
}

async function main() {
  const snapshot = readSnapshot();
  if (!snapshot) process.exit(1);

  const validation = validateSnapshot(snapshot);
  // A snapshot that is only unapproved is still structurally fine to refresh
  // against; anything else means fix the file first.
  const structuralProblems = (validation.problems ?? []).filter((problem) => {
    const code = problem?.code ?? problem;
    return code !== 'not_approved';
  });
  if (structuralProblems.length > 0) {
    console.error('The committed snapshot has structural problems, so it is not safe to refresh against:');
    for (const problem of structuralProblems) console.error(`  - ${problem?.code ?? problem}`);
    process.exit(1);
  }

  const nowIso = new Date().toISOString();
  const decision = refreshDecision({ snapshot, nowIso, force });
  if (!decision.shouldFetch) {
    console.log(REFRESH_SKIPPED[decision.reason] ?? 'Nothing to do.');
    if (decision.ageDays !== null) {
      console.log(`Last checked ${decision.ageDays} day(s) ago; the interval is ${REFRESH_MIN_INTERVAL_DAYS} days.`);
    }
    return;
  }

  console.log(`Checking ${snapshot.sources.length} allowlisted source(s)…`);
  const results = [];
  for (const source of snapshot.sources) {
    // Sequential on purpose: this is a courtesy to public infrastructure, and
    // nothing here is time-critical.
    const result = await fetchSource(source);
    results.push(result);
    console.log(`  ${result.ok ? 'ok  ' : 'fail'}  ${source.id}${result.ok ? '' : ` — ${result.detail}`}`);
  }

  const outcome = applyFetchResults({ snapshot, results, nowIso });
  console.log('');
  for (const line of describeRefresh(outcome)) console.log(line);

  const nothingToReview = outcome.changed.length === 0
    && outcome.failed.length === 0
    && outcome.rejected.length === 0
    // A first digest has to be written too, or the next run has no baseline to
    // compare against and a real change would go unnoticed.
    && outcome.baselined.length === 0;
  if (nothingToReview) return;

  writeFileSync(PROPOSAL_PATH, `${JSON.stringify(outcome.proposed, null, 2)}\n`, 'utf8');
  console.log('');
  console.log(`Proposal written to ${PROPOSAL_PATH}`);
  console.log('The live snapshot was not modified. Review the proposal, re-verify any changed');
  console.log('fact against its source text, then replace the snapshot and commit yourself.');
}

main().catch((error) => {
  console.error(`law:refresh failed: ${error?.message ?? error}`);
  process.exit(1);
});
