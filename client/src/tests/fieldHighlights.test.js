import { describe, it, expect } from 'vitest';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft';
import {
  detectNewlyExtractedFields,
  getFieldControlClass,
  FIELD_CONTROL_STYLES,
  FIELD_CONTAINER_STYLES
} from '../features/extraction/useFieldHighlights';
import { SAMPLE_PEOPLE } from '../data/samplePeople';
import { SAMPLE_PROJECTS } from '../data/sampleProjects';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments';

describe('Form Field Highlighting Behavior Test Suite', () => {
  const referenceDate = new Date('2026-10-29T10:00:00.000Z');

  it('correctly detects highlighted fields for the acceptance test: "Assign a task to Reena to bring milk daily."', () => {
    const transcript = 'Assign a task to Reena to bring milk daily.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate
    });

    const { newlyChanged } = detectNewlyExtractedFields(draft, {}, {});

    // 1. Task Title: extracted ("Bring milk") -> highlighted
    expect(newlyChanged.title).toBe(true);
    expect(draft.fields.title).toBe('Bring milk');

    // 2. Task Description: extracted ("Bring milk daily") -> highlighted
    expect(newlyChanged.description).toBe(true);
    expect(draft.fields.description).toBe('Bring milk daily');

    // 3. Assignee / Doer: matched Reena -> highlighted
    expect(newlyChanged.assigneeId).toBe(true);
    expect(draft.fields.assigneeId).toBe('p6'); // Reena Patel

    // 4. Recurrence: daily recurrence extracted -> highlighted
    expect(newlyChanged.recurrence).toBe(true);
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');

    // 5. Due date/time: unmentioned -> NOT highlighted
    expect(newlyChanged.dueDate).toBeUndefined();
    expect(draft.fields.dueDate).toBe('');

    // 6. Start date/time: unmentioned -> NOT highlighted
    expect(newlyChanged.startDate).toBeUndefined();

    // 7. Other unmentioned fields -> NOT highlighted
    expect(newlyChanged.reviewerId).toBeUndefined();
    expect(newlyChanged.projectId).toBeUndefined();
    expect(newlyChanged.department).toBeUndefined();
    expect(newlyChanged.location).toBeUndefined();
    expect(newlyChanged.priority).toBeUndefined();
  });

  it('correctly detects highlighted fields for utterance with dates: "Assign a task to Priya to bring milk daily, starting today."', () => {
    const transcript = 'Assign a task to Priya to bring milk daily, starting today.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate
    });

    const { newlyChanged } = detectNewlyExtractedFields(draft, {}, {});

    expect(newlyChanged.title).toBe(true);
    expect(newlyChanged.assigneeId).toBe(true);
    expect(draft.fields.assigneeId).toBe('p3'); // Priya Singh
    expect(newlyChanged.recurrence).toBe(true);
    expect(draft.fields.isRecurring).toBe(true);
    expect(newlyChanged.startDate).toBe(true);
    expect(draft.fields.startDate).toBeTruthy();
    expect(newlyChanged.dueDate).toBeUndefined();
  });

  it('highlights only priority when priority is updated in subsequent speech', () => {
    const draft1 = extractTaskDraft({
      transcript: 'Assign to Priya to bring milk daily, starting today.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate
    });
    const result1 = detectNewlyExtractedFields(draft1, {}, {});

    const draft2 = extractTaskDraft({
      transcript: 'Assign to Priya to bring milk daily, starting today, make it urgent.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate
    });
    const result2 = detectNewlyExtractedFields(draft2, result1.nextExtracted, {});

    expect(result2.newlyChanged.priority).toBe(true);
    expect(result2.newlyChanged.title).toBeUndefined();
    expect(result2.newlyChanged.assigneeId).toBeUndefined();
    expect(result2.newlyChanged.recurrence).toBeUndefined();
    expect(result2.newlyChanged.startDate).toBeUndefined();
  });

  it('does NOT highlight manually overridden fields', () => {
    const transcript = 'Assign a task to Priya to bring milk daily, starting today.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate
    });

    const manualOverrides = { title: true, assigneeId: true };
    const { newlyChanged } = detectNewlyExtractedFields(draft, {}, manualOverrides);

    expect(newlyChanged.title).toBeUndefined();
    expect(newlyChanged.assigneeId).toBeUndefined();
    expect(newlyChanged.recurrence).toBe(true);
    expect(newlyChanged.startDate).toBe(true);
  });

  it('does NOT highlight ambiguous assignee', () => {
    const transcript = 'Assign the task to Rahul to inspect the site.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate
    });

    const { newlyChanged } = detectNewlyExtractedFields(draft, {}, {});
    expect(draft.meta.assignee.status).toBe('ambiguous');
    expect(newlyChanged.assigneeId).toBeUndefined();
  });

  it('prevents flickering on repeated identical interim speech transcripts', () => {
    const draft = extractTaskDraft({
      transcript: 'Inspect the coal conveyor belt',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate
    });

    const run1 = detectNewlyExtractedFields(draft, {}, {});
    expect(run1.newlyChanged.title).toBe(true);

    const run2 = detectNewlyExtractedFields(draft, run1.nextExtracted, {});
    expect(run2.newlyChanged.title).toBeUndefined();
  });

  it('forces highlight of all genuinely extracted fields when _forceHighlightAll is true', () => {
    const draft = extractTaskDraft({
      transcript: 'Assign a task to Reena to bring milk daily.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate
    });

    // Populate prevExtracted as if they were already extracted
    const prevExtracted = {
      title: 'Bring milk',
      description: 'Bring milk daily',
      assigneeId: 'p6',
      recurrence: 'true-Daily-1'
    };

    // Normal detection without force would return empty newlyChanged
    const normalRun = detectNewlyExtractedFields(draft, prevExtracted, {});
    expect(Object.keys(normalRun.newlyChanged).length).toBe(0);

    // With _forceHighlightAll set, all extracted fields highlight again
    draft._forceHighlightAll = true;
    const forceRun = detectNewlyExtractedFields(draft, prevExtracted, {});
    expect(forceRun.newlyChanged.title).toBe(true);
    expect(forceRun.newlyChanged.description).toBe(true);
    expect(forceRun.newlyChanged.assigneeId).toBe(true);
    expect(forceRun.newlyChanged.recurrence).toBe(true);
    // Unextracted fields still do NOT highlight
    expect(forceRun.newlyChanged.dueDate).toBeUndefined();
  });

  it('getFieldControlClass returns correct styling classes prioritizing validation states', () => {
    // 1. Highlighted state: subtle light-blue background, blue border, and soft blue ring
    const highlightedStyle = getFieldControlClass({ isHighlighted: true });
    expect(highlightedStyle).toContain('border-blue-500');
    expect(highlightedStyle).toContain('bg-blue-50/80');
    expect(highlightedStyle).toContain('ring-2');
    expect(highlightedStyle).toContain('ring-blue-200');

    // 2. Normal / Default state
    const defaultStyle = getFieldControlClass({ isHighlighted: false });
    expect(defaultStyle).toContain('border-slate-300');
    expect(defaultStyle).toContain('bg-white');

    // 3. Error state strictly takes precedence over highlight
    const errorStyle = getFieldControlClass({ isHighlighted: true, error: true });
    expect(errorStyle).toContain('border-rose-400');
    expect(errorStyle).not.toContain('border-blue-500');

    // 4. Ambiguous state strictly takes precedence over highlight
    const ambiguousStyle = getFieldControlClass({ isHighlighted: true, isAmbiguous: true });
    expect(ambiguousStyle).toContain('border-amber-400');
    expect(ambiguousStyle).not.toContain('border-blue-500');
  });

  it('exports valid container styles for composite fields', () => {
    expect(FIELD_CONTAINER_STYLES.highlighted).toContain('border-blue-400');
    expect(FIELD_CONTAINER_STYLES.highlighted).toContain('ring-2');
  });
});
