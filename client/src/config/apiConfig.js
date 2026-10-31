/**
 * ActionFlow AI — Centralized Frontend API, Session & WebSocket Configuration
 *
 * Single source of truth for all backend HTTP and WebSocket URLs and session identity.
 * - Production API Base URL: https://demo-51qr.onrender.com
 * - Development API Base URL: http://localhost:3001
 * - Production WebSocket URL: wss://demo-51qr.onrender.com/ws
 * - Development WebSocket URL: ws://localhost:3001/ws
 *
 * Prevents relative same-origin requests to Vercel, window.location.origin fallbacks,
 * and duplicate /api/v1 prefixes.
 */

const PRODUCTION_FALLBACK_URL = 'https://demo-51qr.onrender.com';
const DEVELOPMENT_FALLBACK_URL = 'http://localhost:3001';
const SESSION_STORAGE_KEY = 'actionflow_session_id';

/**
 * Normalizes a base URL by removing trailing slashes and any accidental
 * trailing /api or /api/v1 suffix so endpoints never duplicate /api/v1.
 */
export function normalizeBaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let cleaned = rawUrl.trim().replace(/\/+$/, '');
  cleaned = cleaned.replace(/\/api\/v1$/i, '').replace(/\/api$/i, '');
  return cleaned.replace(/\/+$/, '');
}

/**
 * Resolves a single stable session ID across all frontend services, WebSocket connections,
 * and OAuth redirects. Preserves existing session IDs without overwriting them unexpectedly.
 */
