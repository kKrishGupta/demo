/**
 * ActionFlow AI — Intelligence API Client
 *
 * Provides a clean API surface for the React UI to consume the
 * hybrid intelligence pipeline. All endpoints mirror the spec:
 *
 *   POST /api/v1/intelligence/analyze
 *   POST /api/v1/intelligence/extract
 *   POST /api/v1/intelligence/clarify
 *   POST /api/v1/intelligence/validate
 *   POST /api/v1/intelligence/plan
 *   POST /api/v1/intelligence/feedback
 *   POST /api/v1/execution/execute
 *   POST /api/v1/execution/approve
 *
 * Uses centralized apiConfig (`https://demo-51qr.onrender.com` in production,
 * `http://localhost:3001` in development).
 * Clearly separates local extraction from external backend execution.
 */

import { analyzeTranscript, quickExtract, registerCompletedAction, recordCorrection } from '../features/intelligence/intelligenceService.js';
import { buildExecutionPlan } from '../features/intelligence/dagPlanner.js';
import { validateTaskPayload } from './taskService.js';
import {
  API_V1_BASE_URL,
  HEALTH_URL,
  SESSION_ID,
  getSessionId,
  buildApiUrl
} from '../config/apiConfig.js';

const API_VERSION = 'v1';
const API_BASE = API_V1_BASE_URL;

export { SESSION_ID, getSessionId };

// Track whether the server has been detected as available
let _serverAvailable = null; // null = unknown, true/false after probe

/**
 * Probes the server health endpoint (`${API_BASE_URL}/health`) to determine availability.
 */
async function probeServer() {
  if (_serverAvailable === true) return true;
  try {
    const res = await fetch(HEALTH_URL, {
      headers: { 'X-Session-ID': getSessionId() },
      signal: AbortSignal.timeout(8000)
    });
    _serverAvailable = res.ok;
  } catch {
    _serverAvailable = false;
  }
  return _serverAvailable;
}

// Probe once on module load (non-blocking)
probeServer();

/**
 * Makes a POST request to the server with proper headers and error handling.
 * @param {string} path - API path (e.g. '/intelligence/analyze')
 * @param {Object} body - Request body
 * @returns {Promise<Object>} Response JSON
 */
async function serverPost(path, body) {
  let response;
  try {
    response = await fetch(buildApiUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': getSessionId()
      },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    _serverAvailable = false;
    const err = new Error(networkErr.message || 'Backend server is unreachable.');
    err.code = 'SERVER_UNAVAILABLE';
    err.isNetworkError = true;
    throw err;
  }

  _serverAvailable = true;

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const err = new Error(errBody.message || errBody.error || `Server returned HTTP ${response.status}`);
    err.status = response.status;
    err.body = errBody;
    throw err;
  }

  return response.json();
}

/**
 * Makes a GET request to the server.
 */
async function serverGet(path) {
  let response;
  try {
    response = await fetch(buildApiUrl(path), {
      headers: { 'X-Session-ID': getSessionId() }
    });
  } catch (networkErr) {
    _serverAvailable = false;
    const err = new Error(networkErr.message || 'Backend server is unreachable.');
    err.code = 'SERVER_UNAVAILABLE';
    err.isNetworkError = true;
    throw err;
  }

  _serverAvailable = true;

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const err = new Error(errBody.message || errBody.error || `Server returned HTTP ${response.status}`);
    err.status = response.status;
    err.body = errBody;
    throw err;
  }
  return response.json();
}

// ─── Analyze ─────────────────────────────────────────────────────────────────
/**
 * Full pipeline: classify → extract → plan → confidence → duplicate-check
 * Calls the server if available; if allowLocalFallback is enabled, falls back to local rule engine
 * and explicitly labels extractionPath: 'LOCAL'.
 */
