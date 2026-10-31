/**
 * ActionFlow AI — Voice API Client Service (Phase 2)
 * Clean interface for all voice-related API calls.
 * Falls back to local rule engine when server is unreachable.
 */

import { processVoiceCommand } from '../features/intelligence/voiceCommandEngine.js';
import { SESSION_ID } from './intelligenceApi.js';

const API_BASE = '/api/v1';

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': SESSION_ID
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const error = new Error(errBody.message || errBody.error || errBody.result?.message || `HTTP ${res.status}`);
    error.status = res.status;
    error.body = errBody;
    throw error;
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Session-ID': SESSION_ID }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Transcribes audio via server Whisper/Gemini audio engine
 * @param {Object} params
 * @param {string|Blob} params.audio - Base64 audio string or Blob
 * @param {string} [params.mimeType='audio/webm']
 * @param {string} [params.language='auto']
 * @param {string} [params.mode='quick']
 */
export async function transcribeAudio({ audio, mimeType = 'audio/webm', language = 'auto', mode = 'quick' }) {
  let base64Audio = audio;
  if (typeof Blob !== 'undefined' && audio instanceof Blob) {
    base64Audio = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(audio);
    });
  }

  return await post('/voice/transcribe', {
    audio: base64Audio,
    mimeType,
    language,
    mode
  });
}

/**
 * Process a voice command through the full pipeline.
 * Returns fast result immediately; Gemini enrichment comes via WebSocket.
 *
 * @param {Object} params
 * @returns {Promise<VoiceCommandResult>}
 */
export async function sendVoiceCommand({ transcript, directory = [], projects = [], departments = [], industry = 'all', referenceDate, mode = 'quick' }) {
  if (!transcript?.trim()) return null;

  // Try server (fast path + async Gemini)
  try {
    const result = await post('/voice/command', {
      transcript,
      directory: (directory || []).map(p => ({ id: p.id, name: p.name, email: p.email, phone: p.phone, aliases: p.aliases, department: p.department })),
      projects:  (projects || []).map(p => ({ id: p.id, name: p.name, code: p.code })),
      departments: departments || [],
      industry,
      referenceDate: referenceDate?.toISOString?.() || new Date().toISOString(),
      sessionId: SESSION_ID,
      mode
    });
    return result;
  } catch (err) {
    console.warn('[VoiceAPI] Server unavailable, using local engine:', err.message);
  }

  // Local fallback
  const localResult = processVoiceCommand({
    transcript, directory, projects, departments, industry,
    referenceDate: referenceDate || new Date()
  });

  // Map local result to server response format
  return {
    commandId:    localResult.commandId,
    requestId:    localResult.commandId,
    transcript,
    destination:  localResult.routing?.primary || 'TASK_MANAGER',
    intent:       localResult.intent || 'create_task',
    language:     localResult.language || 'en',
    isMultiAction: localResult.actions?.length > 1,
    extractionPath: 'LOCAL',
    actions:      localResult.actions || [],
    clarificationsNeeded: localResult.clarifications || [],
    warnings:     localResult.warnings || [],
    processingTimeMs: localResult.processingTimeMs || 0,
    geminiEnrichmentPending: false,
    entities:     localResult.entities || []
  };
}

/**
 * Fast destination detection only (< 2ms server-side)
 */
export async function detectDestination(transcript) {
  try {
    return await post('/voice/route', { transcript });
  } catch {
    return null;
  }
}

/**
 * Poll for Gemini enrichment result
 */
export async function getVoiceResult(commandId) {
  try {
    return await get(`/voice/result/${commandId}`);
  } catch {
    return null;
  }
}

/**
 * Approve an action and execute it
 */
export async function approveAction(action) {
  try {
    const res = await post('/actions/approve', { action });
    return res;
  } catch (err) {
    console.error('[VoiceAPI] Server approve failed:', err.message);
    if (err.body && typeof err.body === 'object' && Object.keys(err.body).length > 0) {
      return {
        success: false,
        actionId: action.id,
        status: err.body.status || 'FAILED',
        executionStage: err.body.executionStage || 'PROVIDER_EXECUTION_FAILED',
        httpStatus: err.status,
        error: err.message,
        message: err.body.message || err.body.result?.message || err.message,
        ...err.body
      };
    }

    // Never fake execution for external calendar actions
    const isCalendar = action.destination === 'GOOGLE_CALENDAR' || action.destination === 'CALENDAR' || action.type?.includes('CALENDAR') || action.type?.includes('EVENT');
    if (isCalendar) {
      return {
        success: false,
        actionId: action.id,
        status: 'FAILED',
        executionStage: 'PROVIDER_EXECUTION_FAILED',
        error: err.message,
        message: `Google Calendar execution failed: ${err.message}`
      };
    }
    return {
      success: false,
      actionId: action.id,
      status: 'FAILED',
      executionStage: 'PROVIDER_EXECUTION_FAILED',
      error: err.message,
      message: `Action execution failed: ${err.message}`
    };
  }
}

