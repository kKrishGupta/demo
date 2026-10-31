/**
 * ActionFlow AI — Field-Level Confidence Engine
 * Computes calibrated confidence scores per extracted field.
 * Values come from measurable signals — NOT fabricated by LLM.
 */

import { CONFIDENCE_THRESHOLDS } from './actionTypes.js';

// ─── Confidence Signal Weights ───────────────────────────────────────────────
const WEIGHTS = {
  // Entity match method quality
  EXACT_MATCH:      1.0,
  ALIAS_MATCH:      0.95,
  TOKEN_MATCH:      0.9,
  FUZZY_MATCH:      0.75,
  CONTEXT_INFERRED: 0.65,
  NOT_FOUND:        0.0,

  // Date resolution quality
  EXPLICIT_TIME:      1.0,
  EXPLICIT_DATE:      0.95,
  RELATIVE_DAY:       0.9,
  INFERRED_TIME:      0.7,
  AMBIGUOUS:          0.5,

  // Extraction method quality
  DICT_EXACT:         0.95,
  REGEX_PATTERN:      0.85,
  HEURISTIC:          0.7,
  LLM_STRUCTURED:     0.88,
  LLM_FREE_FORM:      0.75,
  FALLBACK:           0.5
};

/**
 * Computes per-field confidence for a draft extraction result
 * @param {Object} draft - Result of extractTaskDraft / processMultilingualTask
 * @returns {FieldConfidences}
 */
export function computeFieldConfidences(draft) {
  const meta = draft.meta || {};
  const fields = draft.fields || {};

  return {
    intent:     computeIntentConfidence(draft),
    title:      computeTitleConfidence(fields, meta),
    assignee:   computeEntityConfidence(meta.assignee),
    reviewer:   computeEntityConfidence(meta.reviewer),
    project:    computeEntityConfidence(meta.project),
    startDate:  computeDateConfidence(meta.startDate),
    deadline:   computeDateConfidence(meta.dueDate),
    priority:   computePriorityConfidence(fields, meta),
    recurrence: computeRecurrenceConfidence(meta.recurrence),
    location:   computeLocationConfidence(meta.location),
    overall:    0  // computed below
  };
}

function computeIntentConfidence(draft) {
  const intent = draft.intent || '';
  const isActionable = draft.isActionable !== false;
  const rawText = draft.rawTranscript || '';

  if (!rawText.trim()) return 0;
  if (intent === 'informational') return 0.4;
  if (intent === 'task_question') return 0.6;
  if (intent === 'task_cancel') return 0.95;
  if (intent === 'untrusted_instruction') return 0.0;
  if (intent === 'task_create' || intent === 'task_delegate') {
    return isActionable ? 0.9 : 0.7;
  }
  return 0.75;
}

function computeTitleConfidence(fields, meta) {
  if (!fields.title) return 0;
  if (meta.titleStatus === 'missing') return 0;

  let score = 0.7; // base for any extracted title

  // Boost if action dict matched
  if (meta.action?.canonical) score += 0.15;

  // Boost if title is reasonably long
  if (fields.title.length > 5 && fields.title.length < 80) score += 0.1;

  // Penalize if ambiguities include 'title'
  if ((meta.ambiguities || []).includes('title')) score -= 0.2;

  return Math.min(1.0, Math.max(0, Number(score.toFixed(2))));
}

function computeEntityConfidence(entityMeta) {
  if (!entityMeta) return 0;
  switch (entityMeta.status) {
    case 'valid':
      return entityMeta.confidence || WEIGHTS.EXACT_MATCH;
    case 'ambiguous':
      return WEIGHTS.FUZZY_MATCH;
    case 'unknown':
      return WEIGHTS.NOT_FOUND;
    case 'missing':
    default:
      return 0;
  }
}

