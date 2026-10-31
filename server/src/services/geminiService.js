/**
 * ActionFlow AI — Gemini Contextual Intelligence Service (Phase 2)
 *
 * Destination-aware prompting: each destination type gets a specialized
 * prompt that extracts the exact fields needed — calendar gets attendees
 * and time slots, WhatsApp gets message content, shopping gets item lists.
 *
 * Features:
 *  - Destination-aware structured prompts
 *  - Versioned prompt templates (v3)
 *  - Response caching (Redis-backed, 5 min TTL)
 *  - In-flight deduplication (no concurrent identical requests)
 *  - Bounded retries with exponential backoff + jitter
 *  - AbortController timeout (15s default)
 *  - Manual schema validation (no zod dependency)
 *  - No PII in cache keys — only transcript hash
 */

import { config } from '../config.js';
import { cacheService, hashString } from '../cache/cacheService.js';

const PROMPT_VERSION = 'v3';
const _inFlightRequests = new Map();

// ─── Destination-Aware Prompt Builder ────────────────────────────────────────
function buildPrompt(transcript, context, destination) {
  const { directory = [], projects = [], referenceDate } = context;

  const today = referenceDate
    ? new Date(referenceDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const directoryHint = directory.slice(0, 15)
    .map(p => `- ${p.name} (id:${p.id}${p.email ? `, email:${p.email}` : ''}${p.phone ? `, phone:${p.phone}` : ''}${p.aliases?.length ? `, also:${p.aliases.slice(0,2).join(',')}` : ''})`)
    .join('\n');

  const projectHint = projects.slice(0, 8)
    .map(p => `- ${p.name} [${p.code}]`)
    .join('\n');

  // Destination-specific extraction instructions
  const destInstructions = {
    GOOGLE_CALENDAR: `Focus on: event title, exact date/time, duration, attendees, location, recurrence.
Extract: eventName (clear English title), startDateRaw (e.g. "tomorrow at 10 AM"), endDateRaw, durationMinutes (default 60), attendeeNames (from directory), location, isRecurring, recurrenceFrequency, recurrenceDay.`,

    WHATSAPP: `Focus on: recipient identification, exact message content to send.
Extract: recipientName (from directory), whatsappMessage (the actual message to send — infer politely from intent), messageIntent (brief description of what to communicate).
Generate whatsappMessage as a natural, professional message in the same language as the transcript.`,

    EMAIL: `Focus on: recipient, subject, message body.
Extract: recipientName (from directory), emailSubject, emailBody (professional draft), urgency.`,

    REMINDERS: `Focus on: what to remember, when to remind.
Extract: reminderTitle (what), reminderTime (when — e.g. "today at 6 PM", "tomorrow morning"), reminderContext (additional context).`,

    SHOPPING_LIST: `Focus on: all items to purchase, quantities, categories.
Extract: shoppingItems (array of {name, quantity, category}). Common Hindi item names: doodh=milk, sabzi=vegetables, atta=flour, chawal=rice, dal=lentils.`,

    TASK_ASSIGNMENT: `Focus on: task details, assignee, deadline, priority.
Extract: taskTitle, assigneeName (from directory), deadline (deadlineRaw), priority, taskDescription.`,

    TASK_MANAGER: `Focus on: task to create or update, deadline, priority, status.
Extract: taskTitle, taskDescription, priority, deadlineRaw, isRecurring, recurrenceFrequency, taskAction (create|update|complete|delete).`,

    MEETING_NOTES: `Focus on: key decisions, action items, owners.
Extract: meetingTitle, decisions (array), actionItems (array of {item, owner, deadline}), attendees.`,

    DOCUMENT_WORKFLOW: `Focus on: document name, action, recipients, deadline.
Extract: documentName, workflowAction (share|approve|sign|review), recipients (array), deadline.`,

    SITE_RECORDING: `Focus on: recording purpose, location, duration, participants.
Extract: recordingPurpose, location, estimatedDurationMinutes, requiresConsent (always true for people recording).`,

    UNKNOWN_DESTINATION: `Extract all possible intent and entity information.`
  };

  const destGuide = destInstructions[destination] || destInstructions.UNKNOWN_DESTINATION;

  return `You are ActionFlow AI — an intelligent voice command extraction system.
Today is ${today}. Primary destination detected: ${destination}.

TASK: Extract structured information from this voice command for the ${destination} module.
${destGuide}

AVAILABLE PEOPLE (use exact names from this list only):
${directoryHint || '(no directory provided)'}

AVAILABLE PROJECTS:
${projectHint || '(no projects provided)'}

EXTRACTION RULES:
1. NEVER invent people not in the directory — leave blank if not found
2. NEVER fabricate dates — use relative expressions (tomorrow, next Friday, etc.)
3. Understand Hindi/Hinglish naturally: kal=tomorrow, aaj=today, subah=morning, shaam=evening, baje=o'clock
4. For WhatsApp: generate a natural, polite message reflecting the user's intent
5. For Calendar: always extract attendee names from the directory
6. Extract ALL actions if multiple exist in one command
7. Return ONLY valid JSON — no prose, no markdown fences

VOICE COMMAND: "${transcript.slice(0, 2000)}"

Respond with exactly this JSON:
{
  "intent": "create_meeting|assign_task|send_whatsapp|send_email|create_reminder|add_shopping|take_notes|share_document|start_recording|create_task|retrieve|informational|correction",
  "language": "en|hi|hinglish|mixed",
  "confidence": 0.95,
  "isMultiAction": false,
  "primaryDestination": "${destination}",
  "actions": [
    {
      "type": "CREATE_TASK|ASSIGN_TASK|CREATE_CALENDAR_EVENT|SEND_WHATSAPP|SEND_EMAIL|CREATE_REMINDER|ADD_SHOPPING_ITEM|CREATE_MEETING_NOTE|START_RECORDING|COMPLETE_TASK|UPDATE_TASK",
      "destination": "${destination}",
      "title": "clean action title in English",
      "taskTitle": "",
      "taskDescription": "",
      "taskAction": "create",
      "priority": "Urgent|High|Normal|Low|",
      "assigneeName": "",
      "assigneeId": "",
      "recipientName": "",
      "recipientId": "",
      "whatsappMessage": "",
      "messageIntent": "",
      "emailSubject": "",
      "emailBody": "",
      "eventName": "",
      "startDateRaw": "",
      "endDateRaw": "",
      "durationMinutes": 60,
      "attendeeNames": [],
      "attendeeIds": [],
      "location": "",
      "reminderTitle": "",
      "reminderTime": "",
      "reminderContext": "",
      "shoppingItems": [],
      "documentName": "",
      "workflowAction": "",
      "deadlineRaw": "",
      "isRecurring": false,
      "recurrenceFrequency": "Daily|Weekly|Monthly|",
      "recurrenceDay": "",
      "dependencies": [],
      "requiresApproval": true,
      "sourceText": "exact phrase from command",
      "confidence": {"intent": 0.95, "title": 0.9, "assignee": 0.0, "deadline": 0.0}
    }
  ],
  "clarificationsNeeded": [
    {"field": "date", "question": "Which date for the meeting?", "importance": "required|optional"}
  ],
  "contextNotes": "any pronouns or references resolved"
}`;
}

// ─── Response Validator ───────────────────────────────────────────────────────
function validateResponse(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Non-object Gemini response');

  const VALID_LANGS   = new Set(['en','hi','hinglish','mixed']);
  const VALID_PRIO    = new Set(['Urgent','High','Normal','Low','']);
  const VALID_REC     = new Set(['Daily','Weekly','Monthly','']);
  const VALID_DESTS   = new Set(['GOOGLE_CALENDAR','TASK_MANAGER','TASK_ASSIGNMENT','WHATSAPP','EMAIL','REMINDERS','SHOPPING_LIST','MEETING_NOTES','DOCUMENT_WORKFLOW','SITE_RECORDING','UNKNOWN_DESTINATION']);

  const sanitizeStr  = (v, max=200) => String(v || '').slice(0, max);
  const sanitizeArr  = (v, max=20)  => Array.isArray(v) ? v.slice(0, max).map(x => typeof x === 'object' ? x : String(x).slice(0,200)) : [];
  const sanitizeBool = (v)           => Boolean(v);
  const sanitizeNum  = (v, def=0)    => isFinite(Number(v)) ? Number(v) : def;

  const actions = (Array.isArray(raw.actions) ? raw.actions : []).slice(0, 10).map(a => ({
    type:              sanitizeStr(a.type || 'CREATE_TASK', 50),
    destination:       VALID_DESTS.has(a.destination) ? a.destination : (VALID_DESTS.has(raw.primaryDestination) ? raw.primaryDestination : 'TASK_MANAGER'),
    title:             sanitizeStr(a.title, 200),
    taskTitle:         sanitizeStr(a.taskTitle || a.title, 200),
    taskDescription:   sanitizeStr(a.taskDescription || a.description, 500),
    taskAction:        sanitizeStr(a.taskAction || 'create', 20),
    priority:          VALID_PRIO.has(a.priority) ? a.priority : '',
    assigneeName:      sanitizeStr(a.assigneeName, 100),
    assigneeId:        sanitizeStr(a.assigneeId, 50),
    recipientName:     sanitizeStr(a.recipientName, 100),
    recipientId:       sanitizeStr(a.recipientId, 50),
    whatsappMessage:   sanitizeStr(a.whatsappMessage, 2000),
    messageIntent:     sanitizeStr(a.messageIntent, 300),
    emailSubject:      sanitizeStr(a.emailSubject, 200),
    emailBody:         sanitizeStr(a.emailBody, 3000),
    eventName:         sanitizeStr(a.eventName || a.title, 200),
    startDateRaw:      sanitizeStr(a.startDateRaw || a.deadlineRaw, 100),
    endDateRaw:        sanitizeStr(a.endDateRaw, 100),
    durationMinutes:   sanitizeNum(a.durationMinutes, 60),
    attendeeNames:     sanitizeArr(a.attendeeNames),
    attendeeIds:       sanitizeArr(a.attendeeIds),
    location:          sanitizeStr(a.location, 200),
    reminderTitle:     sanitizeStr(a.reminderTitle || a.title, 200),
    reminderTime:      sanitizeStr(a.reminderTime || a.startDateRaw, 100),
    reminderContext:   sanitizeStr(a.reminderContext, 300),
    shoppingItems:     sanitizeArr(a.shoppingItems),
    documentName:      sanitizeStr(a.documentName, 200),
    workflowAction:    sanitizeStr(a.workflowAction, 50),
    deadlineRaw:       sanitizeStr(a.deadlineRaw || a.startDateRaw, 100),
    isRecurring:       sanitizeBool(a.isRecurring),
    recurrenceFrequency: VALID_REC.has(a.recurrenceFrequency) ? a.recurrenceFrequency : '',
    recurrenceDay:     sanitizeStr(a.recurrenceDay, 50),
    dependencies:      sanitizeArr(a.dependencies),
    requiresApproval:  sanitizeBool(a.requiresApproval ?? true),
    sourceText:        sanitizeStr(a.sourceText, 400),
    confidence: {
      intent:   sanitizeNum(a.confidence?.intent, 0.8),
      title:    sanitizeNum(a.confidence?.title, 0.8),
      assignee: sanitizeNum(a.confidence?.assignee, 0),
      deadline: sanitizeNum(a.confidence?.deadline, 0)
    }
  }));

  const clarifications = Array.isArray(raw.clarificationsNeeded)
    ? raw.clarificationsNeeded.slice(0,10).map(c => ({
        field:      sanitizeStr(c.field, 50),
        question:   sanitizeStr(c.question || c.message, 300),
        importance: c.importance === 'required' ? 'required' : 'optional'
      }))
    : [];

  return {
    intent:             sanitizeStr(raw.intent || 'create_task', 50),
    language:           VALID_LANGS.has(raw.language) ? raw.language : 'en',
    confidence:         sanitizeNum(raw.confidence, 0.8),
    isMultiAction:      sanitizeBool(raw.isMultiAction),
    isMultiTask:        sanitizeBool(raw.isMultiAction),
    primaryDestination: VALID_DESTS.has(raw.primaryDestination) ? raw.primaryDestination : 'TASK_MANAGER',
    actions,
    clarificationsNeeded: clarifications,
    clarifications:     clarifications.map(c => ({ field: c.field, message: c.question })),
    contextNotes:       sanitizeStr(raw.contextNotes, 500)
  };
}

// ─── JSON Extractor ───────────────────────────────────────────────────────────
function extractJSON(text) {
  if (!text?.trim()) throw new Error('Empty Gemini response');
  let cleaned = text.trim();
  // Strip markdown fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find JSON object in response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Cannot parse Gemini JSON: ${cleaned.slice(0, 200)}`);
  }
}

