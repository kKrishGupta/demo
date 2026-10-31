/**
 * ActionFlow AI — Hybrid Intelligence Service
 *
 * Orchestrates the full multi-layer extraction pipeline:
 *   Input Classification → Normalization → Rule Extraction →
 *   Micro-Action Generation → Confidence Analysis → DAG Planning →
 *   Duplicate Detection → Approval Gateway
 *
 * PATH A: Fast rule-based engine for simple commands
 * PATH B: Gemini contextual engine for complex/multi-task inputs  
 * PATH C: Hybrid merge when both paths are appropriate
 */

import { extractTaskDraft } from '../extraction/extractTaskDraft.js';
import {
  ACTION_TYPES, ACTION_SOURCES, EXECUTION_STATES,
  detectActionType, draftToMicroAction, createMicroAction, REQUIRES_APPROVAL
} from './actionTypes.js';
import { buildExecutionPlan, generateRecommendations } from './dagPlanner.js';
import { buildConfidenceReport } from './confidenceEngine.js';
import { sessionContext } from './contextMemory.js';
import { duplicateDetector } from './duplicateDetector.js';

// ─── Request Classification ───────────────────────────────────────────────────
const SIMPLE_COMMAND_PATTERNS = [
  /^(?:remind\s+me|set\s+reminder|create\s+reminder)\s+/i,
  /^(?:show|list|display|dikhao)\s+(?:pending|tasks?|all)/i,
  /^(?:mark|complete)\s+.{3,40}\s+(?:complete|done|finished)/i,
  /^(?:set|change)\s+priority\s+(?:to\s+)?(?:high|low|urgent|normal)/i,
  /^(?:cancel|delete)\s+.{3,40}\s+task/i
];

/**
 * Classifies input complexity to determine extraction path
 * @param {string} transcript
 * @returns {'FAST' | 'CONTEXTUAL' | 'HYBRID'}
 */
function classifyInput(transcript) {
  if (!transcript?.trim()) return 'FAST';

  const len = transcript.trim().length;
  const wordCount = transcript.trim().split(/\s+/).length;

  // Simple commands → FAST path
  if (wordCount <= 8 && SIMPLE_COMMAND_PATTERNS.some(p => p.test(transcript.trim()))) {
    return 'FAST';
  }

  // Very long or multi-sentence → might need Gemini (if available)
  if (len > 300 || wordCount > 50) {
    return 'HYBRID';
  }

  // Hindi/Hinglish with complex structure → HYBRID
  if (/[\u0900-\u097F]/.test(transcript) && wordCount > 10) {
    return 'HYBRID';
  }

  // Multi-task markers
  if (/[.;]\s+[A-Z\u0900-\u097F]/.test(transcript) && wordCount > 15) {
    return 'HYBRID';
  }

  return 'FAST';
}

// ─── Performance Timer ────────────────────────────────────────────────────────
function makeTimer() {
  const checkpoints = {};
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    mark: (name) => {
      checkpoints[name] = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    },
    get: () => checkpoints,
    total: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start
  };
}

// ─── Main Analysis Function ───────────────────────────────────────────────────
/**
 * Full intelligence pipeline — analyze a transcript and produce an action plan
 *
 * @param {Object} params
 * @param {string} params.transcript
 * @param {Array}  params.directory
 * @param {Array}  params.projects
 * @param {Array}  params.departments
 * @param {string} [params.industry]
 * @param {Date}   [params.referenceDate]
 * @param {string} [params.requestId]
 * @returns {IntelligenceResponse}
 */
