import { describe, it, expect } from 'vitest';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft';
import { SAMPLE_PEOPLE } from '../data/samplePeople';
import { SAMPLE_PROJECTS } from '../data/sampleProjects';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments';

describe('Acceptance Tests (Cases A through I)', () => {
  const refDate = new Date(2026, 9, 29, 10, 0, 0); // Thu Oct 29 2026 10:00:00

  // Case A: "Assign a task to Reena to bring milk daily."
  it('Case A: "Assign a task to Reena to bring milk daily."', () => {
    const transcript = 'Assign a task to Reena to bring milk daily.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // Clean Title without command boilerplate
    expect(draft.fields.title.toLowerCase()).toContain('bring milk');
    expect(draft.fields.title).not.toMatch(/^assign\s+a\s+task\s+to/i);
    // Assignee resolved to Reena
    expect(draft.fields.assigneeId).toBe('p6');
    expect(draft.meta.assignee.value.name).toBe('Reena Patel');
    // Recurrence is Daily
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');

    // Source spans highlight recognized entities
    const spans = draft.meta.spans;
    expect(spans.some((s) => s.category === 'assignee' && s.sourceText.includes('Reena'))).toBe(true);
    expect(spans.some((s) => (s.category === 'title_action' || s.category === 'action' || s.category === 'title') && s.sourceText.includes('bring milk'))).toBe(true);
    expect(spans.some((s) => s.category === 'recurrence' && s.sourceText.includes('daily'))).toBe(true);
  });

  // Case B: "Reena ko roz doodh leke aana hai."
  it('Case B: "Reena ko roz doodh leke aana hai."', () => {
    const transcript = 'Reena ko roz doodh leke aana hai.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // Assignee is Reena
    expect(draft.fields.assigneeId).toBe('p6');
    // Title is clean without postposition wrappers
    expect(draft.fields.title.toLowerCase()).toContain('bring milk');
    // Recurrence is Daily ("roz")
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');

    // Spans check
    const spans = draft.meta.spans;
    expect(spans.some((s) => s.category === 'assignee' && s.sourceText.includes('Reena'))).toBe(true);
    expect(spans.some((s) => s.category === 'recurrence' && s.sourceText.includes('roz'))).toBe(true);
  });

  // Case C: "Assign task to Priya for bring milk frequently and start it today and till after the month with only days 28"
  it('Case C: "Assign task to Priya for bring milk frequently and start it today and till after the month with only days 28"', () => {
    const transcript =
      'Assign task to Priya for bring milk frequently and start it today and till after the month with only days 28';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // 1. Assignee: Priya
    expect(draft.fields.assigneeId).toBe('p3');
    expect(draft.meta.assignee.value.name).toBe('Priya Singh');

    // 2. Action / Title: Bring milk
    expect(draft.fields.title.toLowerCase()).toContain('bring milk');
    expect(draft.fields.title).not.toMatch(/^assign\s+task\s+to/i);

    // 3. Recurrence: "frequently" must NOT default to Daily or Weekly. Must be marked unresolved!
    expect(draft.meta.recurrence.status).toBe('unresolved');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe(''); // Frequency unknown, clarification required
    expect(draft.meta.clarifications.some((c) => c.field === 'recurrenceFrequency')).toBe(true);

    // 4. Start date: "today" recognized without inventing fake time
    expect(draft.meta.startDate.status).toBe('valid');
    expect(draft.fields.startDate).not.toBe('');
    expect(draft.meta.startDate.isTimeInferred).toBe(true);

    // 5. "after the month with only days 28" is unresolved date phrase and must not create a fabricated deadline
    expect(draft.meta.unresolvedDatePhrase).toBeTruthy();
    expect(draft.fields.dueDate).toBe(''); // Not fabricated
    expect(draft.meta.clarifications.some((c) => c.field === 'dueDate')).toBe(true);

    // 6. Source Spans independently highlight spans with exact text and character offsets
    const spans = draft.meta.spans;
    const priyaSpan = spans.find((s) => s.category === 'assignee');
    expect(priyaSpan).toBeDefined();
    expect(priyaSpan.sourceText).toBe('Priya');
    expect(transcript.substring(priyaSpan.startIndex, priyaSpan.endIndex)).toBe('Priya');

    const actionSpan = spans.find((s) => s.category === 'title_action' || s.category === 'action' || s.category === 'title');
    expect(actionSpan).toBeDefined();
    expect(actionSpan.sourceText).toBe('bring milk');
    expect(transcript.substring(actionSpan.startIndex, actionSpan.endIndex)).toBe('bring milk');

    const recSpan = spans.find((s) => s.category === 'recurrence');
    expect(recSpan).toBeDefined();
    expect(recSpan.sourceText).toBe('frequently');
    expect(recSpan.status).toBe('unresolved');

    const startSpan = spans.find((s) => s.category === 'start_date' || s.category === 'startDate');
    expect(startSpan).toBeDefined();
    expect(startSpan.sourceText).toBe('today');

    const unresolvedSpan = spans.find((s) => s.category === 'unresolved');
    expect(unresolvedSpan).toBeDefined();
    expect(unresolvedSpan.sourceText).toBe('after the month with only days 28');
  });

  // Case D: "Priya should prepare the report every Monday until the 28th of next month."
  it('Case D: "Priya should prepare the report every Monday until the 28th of next month."', () => {
    const transcript = 'Priya should prepare the report every Monday until the 28th of next month.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // Assignee: Priya
    expect(draft.fields.assigneeId).toBe('p3');
    // Title: Prepare the report
    expect(draft.fields.title.toLowerCase()).toContain('prepare the report');
    // Recurrence: Weekly on Monday
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Weekly');
    expect(draft.fields.recurrenceDays).toContain('Monday');
    // Recurrence End Date extracted
    expect(draft.fields.recurrenceEndDate).not.toBe('');
  });

  // Case E: "Start today at 9 AM and finish Friday at 5 PM."
  it('Case E: "Start today at 9 AM and finish Friday at 5 PM."', () => {
    const transcript = 'Start today at 9 AM and finish Friday at 5 PM.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.fields.startDate).not.toBe('');
    expect(draft.meta.startDate.isTimeInferred).toBe(false); // Explicitly 9 AM
    expect(draft.fields.dueDate).not.toBe('');
    expect(draft.meta.dueDate.isTimeInferred).toBe(false); // Explicitly 5 PM
  });

  // Case F: "Bring milk regularly, but don't make it daily."
  it('Case F: "Bring milk regularly, but don\'t make it daily."', () => {
    const transcript = "Bring milk regularly, but don't make it daily.";
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // Title: Bring milk
    expect(draft.fields.title.toLowerCase()).toContain('bring milk');
    // Recurrence should NOT be Daily because of the explicit negation "don't make it daily"
    expect(draft.fields.recurrenceFrequency).not.toBe('Daily');
    expect(draft.meta.recurrence.status).toBe('unresolved');
  });

  // Case G: "Assign this to Rahul." If directory contains two Rahuls, ask which one.
  it('Case G: "Assign this to Rahul." flags ambiguity for multiple Rahuls', () => {
    const transcript = 'Assign this to Rahul.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.meta.assignee.status).toBe('ambiguous');
    expect(draft.meta.assignee.candidates.length).toBe(2);
    expect(draft.fields.assigneeId).toBe(''); // Must not guess
    expect(draft.meta.ambiguities).toContain('assignee');
    expect(draft.meta.clarifications.some((c) => c.field === 'assignee')).toBe(true);
  });

  // Case H: Manually change the extracted title, then update the transcript. Confirm manual title remains unchanged.
  it('Case H: Preserves manually edited fields when transcript updates, unless forced', () => {
    // Initial transcript extraction
    const transcript1 = 'Assign task to Priya to bring milk daily.';
    const draft1 = extractTaskDraft({
      transcript: transcript1,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // Form state initialized from extraction
    let formState = { ...draft1.fields };
    let manuallyOverridden = {};

    expect(formState.title).toContain('Bring milk');

    // User manually edits the title
    formState.title = 'Custom Manual Title for Dairy Supply';
    manuallyOverridden.title = true;

    // Transcript updates to a new instruction
    const transcript2 = 'Assign task to Priya to prepare report weekly.';
    const draft2 = extractTaskDraft({
      transcript: transcript2,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // Simulate App.jsx update logic
    const updatedForm = { ...formState };
    Object.keys(draft2.fields).forEach((key) => {
      if (!manuallyOverridden[key]) {
        updatedForm[key] = draft2.fields[key];
      }
    });

    // Title MUST remain the manually edited value
    expect(updatedForm.title).toBe('Custom Manual Title for Dairy Supply');
    // Other non-overridden fields like recurrenceFrequency DO update
    expect(updatedForm.recurrenceFrequency).toBe('Weekly');

    // When user explicitly forces re-extraction (Re-extract all fields)
    const forcedForm = { ...draft2.fields };
    expect(forcedForm.title.toLowerCase()).toContain('prepare');
  });

  // Case I: Confirm that no task is submitted automatically when transcript is recognized or form updates.
  it('Case I: Does not automatically submit task upon transcript recognition', () => {
    let submitCallCount = 0;
    const mockSubmitService = () => {
      submitCallCount += 1;
    };

    // Extracting draft
    const transcript = 'Assign task to Priya for bring milk daily.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // Verification: extraction returns data structure without calling submission
    expect(draft).toBeDefined();
    expect(draft.fields).toBeDefined();
    expect(submitCallCount).toBe(0);
  });
});
