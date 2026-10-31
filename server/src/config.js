/**
 * ActionFlow Server — Centralized Configuration
 * All environment variables accessed through this module.
 * Never access process.env directly elsewhere.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load server/.env regardless of process.cwd()
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback to current working directory .env if present

function requireEnv(key, fallback) {
  const val = process.env[key];
  if (!val && fallback === undefined) {
    console.warn(`[Config] Warning: ${key} is not set.`);
  }
  return val ? val.trim() : (fallback || '');
}

export const config = {
  server: {
    port: parseInt((process.env.PORT || '3001').trim(), 10),
    nodeEnv: (process.env.NODE_ENV || 'development').trim(),
    isDev: (process.env.NODE_ENV || 'development').trim() === 'development'
  },

  gemini: {
    apiKey: (process.env.GEMINI_API_KEY || '').trim(),
    model: (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim(),
    timeoutMs: parseInt((process.env.GEMINI_TIMEOUT_MS || '15000').trim(), 10),
    maxRetries: parseInt((process.env.GEMINI_MAX_RETRIES || '3').trim(), 10),
    isAvailable: Boolean((process.env.GEMINI_API_KEY || '').trim())
  },

  whisper: {
    apiKey: (process.env.OPENAI_API_KEY || process.env.WHISPER_API_KEY || '').trim(),
    endpoint: (process.env.WHISPER_ENDPOINT || 'https://api.openai.com/v1/audio/transcriptions').trim(),
    model: (process.env.WHISPER_MODEL || 'whisper-1').trim(),
    isAvailable: Boolean((process.env.OPENAI_API_KEY || process.env.WHISPER_API_KEY || '').trim())
  },

  redis: {
    url: (process.env.REDIS_URL || '').trim(),
    cacheTtlSeconds: parseInt((process.env.REDIS_CACHE_TTL_SECONDS || '300').trim(), 10),
    isAvailable: Boolean((process.env.REDIS_URL || '').trim())
  },

  whatsapp: {
    provider: (process.env.WHATSAPP_PROVIDER || 'none').trim(),
    cloudApi: {
      phoneNumberId: (process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID || '').trim(),
      accessToken: (process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
      webhookVerifyToken: (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'actionflow_wa_verify_token').trim(),
      appSecret: (process.env.WHATSAPP_APP_SECRET || '').trim(),
      apiVersion: (process.env.WHATSAPP_API_VERSION || 'v20.0').trim(),
      isConfigured: Boolean(
        (process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID || '').trim() &&
        (process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '').trim()
      )
    },
    twilio: {
      accountSid: (process.env.TWILIO_ACCOUNT_SID || '').trim(),
      authToken: (process.env.TWILIO_AUTH_TOKEN || '').trim(),
      from: (process.env.TWILIO_WHATSAPP_FROM || '').trim(),
      isConfigured: Boolean(
        (process.env.TWILIO_ACCOUNT_SID || '').trim() &&
        (process.env.TWILIO_AUTH_TOKEN || '').trim() &&
        (process.env.TWILIO_WHATSAPP_FROM || '').trim()
      )
    },
    isAvailable: Boolean(
      ((process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID || '').trim() &&
       (process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '').trim()) ||
      ((process.env.TWILIO_ACCOUNT_SID || '').trim() &&
       (process.env.TWILIO_AUTH_TOKEN || '').trim())
    )
  },

  googleCalendar: {
    clientId: (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID || '').trim(),
    clientSecret: (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim(),
    redirectUri: (process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback').trim(),
    calendarId: (process.env.GOOGLE_CALENDAR_ID || 'primary').trim(),
    isAvailable: Boolean((process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID || '').trim())
  },

  security: {
    apiSecretKey: (process.env.API_SECRET_KEY || 'dev-secret-change-in-prod').trim(),
    encryptionKey: (process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef').trim(),
    rateLimitWindowMs: parseInt((process.env.RATE_LIMIT_WINDOW_MS || '60000').trim(), 10),
    rateLimitMaxRequests: parseInt((process.env.RATE_LIMIT_MAX_REQUESTS || '100').trim(), 10)
  },

  app: {
    baseUrl: (process.env.APPLICATION_BASE_URL || 'http://localhost:5173').trim(),
    defaultTimeZone: (process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata').trim()
  },

  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }
};

// Log configuration summary at startup (never log secrets)
export function logConfigSummary() {
  console.log('[Config] Server port:', config.server.port);
  console.log('[Config] Environment:', config.server.nodeEnv);
  console.log('[Config] Gemini available:', config.gemini.isAvailable);
  console.log('[Config] Redis available:', config.redis.isAvailable);
  console.log('[Config] WhatsApp available:', config.whatsapp.isAvailable);
  console.log('[Config] Google Calendar available:', config.googleCalendar.isAvailable);
}
