/**
 * ActionFlow Server — Persistent Audit Service
 *
 * Maintains a structured, persistent audit trail for all execution and synchronization events.
 * Persists records to `server/data/audit_log.json` so audit history survives backend restarts
 * and is directly accessible by the Google Calendar Integration Hub and Task Management views.
 *
 * Rules:
 * - Never log API keys, OAuth tokens, auth credentials, or raw WhatsApp message bodies
 * - Log action IDs, Google event IDs, event types, operations, results, timestamps, and safe metadata
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const AUDIT_STORE_FILE = path.join(DATA_DIR, 'audit_log.json');

const _auditLog = [];
const _knownIds = new Set();
const MAX_AUDIT_ENTRIES = 1000;
let _loadedFromDisk = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function isEphemeralTestAudit(entry) {
  const ev = String(entry?.event || '');
  const sid = String(entry?.sessionId || '');
  const aid = String(entry?.actionId || '');
  const gid = String(entry?.details?.eventId || entry?.details?.googleEventId || '');

  if (ev === 'TEST_EVENT' || ev === 'TEST_REDACTION' || ev === 'ACTION_STARTED' || ev === 'ACTION_COMPLETED') {
    return true;
  }
  if (gid.startsWith('SIM_EVT_')) {
    return true;
  }
  if (
    process.env.VITEST &&
    (sid.startsWith('test_') ||
      sid.startsWith('sess_test') ||
      sid.startsWith('ses_test') ||
      sid.startsWith('user_a_') ||
      sid.startsWith('user_b_') ||
      sid === 's1' ||
      sid === 's2' ||
      sid === 'ses1' ||
      aid.startsWith('test_'))
  ) {
    return true;
  }
  return false;
}

export function reloadAuditLogFromDisk() {
  try {
    ensureDataDir();
    if (!fs.existsSync(AUDIT_STORE_FILE)) {
      _loadedFromDisk = true;
      return;
    }
    const raw = fs.readFileSync(AUDIT_STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.entries) ? parsed.entries : [];
    for (const item of list) {
      if (item && item.id && !_knownIds.has(item.id)) {
        _knownIds.add(item.id);
        _auditLog.push(item);
      }
    }
    _auditLog.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    while (_auditLog.length > MAX_AUDIT_ENTRIES) {
      const removed = _auditLog.shift();
      if (removed?.id) _knownIds.delete(removed.id);
    }
    _loadedFromDisk = true;
  } catch (err) {
    console.warn('[AuditService] Could not load audit_log.json:', err.message);
  }
}

function persistAuditToDisk(newEntry = null) {
  try {
    ensureDataDir();
    let diskEntries = [];
    if (fs.existsSync(AUDIT_STORE_FILE)) {
      try {
        const raw = fs.readFileSync(AUDIT_STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.entries)) {
          diskEntries = parsed.entries;
        }
      } catch {
        diskEntries = [];
      }
    }

    const mergedMap = new Map();
    for (const item of diskEntries) {
      if (item?.id && !isEphemeralTestAudit(item)) {
        mergedMap.set(item.id, item);
      }
    }
    for (const item of _auditLog) {
      if (item?.id && !isEphemeralTestAudit(item)) {
        mergedMap.set(item.id, item);
      }
    }
    if (newEntry?.id && !isEphemeralTestAudit(newEntry)) {
      mergedMap.set(newEntry.id, newEntry);
    }

    const mergedList = Array.from(mergedMap.values())
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-MAX_AUDIT_ENTRIES);

    fs.writeFileSync(
      AUDIT_STORE_FILE,
      JSON.stringify({ updatedAt: new Date().toISOString(), entries: mergedList }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn('[AuditService] Could not persist audit_log.json:', err.message);
  }
}

function inferOperation(event, details = {}) {
  if (details.operation) return details.operation;
  const ev = String(event || '');
  if (ev.includes('CREATED') || ev.includes('CREATE')) return 'events.insert';
  if (ev.includes('UPDATED') || ev.includes('RESCHEDULED')) return 'events.patch';
  if (ev.includes('DELETED') || ev.includes('REMOVAL')) return 'events.delete';
  if (ev.includes('SYNC')) return 'events.list / sync';
  if (ev.includes('OAUTH')) return 'oauth2.token';
  return details.endpoint || 'calendar.operation';
}

function inferResult(event, details = {}) {
  if (details.result) return details.result;
  const ev = String(event || '');
  if (ev.includes('FAILED') || ev.includes('ERROR')) return 'FAILED';
  if (ev.includes('STARTED') || ev.includes('ATTEMPT')) return 'IN_PROGRESS';
  return 'SUCCESS';
}

/**
 * Records an audit event in memory and persists it to disk
 * @param {Object} entry
 * @param {string} entry.event - Event type (e.g. CALENDAR_EVENT_CREATED)
 * @param {string} [entry.actionId]
 * @param {string} [entry.sessionId]
 * @param {string} [entry.timestamp] - Optional explicit ISO timestamp (used when backfilling verified provider events)
 * @param {Object} [entry.details] - Safe metadata (no PII, no secrets)
 */