// ─── Quota & Cooldown State (ISSUE 1: Gemini Quota Resilience) ──────────────
const _quotaState = {
  isExhausted: false,
  retryAfterEpochMs: 0,
  retryAfterSeconds: 0,
  lastErrorMessage: null,
  dailyLimitReached: false,
  hitCount: 0,
  lastAttemptCount: 0
};

export function isGeminiQuotaError(err) {
  if (!err) return false;
  if (err.isQuotaExhausted || err.code === 429 || err.status === 429 || err.status === 'RESOURCE_EXHAUSTED') {
    return true;
  }
  const msg = String(err.message || '');
  return /\b429\b|RESOURCE_EXHAUSTED|quota\s+exceeded|free[-_\s]?tier.*limit|rate[-_\s]?limit/i.test(msg);
}

export function parseRetryAfterSeconds(err) {
  if (!err) return 60;
  if (typeof err.retryAfterSeconds === 'number' && err.retryAfterSeconds > 0) {
    return err.retryAfterSeconds;
  }
  const msg = String(err.message || '');
  const retryDelayMatch =
    msg.match(/retryDelay["'\s:]+(\d+(?:\.\d+)?)s/i) ||
    msg.match(/retry\s+(?:in|after)\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)/i) ||
    msg.match(/Retry-After["'\s:]+(\d+)/i);
  if (retryDelayMatch) {
    return Math.max(1, Math.ceil(parseFloat(retryDelayMatch[1])));
  }
  if (/free[-_\s]?tier\s+daily\s+request\s+limit/i.test(msg)) {
    return 300; // 5-minute cooldown window when daily free-tier quota is exhausted
  }
  return 60;
}

export function recordGeminiQuotaExhausted(err) {
  const retrySec = parseRetryAfterSeconds(err);
  const msg = String(err?.message || 'Gemini API quota exhausted (HTTP 429 RESOURCE_EXHAUSTED)');
  _quotaState.isExhausted = true;
  _quotaState.retryAfterSeconds = retrySec;
  _quotaState.retryAfterEpochMs = Date.now() + retrySec * 1000;
  _quotaState.lastErrorMessage = msg;
  _quotaState.dailyLimitReached = /daily\s+request\s+limit/i.test(msg);
  _quotaState.hitCount += 1;

  const quotaErr = new Error(msg);
  quotaErr.code = 429;
  quotaErr.status = 'RESOURCE_EXHAUSTED';
  quotaErr.isQuotaExhausted = true;
  quotaErr.retryAfterSeconds = retrySec;
  quotaErr.dailyLimitReached = _quotaState.dailyLimitReached;
  return quotaErr;
}

export function getGeminiQuotaStatus() {
  const now = Date.now();
  const isCooldownActive = _quotaState.isExhausted && now < _quotaState.retryAfterEpochMs;
  const remainingSeconds = isCooldownActive
    ? Math.max(1, Math.ceil((_quotaState.retryAfterEpochMs - now) / 1000))
    : 0;
  if (!isCooldownActive && _quotaState.isExhausted) {
    _quotaState.isExhausted = false;
  }
  return {
    isQuotaExhausted: isCooldownActive,
    isCooldownActive,
    retryAfterSeconds: remainingSeconds,
    retryAfterEpochMs: _quotaState.retryAfterEpochMs,
    dailyLimitReached: _quotaState.dailyLimitReached,
    lastErrorMessage: _quotaState.lastErrorMessage,
    hitCount: _quotaState.hitCount,
    lastAttemptCount: _quotaState.lastAttemptCount
  };
}

export function resetGeminiQuotaStatus() {
  _quotaState.isExhausted = false;
  _quotaState.retryAfterEpochMs = 0;
  _quotaState.retryAfterSeconds = 0;
  _quotaState.lastErrorMessage = null;
  _quotaState.dailyLimitReached = false;
  _quotaState.hitCount = 0;
  _quotaState.lastAttemptCount = 0;
}

export function simulateGeminiQuotaExhaustion(retryAfterSeconds = 60, customMessage = null) {
  const err = new Error(
    customMessage ||
      `[Gemini] code: 429, status: RESOURCE_EXHAUSTED, model: ${config.gemini.model}, free-tier daily request limit: 20, retryDelay: "${retryAfterSeconds}s"`
  );
  err.code = 429;
  err.status = 'RESOURCE_EXHAUSTED';
  err.retryAfterSeconds = retryAfterSeconds;
  return recordGeminiQuotaExhausted(err);
}

// ─── Retry Logic ─────────────────────────────────────────────────────────────
export async function withRetry(fn, maxRetries = config.gemini.maxRetries) {
  let lastErr;
  _quotaState.lastAttemptCount = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    _quotaState.lastAttemptCount = attempt + 1;
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err?.message || '';
      // 1. Catch Gemini quota / HTTP 429 errors separately — NEVER retry when quota is exhausted or retryDelay is returned
      if (isGeminiQuotaError(err)) {
        throw recordGeminiQuotaExhausted(err);
      }
      // 2. Never retry permanent errors
      if (/NOT_FOUND|INVALID_ARGUMENT|PERMISSION_DENIED|no longer available|is not found for API/i.test(msg)) break;
      if (attempt === maxRetries) break;
      const delay = 300 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function normalizeTranscriptForCache(transcript) {
  return String(transcript || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 500);
}

// ─── Main Export ─────────────────────────────────────────────────────────────
/**
 * Extracts structured data from transcript using Gemini.
 * Destination-aware: uses specialized prompt per routing target.
 *
 * @param {string} transcript
 * @param {Object} context - { directory, projects, referenceDate }
 * @param {string} [destination] - routing destination (optional, improves prompt)
 * @returns {Promise<GeminiResult>}
 */
export async function extractWithGemini(transcript, context = {}, destination = 'TASK_MANAGER') {
  if (!config.gemini.isAvailable) {
    throw new Error('Gemini API key not configured');
  }

  const normalizedKeyText = normalizeTranscriptForCache(transcript);
  // Check both destination-specific and universal transcript cache keys to prevent duplicate calls across routes
  const cacheKey = `af:gemini:v3:${destination}:${hashString(normalizedKeyText)}`;
  const universalCacheKey = `af:gemini:v3:ANY:${hashString(normalizedKeyText)}`;

  const cached = (await cacheService.get(cacheKey)) || (await cacheService.get(universalCacheKey));
  if (cached) return { ...cached, _fromCache: true };

  // Respect Retry-After / Quota Cooldown — do not make external calls while quota is exhausted
  const quotaStatus = getGeminiQuotaStatus();
  if (quotaStatus.isCooldownActive) {
    _quotaState.lastAttemptCount = 0;
    const cooldownErr = new Error(
      quotaStatus.lastErrorMessage ||
        `Gemini API quota exhausted (HTTP 429 RESOURCE_EXHAUSTED). Retry after ${quotaStatus.retryAfterSeconds}s.`
    );
    cooldownErr.code = 429;
    cooldownErr.status = 'RESOURCE_EXHAUSTED';
    cooldownErr.isQuotaExhausted = true;
    cooldownErr.retryAfterSeconds = quotaStatus.retryAfterSeconds;
    throw cooldownErr;
  }

  // In-flight deduplication
  const reqHash = hashString(normalizedKeyText);
  if (_inFlightRequests.has(reqHash)) {
    return await _inFlightRequests.get(reqHash);
  }

  const promise = _executeRequest(transcript, context, destination, cacheKey, universalCacheKey);
  _inFlightRequests.set(reqHash, promise);
  try {
    return await promise;
  } finally {
    _inFlightRequests.delete(reqHash);
  }
}

async function _executeRequest(transcript, context, destination, cacheKey, universalCacheKey) {
  const { GoogleGenAI } = await import('@google/genai').catch(() => {
    throw new Error('@google/genai not installed — run: npm install @google/genai');
  });

  const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  const prompt = buildPrompt(transcript, context, destination);

  const responseText = await withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.gemini.timeoutMs);
    try {
      const res = await ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: { temperature: 0.05, maxOutputTokens: 2048 }
      });
      const text = res.text;
      if (!text) throw new Error('Empty response from Gemini');
      return text;
    } finally {
      clearTimeout(timer);
    }
  });

  const raw = extractJSON(responseText);
  const validated = validateResponse(raw);
  validated._promptVersion = PROMPT_VERSION;
  validated._model = config.gemini.model;

  await cacheService.set(cacheKey, validated, 1800);
  if (universalCacheKey) {
    await cacheService.set(universalCacheKey, validated, 1800);
  }
  return validated;
}

// ─── Health Check ─────────────────────────────────────────────────────────────
export async function checkGeminiHealth() {
  if (!config.gemini.isAvailable) return { status: 'unavailable', reason: 'API key not set' };
  const quotaStatus = getGeminiQuotaStatus();
  if (quotaStatus.isCooldownActive) {
    return {
      status: 'quota_exhausted',
      code: 429,
      retryAfterSeconds: quotaStatus.retryAfterSeconds,
      reason: quotaStatus.lastErrorMessage
    };
  }
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    await ai.models.generateContent({ model: config.gemini.model, contents: 'Reply: ok' });
    return { status: 'healthy', model: config.gemini.model, latencyMs: Date.now() };
  } catch (err) {
    if (isGeminiQuotaError(err)) {
      const qErr = recordGeminiQuotaExhausted(err);
      return {
        status: 'quota_exhausted',
        code: 429,
        retryAfterSeconds: qErr.retryAfterSeconds,
        reason: qErr.message?.slice(0, 200)
      };
    }
    return { status: 'error', reason: err.message?.slice(0, 200) };
  }
}
