/**
 * ActionFlow AI — Backend Server
 * Express.js + WebSocket server with Gemini integration,
 * Redis caching, execution gateway, and audit logging.
 */

import express from 'express';
import { createServer } from 'http';
import { config, logConfigSummary } from './config.js';
import { cacheService } from './cache/cacheService.js';
import {
  securityHeaders, corsMiddleware, rateLimiter,
  requestTracing, requestLogger, errorHandler, notFoundHandler
} from './middleware/index.js';
import intelligenceRoutes from './routes/intelligenceRoutes.js';
import executionRoutes from './routes/executionRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import voiceRoutes from './routes/voiceRoutes.js';
import actionRoutes from './routes/actionRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import meetingRoutes from './routes/meetingRoutes.js';
import contextRoutes from './routes/contextRoutes.js';
import benchmarkRoutes from './routes/benchmarkRoutes.js';
import testingRoutes from './routes/testingRoutes.js';
import { attachWebSocketServer } from './websocket/wsServer.js';

const app = express();
const httpServer = createServer(app);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(requestTracing);
app.use(requestLogger);
app.use(rateLimiter);

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const cacheStats = cacheService.getStats();
  return res.status(200).json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      gemini: config.gemini.isAvailable ? 'configured' : 'not_configured',
      whisper: config.whisper?.isAvailable ? 'configured' : 'not_configured',
      redis: config.redis.isAvailable ? 'configured' : 'not_configured',
      whatsapp: config.whatsapp.isAvailable ? 'configured' : 'not_configured',
      googleCalendar: config.googleCalendar.isAvailable ? 'configured' : 'not_configured'
    },
    cache: {
      backend: cacheStats.backendType,
      hitRate: cacheStats.hitRate,
      hits: cacheStats.hits,
      misses: cacheStats.misses
    }
  });
});

// ─── API Routes (Supporting both /api/v1/* and /api/* canonical paths) ───────────
app.use('/api/v1/intelligence', intelligenceRoutes);
app.use('/api/intelligence', intelligenceRoutes);

app.use('/api/v1/execution', executionRoutes);
app.use('/api/execution', executionRoutes);

app.use('/api/v1/audit', auditRoutes);
app.use('/api/audit', auditRoutes);

app.use('/api/v1/voice', voiceRoutes);
app.use('/api/voice', voiceRoutes);

app.use('/api/v1', actionRoutes);
app.use('/api', actionRoutes);

app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/integrations/google-calendar', calendarRoutes);

app.use('/api/v1', meetingRoutes);
app.use('/api', meetingRoutes);

app.use('/api/v1', contextRoutes);
app.use('/api', contextRoutes);

app.use('/api/v1/benchmark', benchmarkRoutes);
app.use('/api/benchmark', benchmarkRoutes);

app.use('/api/v1/testing', testingRoutes);
app.use('/api/testing', testingRoutes);

import { initReminderScheduler } from './services/reminderSchedulerService.js';

// Google OAuth callback (supports legacy and direct redirect)
app.get(['/api/auth/google/callback', '/auth/google/callback'], async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`${config.app.baseUrl}?calendar_error=${encodeURIComponent(error)}`);
  }
  if (!code) return res.status(400).send('Missing authorization code from Google OAuth.');

  try {
    const { exchangeOAuthCode } = await import('./services/calendarService.js');
    const result = await exchangeOAuthCode(code, state, req.sessionId);
    return res.redirect(`${config.app.baseUrl}?calendar_connected=true&email=${encodeURIComponent(result.userEmail || '')}&sessionId=${encodeURIComponent(result.resolvedSessionId || req.sessionId || '')}`);
  } catch (err) {
    console.error('[GoogleCallback] OAuth error:', err.message);
    return res.redirect(`${config.app.baseUrl}?calendar_error=${encodeURIComponent(err.message)}`);
  }
});

// ─── 404 + Error Handlers ──────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── WebSocket Server ─────────────────────────────────────────────────────────
attachWebSocketServer(httpServer);

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  logConfigSummary();
  await cacheService.initialize();
  initReminderScheduler();

  httpServer.listen(config.server.port, '0.0.0.0', () => {
    console.log(`\n🚀 ActionFlow AI Server running at http://localhost:${config.server.port}`);
    console.log(`   WebSocket: ws://localhost:${config.server.port}/ws`);
    console.log(`   Health: http://localhost:${config.server.port}/health`);
    console.log(`   API: http://localhost:${config.server.port}/api/v1/intelligence/analyze\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
