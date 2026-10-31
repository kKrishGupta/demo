/**
 * ActionFlow Server — Hybrid Extraction Service
 *
 * Orchestrates PATH A (rule-based), PATH B (Gemini), and PATH C (hybrid merge).
 * Runs paths in parallel where appropriate, merges by field-level provenance rules.
 */

import { config } from '../config.js';
import { cacheService, hashString } from '../cache/cacheService.js';
import { extractWithGemini } from './geminiService.js';

// ─── Input Classifier ─────────────────────────────────────────────────────────
const SIMPLE_PATTERNS = [
  /^(?:remind\s+me|set\s+reminder|create\s+reminder)\b/i,
  /^(?:show|list|display|dikhao)\s+(?:pending|tasks?|all)\b/i,
  /^(?:mark|complete)\s+.{3,30}\s+(?:complete|done|finished)$/i,
  /^(?:set|change)\s+priority\s+(?:to\s+)?(?:high|low|urgent|normal)$/i,
  /^cancel\s+.{3,40}\s+task$/i,
  /^(?:saare?\s+)?pending\s+tasks?\s+(?:dikhao|show)/i
];

/**
 * Classifies input to determine extraction path
 * @param {string} transcript
 * @returns {'FAST' | 'CONTEXTUAL' | 'HYBRID'}
 */
export function classifyInput(transcript) {
  if (!transcript?.trim()) return 'FAST';

  const clean = transcript.trim();
  const wordCount = clean.split(/\s+/).length;

  // Always FAST for very short, unambiguous commands
  if (wordCount <= 6 && SIMPLE_PATTERNS.some(p => p.test(clean))) return 'FAST';

  // Always FAST if Gemini is not available
  if (!config.gemini.isAvailable) return 'FAST';

  // CONTEXTUAL for complex, long, or multilingual inputs
  if (wordCount > 60) return 'CONTEXTUAL';
  if (/[.!?]\s+[A-Z\u0900-\u097F]/.test(clean) && wordCount > 20) return 'CONTEXTUAL';
  if (/[\u0900-\u097F]/.test(clean) && wordCount > 15) return 'CONTEXTUAL';

  // HYBRID for medium complexity
  if (wordCount > 20) return 'HYBRID';

  return 'FAST';
}

// ─── Hybrid Merge Rules ───────────────────────────────────────────────────────
/**
 * Merges rule-engine draft with Gemini result using explicit field-level rules.
 * Rule engine wins for: dates (more reliable parsing), assignee (directory match).
 * Gemini wins for: intent, title (when rule engine returns empty), dependencies, multi-action.
 *
 * @param {Object} ruleDraft - Result from rule-based extraction
 * @param {Object} geminiResult - Validated Gemini response
 * @param {Array} directory
 * @returns {Object} merged result
 */
export function mergeExtractionResults(ruleDraft, geminiResult) {
  const fields = ruleDraft.fields || {};
  const meta = ruleDraft.meta || {};
  const geminiAction = geminiResult?.actions?.[0] || {};

  const merged = {
    ...ruleDraft,
    _extractionPath: 'HYBRID',
    _geminiActions: geminiResult?.actions || [],
    fields: { ...fields },
    meta: { ...meta }
  };

  // RULE: Use Gemini intent if rule engine returns 'informational' for clear instructions
  if (geminiResult?.intent && ruleDraft.intent === 'informational') {
    merged.intent = geminiResult.intent;
  }

  // RULE: Use Gemini title if rule engine couldn't extract one
  if (!fields.title && geminiAction.title) {
    merged.fields.title = geminiAction.title;
    merged.meta.titleStatus = 'valid';
    merged.meta.titleSource = 'gemini';
  }

  // RULE: Rule engine date parsing wins (chrono-node is more reliable than Gemini for dates)
  // Only fill if rule engine found nothing
  if (!fields.dueDate && geminiAction.deadlineRaw) {
    merged.meta.geminiDeadlineRaw = geminiAction.deadlineRaw;
    // Don't auto-set dueDate — let UI prompt user to confirm
  }

  // RULE: Rule engine assignee wins (directory match is authoritative)
  // Only use Gemini assignee if rule engine found nothing AND Gemini found someone
  if (!fields.assigneeId && geminiAction.assigneeName && meta.assignee?.status !== 'valid') {
    merged.meta.geminiAssigneeName = geminiAction.assigneeName;
  }

  // RULE: Use Gemini priority if not extracted by rules
  if (!fields.priority && geminiAction.priority) {
    merged.fields.priority = geminiAction.priority;
    merged.meta.prioritySource = 'gemini';
  }

  // RULE: Merge clarifications from both sources
  const ruleClars = meta.clarifications || [];
  const geminiClars = (geminiResult?.clarifications || []).map(c => ({
    ...c, source: 'gemini'
  }));
  const seenMessages = new Set(ruleClars.map(c => c.message));
  const uniqueGeminiClars = geminiClars.filter(c => !seenMessages.has(c.message));
  merged.meta.clarifications = [...ruleClars, ...uniqueGeminiClars];

  // RULE: Use multi-task detection from either source
  if (geminiResult?.isMultiTask && !ruleDraft.isMultiTask) {
    merged.meta.geminiDetectedMultiTask = true;
  }

  // RULE: Use Gemini inter-action dependencies
  if (geminiResult?.dependencies?.length) {
    merged.meta.geminiDependencies = geminiResult.dependencies;
  }

  return merged;
}

// ─── Performance Recording ────────────────────────────────────────────────────
export function createLatencyTracker() {
  const marks = {};
  const origin = Date.now();
  return {
    mark: (name) => { marks[name] = Date.now() - origin; },
    snapshot: () => ({ ...marks }),
    total: () => Date.now() - origin
  };
}