export async function analyzeTranscript({
  transcript,
  directory = [],
  projects = [],
  departments = [],
  industry = 'all',
  referenceDate = new Date(),
  requestId
}) {
  const timer = makeTimer();
  const reqId = requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  if (!transcript?.trim()) {
    return buildEmptyResponse(reqId, 'INPUT_EMPTY');
  }

  timer.mark('start');

  // ── Step 1: Context resolution (pronoun/reference resolution)
  const { resolvedTranscript, resolutions } = sessionContext.resolvePronounsAndReferences(transcript);
  const activeTranscript = resolvedTranscript || transcript;
  timer.mark('context_resolution');

  // ── Step 2: Input classification
  const extractionPath = classifyInput(activeTranscript);
  timer.mark('classification');

  // ── Step 3: Rule-based extraction (always runs)
  const draft = extractTaskDraft({
    transcript: activeTranscript,
    directory,
    projects,
    departments,
    industry,
    referenceDate
  });
  timer.mark('rule_extraction');

  // ── Step 4: Convert draft(s) to MicroActions
  const actions = [];

  if (draft.isMultiTask && Array.isArray(draft.tasks) && draft.tasks.length > 1) {
    for (const taskDraft of draft.tasks) {
      const actionType = detectActionType(taskDraft);
      const action = draftToMicroAction(taskDraft, actionType);
      actions.push(action);
    }
  } else {
    const actionType = detectActionType(draft);
    const action = draftToMicroAction(draft, actionType);
    actions.push(action);
  }
  timer.mark('action_generation');

  // ── Step 5: Duplicate detection
  for (const action of actions) {
    const dupCheck = duplicateDetector.checkDuplicate(action);
    if (dupCheck.isDuplicate) {
      action.warnings.push(`Possible duplicate detected (${dupCheck.matchType} match, similarity: ${dupCheck.similarity.toFixed(2)}).`);
      action.executionState = EXECUTION_STATES.NEEDS_CLARIFICATION;
      action.clarificationsNeeded.push({
        field: 'duplicate',
        type: 'duplicate_warning',
        message: `This action may duplicate an existing task. Continue?`,
        matchedActionId: dupCheck.matchedAction?.actionId
      });
    }
  }
  timer.mark('duplicate_detection');

  // ── Step 6: Link dependencies across actions
  linkActionDependencies(actions, draft);
  timer.mark('dependency_linking');

  // ── Step 7: DAG-based execution planning
  const executionPlan = buildExecutionPlan(actions);
  timer.mark('dag_planning');

  // ── Step 8: Confidence reports
  const confidenceReports = {};
  for (const action of actions) {
    const taskDraftForAction = draft.isMultiTask
      ? draft.tasks?.[actions.indexOf(action)] || draft
      : draft;
    const report = buildConfidenceReport(taskDraftForAction);
    confidenceReports[action.id] = report;
    action.confidence = report.fieldConfidences;
  }
  timer.mark('confidence_analysis');

  // ── Step 9: Smart recommendations
  const suggestions = [];
  for (const action of actions.slice(0, 3)) {  // Limit to top 3 actions
    const recs = generateRecommendations(action, actions);
    suggestions.push(...recs);
  }

  // ── Step 10: Language and intent metadata
  const language = draft.languageClassification?.label || 'en';
  const primaryIntent = draft.intent || 'task_create';

  // ── Determine overall status
  const overallStatus = determineOverallStatus(actions, draft);

  timer.mark('complete');
  const latencies = timer.get();
  const totalMs = timer.total();

  // ── Build response
  return {
    requestId: reqId,
    status: overallStatus,
    language,
    intent: primaryIntent,
    extractionPath,
    contextResolutions: resolutions,
    source: {
      type: 'voice_transcript',
      rawTranscript: transcript,
      normalizedTranscript: draft.normalizedTranscript || activeTranscript,
      language
    },
    actions: actions.map(action => ({
      ...action,
      isMultiTask: draft.isMultiTask || false
    })),
    clarifications: collectAllClarifications(actions),
    suggestions,
    executionPlan: {
      orderedActionIds: executionPlan.orderedActionIds,
      parallelGroups: executionPlan.parallelGroups,
      blockedActionIds: executionPlan.blockedActionIds,
      deadlineConflicts: executionPlan.deadlineConflicts,
      hasCycle: executionPlan.hasCycle,
      cycleWarning: executionPlan.warning || null
    },
    warnings: collectAllWarnings(actions, draft),
    safetyAlert: draft.meta?.safetyClassification?.isSafetyCritical
      ? draft.meta.safetyClassification
      : null,
    metadata: {
      model: 'rule-engine-v2',
      extractionPath,
      promptVersion: 'v2',
      processingTimeMs: Math.round(totalMs),
      latencyBreakdown: Object.fromEntries(
        Object.entries(latencies).map(([k, v]) => [k, Math.round(v)])
      ),
      multiTask: draft.isMultiTask || false,
      taskCount: actions.length
    }
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEmptyResponse(requestId, reason) {
  return {
    requestId,
    status: 'empty',
    reason,
    language: 'en',
    intent: 'unknown',
    extractionPath: 'FAST',
    contextResolutions: [],
    source: { type: 'voice_transcript', rawTranscript: '', normalizedTranscript: '', language: 'en' },
    actions: [],
    clarifications: [],
    suggestions: [],
    executionPlan: { orderedActionIds: [], parallelGroups: [], blockedActionIds: [], deadlineConflicts: [], hasCycle: false },
    warnings: [],
    safetyAlert: null,
    metadata: { model: 'rule-engine-v2', extractionPath: 'FAST', promptVersion: 'v2', processingTimeMs: 0, multiTask: false, taskCount: 0 }
  };
}

function determineOverallStatus(actions, draft) {
  if (!actions.length) return 'empty';
  if (draft.meta?.safetyClassification?.isSafetyCritical) return 'safety_hold';
  if (actions.some(a => a.executionState === EXECUTION_STATES.NEEDS_CLARIFICATION)) {
    return 'needs_clarification';
  }
  if (actions.every(a => a.validationStatus === 'VALID')) return 'ready';
  if (actions.some(a => a.validationStatus === 'INVALID')) return 'invalid';
  return 'extracted';
}

function collectAllClarifications(actions) {
  const seen = new Set();
  const all = [];
  for (const action of actions) {
    for (const c of (action.clarificationsNeeded || [])) {
      const key = `${c.field}:${c.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push({ ...c, actionId: action.id });
      }
    }
  }
  return all;
}

function collectAllWarnings(actions, draft) {
  const seen = new Set();
  const all = [];
  // From draft meta
  for (const w of (draft.meta?.warnings || [])) {
    if (!seen.has(w)) { seen.add(w); all.push(w); }
  }
  // From actions
  for (const action of actions) {
    for (const w of (action.warnings || [])) {
      if (!seen.has(w)) { seen.add(w); all.push(w); }
    }
  }
  return all;
}

/**
 * Links dependencies between actions in a multi-task scenario
 * based on explicit dependency text extracted from each action
 */
function linkActionDependencies(actions, draft) {
  if (actions.length <= 1) return;

  for (const action of actions) {
    if (!Array.isArray(action.dependencies)) continue;
    for (const dep of action.dependencies) {
      if (dep.actionId) continue;  // Already resolved

      // Try to match dependency description to another action's title
      const depText = (dep.description || '').toLowerCase();
      const matchedAction = actions.find(a =>
        a.id !== action.id &&
        a.title &&
        depText.length > 3 &&
        a.title.toLowerCase().includes(depText.slice(0, Math.min(depText.length, 20)))
      );
      if (matchedAction) {
        dep.actionId = matchedAction.id;
        dep.source = 'AUTO_LINKED';
      }
    }
  }
}

// ─── Quick Extraction (backward-compatible) ───────────────────────────────────
/**
 * Fast synchronous extraction for simple commands (Path A)
 * Returns the existing draft format for UI compatibility
 */
export function quickExtract(params) {
  return extractTaskDraft(params);
}

// ─── Register completed action ────────────────────────────────────────────────
export function registerCompletedAction(action) {
  sessionContext.addAction(action);
  duplicateDetector.register(action);
}

// ─── Record user correction ───────────────────────────────────────────────────
export function recordCorrection(correctionData) {
  sessionContext.recordCorrection(correctionData);
}
