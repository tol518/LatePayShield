async function request(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `FDC service returned HTTP ${response.status}.`);
  return payload;
}

/** Start the server-side, testnet-only FDC workflow for a matching XRPL payment. */
export function startFdcPaymentVerification(agreementId, transactionHash) {
  return request('/api/fdc/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agreementId, transactionHash }),
  });
}

/** Read the current state of one server-side FDC verification job. */
export function fetchFdcPaymentVerification(id) {
  return request(`/api/fdc/jobs/${encodeURIComponent(id)}`);
}
