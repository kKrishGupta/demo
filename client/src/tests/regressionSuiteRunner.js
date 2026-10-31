import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft.js';
import { REGRESSION_PEOPLE, REGRESSION_PROJECTS } from './fixtures/regressionFixtures.js';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fixed, injected reference date and timezone: Thursday, Oct 29, 2026, 10:00:00 AM IST
export const FIXED_REF_DATE = new Date('2026-10-29T10:00:00+05:30');

/**
 * Normalizes string for soft comparison
 */
function normalizeStr(str) {
  if (!str) return '';
  return str.toString().toLowerCase().replace(/[^\w\s]/g, '').trim();
}

/**
 * Evaluates a single record from the dataset against the extraction engine
 * 
 * @param {Object} record
 * @returns {{ id: string, passed: boolean, category: string, expected: Object, actual: Object, reason: string }}
 */
export function evaluateRecord(record) {
  const { id, utterance, expected, expected_behavior } = record;

  const draft = extractTaskDraft({
    transcript: utterance,
    directory: REGRESSION_PEOPLE,
    projects: REGRESSION_PROJECTS,
    departments: SAMPLE_DEPARTMENTS,
    referenceDate: FIXED_REF_DATE
  });

  const actual = {
    title: draft.fields.title,
    description: draft.fields.description,
    assigneeName: draft.meta.assignee?.value?.name || null,
    assigneeRaw: draft.meta.assignee?.rawText || null,
    assigneeStatus: draft.meta.assignee?.status || 'missing',
    reviewerName: draft.meta.reviewer?.value?.name || null,
    projectName: draft.meta.project?.value?.name || null,
    location: draft.fields.location || null,
    priority: draft.fields.priority ? draft.fields.priority.toLowerCase() : null,
    isRecurring: draft.fields.isRecurring,
    recurrenceFrequency: draft.fields.recurrenceFrequency,
    startDate: draft.fields.startDate || null,
    dueDate: draft.fields.dueDate || null,
    isActionable: draft.isActionable,
    intent: draft.intent,
    isMultiTask: draft.isMultiTask,
    tasksCount: draft.tasks?.length || 1,
    dependencies: draft.metadata?.dependencies || draft.fields?.dependencies || [],
    isSafetyCritical: draft.meta?.safetyClassification?.isSafetyCritical || false
  };

  // 1. Behavior: empty_input
  if (expected_behavior === 'empty_input') {
    if (!actual.title && !actual.assigneeName) {
      return { id, passed: true, category: 'empty_input', expected, actual, reason: 'Empty input safely produced empty draft' };
    }
    return { id, passed: false, category: 'empty_input', expected, actual, reason: 'Empty input produced non-empty fields' };
  }

  // 2. Behavior: no_task, quoted_text, untrusted_instruction
  if (['no_task', 'quoted_text', 'untrusted_instruction'].includes(expected_behavior)) {
    if (!actual.isActionable || actual.intent === 'task_question' || actual.intent === 'untrusted_instruction') {
      return { id, passed: true, category: 'negation', expected, actual, reason: 'Correctly prevented task creation' };
    }
    return { id, passed: false, category: 'negation', expected, actual, reason: `Task marked ${expected_behavior} was marked actionable` };
  }

  // 3. Behavior: preserve_negation
  if (expected_behavior === 'preserve_negation') {
    // Check if task is cancel or priority/recurrence negation is respected
    if (expected.task === null || actual.intent === 'task_cancel' || !actual.isActionable) {
      return { id, passed: true, category: 'negation', expected, actual, reason: 'Negation respected' };
    }
    if (expected.priority === null && !actual.priority) {
      return { id, passed: true, category: 'negation', expected, actual, reason: 'Priority negation respected' };
    }
    if (expected.recurrence === null && !actual.isRecurring) {
      return { id, passed: true, category: 'negation', expected, actual, reason: 'Recurrence negation respected' };
    }
    if (expected.negated && actual.intent === 'task_cancel') {
      return { id, passed: true, category: 'negation', expected, actual, reason: 'Action negation respected' };
    }
  }

  // 4. Multiple tasks behavior
  if (expected_behavior === 'multiple_tasks' || expected_behavior === 'multiple_tasks_or_clarify') {
    if (expected.tasks && expected.tasks.length > 1) {
      if (actual.isMultiTask && actual.tasksCount >= expected.tasks.length) {
        return { id, passed: true, category: 'multiple_tasks', expected, actual, reason: 'Multi-task utterance segmented correctly' };
      }
      return { id, passed: false, category: 'multiple_tasks', expected, actual, reason: `Expected ${expected.tasks.length} tasks, got ${actual.tasksCount}` };
    }
  }

  // 5. Behavior: clarify_or_unassigned, clarify_assignee
  if (['clarify_or_unassigned', 'clarify_assignee'].includes(expected_behavior)) {
    if (!actual.assigneeName) {
      return { id, passed: true, category: 'assignee', expected, actual, reason: 'Assignee left unassigned/prompted for clarification' };
    }
    return { id, passed: false, category: 'assignee', expected, actual, reason: `Expected no assignee / clarification, got ${actual.assigneeName}` };
  }

  // 6. Expected title match
  if (expected.title) {
    const normExp = normalizeStr(expected.title);
    const normAct = normalizeStr(actual.title);
    if (!normAct.includes(normExp) && !normExp.includes(normAct)) {
      return { id, passed: false, category: 'task title', expected, actual, reason: `Title mismatch: expected "${expected.title}", got "${actual.title}"` };
    }
  }

  // 7. Expected assignee match
  if (expected.assignee !== undefined) {
    if (expected.assignee === null) {
      if (actual.assigneeName) {
        return { id, passed: false, category: 'assignee', expected, actual, reason: `Expected null assignee, got "${actual.assigneeName}"` };
      }
    } else {
      const normExp = normalizeStr(expected.assignee);
      const normAct = normalizeStr(actual.assigneeName || actual.assigneeRaw || '');
      if (!normAct.includes(normExp) && !normExp.includes(normAct)) {
        return { id, passed: false, category: 'assignee', expected, actual, reason: `Assignee mismatch: expected "${expected.assignee}", got "${actual.assigneeName || actual.assigneeRaw}"` };
      }
    }
  }

  // 8. Expected reviewer match
  if (expected.reviewer) {
    const normExp = normalizeStr(expected.reviewer);
    const normAct = normalizeStr(actual.reviewerName || '');
    if (!normAct.includes(normExp)) {
      return { id, passed: false, category: 'reviewer', expected, actual, reason: `Reviewer mismatch: expected "${expected.reviewer}", got "${actual.reviewerName}"` };
    }
  }

  // 9. Expected project match
  if (expected.project) {
    const normExp = normalizeStr(expected.project);
    const normAct = normalizeStr(actual.projectName || '');
    if (!normAct.includes(normExp)) {
      return { id, passed: false, category: 'project', expected, actual, reason: `Project mismatch: expected "${expected.project}", got "${actual.projectName}"` };
    }
  }

  // 10. Expected priority match
  if (expected.priority) {
    const normExp = normalizeStr(expected.priority);
    const normAct = normalizeStr(actual.priority || '');
    if (normExp === 'urgent' && normAct !== 'urgent') {
      return { id, passed: false, category: 'priority', expected, actual, reason: `Priority mismatch: expected urgent, got ${actual.priority}` };
    }
    if (normExp === 'low' && normAct !== 'low') {
      return { id, passed: false, category: 'priority', expected, actual, reason: `Priority mismatch: expected low, got ${actual.priority}` };
    }
  }

  // 11. Expected recurrence match
  if (expected.recurrence) {
    if (!actual.isRecurring && !actual.recurrenceFrequency) {
      if (expected_behavior !== 'clarify_frequency') {
        return { id, passed: false, category: 'recurrence', expected, actual, reason: `Expected recurrence "${expected.recurrence}", none detected` };
      }
    }
  }

  return { id, passed: true, category: 'general', expected, actual, reason: 'All expectations met' };
}

