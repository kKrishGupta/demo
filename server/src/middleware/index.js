/**
 * ActionFlow Server — Middleware Stack
 */

import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from "uuid";
import { config } from '../config.js';

// ─── Security Headers ─────────────────────────────────────────────────────────
export const securityHeaders = helmet({
  contentSecurityPolicy: false // Relaxed for API server
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl)
    if (!origin) return callback(null, true);
    if (
      config.cors.allowedOrigins.includes(origin) ||
      origin === config.app.baseUrl ||
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin) ||
      config.server.isDev
    ) {
      return callback(null, true);
    }
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Session-ID']
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────
export const rateLimiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
  keyGenerator: (req) => req.headers['x-session-id'] || req.ip || 'unknown'
});

// Stricter limit for Gemini-backed endpoints
export const geminiRateLimiter = rateLimit({
  windowMs: 60000,       // 1 minute
  max: 20,               // 20 Gemini calls per minute per session
  message: { error: 'Gemini rate limit exceeded. Try the fast extraction endpoint.' },
  keyGenerator: (req) => req.headers['x-session-id'] || req.ip || 'unknown'
});

// ─── Request Tracing ──────────────────────────────────────────────────────────
export function requestTracing(req, res, next) {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  req.sessionId = req.headers['x-session-id'] || `ses_${uuidv4().slice(0, 8)}`;
  req.startTime = Date.now();

  res.setHeader('X-Request-ID', req.requestId);
  res.setHeader('X-Session-ID', req.sessionId);

  next();
}

// ─── Request Logger ───────────────────────────────────────────────────────────
export function requestLogger(req, res, next) {
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    if (config.server.isDev) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms req:${req.requestId}`);
    }
  });
  next();
}

// ─── Input Validation ─────────────────────────────────────────────────────────
export function validateTranscriptInput(req, res, next) {
  const body = req.body;

  if (!body?.transcript || typeof body.transcript !== 'string') {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Request body must include a non-empty "transcript" string.'
    });
  }

  // Sanitize: trim and limit length
  body.transcript = body.transcript.trim().slice(0, 10000);

  if (!body.transcript) {
    return res.status(400).json({
      error: 'EMPTY_TRANSCRIPT',
      message: 'Transcript cannot be empty.'
    });
  }

  next();
}

// ─── Centralized Error Handler ────────────────────────────────────────────────
export function errorHandler(err, req, res, _next) {
  const requestId = req.requestId || 'unknown';

  // Never expose internal error details in production
  if (!config.server.isDev) {
    console.error(`[Error] req:${requestId}`, err.message);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An internal error occurred.',
      requestId
    });
  }

  console.error(`[Error] req:${requestId}`, err);
  return res.status(err.status || 500).json({
    error: err.code || 'INTERNAL_ERROR',
    message: err.message,
    requestId,
    stack: err.stack?.split('\n').slice(0, 5)
  });
}

// ─── Not Found Handler ────────────────────────────────────────────────────────
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found.`
  });
}
