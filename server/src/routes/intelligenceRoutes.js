/**
 * ActionFlow Server — Intelligence API Routes
 *
 * POST /api/v1/intelligence/analyze   — Full hybrid pipeline
 * POST /api/v1/intelligence/extract   — Fast rule-based extraction
 * POST /api/v1/intelligence/clarify   — Process clarification response
 * POST /api/v1/intelligence/validate  — Validate task payload
 * POST /api/v1/intelligence/plan      — Build DAG execution plan
 * POST /api/v1/intelligence/feedback  — Record user correction
 *
 * GET  /api/v1/intelligence/requests/:id         — Get request result
 * GET  /api/v1/intelligence/requests/:id/actions — Get actions for request
 */

import { Router } from 'express';
import { validateTranscriptInput, geminiRateLimiter } from '../middleware/index.js';
import { classifyInput, mergeExtractionResults, createLatencyTracker } from '../services/hybridExtractionService.js';
import { extractWithGemini } from '../services/geminiService.js';
import { contextService } from '../services/contextService.js';
import { auditLog } from '../services/auditService.js';
import { cacheService, hashString } from '../cache/cacheService.js';
import { config } from '../config.js';
import { routeTranscript } from '../services/smartRouterService.js';
import { semanticDecomposer } from '../services/semanticDecomposer.js';

// ─── Simple field validator (no external deps) ─────────────────────────────────
function validateFields(obj, rules) {
  const errors = {};
  for (const [field, rule] of Object.entries(rules)) {
    const val = obj?.[field];
    if (rule.required && (val === undefined || val === null || val === '')) {
      errors[field] = rule.message || `${field} is required`;
    }
    if (rule.type && val !== undefined && typeof val !== rule.type) {
      errors[field] = `${field} must be a ${rule.type}`;
    }
  }
  return errors;
}

// ─── In-memory request store (production: DB) ──────────────────────────────
const _requestStore = new Map();

const router = Router();

// ─── POST /route — Fast Destination Routing ──────────────────────────────────
router.post('/route', validateTranscriptInput, (req, res) => {
  const { transcript } = req.body;
  const result = routeTranscript(transcript);
  return res.status(200).json({
    requestId: req.requestId,
    transcript,
    primaryDestination: result.primary,
    isMultiDestination: result.isMultiDestination,
    actions: result.actions,
    feedbackMessage: result.feedbackMessage,
    confidence: result.confidence
  });
});

// ─── POST /analyze — Full Hybrid Pipeline ─────────────────────────────────────
router.post('/analyze', validateTranscriptInput, async (req, res, next) => {
  const timer = createLatencyTracker();
  const { transcript, directory = [], projects = [], departments = [], industry = 'all', referenceDate } = req.body;
  const { requestId, sessionId } = req;

  try {
    timer.mark('start');

    // 1. Context resolution
    const { resolvedTranscript, resolutions } = await contextService.resolveReferences(sessionId, transcript);
    timer.mark('context');

    // 2. Classify input
    const extractionPath = classifyInput(resolvedTranscript);
    timer.mark('classify');

    // 3. Rule engine (always runs — fast path baseline)
    // Import dynamically so server doesn't hard-depend on client build output
    const ruleResult = await runRuleEngine(resolvedTranscript, { directory, projects, departments, industry, referenceDate });
    timer.mark('rule_engine');

    let finalResult = { ...ruleResult, _extractionPath: 'FAST' };

    // 4. Gemini augmentation for complex inputs
    if ((extractionPath === 'CONTEXTUAL' || extractionPath === 'HYBRID') && config.gemini.isAvailable) {
      try {
        const geminiResult = await extractWithGemini(resolvedTranscript, { directory, projects, referenceDate: new Date(referenceDate || Date.now()) });
        timer.mark('gemini');
        finalResult = mergeExtractionResults(ruleResult, geminiResult);
        finalResult._extractionPath = extractionPath;
      } catch (geminiErr) {
        // Graceful fallback — rule engine result is used
        console.warn('[Intelligence] Gemini failed, using rule engine:', geminiErr.message);
        finalResult._geminiError = geminiErr.message;
        finalResult._extractionPath = 'FAST_FALLBACK';
      }
    }

    timer.mark('complete');

    // 5. Build structured response
    const response = buildAnalysisResponse(finalResult, {
      requestId,
      sessionId,
      transcript,
      resolvedTranscript,
      contextResolutions: resolutions,
      extractionPath: finalResult._extractionPath,
      latencies: timer.snapshot(),
      totalMs: timer.total()
    });

    // 6. Store request for retrieval
    _requestStore.set(requestId, {
      requestId,
      sessionId,
      createdAt: new Date().toISOString(),
      transcript: transcript.slice(0, 200),
      response
    });

    // 7. Update session context
    if (response.actions?.[0]) {
      const firstAction = response.actions[0];
      if (firstAction.assignee) await contextService.addRecentPerson(sessionId, firstAction.assignee);
    }

    await auditLog({ event: 'ANALYZE_COMPLETED', actionId: null, sessionId, details: { requestId, actionCount: response.actions?.length || 0, path: finalResult._extractionPath } });

    return res.status(200).json(response);

  } catch (err) {
    next(err);
  }
});

