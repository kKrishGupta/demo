import { describe, it, expect } from 'vitest';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft.js';
import { SAMPLE_PEOPLE } from '../data/samplePeople.js';
import { SAMPLE_PROJECTS } from '../data/sampleProjects.js';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments.js';

describe('Multi-Task Utterance Segmentation Test Suite', () => {
  const refDate = new Date(2026, 9, 29, 10, 0, 0);

  it('correctly parses 3 distinct tasks from a single multi-task utterance', () => {
    const multiTaskUtterance =
      'Reena should bring milk every morning. Jayant should check the generator every Friday. Priya should submit the report before month end.';

    const draft = extractTaskDraft({
      transcript: multiTaskUtterance,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.isMultiTask).toBe(true);
    expect(draft.tasks).toBeDefined();
    expect(draft.tasks.length).toBe(3);

    // Task 1: Reena & Milk
    const task1 = draft.tasks[0];
    expect(task1.fields.title).toContain('Bring milk');
    expect(task1.fields.assigneeId).toBe('p6'); // Reena Patel
    expect(task1.fields.isRecurring).toBe(true);
    expect(task1.fields.recurrenceFrequency).toBe('Daily');

    // Task 2: Jayant & Generator
    const task2 = draft.tasks[1];
    expect(task2.fields.assigneeId).toBe('p5'); // Jayant Midde
    expect(task2.fields.isRecurring).toBe(true);
    expect(task2.fields.recurrenceFrequency).toBe('Weekly');
    expect(task2.fields.recurrenceDays).toContain('Friday');

    // Task 3: Priya & Report
    const task3 = draft.tasks[2];
    expect(task3.fields.title.toLowerCase()).toContain('report');
    expect(task3.fields.assigneeId).toBe('p3'); // Priya Singh
  });

  it('preserves single multi-sentence task without falsely splitting start/due/review detail clauses', () => {
    const singleComplexTask =
      'Assign the kitchen material selection to Rahul for the Green Villa project. Start tomorrow at 10 AM, finish by Friday at 5 PM. Priya should review it. Repeat this every week.';

    const draft = extractTaskDraft({
      transcript: singleComplexTask,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // Must NOT be treated as multi-task because subsequent sentences are detail clauses of the SAME task
    expect(draft.isMultiTask).toBeFalsy();
    expect(draft.fields.title).toBe('Kitchen material selection');
    expect(draft.fields.projectId).toBe('proj1');
    expect(draft.meta.reviewer.value.name).toBe('Priya Singh');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Weekly');
  });
});
