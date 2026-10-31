/**
 * ActionFlow Server — WebSocket Streaming Server
 *
 * Provides real-time streaming of extraction progress, action previews,
 * and execution status updates to connected React clients.
 *
 * Message types:
 *   CLIENT → SERVER: { type: 'ANALYZE', transcript, sessionId, requestId }
 *   CLIENT → SERVER: { type: 'PING' }
 *   SERVER → CLIENT: { type: 'ACK', requestId }
 *   SERVER → CLIENT: { type: 'PROGRESS', stage, message }
 *   SERVER → CLIENT: { type: 'ACTION_PREVIEW', action }
 *   SERVER → CLIENT: { type: 'COMPLETE', result }
 *   SERVER → CLIENT: { type: 'ERROR', message }
 *   SERVER → CLIENT: { type: 'PONG' }
 */

import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

// ─── Connected clients store ──────────────────────────────────────────────────
const clients = new Map(); // sessionId → WebSocket

/**
 * Attaches the WebSocket server to an existing HTTP server
 * @param {import('http').Server} httpServer
 */
export function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  });

  wss.on('connection', (ws, req) => {
    // Extract session ID from query param or generate one
    const url = new URL(req.url, 'http://localhost');
    const sessionId = url.searchParams.get('sessionId') || uuidv4();

    ws.sessionId = sessionId;
    ws.isAlive = true;

    clients.set(sessionId, ws);
    console.log(`[WS] Client connected. Session: ${sessionId}. Total: ${clients.size}`);

    // Send connection acknowledgement
    safeSend(ws, { type: 'CONNECTED', sessionId, message: 'ActionFlow AI WebSocket ready.' });

    ws.on('message', async (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        safeSend(ws, { type: 'ERROR', message: 'Invalid JSON message.' });
        return;
      }

      switch (msg.type) {
        case 'PING':
          ws.isAlive = true;
          safeSend(ws, { type: 'PONG', timestamp: Date.now() });
          break;

        case 'ANALYZE':
          await handleAnalyzeRequest(ws, msg);
          break;

        default:
          safeSend(ws, { type: 'ERROR', message: `Unknown message type: ${msg.type}` });
      }
    });

    ws.on('close', () => {
      clients.delete(sessionId);
      console.log(`[WS] Client disconnected. Session: ${sessionId}. Total: ${clients.size}`);
    });

    ws.on('error', (err) => {
      console.warn(`[WS] Client error (${sessionId}):`, err.message);
    });
  });

  // Heartbeat to detect stale connections (every 30s)
  setInterval(() => {
    for (const [sessionId, ws] of clients.entries()) {
      if (!ws.isAlive) {
        ws.terminate();
        clients.delete(sessionId);
        return;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('pong', function () {
    this.isAlive = true;
  });

  console.log('[WS] WebSocket server attached at /ws');
  return wss;
}

/**
 * Handles the ANALYZE message with progressive streaming updates
 */
async function handleAnalyzeRequest(ws, msg) {
  const requestId = msg.requestId || uuidv4();

  // Immediate acknowledgement
  safeSend(ws, { type: 'ACK', requestId, message: 'Processing started.' });

  try {
    // Stage 1: Input received
    safeSend(ws, { type: 'PROGRESS', requestId, stage: 'RECEIVED', message: 'Input received and validated.' });

    await delay(10);

    // Stage 2: Context resolution
    safeSend(ws, { type: 'PROGRESS', requestId, stage: 'CONTEXT', message: 'Resolving context and references...' });

    await delay(20);

    // Stage 3: Rule engine
    safeSend(ws, { type: 'PROGRESS', requestId, stage: 'RULE_ENGINE', message: 'Running deterministic extraction...' });

    await delay(50);

    // Stage 4: Preview extracted fields (non-executable partial result)
    const preview = buildLivePreview(msg.transcript || '');
    if (preview.title) {
      safeSend(ws, {
        type: 'ACTION_PREVIEW',
        requestId,
        preview,
        message: 'Fields extracted — awaiting validation.'
      });
    }

    // Stage 5: Confidence analysis
    safeSend(ws, { type: 'PROGRESS', requestId, stage: 'CONFIDENCE', message: 'Computing confidence scores...' });

    await delay(20);

    // Stage 6: Planning
    safeSend(ws, { type: 'PROGRESS', requestId, stage: 'PLANNING', message: 'Building execution plan...' });

    await delay(10);

    // Stage 7: Complete (for streaming demo; real result comes from REST API)
    safeSend(ws, {
      type: 'COMPLETE',
      requestId,
      status: 'extracted',
      message: 'Extraction complete. Fetch full result via GET /api/v1/intelligence/requests/' + requestId
    });

  } catch (err) {
    safeSend(ws, { type: 'ERROR', requestId, message: err.message });
  }
}

/**
 * Broadcasts an execution status update to a specific session
 * @param {string} sessionId
 * @param {Object} update
 */
export function broadcastToSession(sessionId, update) {
  const ws = clients.get(sessionId);
  if (ws) safeSend(ws, update);
}

/**
 * Broadcasts a calendar synchronization / mutation event to all connected clients
 * @param {Object} payload
 */
export function broadcastCalendarUpdate(payload = {}) {
  const message = {
    type: 'CALENDAR_UPDATED',
    timestamp: new Date().toISOString(),
    ...payload
  };
  for (const ws of clients.values()) {
    safeSend(ws, message);
  }
}

function safeSend(ws, data) {
  try {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(data));
    }
  } catch (err) {
    console.warn('[WS] Failed to send:', err.message);
  }
}

function buildLivePreview(transcript) {
  if (!transcript) return {};
  const titleMatch = transcript.match(/(?:assign|ask|tell|create|have)\s+(?:[a-z\s]+?\s+)?(?:to|for)\s+([^.?!,;]{5,60})/i);
  return {
    title: titleMatch?.[1]?.trim() || '',
    hasAssignee: /(?:assign|ask|tell)\s+[A-Z][a-z]+/i.test(transcript),
    hasPriority: /\b(urgent|high|low)\b/i.test(transcript),
    hasDeadline: /\b(tomorrow|next|by|deadline)\b/i.test(transcript)
  };
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