export async function apiAnalyze({
  transcript,
  directory = [],
  projects = [],
  departments = [],
  industry = 'all',
  referenceDate = new Date(),
  requestId,
  allowLocalFallback = true
}) {
  if (!transcript?.trim()) {
    return { status: 'empty', actions: [], clarifications: [], suggestions: [], warnings: [] };
  }

  // Try server first (enables Gemini for complex inputs)
  try {
    const serverResult = await serverPost('/intelligence/analyze', {
      transcript,
      directory: (directory || []).map(p => ({ id: p.id, name: p.name, aliases: p.aliases, department: p.department })),
      projects: (projects || []).map(p => ({ id: p.id, name: p.name, code: p.code })),
      departments: departments || [],
      industry,
      referenceDate: referenceDate?.toISOString()
    });

    if (serverResult) return serverResult;
  } catch (err) {
    console.warn('[IntelligenceAPI] Server analyze failed:', err.message);
    if (!allowLocalFallback) {
      throw err;
    }
  }

  // Local fallback (rule engine only — explicitly labelled LOCAL)
  const localAnalysis = await analyzeTranscript({
    transcript, directory, projects, departments, industry, referenceDate, requestId
  });
  return {
    ...localAnalysis,
    extractionPath: 'LOCAL',
    isLocalExtraction: true,
    geminiEnriched: false
  };
}

// ─── Extract (fast-path) ──────────────────────────────────────────────────────
/**
 * Fast rule-based extraction — returns draft in existing schema format
 * (Backward-compatible with existing TaskForm / VoiceCapture components)
 */
export function apiExtract(params) {
  return quickExtract(params);
}

// ─── Clarify ──────────────────────────────────────────────────────────────────
/**
 * Processes a clarification response and re-runs extraction with provided hints
 */
export async function apiClarify({
  requestId,
  clarificationResponses,
  originalTranscript,
  directory,
  projects,
  departments,
  referenceDate
}) {
  // Build augmented transcript with clarification context
  let augmented = originalTranscript;
  for (const [field, value] of Object.entries(clarificationResponses || {})) {
    augmented += ` [CLARIFIED: ${field}=${value}]`;
  }

  // Try server
  try {
    const serverResult = await serverPost('/intelligence/clarify', {
      transcript: augmented,
      clarifications: clarificationResponses,
      originalRequestId: requestId,
      directory: (directory || []).map(p => ({ id: p.id, name: p.name })),
      projects: (projects || []).map(p => ({ id: p.id, name: p.name })),
      departments: departments || []
    });

    if (serverResult) return serverResult;
  } catch {
    // Fall through to local
  }

  // Local fallback
  return await apiAnalyze({
    transcript: augmented, directory, projects, departments, referenceDate,
    requestId: `${requestId}_clarified`
  });
}

// ─── Validate ─────────────────────────────────────────────────────────────────
/**
 * Validates a task payload against business rules
 */
export function apiValidate(taskPayload) {
  const validation = validateTaskPayload(taskPayload);

  const warnings = [];
  if (!taskPayload.description && taskPayload.title) {
    warnings.push('Consider adding a task description for clarity.');
  }
  if (!taskPayload.priority) {
    warnings.push('No priority set — task will be treated as normal priority.');
  }
  if (taskPayload.isRecurring && !taskPayload.recurrenceFrequency) {
    validation.errors.recurrenceFrequency = 'Recurrence frequency is required for recurring tasks.';
    validation.isValid = false;
  }

  return {
    isValid: validation.isValid,
    errors: validation.errors,
    warnings,
    version: API_VERSION
  };
}

// ─── Plan ─────────────────────────────────────────────────────────────────────
/**
 * Builds a DAG-based execution plan for a set of actions
 */
export function apiPlan(actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return {
      orderedActionIds: [],
      parallelGroups: [],
      blockedActionIds: [],
      deadlineConflicts: [],
      hasCycle: false
    };
  }
  return buildExecutionPlan(actions);
}

// ─── Feedback ─────────────────────────────────────────────────────────────────
/**
 * Records user correction feedback for parser improvement
 * Sends to server (which stores in Redis/DB) and also records locally.
 */
export async function apiFeedback({
  actionId,
  originalTranscript,
  originalExtracted,
  correctedField,
  correctedValue,
  originalValue
}) {
  // Record locally (session context)
  recordCorrection({
    actionId, originalTranscript, originalExtracted,
    correctedField, correctedValue, originalValue,
    modelVersion: 'rule-engine-v2', promptVersion: 'v2'
  });

  // Send to server for persistent storage
  try {
    await serverPost('/intelligence/feedback', {
      actionId,
      originalTranscript: (originalTranscript || '').slice(0, 5000),
      correctedField, correctedValue, originalValue
    });
  } catch {
    // Non-critical — local recording is the fallback
  }

  return { success: true, recorded: true };
}

