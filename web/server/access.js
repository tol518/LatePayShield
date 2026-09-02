import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// One header, one meaning: the caller presents an operator token that only a
// same-origin page can read. A cross-origin page cannot set it, so this is the
// authorization gate and the cross-site write protection at the same time.
export const OPERATOR_TOKEN_HEADER = 'x-latepay-operator-token';
export const OPERATOR_TOKEN_META = 'latepay-operator-token';
// Case rows written before ownership existed belong to the single local
// operator, so the default loopback setup keeps seeing its own case files.
export const DEFAULT_OPERATOR_ID = 'local-operator';
const OPERATOR_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const MIN_TOKEN_LENGTH = 24;

export class AccessError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AccessError';
    this.status = status;
  }
}

function normalizeHostname(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return '';
  const bracketed = text.match(/^\[(.+)\]$/);
  return bracketed ? bracketed[1] : text;
}

/**
 * Only canonical loopback spellings count. Obfuscated forms such as
 * `0177.0.0.1` or `2130706433` are rejected rather than resolved, because in a
 * Host header they are a rebinding attempt, not an operator address.
 */
export function isLoopbackHostname(value) {
  const host = normalizeHostname(value);
  if (!host) return false;
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (host.startsWith('::ffff:')) return isLoopbackHostname(host.slice('::ffff:'.length));
  if (!/^\d{1,3}(\.\d{1,3}){1,3}$/.test(host)) return false;
  const octets = host.split('.').map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) && octets[0] === 127;
}

function parseOperators(value) {
  const operators = new Map();
  for (const entry of String(value ?? '').split(',')) {
    const pair = entry.trim();
    if (!pair) continue;
    const separator = pair.indexOf(':');
    if (separator <= 0) {
      throw new Error('WEB_OPERATOR_TOKENS entries must be written as operatorId:token.');
    }
    const id = pair.slice(0, separator).trim();
    const token = pair.slice(separator + 1).trim();
    if (!OPERATOR_ID.test(id)) throw new Error(`WEB_OPERATOR_TOKENS operator ID "${id}" is invalid.`);
    if (token.length < MIN_TOKEN_LENGTH) {
      throw new Error(`WEB_OPERATOR_TOKENS token for "${id}" must be at least ${MIN_TOKEN_LENGTH} characters.`);
    }
    if (operators.has(token)) throw new Error('WEB_OPERATOR_TOKENS reuses one token for two operators.');
    operators.set(token, id);
  }
  return operators;
}

function parseOrigins(value) {
  const origins = new Set();
  for (const entry of String(value ?? '').split(',')) {
    const text = entry.trim();
    if (!text) continue;
    let url;
    try {
      url = new URL(text);
    } catch {
      throw new Error(`WEB_ALLOWED_ORIGINS entry "${text}" is not an absolute origin.`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`WEB_ALLOWED_ORIGINS entry "${text}" must use http or https.`);
    }
    origins.add(url.origin);
  }
  return origins;
}

/**
 * Read the network and operator policy for this process. The default is a
 * loopback deployment with one generated token; anything wider has to be
 * configured deliberately.
 */
export function readAccessConfig(env = process.env) {
  const host = env.XAMAN_SERVER_HOST ?? '127.0.0.1';
  const loopbackOnly = isLoopbackHostname(host);
  const configuredOperators = parseOperators(env.WEB_OPERATOR_TOKENS);
  const operators = new Map(configuredOperators);
  const allowedOrigins = parseOrigins(env.WEB_ALLOWED_ORIGINS);

  let generatedToken = null;
  if (loopbackOnly && operators.size === 0) {
    generatedToken = randomBytes(32).toString('hex');
    operators.set(generatedToken, DEFAULT_OPERATOR_ID);
  }

  return {
    host,
    loopbackOnly,
    authenticatedDeployment: env.WEB_AUTHENTICATED_DEPLOYMENT === 'true',
    configuredOperatorCount: configuredOperators.size,
    operators,
    allowedOrigins,
    generatedToken,
    // The served page may carry a token only where reaching the page already
    // means being the local operator. A shared deployment must distribute
    // operator tokens out of band instead.
    browserToken: loopbackOnly ? (generatedToken ?? [...operators.keys()][0] ?? null) : null,
  };
}

