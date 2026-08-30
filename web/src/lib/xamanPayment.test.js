import test from 'node:test';
import assert from 'node:assert/strict';
import { xamanPaymentDispatchError } from './xamanPayment.js';

test('explains a redundant self-payment without exposing a raw XRPL code', () => {
  const address = 'rMdu1DGL5FWZCzVyjEohydyMwLKvyARVDK';
  const message = xamanPaymentDispatchError({
    account: address,
    dispatchResult: 'temREDUNDANT',
  }, address);

  assert.match(message, /same account/i);
  assert.match(message, /different Testnet payer account/i);
  assert.doesNotMatch(message, /temREDUNDANT/);
});

test('keeps successful and pending Xaman dispatch states non-errors', () => {
  assert.equal(xamanPaymentDispatchError({ dispatchResult: null }, 'rDestination'), null);
  assert.equal(xamanPaymentDispatchError({ dispatchResult: 'tesSUCCESS' }, 'rDestination'), null);
});

test('preserves an unfamiliar XRPL dispatch result for diagnosis', () => {
  assert.match(
    xamanPaymentDispatchError({ dispatchResult: 'tefPAST_SEQ' }, 'rDestination'),
    /tefPAST_SEQ/,
  );
});
