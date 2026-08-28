/* Browser-local payment routing data.
 *
 * The contract intentionally stores only the XRPL destination hash. Keeping
 * just the original r-address locally lets its creator resume a payment after
 * a refresh without putting invoice names, payer names, or wallet secrets in
 * browser storage. A different browser/device must enter the r-address again.
 */

const STORAGE_KEY = 'latepay-payment-destinations-v1';

function readAll() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getPaymentDestination(agreementId) {
  return readAll()[String(agreementId)]?.destination ?? null;
}

export function getPaymentTransactionHash(agreementId) {
  return readAll()[String(agreementId)]?.transactionHash ?? null;
}

export function getFdcVerificationJobId(agreementId) {
  return readAll()[String(agreementId)]?.fdcJobId ?? null;
}

export function savePaymentDestination(agreementId, destination) {
  const all = readAll();
  all[String(agreementId)] = { ...all[String(agreementId)], destination, savedAt: new Date().toISOString() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function savePaymentTransactionHash(agreementId, transactionHash) {
  const all = readAll();
  all[String(agreementId)] = {
    ...all[String(agreementId)],
    transactionHash: transactionHash.replace(/^0x/i, '').toUpperCase(),
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function saveFdcVerificationJobId(agreementId, fdcJobId) {
  const all = readAll();
  all[String(agreementId)] = {
    ...all[String(agreementId)],
    fdcJobId,
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
