import { describe, it, expect } from 'vitest';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft';
import { extractRecurrence } from '../features/extraction/extractRecurrence';
import { SAMPLE_PEOPLE } from '../data/samplePeople';
import { SAMPLE_PROJECTS } from '../data/sampleProjects';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments';

describe('Voice-to-Task Extraction Engine', () => {
  const refDate = new Date(2026, 9, 28, 9, 0, 0);

  it('correctly processes the required demonstration command', () => {
    const demoCommand =
      'Assign the kitchen material selection to Rahul for the Green Villa project. Start tomorrow at 10 AM, finish by Friday at 5 PM. Priya should review it. Repeat this every week.';

    const draft = extractTaskDraft({
      transcript: demoCommand,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // 1. Task Title & Description (synthesized or extracted)
    expect(draft.fields.title).toBe('Kitchen material selection');
    expect(draft.fields.description).toBe('Kitchen material selection task');

    // 2. Assignee Ambiguity Detection (Rahul matches 2 people)
    expect(draft.meta.assignee.status).toBe('ambiguous');
    expect(draft.meta.assignee.candidates.length).toBe(2);
    expect(draft.fields.assigneeId).toBe(''); // Must NOT auto-assign when ambiguous
    expect(draft.meta.ambiguities).toContain('assignee');
    expect(draft.meta.assignee.message).toContain('Rahul');

    // 3. Project Matching
    expect(draft.meta.project.status).toBe('valid');
    expect(draft.meta.project.value.name).toBe('Green Villa');
    expect(draft.fields.projectId).toBe('proj1');

    // 4. Reviewer Identification
    expect(draft.meta.reviewer.status).toBe('valid');
    expect(draft.meta.reviewer.value.name).toBe('Priya Singh');
    expect(draft.fields.reviewerId).toBe('p3');

    // 5. Start and Due Dates
    expect(draft.meta.startDate.status).toBe('valid');
    expect(draft.fields.startDate).not.toBe('');
    expect(draft.meta.dueDate.status).toBe('valid');
    expect(draft.fields.dueDate).not.toBe('');

    // 6. Recurrence Identification
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Weekly');
  });

  it('correctly extracts unambiguous single assignee', () => {
    const command = 'Delegate the security audit to Jayant for Internal Operations. Due Friday at 5 PM.';
    const draft = extractTaskDraft({
      transcript: command,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.meta.assignee.status).toBe('valid');
    expect(draft.meta.assignee.value.name).toBe('Jayant Midde');
    expect(draft.fields.assigneeId).toBe('p5');
  });

  it('detects missing recurrence frequency and highlights it', () => {
    const text = 'Repeat this task';
    const rec = extractRecurrence(text);

    expect(rec.isRecurring).toBe(true);
    expect(rec.status).toBe('missing_frequency');
    expect(rec.message).toContain('frequency was not specified');
  });

  it('handles user salary report command with speech artifacts', () => {
    const text = 'Create a task to prepare the monthly salary report. Assign it to Priya Singh for the Orchid Tower project. Start tomorrow at 9:00 AM and finish by Friday at 4:00 PM, Rahul Sharma showed. Review it, set the priority to I and repeat it every week. Alright.';
    const draft = extractTaskDraft({
      transcript: text,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Prepare monthly salary report');
    expect(draft.fields.assigneeId).toBe('p3'); // Priya Singh
    expect(draft.meta.assignee.value.name).toBe('Priya Singh');
    expect(draft.fields.reviewerId).toBe('p1'); // Rahul Sharma
    expect(draft.meta.reviewer.value.name).toBe('Rahul Sharma');
    expect(draft.fields.projectId).toBe('proj2'); // Orchid Tower
    expect(draft.fields.priority).toBe('High');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Weekly');
    expect(draft.fields.startDate).toContain('09:00');
    expect(draft.fields.dueDate).toContain('16:00');
    expect(draft.meta.warnings.length).toBe(0);
  });

  it('handles "Assign to the Krish" speech artifact and dates', () => {
    const text = 'Assign the office inventory check to the Krish Start tomorrow morning and complete it by Thursday evening.';
    const draft = extractTaskDraft({
      transcript: text,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Office inventory check');
    expect(draft.fields.assigneeId).toBe('p4'); // Krish Gupta
    expect(draft.meta.assignee.value.name).toBe('Krish Gupta');
    expect(draft.fields.startDate).not.toBe('');
    expect(draft.fields.dueDate).not.toBe('');
  });

  it('correctly extracts project and reviewer in continuous spoken sentences', () => {
    const text = 'Assign the kitchen material selection to Rahul for the Green Villa project and Priya to review. Finish by Friday at 5 PM.';
    const draft = extractTaskDraft({
      transcript: text,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Kitchen material selection');
    expect(draft.meta.project.status).toBe('valid');
    expect(draft.fields.projectId).toBe('proj1');
    expect(draft.meta.reviewer.status).toBe('valid');
    expect(draft.fields.reviewerId).toBe('p3');
  });

  it('handles "review by Priya" and project correctly', () => {
    const text = 'Create task for Green Villa project, review by Priya. Due tomorrow at 5 PM.';
    const draft = extractTaskDraft({
      transcript: text,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.meta.project.status).toBe('valid');
    expect(draft.fields.projectId).toBe('proj1');
    expect(draft.meta.reviewer.status).toBe('valid');
    expect(draft.fields.reviewerId).toBe('p3');
  });

  it('handles empty or unrecognized input safely', () => {
    const draft = extractTaskDraft({
      transcript: '',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS
    });

    expect(draft.fields.title).toBe('');
    expect(draft.fields.assigneeId).toBe('');
    expect(draft.fields.dueDate).toBe('');
    expect(draft.meta.titleStatus).toBe('missing');
  });
});