export async function auditLog({ event, actionId, sessionId, timestamp = null, details = {} }) {
  if (!_loadedFromDisk) {
    reloadAuditLogFromDisk();
  }

  const sanitized = sanitizeDetails(details);
  const googleEventId = sanitized.googleEventId || sanitized.eventId || null;
  const title = sanitized.title || sanitized.summary || null;
  const operation = inferOperation(event, sanitized);
  const result = inferResult(event, sanitized);
  const errorDetails =
    sanitized.errorDetails ||
    sanitized.googleErrorMessage ||
    sanitized.error ||
    sanitized.message ||
    null;

  const entry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    event,
    actionId: actionId || sanitized.actionId || null,
    googleEventId,
    title,
    operation,
    result,
    errorDetails: result === 'FAILED' ? errorDetails : null,
    sessionId: sessionId || null,
    timestamp: timestamp || new Date().toISOString(),
    details: {
      ...sanitized,
      ...(googleEventId ? { eventId: googleEventId, googleEventId } : {}),
      ...(title ? { title } : {}),
      operation,
      result,
      ...(result === 'FAILED' && errorDetails ? { errorDetails } : {})
    }
  };

  _knownIds.add(entry.id);
  _auditLog.push(entry);

  if (_auditLog.length > MAX_AUDIT_ENTRIES) {
    const shifted = _auditLog.shift();
    if (shifted?.id) _knownIds.delete(shifted.id);
  }

  if (!isEphemeralTestAudit(entry)) {
    persistAuditToDisk(entry);
  }

  if (config.server.isDev) {
    console.log(`[Audit] ${entry.timestamp} ${event}${actionId ? ` action:${actionId}` : ''}${googleEventId ? ` eventId:${googleEventId}` : ''}`);
  }

  return entry;
}

/**
 * Retrieves recent audit entries (merging persisted disk records + in-memory records)
 * @param {Object} filters
 * @param {string} [filters.actionId]
 * @param {string} [filters.googleEventId]
 * @param {string} [filters.sessionId]
 * @param {string} [filters.event]
 * @param {number} [filters.limit]
 * @returns {Array}
 */
export function getAuditEntries({ actionId, googleEventId, sessionId, event, limit = 50 } = {}) {
  reloadAuditLogFromDisk();

  let entries = [..._auditLog].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  if (actionId) entries = entries.filter(e => e.actionId === actionId);
  if (googleEventId) {
    entries = entries.filter(
      e =>
        e.googleEventId === googleEventId ||
        e.details?.eventId === googleEventId ||
        e.details?.googleEventId === googleEventId
    );
  }
  if (sessionId) entries = entries.filter(e => e.sessionId === sessionId);
  if (event) entries = entries.filter(e => e.event === event);

  return entries.slice(0, limit);
}

/**
 * Retrieves recent Google Calendar audit activity records
 */
export function getCalendarActivityEntries({ sessionId = null, limit = 100 } = {}) {
  reloadAuditLogFromDisk();
  const entries = [..._auditLog]
    .filter(e =>
      e &&
      (e.event?.startsWith('CALENDAR_') ||
        e.event?.startsWith('REMINDER_') ||
        e.details?.type?.includes('CALENDAR'))
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return entries.slice(0, limit);
}

/**
 * Removes PII and sensitive fields from audit details
 */
function sanitizeDetails(details) {
  if (!details || typeof details !== 'object') return {};
  const safe = { ...details };

  const forbidden = [
    'token',
    'accessToken',
    'refreshToken',
    'password',
    'secret',
    'apiKey',
    'authToken',
    'credentials',
    'messageBody'
  ];
  for (const key of forbidden) {
    if (key in safe) safe[key] = '[REDACTED]';
  }

  for (const [k, v] of Object.entries(safe)) {
    if (typeof v === 'string' && v.length > 200) {
      safe[k] = v.slice(0, 200) + '...';
    }
  }

  return safe;
}