export function resolveSessionId(locationOverride = null, storageOverride = null) {
  const loc = locationOverride || (typeof window !== 'undefined' ? window.location : null);
  const store = storageOverride || (typeof window !== 'undefined' ? window.localStorage : null);

  if (!loc && !store) return 'server_session';

  try {
    const existingStored = store?.getItem(SESSION_STORAGE_KEY)?.trim() || '';

    if (loc?.search) {
      const urlParams = new URLSearchParams(loc.search);
      const redirectSession = urlParams.get('sessionId')?.trim() || '';
      // Adopt redirectSession if valid and not an ephemeral server fallback overwriting a client session
      if (
        redirectSession &&
        redirectSession !== 'default_session' &&
        (!existingStored || !redirectSession.startsWith('ses_'))
      ) {
        store?.setItem(SESSION_STORAGE_KEY, redirectSession);
        return redirectSession;
      }
    }

    if (existingStored) {
      return existingStored;
    }

    const generated = `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    store?.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'default_client_session';
  }
}

export const SESSION_ID = resolveSessionId();

export function getSessionId() {
  return resolveSessionId();
}

export function resolveApiConfig(envOverride = null, locationOverride = null) {
  const env = envOverride || (typeof import.meta !== 'undefined' && import.meta.env) || {};
  const isProdBuild = Boolean(env.PROD);
  const rawEnvUrl = env.VITE_API_BASE_URL || env.VITE_API_URL || '';
  const normalizedEnvUrl = normalizeBaseUrl(rawEnvUrl);

  const loc = locationOverride || (typeof window !== 'undefined' ? window.location : null);
  const isBrowserLocalhost = Boolean(
    loc && /^(localhost|127\.0\.0\.1)$/i.test(loc.hostname || '')
  );
  const isDeployedBrowser = Boolean(loc && !isBrowserLocalhost);

  let configWarning = null;
  let baseUrl = normalizedEnvUrl;

  // Guard against accidental configuration pointing to the Vercel frontend domain or localhost when deployed
  if (baseUrl && isDeployedBrowser) {
    if (
      (loc.hostname && baseUrl.includes(loc.hostname)) ||
      /vercel\.app/i.test(baseUrl) ||
      /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl)
    ) {
      configWarning = `VITE_API_BASE_URL ("${baseUrl}") is invalid for deployed production origin "${loc.hostname}". Routing to ${PRODUCTION_FALLBACK_URL}.`;
      console.error(`[ActionFlow API Config] ${configWarning}`);
      baseUrl = PRODUCTION_FALLBACK_URL;
    }
  }

  if (!baseUrl) {
    if (isProdBuild || isDeployedBrowser) {
      configWarning = `VITE_API_BASE_URL was not set in environment; using production Render backend (${PRODUCTION_FALLBACK_URL}).`;
      baseUrl = PRODUCTION_FALLBACK_URL;
    } else {
      baseUrl = DEVELOPMENT_FALLBACK_URL;
    }
  }

  // Derive WebSocket base URL (https:// -> wss://, http:// -> ws://)
  const wsProtocolUrl = baseUrl
    .replace(/^https:\/\//i, 'wss://')
    .replace(/^http:\/\//i, 'ws://');
  const wsBaseUrl = `${wsProtocolUrl}/ws`;

  return {
    apiBaseUrl: baseUrl,
    apiV1BaseUrl: `${baseUrl}/api/v1`,
    healthUrl: `${baseUrl}/health`,
    wsBaseUrl,
    isProdBuild,
    isDeployedBrowser,
    configuredEnvUrl: normalizedEnvUrl || null,
    configWarning
  };
}

const resolved = resolveApiConfig();

export const API_BASE_URL = resolved.apiBaseUrl;
export const API_V1_BASE_URL = resolved.apiV1BaseUrl;
export const HEALTH_URL = resolved.healthUrl;
export const WS_BASE_URL = resolved.wsBaseUrl;
export const IS_PROD_BUILD = resolved.isProdBuild || resolved.isDeployedBrowser;
export const API_CONFIG_WARNING = resolved.configWarning;

if (typeof window !== 'undefined' && !Boolean(import.meta.env?.VITEST)) {
  console.info('[ActionFlow Config]', {
    apiBaseUrl: API_BASE_URL,
    apiV1BaseUrl: API_V1_BASE_URL,
    healthUrl: HEALTH_URL,
    wsBaseUrl: WS_BASE_URL,
    sessionId: SESSION_ID,
    configuredEnvUrl: resolved.configuredEnvUrl,
    isProdBuild: resolved.isProdBuild,
    configWarning: API_CONFIG_WARNING
  });
}

/**
 * Constructs a full backend URL from any endpoint path.
 * Safely handles:
 * - '/health' -> `${API_BASE_URL}/health`
 * - '/api/v1/...' -> `${API_BASE_URL}/api/v1/...`
 * - '/voice/command' -> `${API_BASE_URL}/api/v1/voice/command`
 */
export function buildApiUrl(path, baseOverride = null) {
  const baseUrl = baseOverride ? normalizeBaseUrl(baseOverride) : API_BASE_URL;
  const v1BaseUrl = `${baseUrl}/api/v1`;

  if (!path || typeof path !== 'string') return v1BaseUrl;
  const trimmed = path.trim();

  // If already an absolute http(s) URL, return as-is
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  if (normalizedPath === '/health' || normalizedPath.startsWith('/health?')) {
    return `${baseUrl}${normalizedPath}`;
  }

  if (normalizedPath.startsWith('/api/v1/') || normalizedPath === '/api/v1') {
    return `${baseUrl}${normalizedPath}`;
  }

  if (normalizedPath.startsWith('/api/')) {
    return `${baseUrl}${normalizedPath}`;
  }

  return `${v1BaseUrl}${normalizedPath}`;
}

/**
 * Constructs the full backend WebSocket URL (`wss://demo-51qr.onrender.com/ws?sessionId=...`)
 */
export function buildWebSocketUrl(sessionId = SESSION_ID, wsBaseOverride = null) {
  const wsBase = wsBaseOverride || WS_BASE_URL;
  const resolvedSession = sessionId || SESSION_ID;
  if (!resolvedSession) return wsBase;
  return `${wsBase}?sessionId=${encodeURIComponent(resolvedSession)}`;
}

/**
 * Centralized fetch wrapper that always targets the configured backend API
 * and attaches the unified X-Session-ID header.
 */
export async function apiFetch(path, options = {}) {
  const url = buildApiUrl(path);
  const headers = {
    'X-Session-ID': getSessionId(),
    ...(options.headers || {})
  };
  return fetch(url, { ...options, headers });
}
