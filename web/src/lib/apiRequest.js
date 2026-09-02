// The local service authorizes each API call with an operator token. The page
// it serves carries that token in a meta tag, so only same-origin code can
// read it; a cross-origin page can neither read it nor set the header.
export const OPERATOR_TOKEN_HEADER = 'X-LatePay-Operator-Token';
const OPERATOR_TOKEN_META = 'latepay-operator-token';

export function operatorToken() {
  if (typeof document === 'undefined') return '';
  return document.querySelector(`meta[name="${OPERATOR_TOKEN_META}"]`)?.content?.trim() ?? '';
}

/** Same-origin fetch that presents this operator's token. */
export function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const token = operatorToken();
  if (token) headers.set(OPERATOR_TOKEN_HEADER, token);
  return fetch(path, { ...options, headers, credentials: 'same-origin' });
}

/**
 * Turn an authorization refusal into language an operator can act on, instead
 * of a bare HTTP code.
 */
export function describeApiFailure(status, message, serviceName) {
  if (message) return message;
  if (status === 401) {
    return `${serviceName} did not accept this browser session. Reload the page served by the local service, or check WEB_OPERATOR_TOKENS.`;
  }
  if (status === 403) {
    return `${serviceName} refused this request because it did not come from an allowed local origin.`;
  }
  return `${serviceName} returned HTTP ${status}.`;
}
