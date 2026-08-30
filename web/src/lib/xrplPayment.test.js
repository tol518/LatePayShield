import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeXrplTransactionHash,
  validateXrplPayment,
  waitForValidatedXrplPayment,
} from './xrplPayment.js';

const payment = {
  Account: 'rPayer',
  Amount: '2000000',
  Destination: 'rMdu1DGL5FWZCzVyjEohydyMwLKvyARVDK',
  DestinationTag: 1001,
  TransactionType: 'Payment',
  date: 841173140,
  hash: '54D07290376AD5060B0E6EA72FE0E3915926B436B38BCB334B56627917BAE8AE',
  ledger_index: 20269108,
  meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '2000000' },
  validated: true,
};

const criteria = {
  destination: 'rMdu1DGL5FWZCzVyjEohydyMwLKvyARVDK',
  destinationTag: 1001,
  expectedDrops: 2000000n,
  startLedger: 20268580,
  dueAt: 1788460560,
};

test('accepts the real paid-path transaction facts when every criterion matches', () => {
  const result = validateXrplPayment(payment, criteria);
  assert.equal(result.hash, payment.hash);
  assert.equal(result.ledgerIndex, 20269108);
  assert.equal(result.receivedDrops, 2000000n);
});

test('rejects a transaction sent to a different destination', () => {
  assert.throws(
    () => validateXrplPayment(payment, { ...criteria, destination: 'rDifferentDestination' }),
    /destination does not match/,
  );
});

test('normalizes the transaction id returned by Xaman', () => {
  assert.equal(
    normalizeXrplTransactionHash(`  0x${payment.hash.toLowerCase()}  `),
    payment.hash,
  );
});

test('keeps polling while a newly submitted Xaman payment is not indexed', async () => {
  let calls = 0;
  const waits = [];
  const result = await waitForValidatedXrplPayment(payment.hash, criteria, {
    attempts: 4,
    intervalMs: 3_000,
    fetchPayment: async () => {
      calls += 1;
      if (calls < 3) throw new Error('That transaction was not found on XRPL Testnet.');
      return { hash: payment.hash };
    },
    wait: async (duration) => { waits.push(duration); },
  });

  assert.equal(result.hash, payment.hash);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [3_000, 3_000]);
});

test('does not retry a permanent payment mismatch', async () => {
  let calls = 0;
  await assert.rejects(
    waitForValidatedXrplPayment(payment.hash, criteria, {
      attempts: 4,
      fetchPayment: async () => {
        calls += 1;
        throw new Error('The payment destination does not match this agreement.');
      },
      wait: async () => {},
    }),
    /destination does not match/,
  );
  assert.equal(calls, 1);
});