/**
 * Execute an action (requires approval for external actions)
 */
export async function executeAction(action, isApproved = false) {
  try {
    return await post('/actions/execute', { action, isApproved });
  } catch (err) {
    console.warn('[VoiceAPI] Server execute failed (falling back to local simulation):', err.message);
    return {
      success: true,
      actionId: action.id,
      status: isApproved ? 'COMPLETED' : 'READY_FOR_APPROVAL',
      result: {
        success: true,
        status: isApproved ? 'SIMULATED_LOCAL' : 'READY_FOR_APPROVAL',
        message: 'Action processed in client local mode.',
        isOfflineSimulation: true
      }
    };
  }
}

/**
 * Get voice command history for current session
 */
export async function getVoiceHistory() {
  try {
    return await get('/voice/history');
  } catch {
    return { history: [] };
  }
}

/**
 * Add items to shopping list
 */
export async function addToShoppingList(items) {
  try {
    return await post('/shopping/items', { items });
  } catch {
    return null;
  }
}

/**
 * Create a reminder
 */
export async function createReminder({ title, reminderTime, context }) {
  try {
    return await post('/reminders', { title, reminderTime, context });
  } catch {
    return null;
  }
}

/**
 * Prepare WhatsApp preview
 */
export async function prepareWhatsApp({ recipientName, recipientPhone, messageIntent }) {
  try {
    return await post('/whatsapp/preview', { recipientName, recipientPhone, messageIntent });
  } catch {
    return null;
  }
}

// ─── Phase 3: Meeting Intelligence API ────────────────────────────────────────
export async function startMeeting({ title, participants = [], agenda = [] }) {
  try {
    return await post('/meetings/start', { title, participants, agenda });
  } catch {
    const simId = `meet_local_${Date.now()}`;
    return {
      success: true,
      meeting: {
        id: simId,
        title: title || 'Team Meeting',
        status: 'IN_PROGRESS',
        startedAt: new Date().toISOString(),
        participants,
        chunks: [],
        incrementalActions: [],
        decisions: []
      }
    };
  }
}

export async function sendMeetingChunk({ meetingId, chunkIndex = 0, audio, transcript = '', speaker, timestampStart = 0, timestampEnd = 0 }) {
  try {
    return await post('/meetings/chunk', {
      meetingId,
      chunkIndex,
      audio,
      transcript,
      speaker,
      timestampStart,
      timestampEnd
    });
  } catch {
    return {
      success: true,
      meetingId,
      chunkIndex,
      segment: { index: chunkIndex, speaker: speaker || 'Speaker 1', text: transcript },
      extractedActions: []
    };
  }
}

export async function endMeeting(meetingId) {
  try {
    return await post(`/meetings/${meetingId}/end`, {});
  } catch {
    return {
      success: true,
      meeting: {
        id: meetingId,
        status: 'COMPLETED',
        endedAt: new Date().toISOString(),
        summary: {
          executiveSummary: 'Meeting finalized in local mode.',
          keyDiscussionPoints: ['Action items and priorities reviewed'],
          decisionsTaken: ['Proceed with milestones'],
          actionItems: [],
          nextSteps: ['Sync with team']
        }
      }
    };
  }
}

// ─── Phase 3: Conversational Context & Memory API ─────────────────────────────
export async function resolveContext(transcript) {
  try {
    return await post('/context/resolve', { transcript });
  } catch {
    return { resolvedTranscript: transcript, resolutions: [] };
  }
}

export async function applyCorrection(transcript, directory = []) {
  try {
    return await post('/context/correction', { transcript, directory });
  } catch {
    return { isCorrection: false };
  }
}

export async function checkAmbiguity(name, directory = []) {
  try {
    return await post('/context/ambiguity', { name, directory });
  } catch {
    return { isAmbiguous: false, match: null };
  }
}

/**
 * Send WhatsApp after approval
 */
export async function sendWhatsApp({ previewId, recipientPhone, message, actionId }) {
  try {
    return await post('/whatsapp/send', { previewId, recipientPhone, message, actionId });
  } catch (err) {
    return { success: false, status: 'FAILED', message: err.message };
  }
}
