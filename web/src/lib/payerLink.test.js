import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayerLink, readPayerLink } from './payerLink.js';

const APP = 'https://latepay.example/app';

test('builds a payer link that lands on the agreement awaiting payment', () => {
  const link = buildPayerLink(4, 'rhpckf1fvsoxXozyddp2GLRekbzu5ymw7G', `${APP}#prepare`);
  const url = new URL(link);

  assert.equal(url.searchParams.get('agreement'), '4');
  assert.equal(url.searchParams.get('destination'), 'rhpckf1fvsoxXozyddp2GLRekbzu5ymw7G');
  // The supplier may be anywhere on the page when they copy the link; the payer
  // still has to arrive at the registry.
  assert.equal(url.hash, '#registry');
});

test('reads back an agreement and its claimed destination', () => {
  const link = buildPayerLink(12, 'rhpckf1fvsoxXozyddp2GLRekbzu5ymw7G', APP);
  assert.deepEqual(readPayerLink(link), {
    agreementId: 12,
    destination: 'rhpckf1fvsoxXozyddp2GLRekbzu5ymw7G',
  });
});

test('ignores an ordinary visit and a malformed agreement id', () => {
  assert.equal(readPayerLink(APP), null);
  assert.equal(readPayerLink(`${APP}#registry`), null);
  assert.equal(readPayerLink(`${APP}?agreement=`), null);
  assert.equal(readPayerLink(`${APP}?agreement=abc`), null);
  assert.equal(readPayerLink('not a url'), null);
});

test('surfaces a destination-less link rather than inventing an address', () => {
  assert.deepEqual(readPayerLink(`${APP}?agreement=9`), { agreementId: 9, destination: '' });
});