/** Refuse an unsafe bind before the socket is opened. Returns null when safe. */
export function describeBindRefusal(config) {
  if (config.loopbackOnly) return null;
  if (!config.authenticatedDeployment) {
    return `Refusing to bind XAMAN_SERVER_HOST=${config.host}: a non-loopback bind requires WEB_AUTHENTICATED_DEPLOYMENT=true.`;
  }
  if (config.configuredOperatorCount === 0) {
    return `Refusing to bind XAMAN_SERVER_HOST=${config.host}: an authenticated deployment requires WEB_OPERATOR_TOKENS.`;
  }
  if (config.allowedOrigins.size === 0) {
    return `Refusing to bind XAMAN_SERVER_HOST=${config.host}: an authenticated deployment requires WEB_ALLOWED_ORIGINS.`;
  }
  return null;
}

function originAllowed(origin, config) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (config.loopbackOnly) {
    // The Vite dev server proxies from its own loopback port, so the port is
    // not pinned here. An attacker-controlled page is never a loopback origin.
    return (url.protocol === 'http:' || url.protocol === 'https:') && isLoopbackHostname(url.hostname);
  }
  return config.allowedOrigins.has(url.origin);
}

function hostHeaderAllowed(header, config) {
  const value = String(header ?? '').trim();
  if (!value) return false;
  let url;
  try {
    url = new URL(`http://${value}`);
  } catch {
    return false;
  }
  if (!url.hostname || url.pathname !== '/' || url.username || url.password) return false;
  if (config.loopbackOnly) return isLoopbackHostname(url.hostname);
  return [...config.allowedOrigins].some((origin) => new URL(origin).host === url.host);
}

/**
 * Network policy for every request, including the static frontend: the peer,
 * the Host header, and any Origin header must all belong to this deployment.
 * A state-changing request from another origin is rejected whatever its
 * Content-Type, because the check never looks at the body.
 */
export function authorizeNetwork(request, config) {
  if (config.loopbackOnly && !isLoopbackHostname(request.socket?.remoteAddress)) {
    throw new AccessError(403, 'This service accepts local requests only.');
  }
  if (!hostHeaderAllowed(request.headers.host, config)) {
    throw new AccessError(403, 'Unexpected Host header for this deployment.');
  }
  const origin = request.headers.origin;
  if (origin !== undefined && !originAllowed(origin, config)) {
    throw new AccessError(403, 'This request came from an origin that is not allowed to use the service.');
  }
}

function matchOperator(presented, config) {
  const presentedDigest = createHash('sha256').update(presented).digest();
  for (const [token, id] of config.operators) {
    const digest = createHash('sha256').update(token).digest();
    if (timingSafeEqual(presentedDigest, digest)) return id;
  }
  return null;
}

/** Resolve the authenticated operator for an API request, or refuse it. */
export function authorizeOperator(request, config) {
  const presented = String(request.headers[OPERATOR_TOKEN_HEADER] ?? '').trim();
  if (!presented) {
    throw new AccessError(401, 'This request needs an operator token. Open the service page it serves, or set WEB_OPERATOR_TOKENS and send the token header.');
  }
  const operatorId = matchOperator(presented, config);
  if (!operatorId) throw new AccessError(401, 'The operator token was not recognised.');
  return operatorId;
}

/** Put the loopback operator token in the served page so the UI can use it. */
export function injectOperatorToken(html, config) {
  if (!config.browserToken) return html;
  const tag = `<meta name="${OPERATOR_TOKEN_META}" content="${config.browserToken}">`;
  return html.includes('<head>') ? html.replace('<head>', `<head>${tag}`) : `${tag}${html}`;
}
