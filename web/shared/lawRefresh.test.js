import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REFRESH_MIN_INTERVAL_DAYS,
  applyFetchResults,
  dependentFactIds,
  describeRefresh,
  isAllowedSourceUrl,
  refreshDecision,
} from './lawRefresh.js';

function snapshot(overrides = {}) {
  return {
    snapshotVersion: 1,
    fetchedAt: '2026-08-01T00:00:00Z',
    approvedBy: 'A Reviewer',
    approvedAt: '2026-08-01T09:00:00Z',
    sources: [
      { id: 'boe-bank-rate', url: 'https://www.bankofengland.co.uk/x', fetchedAt: '2026-08-01T00:00:00Z', status: 'ok', sha256: 'a'.repeat(64) },
      { id: 'lpcda-1998-s6', url: 'https://www.legislation.gov.uk/y', fetchedAt: '2026-08-01T00:00:00Z', status: 'ok', sha256: 'b'.repeat(64) },
    ],
    facts: [
      { id: 'statutory-interest-reference-rate', citationIds: ['boe-bank-rate'] },
      { id: 'statutory-interest-margin', citationIds: ['lpcda-1998-s6'] },
    ],
    conventions: [{ id: 'day-count-basis', citationIds: [] }],
    citations: [],
    ...overrides,
  };
}

const NOW = '2026-10-01T00:00:00Z';

test('the cadence gate holds a refresh inside 28 days and lets it through after', () => {
  const fresh = refreshDecision({ snapshot: snapshot({ fetchedAt: '2026-09-25T00:00:00Z' }), nowIso: NOW });
  assert.equal(fresh.shouldFetch, false);
  assert.equal(fresh.reason, 'too_recent');
  assert.ok(fresh.ageDays < REFRESH_MIN_INTERVAL_DAYS);

  const due = refreshDecision({ snapshot: snapshot(), nowIso: NOW });
  assert.equal(due.shouldFetch, true);
  assert.equal(due.reason, null);
});

test('--force overrides the cadence but nothing else does', () => {
  const forced = refreshDecision({ snapshot: snapshot({ fetchedAt: '2026-09-30T00:00:00Z' }), nowIso: NOW, force: true });
  assert.equal(forced.shouldFetch, true);
});

test('a snapshot that cannot say when it was checked is worth checking', () => {
  for (const fetchedAt of [undefined, null, '', 'never']) {
    assert.equal(refreshDecision({ snapshot: snapshot({ fetchedAt }), nowIso: NOW }).shouldFetch, true);
  }
  // But an unreadable snapshot has nothing to refresh against.
  for (const bad of [null, undefined, [], 'snapshot']) {
    const decision = refreshDecision({ snapshot: bad, nowIso: NOW });
    assert.equal(decision.shouldFetch, false);
    assert.equal(decision.reason, 'unreadable');
  }
});

test('an unchanged source leaves approval and the snapshot alone', () => {
  const before = snapshot();
  const outcome = applyFetchResults({
    snapshot: before,
    nowIso: NOW,
    results: [
      { id: 'boe-bank-rate', ok: true, sha256: 'a'.repeat(64) },
      { id: 'lpcda-1998-s6', ok: true, sha256: 'b'.repeat(64) },
    ],
  });
  assert.deepEqual(outcome.changed, []);
  assert.equal(outcome.approvalCleared, false);
  assert.equal(outcome.proposed.approvedBy, 'A Reviewer');
  assert.deepEqual(outcome.unchanged.sort(), ['boe-bank-rate', 'lpcda-1998-s6']);
  assert.equal(outcome.proposed.fetchedAt, NOW);
});

test('a changed source clears approval and names the facts to re-verify', () => {
  const outcome = applyFetchResults({
    snapshot: snapshot(),
    nowIso: NOW,
    results: [
      { id: 'boe-bank-rate', ok: true, sha256: 'c'.repeat(64) },
      { id: 'lpcda-1998-s6', ok: true, sha256: 'b'.repeat(64) },
    ],
  });
  assert.equal(outcome.changed.length, 1);
  assert.equal(outcome.changed[0].id, 'boe-bank-rate');
  assert.deepEqual(outcome.changed[0].dependentFactIds, ['statutory-interest-reference-rate']);

  // The point of the whole process: the figures behind a changed source are no
  // longer known to match it, so the proposal arrives unapproved.
  assert.equal(outcome.approvalCleared, true);
  assert.equal(outcome.proposed.approvedBy, null);
  assert.equal(outcome.proposed.approvedAt, null);
});

test('a failed source keeps its previous values and does not advance freshness', () => {
  // SKILLS.md §7.4: a partial refresh never lets stale data pass as fresh.
  const before = snapshot();
  const outcome = applyFetchResults({
    snapshot: before,
    nowIso: NOW,
    results: [
      { id: 'boe-bank-rate', ok: false, detail: 'HTTP 503' },
      { id: 'lpcda-1998-s6', ok: true, sha256: 'b'.repeat(64) },
    ],
  });

  const boe = outcome.proposed.sources.find((source) => source.id === 'boe-bank-rate');
  assert.equal(boe.status, 'failed');
  assert.equal(boe.sha256, 'a'.repeat(64), 'the previous digest must be kept');
  assert.equal(boe.fetchedAt, '2026-08-01T00:00:00Z', 'a failed source must not look freshly checked');
  // The snapshot's own timestamp does not advance either.
  assert.equal(outcome.proposed.fetchedAt, before.fetchedAt);
  assert.equal(outcome.failed[0].detail, 'HTTP 503');
  // A failure is not a change, so it does not invalidate approval on its own.
  assert.equal(outcome.approvalCleared, false);
});