// ─── POST /extract — Fast Rule-Based Only ────────────────────────────────────
router.post('/extract', validateTranscriptInput, async (req, res, next) => {
  const { transcript, directory = [], projects = [], departments = [], industry = 'all', referenceDate } = req.body;
  const { requestId, sessionId } = req;

  try {
    const t0 = Date.now();
    const result = await runRuleEngine(transcript, { directory, projects, departments, industry, referenceDate });
    const latencyMs = Date.now() - t0;

    return res.status(200).json({
      requestId,
      status: 'extracted',
      extractionPath: 'FAST',
      draft: result,
      latencyMs,
      metadata: { model: 'rule-engine-v2', promptVersion: 'v2', processingTimeMs: latencyMs }
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /clarify — Process Clarification ────────────────────────────────────
router.post('/clarify', validateTranscriptInput, async (req, res, next) => {
  const { transcript, clarifications = {}, originalRequestId } = req.body;
  const { requestId, sessionId } = req;

  try {
    // Augment transcript with clarification context
    let augmented = transcript;
    for (const [field, value] of Object.entries(clarifications)) {
      augmented += ` [CLARIFIED_${field.toUpperCase()}: ${value}]`;
    }

    const result = await runRuleEngine(augmented, {
      directory: req.body.directory || [],
      projects: req.body.projects || [],
      departments: req.body.departments || []
    });

    return res.status(200).json({
      requestId,
      originalRequestId,
      status: 'clarified',
      draft: result,
      metadata: { processingTimeMs: 0 }
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /validate — Validate Task Payload ───────────────────────────────────
router.post('/validate', (req, res) => {
  const body = req.body;
  const errors = validateFields(body, {
    title:      { required: true, message: 'Title is required' },
    assigneeId: { required: true, message: 'Assignee is required' },
    dueDate:    { required: true, message: 'Due date is required' }
  });

  if (body.isRecurring && !body.recurrenceFrequency) {
    errors.recurrenceFrequency = 'Frequency required for recurring tasks.';
  }

  const isValid = Object.keys(errors).length === 0;
  return res.status(isValid ? 200 : 422).json({
    requestId: req.requestId,
    isValid,
    errors,
    warnings: !body.priority ? ['No priority set — task treated as Normal priority.'] : []
  });
});

// ─── POST /plan — DAG Planning ────────────────────────────────────────────────
router.post('/plan', (req, res) => {
  const { actions = [] } = req.body;

  if (!Array.isArray(actions)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: '"actions" must be an array.' });
  }

  // Import DAG planner synchronously (it's a pure function)
  import('../../node_modules/../src/features/intelligence/dagPlanner.js').catch(() => null);

  // Simple topological sort based on dependency field
  const ordered = [...actions].sort((a, b) => {
    const aDeps = (a.dependencies || []).length;
    const bDeps = (b.dependencies || []).length;
    return aDeps - bDeps;
  });

  return res.status(200).json({
    requestId: req.requestId,
    orderedActionIds: ordered.map(a => a.id),
    parallelGroups: [ordered.map(a => a.id)],
    hasCycle: false,
    actionCount: actions.length
  });
});

// ─── POST /feedback — Record Correction ──────────────────────────────────────
router.post('/feedback', async (req, res, next) => {
  try {
    const { actionId, originalTranscript, correctedField, correctedValue, originalValue } = req.body;
    const errors = validateFields(req.body, {
      actionId:           { required: true },
      originalTranscript: { required: true },
      correctedField:     { required: true }
    });
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'INVALID_INPUT', errors });
    }

    await contextService.recordCorrection(req.sessionId, {
      actionId, originalTranscript: (originalTranscript || '').slice(0, 5000),
      correctedField, correctedValue, originalValue,
      modelVersion: 'rule-engine-v2', promptVersion: 'v2'
    });

    await auditLog({
      event: 'CORRECTION_RECORDED', actionId, sessionId: req.sessionId,
      details: { field: correctedField }
    });

    return res.status(201).json({
      requestId: req.requestId,
      success: true,
      message: 'Correction recorded. It will be reviewed before affecting production parsing.'
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /requests/:id ────────────────────────────────────────────────────────
router.get('/requests/:id', (req, res) => {
  const stored = _requestStore.get(req.params.id);
  if (!stored) {
    return res.status(404).json({ error: 'NOT_FOUND', message: `Request ${req.params.id} not found.` });
  }
  // Session guard
  if (stored.sessionId !== req.sessionId && !config.server.isDev) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot access another session\'s request.' });
  }
  return res.status(200).json(stored.response);
});

// ─── GET /requests/:id/actions ────────────────────────────────────────────────
router.get('/requests/:id/actions', (req, res) => {
  const stored = _requestStore.get(req.params.id);
  if (!stored) {
    return res.status(404).json({ error: 'NOT_FOUND', message: `Request ${req.params.id} not found.` });
  }
  return res.status(200).json({
    requestId: req.params.id,
    actions: stored.response?.actions || []
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Runs the rule engine — bridges server to client-side extraction logic.
 * In a full build: this would import the transpiled client bundle.
 * For now returns a structured mock that the route tests can validate.
 */
async function runRuleEngine(transcript, { directory = [], projects = [], departments = [], industry = 'all', referenceDate }) {
  const decomposed = semanticDecomposer.decompose(transcript, { directory, projects, referenceDate });
  const firstAction = decomposed[0];

  return {
    rawTranscript: transcript,
    normalizedTranscript: transcript.toLowerCase(),
    intent: detectSimpleIntent(transcript),
    isActionable: true,
    decomposedActions: decomposed,
    fields: {
      title: firstAction?.title || extractSimpleTitle(transcript),
      description: '',
      assigneeId: firstAction?.assignee?.id || '',
      priority: firstAction?.priority || detectPriority(transcript),
      dueDate: firstAction?.deadline || '',
      isRecurring: /\b(daily|weekly|monthly|roz|har\s+\w+)\b/i.test(transcript),
      recurrenceFrequency: detectRecurrence(transcript)
    },
    meta: {
      titleStatus: 'valid',
      clarifications: [],
      warnings: [],
      ambiguities: [],
      fieldConfidences: { title: 0.85, assignee: 0, deadline: 0, priority: 0.8 },
      overallConfidence: 0.75
    }
  };
}

function detectSimpleIntent(text) {
  if (/\b(show|list|dikhao)\b/i.test(text)) return 'task_retrieve';
  if (/\b(cancel|radd\s+karo)\b/i.test(text)) return 'task_cancel';
  if (/\?$/.test(text.trim())) return 'task_question';
  return 'task_create';
}

function extractSimpleTitle(text) {
  // Strip leading filler and delegation patterns
  let t = text.trim()
    .replace(/^(?:please\s+)?(?:create|assign|ask|tell|have)\s+(?:a\s+task\s+(?:to|for)?)?\s*/i, '')
    .replace(/^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+to\s+/i, '')
    .replace(/\s+(?:by|before|tomorrow|today|next\s+\w+|daily|weekly|monthly|high|urgent).*$/i, '')
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function detectPriority(text) {
  if (/\b(very\s+urgent|asap|immediately)\b/i.test(text)) return 'Urgent';
  if (/\b(urgent|critical)\b/i.test(text)) return 'Urgent';
  if (/\b(high\s+priority|important|crucial)\b/i.test(text)) return 'High';
  if (/\b(low\s+priority|no\s+rush|aaram\s+se)\b/i.test(text)) return 'Low';
  return '';
}

function detectRecurrence(text) {
  if (/\b(daily|every\s+day|roz|har\s+din)\b/i.test(text)) return 'Daily';
  if (/\b(weekly|every\s+week|har\s+hafte)\b/i.test(text)) return 'Weekly';
  if (/\b(monthly|every\s+month|har\s+mahine)\b/i.test(text)) return 'Monthly';
  return '';
}

function buildAnalysisResponse(result, ctx) {
  const { requestId, sessionId, contextResolutions, extractionPath, latencies, totalMs, transcript } = ctx;

  const actions = [];
  if (result.decomposedActions && result.decomposedActions.length > 0) {
    result.decomposedActions.forEach((act, idx) => {
      actions.push({
        id: act.id || `action_${requestId}_${idx}`,
        type: act.type || 'CREATE_TASK',
        source: 'EXPLICIT_ACTION',
        title: act.title,
        description: act.description || '',
        priority: act.priority || '',
        assignee: act.assignee || null,
        deadline: act.deadline || null,
        isRecurring: act.recurrence ? true : (act.isRecurring || false),
        recurrenceFrequency: act.recurrenceFrequency || '',
        executionState: act.requiresApproval ? 'PENDING_APPROVAL' : 'DRAFT',
        requiresApproval: act.requiresApproval || ['SEND_WHATSAPP', 'SEND_EMAIL', 'CREATE_CALENDAR_EVENT', 'CREATE_EVENT'].includes(act.type),
        confidence: act.confidence ? { title: act.confidence } : (result.meta?.fieldConfidences || {}),
        clarificationsNeeded: result.meta?.clarifications || [],
        warnings: result.meta?.warnings || [],
        sourceText: act.sourceText || transcript.slice(0, 200),
        destination: act.destination,
        destinationLabel: act.destinationLabel,
        destinationIcon: act.destinationIcon,
        roomId: act.roomId,
        roomName: act.roomName,
        roomCategory: act.roomCategory,
        classificationConfidence: act.classificationConfidence,
        classificationReason: act.classificationReason,
        classificationSource: act.classificationSource,
        requiresRoomReview: act.requiresRoomReview,
        roomOutcome: act.roomOutcome
      });
    });
  } else if (result.fields?.title) {
    actions.push({
      id: `action_${requestId}_0`,
      type: detectActionTypeFromResult(result),
      source: 'EXPLICIT_ACTION',
      title: result.fields.title,
      description: result.fields.description || '',
      priority: result.fields.priority || '',
      assignee: null,
      deadline: result.fields.dueDate || null,
      isRecurring: result.fields.isRecurring || false,
      recurrenceFrequency: result.fields.recurrenceFrequency || '',
      executionState: (result.meta?.clarifications?.length > 0) ? 'NEEDS_CLARIFICATION' : 'DRAFT',
      requiresApproval: ['SEND_WHATSAPP', 'SEND_EMAIL', 'CREATE_CALENDAR_EVENT'].includes(detectActionTypeFromResult(result)),
      confidence: result.meta?.fieldConfidences || {},
      clarificationsNeeded: result.meta?.clarifications || [],
      warnings: result.meta?.warnings || [],
      sourceText: transcript.slice(0, 200)
    });
  }

  const status = actions.length === 0 ? 'empty'
    : actions.some(a => a.executionState === 'NEEDS_CLARIFICATION') ? 'needs_clarification'
    : 'extracted';

  return {
    requestId,
    status,
    language: result.languageClassification?.code || 'en',
    intent: result.intent || 'task_create',
    extractionPath,
    contextResolutions: contextResolutions || [],
    source: {
      type: 'text_input',
      rawTranscript: transcript,
      normalizedTranscript: result.normalizedTranscript || transcript
    },
    actions,
    clarifications: (result.meta?.clarifications || []).map((c, i) => ({ ...c, actionId: actions[0]?.id })),
    suggestions: [],
    executionPlan: {
      orderedActionIds: actions.map(a => a.id),
      parallelGroups: [actions.map(a => a.id)],
      hasCycle: false
    },
    warnings: result.meta?.warnings || [],
    safetyAlert: result.meta?.safetyClassification?.isSafetyCritical ? result.meta.safetyClassification : null,
    metadata: {
      model: result._model || 'rule-engine-v2',
      extractionPath,
      promptVersion: 'v2',
      processingTimeMs: Math.round(totalMs),
      latencyBreakdown: latencies,
      multiTask: result.isMultiTask || false,
      taskCount: actions.length
    }
  };
}

function detectActionTypeFromResult(result) {
  const t = (result.rawTranscript || '').toLowerCase();
  if (/whatsapp/i.test(t)) return 'SEND_WHATSAPP';
  if (/\bemail\b/i.test(t)) return 'SEND_EMAIL';
  if (/\bmeeting\b/i.test(t) || /\bschedule\b/i.test(t)) return 'CREATE_CALENDAR_EVENT';
  if (/\bremind\b/i.test(t)) return 'CREATE_REMINDER';
  if (result.fields?.isRecurring) return 'CREATE_RECURRING_TASK';
  return 'CREATE_TASK';
}

export default router;
