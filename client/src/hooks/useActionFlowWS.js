/**
 * ActionFlow AI — WebSocket Hook
 * Connects to the server WebSocket for real-time Gemini enrichment updates.
 * Uses centralized buildWebSocketUrl (`wss://demo-51qr.onrender.com/ws` in production,
 * `ws://localhost:3001/ws` in development).
 * Stable connection lifecycle with ref-based message handler and backoff.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { buildWebSocketUrl } from '../config/apiConfig.js';

export default function useActionFlowWS({ sessionId, onMessage, enabled = true }) {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const reconnectAttempts = useRef(0);
  const onMessageRef = useRef(onMessage);

  // Keep latest onMessage callback in ref without re-triggering socket connection
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (!enabled || !sessionId || typeof window === 'undefined') return;

    // Prevent duplicate connections if already open or connecting
    if (ws.current) {
      if (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING) {
        return;
      }
    }

    try {
      const url = buildWebSocketUrl(sessionId);
      const socket = new WebSocket(url);

      socket.onopen = () => {
        setConnected(true);
        reconnectAttempts.current = 0;
      };

      socket.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'PONG') return; // heartbeat, ignore

          setLastEvent(data);
          onMessageRef.current?.(data);
        } catch { /* non-JSON frame */ }
      };

      socket.onclose = () => {
        setConnected(false);
        ws.current = null;

        // Exponential backoff when backend is offline
        if (reconnectAttempts.current < 8) {
          const delay = Math.min(2500 * Math.pow(1.5, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      socket.onerror = () => {
        // Handled via onclose
      };

      ws.current = socket;
    } catch {
      // WebSocket not available (SSR, test env, etc.)
    }
  }, [sessionId, enabled]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      if (ws.current) {
        ws.current.onclose = null; // Suppress close listener on component unmount
        ws.current.onerror = null;
        if (ws.current.readyState === WebSocket.OPEN) {
          ws.current.close();
        } else if (ws.current.readyState === WebSocket.CONNECTING) {
          const s = ws.current;
          s.onopen = () => { try { s.close(); } catch {} };
        }
        ws.current = null;
      }
    };
  }, [connect]);

  // Heartbeat ping every 25s
  useEffect(() => {
    if (!connected) return;
    const ping = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'PING' }));
      }
    }, 25000);
    return () => clearInterval(ping);
  }, [connected]);

  return { connected, lastEvent };
}
