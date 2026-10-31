import { describe, it, expect } from 'vitest';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft';
import { SAMPLE_PEOPLE } from '../data/samplePeople';
import { SAMPLE_PROJECTS } from '../data/sampleProjects';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments';

describe('Multilingual Voice-to-Task Engine Benchmark Suite', () => {
  const refDate = new Date(2026, 9, 29, 9, 0, 0);

  // 12 Equivalent Core Benchmark Sentences
  it('1. "Assign a task to Reena to bring milk daily."', () => {
    const draft = extractTaskDraft({
      transcript: 'Assign a task to Reena to bring milk daily.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');
  });

  it('2. "Reena ko roz doodh leke aana hai."', () => {
    const draft = extractTaskDraft({
      transcript: 'Reena ko roz doodh leke aana hai.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');
  });

  it('3. "Rina, milk le aana har din."', () => {
    const draft = extractTaskDraft({
      transcript: 'Rina, milk le aana har din.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel'); // via Rina alias
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');
  });

  it('4. "Reena ko doodh laane ka kaam do."', () => {
    const draft = extractTaskDraft({
      transcript: 'Reena ko doodh laane ka kaam do.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
  });

  it('5. "Milk lana hai, Reena karegi, daily."', () => {
    const draft = extractTaskDraft({
      transcript: 'Milk lana hai, Reena karegi, daily.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');
  });

  it('6. "Make Reena responsible for bringing milk every morning."', () => {
    const draft = extractTaskDraft({
      transcript: 'Make Reena responsible for bringing milk every morning.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');
  });

  it('7. "Kitchen ke liye doodh mangwa do, Reena karegi."', () => {
    const draft = extractTaskDraft({
      transcript: 'Kitchen ke liye doodh mangwa do, Reena karegi.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    expect(draft.fields.location).toBe('Kitchen');
  });

  it('8. "Reena se doodh laane ko bol do."', () => {
    const draft = extractTaskDraft({
      transcript: 'Reena se doodh laane ko bol do.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
  });

  it('9. "Create a task for Reena to bring milk every day."', () => {
    const draft = extractTaskDraft({
      transcript: 'Create a task for Reena to bring milk every day.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');
  });

  it('10. "Doodh le aao Reena, roz subah."', () => {
    const draft = extractTaskDraft({
      transcript: 'Doodh le aao Reena, roz subah.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');
  });

  it('11. "Reena should bring milk tomorrow morning."', () => {
    const draft = extractTaskDraft({
      transcript: 'Reena should bring milk tomorrow morning.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    expect(draft.fields.dueDate).not.toBe('');
    expect(draft.fields.dueDate).toContain('09:00'); // morning default
  });

  it('12. "Assign milk delivery to Reena. Kitchen location. Every day."', () => {
    const draft = extractTaskDraft({
      transcript: 'Assign milk delivery to Reena. Kitchen location. Every day.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    expect(draft.fields.location).toBe('Kitchen');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');
  });

  // Additional multilingual and context cases
  it('handles household cleaning task "Kitchen saaf karo"', () => {
    const draft = extractTaskDraft({
      transcript: 'Kitchen saaf karo.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS
    });

    expect(draft.fields.title).toBe('Clean kitchen');
    expect(draft.fields.location).toBe('Kitchen');
  });

  it('handles "Reena kitchen mein doodh rakh de"', () => {
    const draft = extractTaskDraft({
      transcript: 'Reena kitchen mein doodh rakh de.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    expect(draft.fields.location).toBe('Kitchen');
  });

  it('handles Devanagari Hindi "रीना को रोज़ दूध लेकर आना है"', () => {
    const draft = extractTaskDraft({
      transcript: 'रीना को रोज़ दूध लेकर आना है।',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');
  });

  it('correctly negates recurrence when user says "not daily" or "one time only"', () => {
    const draft = extractTaskDraft({
      transcript: 'Assign bringing milk to Reena, not daily, one time only.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS
    });

    expect(draft.fields.isRecurring).toBe(false);
    expect(draft.fields.recurrenceFrequency).toBe('');
    expect(draft.meta.recurrence.status).toBe('negated');
  });

  it('detects unknown person and issues clarification', () => {
    const draft = extractTaskDraft({
      transcript: 'Assign the site inspection to Vikram.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS
    });

    expect(draft.meta.assignee.status).toBe('unknown');
    expect(draft.fields.assigneeId).toBe('');
    expect(draft.meta.clarifications.some((c) => c.field === 'assignee')).toBe(true);
  });

  it('detects ambiguous person when 2 people share a first name', () => {
    const draft = extractTaskDraft({
      transcript: 'Assign task to Rahul for Green Villa project.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS
    });

    expect(draft.meta.assignee.status).toBe('ambiguous');
    expect(draft.meta.assignee.candidates.length).toBe(2);
    expect(draft.fields.assigneeId).toBe('');
  });

  it('handles alternate day recurrence "every two days"', () => {
    const draft = extractTaskDraft({
      transcript: 'Bring milk every two days, Reena karegi.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS
    });

    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceInterval).toBe(2);
  });

  it('handles date conflicts where due date is before start date', () => {
    const draft = extractTaskDraft({
      transcript: 'Start Friday at 5 PM and finish by Thursday at 10 AM, Reena will do it.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      referenceDate: refDate
    });

    expect(draft.meta.dueDate.status).toBe('invalid');
    expect(draft.meta.clarifications.some((c) => c.field === 'dueDate')).toBe(true);
  });
});
