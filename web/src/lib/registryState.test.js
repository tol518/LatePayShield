import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_REGISTRY_STATE,
  POLL_ACTIVE_MS,
  POLL_SETTLED_MS,
  nextRegistryState,
  pollIntervalFor,
  shouldPoll,
} from './registryState.js';

const READY = {
  ok: true,
  registry: { nextAgreementId: 15 },
  agreements: [{ id: 14, uiStatus: 'PAID_VERIFIED' }],
};

test('a successful read replaces the data and clears any error', () => {
  const state = nextRegistryState(INITIAL_REGISTRY_STATE, READY);
  assert.equal(state.phase, 'ready');
  assert.equal(state.registry.nextAgreementId, 15);
  assert.equal(state.agreements.length, 1);
  assert.equal(state.error, null);
  assert.equal(state.stale, false);
});

test('a later read showing a changed status simply replaces the earlier one', () => {
  // This is the whole point of polling: the contract changed, so the screen
  // changes. Nothing here can move a status the chain has not moved.
  const awaiting = nextRegistryState(INITIAL_REGISTRY_STATE, {
    ok: true,
    registry: { nextAgreementId: 15 },
    agreements: [{ id: 14, uiStatus: 'AWAITING_PAYMENT' }],
  });
  const verified = nextRegistryState(awaiting, READY);
  assert.equal(verified.agreements[0].uiStatus, 'PAID_VERIFIED');
  assert.equal(verified.stale, false);
});

test('a first read that fails is a failure state, not an empty registry', () => {
  // docs/ui-language.md: a failure must never read as "no agreements".
  const state = nextRegistryState(INITIAL_REGISTRY_STATE, { ok: false, error: 'RPC unreachable' });
  assert.equal(state.phase, 'failed');
  assert.equal(state.registry, null);
  assert.deepEqual(state.agreements, []);
  assert.equal(state.error, 'RPC unreachable');
});

test('a failed poll keeps the last good data and marks it stale', () => {
  const good = nextRegistryState(INITIAL_REGISTRY_STATE, READY);
  const hiccup = nextRegistryState(good, { ok: false, error: 'RPC unreachable' });

  // The agreement the user is reading stays on screen...
  assert.equal(hiccup.phase, 'ready');
  assert.equal(hiccup.agreements.length, 1);
  assert.equal(hiccup.registry.nextAgreementId, 15);
  // ...but it no longer claims to be current.
  assert.equal(hiccup.stale, true);
  assert.equal(hiccup.error, 'RPC unreachable');
});

test('recovering from a failed poll clears the stale flag', () => {
  const good = nextRegistryState(INITIAL_REGISTRY_STATE, READY);
  const hiccup = nextRegistryState(good, { ok: false, error: 'RPC unreachable' });
  const recovered = nextRegistryState(hiccup, READY);
  assert.equal(recovered.stale, false);
  assert.equal(recovered.error, null);
});

test('a failure after a real empty registry keeps the empty result, not a blank', () => {
  // An empty registry is a legitimate ready state, so a later failure must
  // preserve it rather than reverting to the failure page.
  const empty = nextRegistryState(INITIAL_REGISTRY_STATE, {
    ok: true,
    registry: { nextAgreementId: 1 },
    agreements: [],
  });
  assert.equal(empty.phase, 'ready');
  const hiccup = nextRegistryState(empty, { ok: false, error: 'RPC unreachable' });
  assert.equal(hiccup.phase, 'ready');
  assert.equal(hiccup.stale, true);
  assert.deepEqual(hiccup.agreements, []);
});

test('a failure with no message still says something', () => {
  const state = nextRegistryState(INITIAL_REGISTRY_STATE, { ok: false });
  assert.equal(state.phase, 'failed');
  assert.match(state.error, /could not be reached/);
});

test('missing arguments do not throw', () => {
  assert.equal(nextRegistryState(undefined, { ok: false, error: 'x' }).phase, 'failed');
  assert.equal(nextRegistryState(undefined, undefined).phase, 'failed');
});

test('polling waits for the first read and pauses on a hidden tab', () => {
  // Nothing to refresh before the first read resolves.
  assert.equal(shouldPoll({ phase: 'loading', documentHidden: false }), false);
  // A hidden tab has nobody to inform, so no RPC call is worth making.
  assert.equal(shouldPoll({ phase: 'ready', documentHidden: true }), false);
  assert.equal(shouldPoll({ phase: 'failed', documentHidden: true }), false);
  // Visible and settled: poll, including after a failure so it can recover.
  assert.equal(shouldPoll({ phase: 'ready', documentHidden: false }), true);
  assert.equal(shouldPoll({ phase: 'failed', documentHidden: false }), true);
});

test('the poll interval follows whether anything can still change', () => {
  // Only `Active` (contract status 1) can move; paid, overdue and disputed are
  // terminal, so a faster poll on a settled registry buys nothing and each poll
  // costs 3 + N RPC calls.
  assert.equal(pollIntervalFor([{ contractStatusOrdinal: 1 }]), POLL_ACTIVE_MS);
  assert.equal(
    pollIntervalFor([{ contractStatusOrdinal: 2 }, { contractStatusOrdinal: 1 }]),
    POLL_ACTIVE_MS,
    'one active agreement is enough to keep the fast cadence',
  );

  for (const settled of [
    [{ contractStatusOrdinal: 2 }],
    [{ contractStatusOrdinal: 3 }],
    [{ contractStatusOrdinal: 4 }],
    [{ contractStatusOrdinal: 2 }, { contractStatusOrdinal: 3 }],
  ]) {
    assert.equal(pollIntervalFor(settled), POLL_SETTLED_MS, JSON.stringify(settled));
  }
});

test('an empty or unusable agreement list polls at the slow cadence', () => {
  // Nothing to watch, and a malformed read must not be an excuse to hammer the
  // endpoint.
  for (const input of [[], null, undefined, 'agreements', [{}], [{ contractStatusOrdinal: null }]]) {
    assert.equal(pollIntervalFor(input), POLL_SETTLED_MS, JSON.stringify(input));
  }
});

test('the fast cadence is slower than an FDC round, by design', () => {
  // Polling cannot reveal an outcome before the voting round finalises, which
  // takes minutes. The fast interval exists to surface a change that already
  // happened, not to chase one that has not.
  assert.ok(POLL_ACTIVE_MS >= 1_000, 'never poll faster than once a second');
  assert.ok(POLL_SETTLED_MS > POLL_ACTIVE_MS);
});