// ─── Execute ───────────────────────────────────────────────────────────────────
/**
 * Submits an action for execution via the server's execution gateway.
 * Never fakes COMPLETED or LOCAL_ACKNOWLEDGED when the server is unavailable.
 */
export async function apiExecute(action, { isApproved = false } = {}) {
  const actionId = action?.id || `action_${Date.now()}`;
  try {
    const serverResult = await serverPost('/execution/execute', {
      action: {
        id: actionId,
        type: action.type || 'CREATE_TASK',
        title: action.title || action.fields?.title || '',
        description: action.description || action.fields?.description || '',
        priority: action.priority || action.fields?.priority || '',
        assignee: action.assignee
          ? { id: action.assignee.id, name: action.assignee.name, email: action.assignee.email, phone: action.assignee.phone }
          : null,
        deadline: action.deadline || action.fields?.dueDate || null,
        isRecurring: action.isRecurring || action.fields?.isRecurring || false,
        recurrenceFrequency: action.recurrenceFrequency || action.fields?.recurrenceFrequency || '',
        recipient: action.recipient || null
      },
      isApproved
    });

    if (serverResult) return serverResult;
  } catch (err) {
    console.warn('[IntelligenceAPI] Server execute failed:', err.message);
    const status = err.isNetworkError ? 'SERVER_UNAVAILABLE' : 'FAILED';
    return {
      success: false,
      actionId,
      status,
      httpStatus: err.status || 503,
      error: err.message || 'Backend server unavailable.',
      result: {
        success: false,
        status,
        message: err.message || 'Backend server is unreachable. Action was not executed.'
      }
    };
  }

  return {
    success: false,
    actionId,
    status: 'SERVER_UNAVAILABLE',
    httpStatus: 503,
    error: 'Backend server unavailable.',
    result: {
      success: false,
      status: 'SERVER_UNAVAILABLE',
      message: 'Backend server is unreachable. Action was not executed.'
    }
  };
}

// ─── Register completed action ────────────────────────────────────────────────
export function apiRegisterAction(action) {
  registerCompletedAction(action);
  return { success: true };
}

// ─── Server status ─────────────────────────────────────────────────────────────
/**
 * Returns whether the backend server is detected as available.
 * Useful for UI indicators.
 */
export function getServerStatus() {
  return _serverAvailable;
}

/**
 * Forces a re-probe of server availability.
 */
export async function refreshServerStatus() {
  _serverAvailable = null;
  return await probeServer();
}

// ─── Voice Command (Phase 1) ───────────────────────────────────────────────────
/**
 * POST /api/v1/voice/command — full voice pipeline with destination routing
 */
export async function apiVoiceCommand({ transcript, directory = [], projects = [], departments = [] }) {
  if (!transcript?.trim()) return null;

  try {
    const serverResult = await serverPost('/voice/command', {
      transcript,
      directory: (directory || []).map(p => ({ id: p.id, name: p.name, aliases: p.aliases })),
      projects: (projects || []).map(p => ({ id: p.id, name: p.name, code: p.code })),
      departments: departments || []
    });
    if (serverResult) return serverResult;
  } catch {
    // Fall through to null — caller handles local fallback
  }
  return null;
}

/**
 * POST /api/v1/voice/route — fast destination detection
 */
export async function apiRouteTranscript(transcript) {
  if (!transcript?.trim()) return null;
  try {
    return await serverPost('/voice/route', { transcript });
  } catch {
    return null;
  }
}

// ─── Task / Assignment / Shopping / Reminder APIs ─────────────────────────────
export async function apiCreateTask(payload) {
  try { return await serverPost('/tasks', payload); } catch { return null; }
}

export async function apiCreateAssignment(payload) {
  try { return await serverPost('/assignments', payload); } catch { return null; }
}

export async function apiAddShoppingItems(items, category) {
  try { return await serverPost('/shopping/items', { items, category }); } catch { return null; }
}

export async function apiCreateReminder(payload) {
  try { return await serverPost('/reminders', payload); } catch { return null; }
}

export async function apiPrepareWhatsApp(payload) {
  try { return await serverPost('/whatsapp/prepare', payload); } catch { return null; }
}

export async function apiSendWhatsApp(payload) {
  try { return await serverPost('/whatsapp/send', payload); } catch { return null; }
}

export async function apiGetActionHistory() {
  try { return await serverGet('/actions/history'); } catch { return null; }
}
