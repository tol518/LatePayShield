import test from 'node:test';
import assert from 'node:assert/strict';
import { getPaymentDestination, getPaymentTransactionHash, savePaymentDestination, savePaymentTransactionHash } from './paymentInstructions.js';

test('persists only a payment destination by agreement id', () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };

  savePaymentDestination(4, 'rhpckf1fvsoxXozyddp2GLRekbzu5ymw7G');
  savePaymentTransactionHash(4, '397a2598098df01b2252741906724fa6b81c7b13664fc45d2bd8560ab264b47a');
  assert.equal(getPaymentDestination(4), 'rhpckf1fvsoxXozyddp2GLRekbzu5ymw7G');
  assert.equal(getPaymentTransactionHash(4), '397A2598098DF01B2252741906724FA6B81C7B13664FC45D2BD8560AB264B47A');
  assert.equal(getPaymentDestination(5), null);
});