test('a first digest is recorded as a baseline, not as a change', () => {
  // Without this, the digest would be computed and discarded, and change
  // detection would never start working.
  const before = snapshot({
    sources: [{ id: 'boe-bank-rate', url: 'https://www.bankofengland.co.uk/x', fetchedAt: '2026-08-01T00:00:00Z', status: 'ok' }],
  });
  const outcome = applyFetchResults({
    snapshot: before,
    nowIso: NOW,
    results: [{ id: 'boe-bank-rate', ok: true, sha256: 'd'.repeat(64) }],
  });
  assert.equal(outcome.baselined.length, 1);
  assert.deepEqual(outcome.changed, []);
  // Nothing about the law changed, so approval survives.
  assert.equal(outcome.approvalCleared, false);
  assert.equal(outcome.proposed.approvedBy, 'A Reviewer');
  assert.equal(outcome.proposed.sources[0].sha256, 'd'.repeat(64));
});

test('a result for a non-allowlisted source is refused, not recorded', () => {
  const before = snapshot({
    sources: [{ id: 'rogue', url: 'https://legislation.gov.uk.evil.example/x', fetchedAt: '2026-08-01T00:00:00Z', status: 'ok', sha256: 'e'.repeat(64) }],
  });
  const outcome = applyFetchResults({
    snapshot: before,
    nowIso: NOW,
    results: [{ id: 'rogue', ok: true, sha256: 'f'.repeat(64) }],
  });
  assert.equal(outcome.rejected.length, 1);
  assert.equal(outcome.rejected[0].reason, 'not_allowlisted');
  // The digest is not written, so a source off the allowlist cannot influence
  // the snapshot even if something managed to fetch it.
  assert.equal(outcome.proposed.sources[0].sha256, 'e'.repeat(64));
  assert.deepEqual(outcome.changed, []);
});

test('a source with no result is left exactly as it was', () => {
  const outcome = applyFetchResults({
    snapshot: snapshot(),
    nowIso: NOW,
    results: [{ id: 'boe-bank-rate', ok: true, sha256: 'a'.repeat(64) }],
  });
  const untouched = outcome.proposed.sources.find((source) => source.id === 'lpcda-1998-s6');
  assert.equal(untouched.fetchedAt, '2026-08-01T00:00:00Z');
  assert.equal(untouched.sha256, 'b'.repeat(64));
});

test('the allowlist is the same one the validator enforces', () => {
  assert.equal(isAllowedSourceUrl('https://www.legislation.gov.uk/x'), true);
  assert.equal(isAllowedSourceUrl('https://www.bankofengland.co.uk/x'), true);
  assert.equal(isAllowedSourceUrl('http://legislation.gov.uk/x'), false, 'plain http is refused');
  assert.equal(isAllowedSourceUrl('https://legislation.gov.uk.evil.example/x'), false);
  assert.equal(isAllowedSourceUrl('https://evil.example/legislation.gov.uk'), false);
});

test('dependent facts and conventions are found by citation', () => {
  assert.deepEqual(dependentFactIds(snapshot(), 'boe-bank-rate'), ['statutory-interest-reference-rate']);
  assert.deepEqual(dependentFactIds(snapshot(), 'nothing-cites-this'), []);
  assert.deepEqual(dependentFactIds(null, 'boe-bank-rate'), []);
});

test('the report tells the operator what is required, and never auto-approves', () => {
  const quiet = describeRefresh({ unchanged: ['a', 'b'] });
  assert.match(quiet.join('\n'), /No source content changed/);
  assert.match(quiet.join('\n'), /keeps its current approval state/);

  const changed = describeRefresh({
    changed: [{ id: 'boe-bank-rate', url: 'https://x', previousSha256: 'a'.repeat(64), sha256: 'c'.repeat(64), dependentFactIds: ['statutory-interest-reference-rate'] }],
    approvalCleared: true,
  });
  const text = changed.join('\n');
  assert.match(text, /CHANGED/);
  assert.match(text, /re-verify: statutory-interest-reference-rate/);
  assert.match(text, /Approval has been cleared/);
  assert.match(text, /set approvedBy and/);
  // It is explicit that the disabled state is intended, not a fault.
  assert.match(text, /which is the intended state/);

  const failed = describeRefresh({ failed: [{ id: 'boe-bank-rate', url: 'https://x', detail: 'HTTP 503' }] });
  assert.match(failed.join('\n'), /Previous values kept; fetchedAt not advanced/);

  const baseline = describeRefresh({ baselined: [{ id: 'x', url: 'https://x', sha256: 'd'.repeat(64) }] });
  assert.match(baseline.join('\n'), /BASELINE/);
  assert.match(baseline.join('\n'), /Approval is unaffected/);
});

test('the module reads no clock, no network and no filesystem', async () => {
  // The caller supplies the time and the fetch results, so a refresh is
  // reproducible and testable without touching anything.
  const source = await (await import('node:fs/promises')).readFile(
    new URL('./lawRefresh.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /Date\.now|new Date\(|fetch\(|readFile|writeFile|from 'node:/);
});
