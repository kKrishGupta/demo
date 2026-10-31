/**
 * ActionFlow AI — Centralized Frontend API & WebSocket Configuration
 *
 * Single source of truth for all backend HTTP and WebSocket URLs.
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
    configuredEnvUrl: normalizedEnvUrl || null,
    configWarning
  };
}

const resolved = resolveApiConfig();

export const API_BASE_URL = resolved.apiBaseUrl;
export const API_V1_BASE_URL = resolved.apiV1BaseUrl;
export const HEALTH_URL = resolved.healthUrl;
export const WS_BASE_URL = resolved.wsBaseUrl;
export const API_CONFIG_WARNING = resolved.configWarning;

if (typeof window !== 'undefined' && !Boolean(import.meta.env?.VITEST)) {
  console.info('[ActionFlow Config]', {
    apiBaseUrl: API_BASE_URL,
    apiV1BaseUrl: API_V1_BASE_URL,
    healthUrl: HEALTH_URL,
    wsBaseUrl: WS_BASE_URL,
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
export function buildWebSocketUrl(sessionId, wsBaseOverride = null) {
  const wsBase = wsBaseOverride || WS_BASE_URL;
  if (!sessionId) return wsBase;
  return `${wsBase}?sessionId=${encodeURIComponent(sessionId)}`;
}

/**
 * Centralized fetch wrapper that always targets the configured backend API.
 */
export async function apiFetch(path, options = {}) {
  const url = buildApiUrl(path);
  return fetch(url, options);
}
