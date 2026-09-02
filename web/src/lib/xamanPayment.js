import { apiFetch, describeApiFailure } from './apiRequest.js';

async function request(path, options) {
  const response = await apiFetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(describeApiFailure(response.status, payload.error, 'The payment service'));
  return payload;
}

export function fetchXamanAvailability() {
  return request('/api/xaman/health');
}

export function createXamanPayment(agreementId, criteria) {
  return request('/api/xaman/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agreementId,
      destination: criteria.destination,
      destinationTag: criteria.destinationTag,
      amountDrops: criteria.expectedDrops.toString(),
      dueAt: criteria.dueAt,
    }),
  });
}

export function fetchXamanPaymentStatus(id) {
  return request(`/api/xaman/payments/${encodeURIComponent(id)}`);
}

export function createXamanWalletConnection() {
  return request('/api/xaman/wallet-connections', { method: 'POST' });
}

export function fetchXamanWalletConnectionStatus(id) {
  return request(`/api/xaman/wallet-connections/${encodeURIComponent(id)}`);
}

export function fetchXrplAgreementDefaults() {
  return request('/api/xrpl/agreement-defaults');
}

export function xamanPaymentDispatchError(status, destination) {
  const result = status?.dispatchResult;
  if (!result || result === 'tesSUCCESS') return null;

  const payer = String(status?.account ?? '').trim();
  const receiver = String(destination ?? '').trim();
  if (result === 'temREDUNDANT') {
    return payer && receiver && payer === receiver
      ? 'This Xaman account is also the supplier receiving account. XRPL does not allow an XRP payment to the same account. Choose a different Testnet payer account in Xaman.'
      : 'XRPL rejected this payment as redundant. This usually means the payer and receiving account are the same. Choose a different Testnet payer account in Xaman.';
  }

  return `Xaman signed the payment, but XRPL submission returned ${result}.`;
}
