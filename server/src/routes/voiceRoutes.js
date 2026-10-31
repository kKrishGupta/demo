/**
 * ActionFlow AI — Voice API Routes (Phase 1 Upgraded)
 *
 * Implements:
 * - Audio transcription via Whisper / Gemini Multimodal / Fallback
 * - Multi-action decomposition across 13 canonical destination types
 * - 3 Command Modes: QUICK, CONVERSATION, CONTINUOUS_MEETING
 * - Smart task vs. assignment categorization
 * - Real confidence calculation and natural conversational feedback
 * - WebSocket broadcast for real-time progressive streaming
 */

import { Router } from 'express';
import { validateTranscriptInput } from '../middleware/index.js';
import { createLatencyTracker } from '../services/hybridExtractionService.js';
import { extractWithGemini, getGeminiQuotaStatus, isGeminiQuotaError } from '../services/geminiService.js';
import { contextService } from '../services/contextService.js';
import { cacheService } from '../cache/cacheService.js';
import { auditLog } from '../services/auditService.js';
import { broadcastToSession } from '../websocket/wsServer.js';
import { config } from '../config.js';
import { transcribeAudio } from '../services/transcriptionService.js';
import { semanticDecomposer } from '../services/semanticDecomposer.js';
import {
  routeTranscript,
  routeClause,
  DESTINATIONS,
  DESTINATION_LABELS,
  DESTINATION_ICONS,
  DESTINATION_COLORS,
  classifyTaskVsAssignment
} from '../services/smartRouterService.js';

const router = Router();
const _history = new Map();

function pushHistory(sessionId, entry) {
  if (!_history.has(sessionId)) _history.set(sessionId, []);
  const h = _history.get(sessionId);
  h.unshift({ ...entry, historyId: `hist_${Date.now()}` });
  if (h.length > 50) h.pop();
}

// ─── Extract Colored Entity Spans (V4 Upgraded) ──────────────────────────────
function extractEntitySpans(text) {
  const spans = [];
  const lower = text.toLowerCase();

  const addSpan = (start, end, label, badgeLabel, category, color, confidence = 0.95) => {
    if (start >= 0 && end > start) {
      spans.push({
        startIndex: start,
        endIndex: end,
        rawText: text.substring(start, end),
        label,
        badgeLabel,
        category,
        color,
        confidence
      });
    }
  };

  // 1. DATES (Kal, Tomorrow, Today, etc.)
  const dateRegex = /\b(?:today|tomorrow|yesterday|kal|aaj|parso|this\s+friday|next\s+monday|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/gi;
  let match;
  while ((match = dateRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'DATE', 'DATE', 'DATE', 'blue', 0.95);
  }

  // 2. CALENDAR EVENTS (Meeting, standup, appointment)
  const meetingRegex = /\b(?:meeting|appointment|standup|calendar\s+invite)\b/gi;
  while ((match = meetingRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'CALENDAR_EVENT', 'CALENDAR_EVENT', 'CALENDAR_EVENT', 'blue', 0.96);
  }

  // 3. TIMES (10 baje, 4 PM, etc.)
  const timeRegex = /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|baje)|morning|evening|subah|shaam|raat)\b/gi;
  while ((match = timeRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'TIME', 'TIME', 'TIME', 'green', 0.94);
  }

  // 4. PEOPLE with context roles (Calendar Attendee vs WhatsApp Recipient vs Assignee)
  const people = ['rahul', 'aman', 'priya', 'ashok', 'jayant', 'krish', 'riya', 'reena', 'neha', 'pooja'];
  for (const p of people) {
    let idx = lower.indexOf(p);
    while (idx !== -1) {
      const end = idx + p.length;
      const surrounding = lower.slice(Math.max(0, idx - 25), Math.min(lower.length, end + 30));

      let label = 'PERSON';
      let badgeLabel = 'PERSON';
      if (/ke\s+saath\s+meeting|meeting\s+with|calendar/i.test(surrounding)) {
        label = 'PERSON / CALENDAR_ATTENDEE';
        badgeLabel = 'CALENDAR_ATTENDEE';
      } else if (/ko\s+(?:whatsapp|message|msg)|whatsapp.*par|se.*(?:bhej|bhejna|bhejni)/i.test(surrounding)) {
        label = 'PERSON / WHATSAPP_RECIPIENT';
        badgeLabel = 'WHATSAPP_RECIPIENT';
      } else if (/assign|zimmedari|karega|karegi|se.*mangwani|mangwana|se.*report/i.test(surrounding)) {
        label = 'PERSON / ASSIGNEE';
        badgeLabel = 'TASK_ASSIGNEE';
      }

      addSpan(idx, end, label, badgeLabel, 'PEOPLE', 'purple', 0.98);
      idx = lower.indexOf(p, end);
    }
  }

  // 5. WORK ITEMS / MESSAGE OBJECTS (Production report, presentation, etc.)
  const workRegex = /\b(?:production\s+report|presentation|quarterly\s+numbers|sales\s+report|inventory\s+count|website\s+testing|generator\s+check)\b/gi;
  while ((match = workRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'WORK_ITEM', 'WORK_ITEM', 'WORK_ITEM', 'amber', 0.92);
  }

  // 6. SHOPPING ITEMS (Bread, Milk, Doodh, etc.)
  const shoppingRegex = /\b(?:bread|milk|doodh|dudh|eggs?|butter|dal|atta|sugar|sabzi|fruits?)\b/gi;
  while ((match = shoppingRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'SHOPPING_ITEM', 'SHOPPING_ITEM', 'SHOPPING_ITEM', 'orange', 0.97);
  }

  // 7. LOCATIONS & SITES
  const locRegex = /\b(?:market|office|kitchen|ghar|site|coal\s+mine|green\s+villa|orchid\s+tower)\b/gi;
  while ((match = locRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'LOCATION', 'LOCATION', 'LOCATION_PROJECT', 'teal', 0.91);
  }

  // Sort and remove duplicates/overlaps
  spans.sort((a, b) => a.startIndex - b.startIndex);
  const cleanSpans = [];
  let lastEnd = 0;
  for (const s of spans) {
    if (s.startIndex >= lastEnd) {
      cleanSpans.push(s);
      lastEnd = s.endIndex;
    }
  }

  return cleanSpans;
}

