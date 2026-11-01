/**
 * ActionFlow — Outbound Network Resilience
 *
 * Fixes intermittent "fetch failed" errors when calling Google APIs
 * (OAuth token refresh, Calendar events.insert, etc.) on unstable networks.
 *
 * Root cause observed: Node's fetch failed with UND_ERR_CONNECT_TIMEOUT /
 * ENOTFOUND while the machine's DNS returned IPv6 addresses first over a
 * network whose IPv6 route is unreliable.
 *
 * 1. Prefer IPv4 addresses when resolving hostnames.
 * 2. Retry requests that failed BEFORE reaching the server (DNS / connect
 *    phase). These are always safe to retry, even for POST, because no bytes
 *    of the request were delivered.
 * 3. Replace the opaque "fetch failed" message with the real cause
 *    (e.g. "fetch failed: UND_ERR_CONNECT_TIMEOUT (www.googleapis.com)").
 */

import dns from 'node:dns';

// Errors raised before the request reached the remote server
const CONNECT_PHASE_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENETDOWN'
]);

// Fast-failing errors get more retries than slow (10s) connect timeouts
const MAX_RETRIES_FAST = 2;
const MAX_RETRIES_TIMEOUT = 1;

function getCauseCode(err) {
  return err?.cause?.code || err?.cause?.cause?.code || err?.code || null;
}

function getHost(input) {
  try {
    const url = typeof input === 'string' ? input : (input?.url || String(input));
    return new URL(url).host;
  } catch {
    return 'unknown-host';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let installed = false;

export function installNetworkResilience() {
  if (installed || typeof globalThis.fetch !== 'function') return;
  installed = true;

  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {
    // Older Node versions — ignore
  }

  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function resilientFetch(input, init) {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await nativeFetch(input, init);
      } catch (err) {
        const code = getCauseCode(err);
        const host = getHost(input);
        const aborted = err?.name === 'AbortError' || init?.signal?.aborted;
        const maxRetries = code === 'UND_ERR_CONNECT_TIMEOUT' ? MAX_RETRIES_TIMEOUT : MAX_RETRIES_FAST;

        if (!aborted && CONNECT_PHASE_CODES.has(code) && attempt < maxRetries) {
          attempt++;
          const delay = 400 * attempt;
          console.warn(`[Network] ${code} reaching ${host} — retry ${attempt}/${maxRetries} in ${delay}ms`);
          await sleep(delay);
          continue;
        }

        if (code && err && typeof err.message === 'string' && !err.message.includes(code)) {
          try {
            err.message = `${err.message}: ${code} (${host}) — check internet / DNS / VPN connectivity`;
          } catch {
            // message not writable — ignore
          }
        }
        throw err;
      }
    }
  };

  console.log('[Network] Outbound resilience enabled (IPv4-first DNS, connect-phase retries).');
}

