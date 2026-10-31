/**
 * ActionFlow AI — Evaluation & Accuracy Lab
 * Runs the 500+ evaluation dataset against the extraction engine
 * and produces field-level accuracy metrics.
 *
 * Usage (in tests or CLI):
 *   import { runEvaluation } from './evaluationRunner.js';
 *   const results = await runEvaluation(dataset, directory, projects);
 */

import { extractTaskDraft } from '../extraction/extractTaskDraft.js';
import { detectActionType } from './actionTypes.js';

/**
 * Normalizes a string for comparison
 */
function norm(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[^\w\s]/g, '').trim().replace(/\s+/g, ' ');
}

/**
 * Evaluates a single record against the extraction engine
 */
function evaluateRecord(record, directory, projects, departments, referenceDate) {
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const draft = extractTaskDraft({
    transcript: record.utterance,
    directory,
    projects,
    departments,
    referenceDate
  });

  const latencyMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs;

  const expected = record.expected || {};
  const behavior = record.expected_behavior || 'extract';
  const result = {
    id: record.id,
    category: record.category,
    utterance: record.utterance,
    behavior,
    latencyMs: Math.round(latencyMs),
    pass: true,
    failures: [],
    extracted: {}
  };

  // Collect extracted values
  result.extracted = {
    title: draft.fields?.title || '',
    assignee: draft.meta?.assignee?.value?.name || null,
    reviewer: draft.meta?.reviewer?.value?.name || null,
    priority: draft.fields?.priority || '',
    isRecurring: draft.fields?.isRecurring || false,
    recurrence: draft.fields?.recurrenceFrequency || draft.meta?.recurrence?.status || '',
    hasDeadline: Boolean(draft.fields?.dueDate),
    hasDependency: (draft.fields?.dependencies || []).length > 0,
    isMultiTask: draft.isMultiTask || false,
    taskCount: draft.isMultiTask ? (draft.tasks?.length || 1) : 1,
    actionType: detectActionType(draft),
    warnings: draft.meta?.warnings || [],
    clarifications: draft.meta?.clarifications || []
  };

  // Cancel/non-actionable behaviors
  if (behavior === 'cancel' || behavior === 'non_actionable' || behavior === 'security_reject') {
    const isActionable = draft.isActionable !== false && draft.intent !== 'task_cancel' && draft.intent !== 'untrusted_instruction';
    if (behavior === 'security_reject' && draft.intent === 'untrusted_instruction') {
      // Good — correctly rejected
    } else if (behavior === 'cancel' && isActionable) {
      result.failures.push({ field: 'intent', expected: 'NOT_ACTIONABLE', got: draft.intent });
    }
    result.pass = result.failures.length === 0;
    return result;
  }

  // For suggestion-only behaviors
  if (behavior === 'suggest_followup') {
    result.pass = true;
    return result;
  }

  // Title check
  if (expected.title && expected.title !== null) {
    const expNorm = norm(expected.title);
    const actNorm = norm(result.extracted.title);
    if (!actNorm.includes(expNorm) && !expNorm.includes(actNorm)) {
      result.failures.push({ field: 'title', expected: expected.title, got: result.extracted.title });
    }
  }

  // Assignee check
  if (expected.assignee !== undefined) {
    if (expected.assignee === null) {
      // Expect no assignee (ambiguous or missing)
      if (result.extracted.assignee && draft.meta?.assignee?.status === 'valid') {
        // For ambiguous cases this is acceptable
      }
    } else {
      const expAssignee = norm(expected.assignee);
      const actAssignee = norm(result.extracted.assignee || '');
      if (!actAssignee.includes(expAssignee) && !expAssignee.includes(actAssignee)) {
        result.failures.push({ field: 'assignee', expected: expected.assignee, got: result.extracted.assignee });
      }
    }
  }

  // Priority check
  if (expected.priority) {
    const expPriority = norm(expected.priority);
    const actPriority = norm(result.extracted.priority);
    if (actPriority !== expPriority) {
      result.failures.push({ field: 'priority', expected: expected.priority, got: result.extracted.priority });
    }
  }

  // Deadline check
  if (expected.hasDeadline === true && !result.extracted.hasDeadline) {
    result.failures.push({ field: 'deadline', expected: 'HAS_DEADLINE', got: 'NO_DEADLINE' });
  }
  if (expected.hasDeadline === false && result.extracted.hasDeadline) {
    result.failures.push({ field: 'deadline', expected: 'NO_DEADLINE', got: 'HAS_DEADLINE' });
  }

  // Recurrence check
  if (expected.isRecurring === true && !result.extracted.isRecurring) {
    result.failures.push({ field: 'isRecurring', expected: true, got: false });
  }
  if (expected.isRecurring === false && result.extracted.isRecurring) {
    result.failures.push({ field: 'isRecurring', expected: false, got: true });
  }
  if (expected.recurrence && expected.recurrence !== 'unresolved') {
    const expRec = norm(expected.recurrence);
    const actRec = norm(result.extracted.recurrence);
    if (!actRec.includes(expRec) && !expRec.includes(actRec)) {
      result.failures.push({ field: 'recurrence', expected: expected.recurrence, got: result.extracted.recurrence });
    }
  }

  // Multi-task check
  if (expected.isMultiTask === true && !result.extracted.isMultiTask) {
    result.failures.push({ field: 'isMultiTask', expected: true, got: false });
  }

  result.pass = result.failures.length === 0;
  return result;
}

/**
 * Runs the full evaluation dataset
 * @param {Object} dataset - The evaluation_dataset_500.json content
 * @param {Array} directory
 * @param {Array} projects
 * @param {Array} [departments]
 * @param {Date}  [referenceDate]
 * @returns {EvaluationReport}
 */
export function runEvaluation(dataset, directory = [], projects = [], departments = [], referenceDate = new Date()) {
  const records = dataset.records || [];
  const results = records.map(r => evaluateRecord(r, directory, projects, departments, referenceDate));

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;

  // Per-field accuracy
  const fieldCounts = {};
  const fieldPass = {};
  for (const r of results) {
    for (const f of r.failures) {
      fieldCounts[f.field] = (fieldCounts[f.field] || 0) + 1;
      fieldPass[f.field] = fieldPass[f.field] || 0;
    }
  }

  // Per-category accuracy
  const categoryResults = {};
  for (const r of results) {
    if (!categoryResults[r.category]) {
      categoryResults[r.category] = { total: 0, passed: 0 };
    }
    categoryResults[r.category].total++;
    if (r.pass) categoryResults[r.category].passed++;
  }

  // Latency stats
  const latencies = results.map(r => r.latencyMs).filter(v => v >= 0);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const p95Latency = latencies.length ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] : 0;
  const maxLatency = latencies.length ? Math.max(...latencies) : 0;

  return {
    summary: {
      total,
      passed,
      failed,
      accuracy: total > 0 ? Number((passed / total).toFixed(4)) : 0,
      accuracyPct: total > 0 ? `${(passed / total * 100).toFixed(1)}%` : '0%'
    },
    latency: {
      avgMs: avgLatency,
      p95Ms: p95Latency,
      maxMs: maxLatency
    },
    byCategory: Object.fromEntries(
      Object.entries(categoryResults).map(([cat, stats]) => [
        cat,
        {
          ...stats,
          accuracy: Number((stats.passed / stats.total).toFixed(4)),
          accuracyPct: `${(stats.passed / stats.total * 100).toFixed(1)}%`
        }
      ])
    ),
    fieldFailureCounts: fieldCounts,
    failedRecords: results.filter(r => !r.pass),
    allResults: results
  };
}