// ─── POST /transcribe — Speech-to-Text via Whisper / Gemini ───────────────────
router.post('/transcribe', async (req, res, next) => {
  const { audio, mimeType = 'audio/webm', language = 'auto', mode = 'quick' } = req.body;
  const { sessionId, requestId } = req;

  if (!audio) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'audio data is required (base64 string or data URL).' });
  }

  try {
    const t0 = Date.now();
    const result = await transcribeAudio({ audio, mimeType, language, mode, sessionId });
    const latencyMs = Date.now() - t0;

    return res.status(200).json({
      requestId,
      sessionId,
      ...result,
      latencyMs
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /route — Fast Destination Classification ───────────────────────────
router.post('/route', validateTranscriptInput, (req, res) => {
  const { transcript } = req.body;
  const routing = routeTranscript(transcript);

  return res.status(200).json({
    requestId: req.requestId,
    transcript,
    primaryDestination: routing.primary,
    isMultiDestination: routing.isMultiDestination,
    actions: routing.actions,
    feedbackMessage: routing.feedbackMessage,
    confidence: routing.confidence
  });
});

// ─── POST /command — Voice-First Command Processing Pipeline ─────────────────
router.post('/command', validateTranscriptInput, async (req, res, next) => {
  const { transcript, directory = [], projects = [], referenceDate, mode = 'quick' } = req.body;
  const { requestId, sessionId } = req;
  const timer = createLatencyTracker();
  const commandId = `voice_${requestId}`;

  try {
    timer.mark('start');

    // 1. Context & Pronoun Resolution
    const { resolvedTranscript, resolutions } = await contextService.resolveReferences(sessionId, transcript);
    timer.mark('context');

    // 2. Semantic Action Decomposition & Routing Engine (Master Rebuild V4)
    const routingResult = routeTranscript(resolvedTranscript);
    const semanticActions = semanticDecomposer.decompose(resolvedTranscript, { directory, projects, referenceDate });
    timer.mark('routing');

    // 3. Coloured Entity Extraction
    const entitySpans = extractEntitySpans(resolvedTranscript);
    timer.mark('entities');

    // 4. Construct Decomposed Action Payloads
    let actions = [];
    if (semanticActions && semanticActions.length > 0) {
      actions = semanticActions;
      const uniqueDests = [...new Set(semanticActions.map(a => a.destination).filter(Boolean))];
      if (uniqueDests.length > 0) {
        routingResult.primary = uniqueDests[0];
        routingResult.uniqueDestinations = uniqueDests;
        routingResult.isMultiDestination = uniqueDests.length > 1;
      }
    } else if (!/^(?:hello|hi|hey|hey\s+there|good\s+morning|good\s+afternoon|good\s+evening|namaste|suno|suniye)\b[.!?, ]*$/i.test(resolvedTranscript.trim())) {
      actions = routingResult.actions.map((act) => {
        const lowerClause = act.clause.toLowerCase();

        // Priority
        const priority =
          /\b(?:urgent|asap|turant|immediately|critical)\b/i.test(lowerClause) ? 'Urgent' :
          /\b(?:high\s+priority|important|crucial)\b/i.test(lowerClause) ? 'High' :
          /\b(?:low\s+priority|aaram\s+se)\b/i.test(lowerClause) ? 'Low' : '';

        // Date & Time
        const deadlineRaw =
          /\bkal\b/i.test(lowerClause)      ? 'tomorrow' :
          /\btomorrow\b/i.test(lowerClause) ? 'tomorrow' :
          /\baaj\b/i.test(lowerClause)      ? 'today' :
          /\bfriday\b/i.test(lowerClause)   ? 'this Friday' :
          /\bmonday\b/i.test(lowerClause)   ? 'this Monday' : '';

        // Shopping items if applicable
        const shoppingItems = [];
        if (act.destination === DESTINATIONS.SHOPPING_LIST) {
          const found = lowerClause.match(/\b(?:bread|milk|doodh|sabzi|atta|chawal|dal|eggs?|sugar|namak|butter|oil)\b/gi);
          if (found) shoppingItems.push(...new Set(found.map(i => i.toLowerCase())));
        }

        // WhatsApp message if applicable (never fabricate filler text)
        let whatsappMessage = null;
        if (act.destination === DESTINATIONS.WHATSAPP) {
          const m = act.clause.match(/(?:ki|ke|that|saying|bol do|bolo|inform|bata do)\s+([^.;!?]+)/i);
          whatsappMessage = m?.[1]?.trim() || null;
        }

        return {
          id: act.id,
          type: act.operation,
          destination: act.destination,
          destinationLabel: act.destinationLabel,
          destinationIcon: act.destinationIcon,
          destinationColor: act.destinationColor,
          title: act.clause.charAt(0).toUpperCase() + act.clause.slice(1),
          description: whatsappMessage || '',
          priority,
          deadlineRaw,
          whatsappMessage,
          shoppingItems,
          dependencies: [],
          requiresApproval: act.requiresApproval,
          stage: act.requiresApproval ? 'READY_FOR_APPROVAL' : 'EXTRACTED',
          sourceText: act.clause,
          confidence: {
            intent: act.confidence,
            overall: act.confidence
          },
          extractionPath: 'FAST'
        };
      });
    }

    // 7. Determine whether deterministic entities are sufficiently clear (so Gemini enrichment is optional)
    const hasSufficientDeterministicClarity =
      actions.length > 0 &&
      actions.every(a => {
        const conf = typeof a.confidence === 'number' ? a.confidence : (a.confidence?.overall || a.confidence?.intent || 0);
        if (conf < 0.85) return false;
        if (a.type === 'SEND_WHATSAPP' || a.destination === 'WHATSAPP') {
          return Boolean((a.recipientName || a.recipientPhone) && a.whatsappMessage);
        }
        return Boolean(a.title);
      });

    // Build clarifications when confidence or entities are insufficient instead of guessing
    const clarifications = [];
    for (const a of actions) {
      if (a.type === 'SEND_WHATSAPP' || a.destination === 'WHATSAPP') {
        if (!a.recipientName && !a.recipientPhone) {
          clarifications.push({
            actionId: a.id,
            field: 'recipient',
            question: 'Who should receive this WhatsApp message, and what is their phone number?'
          });
        }
        if (!a.whatsappMessage) {
          clarifications.push({
            actionId: a.id,
            field: 'whatsappMessage',
            question: `What message would you like to send${a.recipientName ? ` to ${a.recipientName}` : ''}?`
          });
        }
      }
    }

    const quotaStatus = getGeminiQuotaStatus();
    const shouldRunGeminiEnrichment =
      config.gemini.isAvailable &&
      !quotaStatus.isCooldownActive &&
      (Boolean(req.body?.forceGeminiEnrichment) || !hasSufficientDeterministicClarity);

    const geminiWarning = quotaStatus.isCooldownActive
      ? {
          code: 'GEMINI_QUOTA_EXHAUSTED',
          status: 429,
          retryAfterSeconds: quotaStatus.retryAfterSeconds,
          message: `Gemini AI enrichment is temporarily unavailable (free-tier quota exhausted, retry after ${quotaStatus.retryAfterSeconds}s). Deterministic extraction and action routing are active.`
        }
      : null;

    const responsePayload = {
      commandId,
      requestId,
      mode,
      transcript,
      resolvedTranscript,
      contextResolutions: resolutions,
      primaryDestination: routingResult.primary,
      destinationLabel: DESTINATION_LABELS[routingResult.primary],
      destinationIcon: DESTINATION_ICONS[routingResult.primary],
      isMultiAction: actions.length > 1,
      isMultiDestination: routingResult.isMultiDestination,
      actions,
      clarifications,
      entitySpans,
      feedbackMessage: routingResult.feedbackMessage,
      processingTimeMs: Math.round(timer.total()),
      extractionPath: 'DETERMINISTIC_FAST',
      geminiEnrichmentPending: shouldRunGeminiEnrichment,
      geminiWarning,
      enrichmentId: commandId
    };

    // Cache result
    await cacheService.set(`af:voice:result:${commandId}`, responsePayload, 1800);
    pushHistory(sessionId, {
      commandId,
      transcript: transcript.slice(0, 100),
      destination: routingResult.primary,
      actionCount: actions.length,
      mode,
      timestamp: new Date().toISOString()
    });

    // Send immediate fast-path response
    res.status(200).json(responsePayload);

    // Asynchronous Gemini enrichment only when needed and quota is available
    if (shouldRunGeminiEnrichment) {
      _enrichAsync(commandId, sessionId, resolvedTranscript, routingResult.primary, directory, projects, referenceDate, responsePayload);
    }

    await auditLog({
      event: 'VOICE_COMMAND_PROCESSED',
      actionId: commandId,
      sessionId,
      details: {
        destinations: routingResult.uniqueDestinations,
        actionCount: actions.length,
        mode,
        ms: Math.round(timer.total())
      }
    });

  } catch (err) {
    next(err);
  }
});

// ─── Async Gemini Enrichment ───────────────────────────────────────────────────
async function _enrichAsync(commandId, sessionId, transcript, destination, directory, projects, referenceDate, base) {
  try {
    broadcastToSession(sessionId, {
      type: 'GEMINI_STARTED',
      commandId,
      message: 'Analyzing contextual details and verifying entities...'
    });

    const gemini = await extractWithGemini(
      transcript,
      {
        directory: (directory || []).slice(0, 15),
        projects: (projects || []).slice(0, 8),
        referenceDate: referenceDate ? new Date(referenceDate) : new Date()
      },
      destination
    );

    const enriched = {
      ...base,
      geminiData: gemini,
      geminiEnrichmentPending: false,
      enrichedAt: new Date().toISOString()
    };

    await cacheService.set(`af:voice:result:${commandId}`, enriched, 1800);
    broadcastToSession(sessionId, {
      type: 'GEMINI_ENRICHMENT',
      commandId,
      ...enriched
    });

  } catch (err) {
    const isQuota = isGeminiQuotaError(err);
    const quotaStatus = getGeminiQuotaStatus();
    const warningMsg = isQuota
      ? `Gemini AI enrichment is temporarily unavailable (HTTP 429 quota exhausted, retry after ${err.retryAfterSeconds || quotaStatus.retryAfterSeconds || 60}s). Deterministic extraction and routing remain active.`
      : 'AI enrichment unavailable. Fast-path deterministic actions active.';

    console.warn(`[VoiceRoutes] Gemini enrichment ${isQuota ? 'quota exhausted (429)' : 'failed'}:`, commandId, err.message);

    const fallbackStored = {
      ...base,
      geminiEnrichmentPending: false,
      geminiWarning: {
        code: isQuota ? 'GEMINI_QUOTA_EXHAUSTED' : 'GEMINI_UNAVAILABLE',
        status: isQuota ? 429 : 503,
        retryAfterSeconds: err.retryAfterSeconds || quotaStatus.retryAfterSeconds || 0,
        message: warningMsg
      }
    };
    await cacheService.set(`af:voice:result:${commandId}`, fallbackStored, 1800);

    broadcastToSession(sessionId, {
      type: 'GEMINI_FALLBACK',
      commandId,
      isQuotaExhausted: isQuota,
      retryAfterSeconds: err.retryAfterSeconds || quotaStatus.retryAfterSeconds || 0,
      message: warningMsg,
      geminiWarning: fallbackStored.geminiWarning,
      actions: base.actions
    });
  }
}

// ─── GET /history ─────────────────────────────────────────────────────────────
router.get('/history', (req, res) => {
  const h = _history.get(req.sessionId) || [];
  return res.status(200).json({ requestId: req.requestId, count: h.length, history: h });
});

// ─── GET /result/:id ──────────────────────────────────────────────────────────
router.get('/result/:id', async (req, res) => {
  const stored = await cacheService.get(`af:voice:result:${req.params.id}`);
  if (!stored) {
    return res.status(404).json({ error: 'NOT_FOUND', message: `Result ${req.params.id} not found.` });
  }
  return res.status(200).json(stored);
});

export { extractEntitySpans };
export default router;