/**
 * Runs the full 120-test dataset and returns statistics and failure records
 */
export function runRegressionBenchmark() {
  const jsonPath = path.join(__dirname, 'fixtures/voice_to_task_regression_dataset.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const results = data.records.map(evaluateRecord);
  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);

  const failuresByCategory = {};
  failed.forEach((f) => {
    failuresByCategory[f.category] = failuresByCategory[f.category] || [];
    failuresByCategory[f.category].push(f);
  });

  return {
    total: results.length,
    passedCount: passed.length,
    failedCount: failed.length,
    passRate: ((passed.length / results.length) * 100).toFixed(1) + '%',
    failuresByCategory,
    failedRecords: failed
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const summary = runRegressionBenchmark();
  console.log(`\n================ REGRESSION BENCHMARK REPORT ================`);
  console.log(`Total Cases: ${summary.total}`);
  console.log(`Passed:      ${summary.passedCount}`);
  console.log(`Failed:      ${summary.failedCount}`);
  console.log(`Pass Rate:   ${summary.passRate}`);
  console.log(`\n--- Failures By Category ---`);
  for (const [cat, fails] of Object.entries(summary.failuresByCategory)) {
    console.log(`\n[${cat.toUpperCase()}] (${fails.length} failures):`);
    fails.forEach((f) => {
      console.log(`  - ${f.id}: ${f.reason}`);
    });
  }
}