function computeDateConfidence(dateMeta) {
  if (!dateMeta || dateMeta.status === 'missing') return 0;
  if (dateMeta.status === 'invalid') return 0;
  if (dateMeta.status === 'ambiguous') return WEIGHTS.AMBIGUOUS;

  if (!dateMeta.isTimeInferred) {
    return WEIGHTS.EXPLICIT_TIME;     // Explicit time given → very high confidence
  }
  return WEIGHTS.INFERRED_TIME;       // Date clear but time was inferred
}

function computePriorityConfidence(fields, meta) {
  if (!fields.priority) return 0;
  return meta.fieldConfidences?.priority || WEIGHTS.DICT_EXACT;
}

function computeRecurrenceConfidence(recurrenceMeta) {
  if (!recurrenceMeta) return 0;
  switch (recurrenceMeta.status) {
    case 'valid':    return recurrenceMeta.confidence || 0.9;
    case 'negated':  return 1.0;
    case 'unresolved': return 0.6;
    case 'missing_frequency': return 0.65;
    case 'conflict': return 0.3;
    default:         return 0;
  }
}

function computeLocationConfidence(locationMeta) {
  if (!locationMeta || !locationMeta.canonical) return 0;
  return locationMeta.confidence || 0.8;
}

/**
 * Computes overall confidence from field-level scores
 * @param {Object} fieldConfs - result of computeFieldConfidences
 * @returns {number}
 */
export function computeOverallConfidence(fieldConfs) {
  // Only count fields that were actually extracted (score > 0)
  const requiredFields = ['intent', 'title'];
  const optionalFields = ['assignee', 'deadline', 'priority', 'recurrence'];

  let sum = 0;
  let weight = 0;

  for (const field of requiredFields) {
    const score = fieldConfs[field] || 0;
    sum += score * 2;   // Required fields weighted 2x
    weight += 2;
  }

  for (const field of optionalFields) {
    const score = fieldConfs[field];
    if (score > 0) {
      sum += score;
      weight += 1;
    }
  }

  return weight > 0 ? Number((sum / weight).toFixed(2)) : 0.5;
}

/**
 * Determines which fields need review based on confidence thresholds
 * @param {Object} fieldConfs
 * @returns {Array<{field: string, confidence: number, level: string}>}
 */
export function identifyLowConfidenceFields(fieldConfs) {
  const lowFields = [];
  const important = ['title', 'assignee', 'deadline'];

  for (const [field, conf] of Object.entries(fieldConfs)) {
    if (field === 'overall') continue;
    if (conf === 0) continue; // Not extracted — different from low confidence

    const level = conf >= CONFIDENCE_THRESHOLDS.HIGH     ? 'HIGH'
                : conf >= CONFIDENCE_THRESHOLDS.MEDIUM   ? 'MEDIUM'
                : conf >= CONFIDENCE_THRESHOLDS.LOW      ? 'LOW'
                : 'VERY_LOW';

    if (level === 'LOW' || level === 'VERY_LOW') {
      lowFields.push({ field, confidence: conf, level, isImportant: important.includes(field) });
    }
  }

  return lowFields.sort((a, b) => a.confidence - b.confidence);
}

/**
 * Builds a complete field confidence report for display
 * @param {Object} draft
 * @returns {ConfidenceReport}
 */
export function buildConfidenceReport(draft) {
  const fieldConfs = computeFieldConfidences(draft);
  fieldConfs.overall = computeOverallConfidence(fieldConfs);

  const lowFields = identifyLowConfidenceFields(fieldConfs);
  const needsReview = lowFields.filter(f => f.isImportant && f.level !== 'HIGH');
  const blocksExecution = lowFields.some(f => f.level === 'VERY_LOW' && f.isImportant);

  return {
    fieldConfidences: fieldConfs,
    lowConfidenceFields: lowFields,
    needsReview,
    blocksExecution,
    overallLevel: fieldConfs.overall >= CONFIDENCE_THRESHOLDS.HIGH   ? 'HIGH'
                : fieldConfs.overall >= CONFIDENCE_THRESHOLDS.MEDIUM ? 'MEDIUM'
                : fieldConfs.overall >= CONFIDENCE_THRESHOLDS.LOW    ? 'LOW'
                : 'VERY_LOW'
  };
}
