async function request(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Payment service returned HTTP ${response.status}.`);
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
