import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft.js';
import { REGRESSION_PEOPLE, REGRESSION_PROJECTS } from './fixtures/regressionFixtures.js';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FIXED_REF_DATE = new Date('2026-10-29T10:00:00+05:30');

function normalizeStr(str) {
  if (!str) return '';
  return str.toString().toLowerCase().replace(/[^\w\s]/g, '').trim();
}

describe('Voice-to-Task 120 Dataset Automated Regression Suite', () => {
  const jsonPath = path.join(__dirname, 'fixtures/voice_to_task_regression_dataset.json');
  const dataset = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  dataset.records.forEach((record) => {
    it(`[${record.id}] (${record.expected_behavior}): "${record.utterance}"`, () => {
      const { utterance, expected, expected_behavior } = record;

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
        isActionable: draft.isActionable,
        intent: draft.intent,
        isMultiTask: draft.isMultiTask,
        tasksCount: draft.tasks?.length || 1
      };

      // 1. Behavior: empty_input
      if (expected_behavior === 'empty_input') {
        expect(actual.title).toBe('');
        expect(actual.assigneeName).toBeNull();
        return;
      }

      // 2. Behavior: no_task, quoted_text, untrusted_instruction
      if (['no_task', 'quoted_text', 'untrusted_instruction'].includes(expected_behavior)) {
        const isNonActionable = !actual.isActionable || actual.intent === 'task_question' || actual.intent === 'untrusted_instruction';
        expect(isNonActionable).toBe(true);
        return;
      }

      // 3. Behavior: preserve_negation
      if (expected_behavior === 'preserve_negation') {
        if (expected.task === null || expected.negated) {
          expect(actual.intent === 'task_cancel' || !actual.isActionable).toBe(true);
          return;
        }
        if (expected.priority === null) {
          expect(actual.priority).toBeFalsy();
          return;
        }
        if (expected.recurrence === null) {
          expect(actual.isRecurring).toBe(false);
          return;
        }
      }

      // 4. Multiple tasks behavior
      if (expected_behavior === 'multiple_tasks' || expected_behavior === 'multiple_tasks_or_clarify') {
        if (expected.tasks && expected.tasks.length > 1) {
          expect(actual.isMultiTask).toBe(true);
          expect(actual.tasksCount).toBeGreaterThanOrEqual(expected.tasks.length);
          return;
        }
      }

      // 5. Behavior: clarify_or_unassigned, clarify_assignee
      if (['clarify_or_unassigned', 'clarify_assignee'].includes(expected_behavior)) {
        expect(actual.assigneeName).toBeNull();
        return;
      }

      // 6. Expected title match
      if (expected.title) {
        const normExp = normalizeStr(expected.title);
        const normAct = normalizeStr(actual.title);
        const matches = normAct.includes(normExp) || normExp.includes(normAct);
        expect(matches, `Expected title "${expected.title}", got "${actual.title}"`).toBe(true);
      }

      // 7. Expected assignee match
      if (expected.assignee !== undefined) {
        if (expected.assignee === null) {
          expect(actual.assigneeName).toBeNull();
        } else {
          const normExp = normalizeStr(expected.assignee);
          const normActName = normalizeStr(actual.assigneeName || '');
          const normActRaw = normalizeStr(actual.assigneeRaw || '');
          const nameMatches = normActName.includes(normExp) || normExp.includes(normActName);
          const rawMatches = normActRaw.includes(normExp) || normExp.includes(normActRaw);
          const aliasesMatch = draft.meta.assignee?.value?.aliases?.some((a) => {
            const normA = normalizeStr(a);
            return normA.includes(normExp) || normExp.includes(normA);
          });
          const matches = nameMatches || rawMatches || Boolean(aliasesMatch);
          expect(matches, `Expected assignee "${expected.assignee}", got name="${actual.assigneeName}" raw="${actual.assigneeRaw}"`).toBe(true);
        }
      }

      // 8. Expected reviewer match
      if (expected.reviewer) {
        const normExp = normalizeStr(expected.reviewer);
        const normAct = normalizeStr(actual.reviewerName || '');
        expect(normAct.includes(normExp), `Expected reviewer "${expected.reviewer}", got "${actual.reviewerName}"`).toBe(true);
      }

      // 9. Expected project match
      if (expected.project) {
        const normExp = normalizeStr(expected.project);
        const normAct = normalizeStr(actual.projectName || '');
        expect(normAct.includes(normExp), `Expected project "${expected.project}", got "${actual.projectName}"`).toBe(true);
      }

      // 10. Expected priority match
      if (expected.priority) {
        const normExp = normalizeStr(expected.priority);
        const normAct = normalizeStr(actual.priority || '');
        if (normExp === 'urgent') {
          expect(normAct).toBe('urgent');
        } else if (normExp === 'low') {
          expect(normAct).toBe('low');
        }
      }

      // 11. Expected recurrence match
      if (expected.recurrence && expected_behavior !== 'clarify_frequency') {
        expect(actual.isRecurring || Boolean(actual.recurrenceFrequency), `Expected recurrence "${expected.recurrence}"`).toBe(true);
      }
    });
  });
});
