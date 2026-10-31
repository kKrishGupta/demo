import { describe, it, expect } from 'vitest';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft.js';
import { SAMPLE_PEOPLE } from '../data/samplePeople.js';
import { SAMPLE_PROJECTS } from '../data/sampleProjects.js';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments.js';

const INITIAL_TASK_STATE = {
  title: '',
  description: '',
  assigneeId: '',
  reviewerId: '',
  projectId: '',
  department: '',
  location: '',
  priority: '',
  startDate: '',
  dueDate: '',
  isRecurring: false,
  recurrenceFrequency: '',
  recurrenceInterval: 1,
  recurrenceDays: [],
  recurrenceEndDate: '',
  dependencies: []
};

describe('Regression Task Extraction Test Suite (Critical Bug Fix)', () => {
  const refDate = new Date(2026, 9, 29, 10, 0, 0);

  // Exact failing transcript from user bug report
  it('correctly processes the exact failing transcript without stale demo or false fallback', () => {
    const transcript =
      'Assign a task to Reena to create a website. A review by Ashok. And check it regularly and it is very urgent.';

    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // 1. Title must be "Create a website", NEVER "Inspect and repair"
    expect(draft.fields.title).toBe('Create a website');
    expect(draft.fields.title).not.toContain('Inspect and repair');

    // 2. Description must refer to creating a website
    expect(draft.fields.description.toLowerCase()).toContain('create a website');
    expect(draft.fields.description).not.toContain('Inspect and repair');

    // 3. Doer is Reena Patel (p6)
    expect(draft.fields.assigneeId).toBe('p6');
    expect(draft.meta.assignee.value?.name).toBe('Reena Patel');

    // 4. Reviewer is Ashok Kumar (p7)
    expect(draft.fields.reviewerId).toBe('p7');
    expect(draft.meta.reviewer.value?.name).toBe('Ashok Kumar');

    // 5. Priority is Urgent ("very urgent" -> Urgent)
    expect(draft.fields.priority).toBe('Urgent');

    // 6. "Regularly" recognized as possible recurring check instruction
    expect(draft.meta.recurrence.status).toBe('unresolved');
    expect(draft.meta.recurrence.rawText.toLowerCase()).toContain('regularly');

    // Recurrence frequency remains unresolved, and recurrence toggle is NOT left enabled
    expect(draft.fields.recurrenceFrequency).toBe('');
    expect(draft.fields.isRecurring).toBe(false);

    // 7. Due date remains missing (never fabricated)
    expect(draft.fields.dueDate).toBe('');
    expect(draft.meta.dueDate.status).toBe('missing');

    // 8. Targeted clarification is displayed
    const clarifications = draft.meta.clarifications;
    expect(clarifications.length).toBeGreaterThan(0);
    const hasCheckClarification = clarifications.some(
      (c) =>
        c.message.includes("'check it regularly' be a separate recurring task") ||
        c.message.includes('How often should the check repeat')
    );
    expect(hasCheckClarification).toBe(true);

    // 9. No task is confirmed/submitted automatically
    expect(draft.meta.isConfirmed).toBeFalsy();
  });

  // Test Case A
  it('Case A: "Assign a task to Reena to create a website. Ashok should review it. Check it daily. It is very urgent."', () => {
    const transcript =
      'Assign a task to Reena to create a website. Ashok should review it. Check it daily. It is very urgent.';

    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Create a website');
    expect(draft.fields.assigneeId).toBe('p6'); // Reena Patel
    expect(draft.fields.reviewerId).toBe('p7'); // Ashok Kumar
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');
    expect(draft.fields.priority).toBe('Urgent');
    expect(draft.fields.dueDate).toBe(''); // Missing deadline
    expect(draft.meta.dueDate.status).toBe('missing');
  });

  // Test Case B
  it('Case B: "Assign website creation to Reena. Ashok should review it weekly."', () => {
    const transcript = 'Assign website creation to Reena. Ashok should review it weekly.';

    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Create a website');
    expect(draft.fields.assigneeId).toBe('p6'); // Reena Patel
    expect(draft.fields.reviewerId).toBe('p7'); // Ashok Kumar
    expect(draft.fields.recurrenceFrequency).toBe('Weekly');

    // Clarification asks whether the weekly review is a separate task or reviewer responsibility
    const hasWeeklyReviewClarification = draft.meta.clarifications.some(
      (c) => c.field === 'reviewer' && c.message.includes('Should weekly review be a separate task')
    );
    expect(hasWeeklyReviewClarification).toBe(true);
  });

  // Test Case C
  it('Case C: "Create a website for Reena. The task is to inspect and repair the old server."', () => {
    const transcript = 'Create a website for Reena. The task is to inspect and repair the old server.';

    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // Explicit task definition takes precedence
    expect(draft.fields.title).toBe('Inspect and repair the old server');
    expect(draft.fields.title).not.toBe('Create a website');
  });

  // Test Case D
  it('Case D: "Actually, change the task from inspecting the server to creating a website."', () => {
    const transcript = 'Actually, change the task from inspecting the server to creating a website.';

    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // Self-correction updates title to creating a website without stale task text
    expect(draft.fields.title).toBe('Create a website');
    expect(draft.fields.title.toLowerCase()).not.toContain('inspecting the server');
  });

  // Test Case E
  it('Case E: "Create a website. Make it urgent. No recurring schedule."', () => {
    const transcript = 'Create a website. Make it urgent. No recurring schedule.';

    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Create a website');
    expect(draft.fields.priority).toBe('Urgent');
    expect(draft.fields.isRecurring).toBe(false);
    expect(draft.meta.recurrence.status).toBe('negated');
  });

  // Test Case F: Demo loaded, then replaced with completely unrelated command
  it('Case F: Replacing demo transcript with unrelated command prevents any demo field leakage', () => {
    // 1. Simulate demo state
    const demoState = {
      ...INITIAL_TASK_STATE,
      title: 'Inspect and repair',
      description: 'Inspect and repair task',
      assigneeId: 'p6',
      reviewerId: '',
      isRecurring: true,
      recurrenceFrequency: 'Daily',
      priority: 'Urgent'
    };

    // 2. New unrelated transcript (non-recurring)
    const newTranscript = 'Prepare the operations budget.';
    const newDraft = extractTaskDraft({
      transcript: newTranscript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // 3. Reconcile state as in App.jsx (starting from fresh initial state, preserving only manual overrides)
    const manuallyOverridden = {}; // No manual user typing
    const updatedForm = { ...INITIAL_TASK_STATE };
    Object.keys(newDraft.fields).forEach((key) => {
      if (!manuallyOverridden[key]) {
        updatedForm[key] = newDraft.fields[key];
      } else {
        updatedForm[key] = demoState[key];
      }
    });

    // No stale demo title, description, person, recurrence, or priority leaks into the new extraction
    expect(updatedForm.title).toContain('operations budget');
    expect(updatedForm.title).not.toContain('Inspect and repair');
    expect(updatedForm.description).not.toContain('Inspect and repair');
    expect(updatedForm.isRecurring).toBe(false); // Demo was Daily recurring, new is not
    expect(updatedForm.priority).toBe(''); // Demo was Urgent, new has no priority
  });

  // Test Case G: Out-of-order / Slow async race condition protection
  it('Case G: Obsolete slow asynchronous extraction result cannot overwrite newer transcript result', async () => {
    let transcriptVersion = 0;
    let currentFormState = { ...INITIAL_TASK_STATE };

    const processTranscriptAsync = async (text, delayMs) => {
      transcriptVersion += 1;
      const requestVersion = transcriptVersion;

      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const draft = extractTaskDraft({
        transcript: text,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        departments: SAMPLE_DEPARTMENTS,
        referenceDate: refDate
      });

      // Strict version guard: ignore obsolete result if a newer transcript was already requested
      if (requestVersion !== transcriptVersion) {
        return { ignored: true, requestVersion };
      }

      currentFormState = {
        ...INITIAL_TASK_STATE,
        ...draft.fields
      };
      return { ignored: false, requestVersion };
    };

    // Fire Transcript A (slow, 80ms)
    const slowPromise = processTranscriptAsync('Assign a task to Reena to create a website.', 80);

    // Fire Transcript B immediately after (fast, 10ms)
    const fastPromise = processTranscriptAsync('Prepare financial report with Priya.', 10);

    const [slowResult, fastResult] = await Promise.all([slowPromise, fastPromise]);

    // Transcript B finished first and set the form
    expect(fastResult.ignored).toBe(false);

    // Slower Transcript A finished later but was ignored due to obsolete version
    expect(slowResult.ignored).toBe(true);

    // Final state strictly reflects Transcript B, not Transcript A
    expect(currentFormState.title).toContain('Prepare financial report');
    expect(currentFormState.title).not.toContain('website');
  });

  // Section 8: Imperative & Delegation Action Extraction Regression Tests
  describe('Imperative & Delegation Action Extraction (Section 8)', () => {
    // 1. "Ask the Riya to bring the milk milk from the market."
    it('Test 1: "Ask the Riya to bring the milk milk from the market."', () => {
      const transcript = 'Ask the Riya to bring the milk milk from the market.';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        departments: SAMPLE_DEPARTMENTS,
        referenceDate: refDate
      });

      // Title: "Bring milk", NOT "Ask the Riya"
      expect(draft.fields.title).toBe('Bring milk');
      expect(draft.fields.title).not.toContain('Ask');
      expect(draft.fields.title).not.toContain('Riya');

      // Description preserves market context and normalizes speech repetition
      expect(draft.fields.description.toLowerCase()).toContain('bring');
      expect(draft.fields.description.toLowerCase()).toContain('milk');
      expect(draft.fields.description.toLowerCase()).toContain('market');
      expect(draft.fields.description).not.toContain('milk milk');

      // Assignee: Riya matched to p8
      expect(draft.fields.assigneeId).toBe('p8');
      expect(draft.meta.assignee.value?.name).toBe('Riya Sen');

      // Action, Object, Location
      expect(draft.action).toBe('bring');
      expect(draft.object).toBe('milk');
      expect(draft.fields.location).toBe('Market');

      // Recurrence, priority, dates not specified
      expect(draft.fields.isRecurring).toBe(false);
      expect(draft.fields.priority).toBe('');
      expect(draft.fields.startDate).toBe('');
      expect(draft.fields.dueDate).toBe('');
    });

    // 2. "Tell Rahul to inspect the generator tomorrow morning."
    it('Test 2: "Tell Rahul to inspect the generator tomorrow morning."', () => {
      const transcript = 'Tell Rahul to inspect the generator tomorrow morning.';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        departments: SAMPLE_DEPARTMENTS,
        referenceDate: refDate
      });

      expect(draft.fields.title).toBe('Inspect generator');
      expect(draft.fields.title).not.toContain('Tell');
      expect(draft.fields.title).not.toContain('Rahul');
      expect(draft.fields.description).toContain('tomorrow morning');
      // Assignee Rahul (ambiguous between Rahul Sharma and Rahul Verma, or matched)
      expect(draft.meta.assignee.status === 'valid' || draft.meta.assignee.status === 'ambiguous').toBe(true);
    });

    // 3. "Assign Priya to prepare the monthly report."
    it('Test 3: "Assign Priya to prepare the monthly report."', () => {
      const transcript = 'Assign Priya to prepare the monthly report.';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        departments: SAMPLE_DEPARTMENTS,
        referenceDate: refDate
      });

      expect(draft.fields.title).toBe('Prepare monthly report');
      expect(draft.fields.title).not.toContain('Assign');
      expect(draft.fields.title).not.toContain('Priya');
      expect(draft.fields.assigneeId).toBe('p3'); // Priya Singh
    });

    // 4. "Riya ko roz subah doodh le aana bol do."
    it('Test 4: "Riya ko roz subah doodh le aana bol do."', () => {
      const transcript = 'Riya ko roz subah doodh le aana bol do.';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        departments: SAMPLE_DEPARTMENTS,
        referenceDate: refDate
      });

      expect(draft.fields.title).toBe('Bring milk');
      expect(draft.fields.assigneeId).toBe('p8'); // Riya Sen
      expect(draft.fields.isRecurring).toBe(true);
      expect(draft.fields.recurrenceFrequency).toBe('Daily');
    });

    // 5. "Ask Ashok to review the website and send the report by Friday."
    it('Test 5: "Ask Ashok to review the website and send the report by Friday."', () => {
      const transcript = 'Ask Ashok to review the website and send the report by Friday.';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        departments: SAMPLE_DEPARTMENTS,
        referenceDate: refDate
      });

      expect(draft.fields.title).toBe('Review website and send report');
      expect(draft.meta.clarifications.some((c) => c.message.includes('separate tasks'))).toBe(true);
    });

    // 6. "Ask Riya if she can bring milk."
    it('Test 6: "Ask Riya if she can bring milk."', () => {
      const transcript = 'Ask Riya if she can bring milk.';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        departments: SAMPLE_DEPARTMENTS,
        referenceDate: refDate
      });

      // Question about availability, not confirmed task
      expect(draft.intent).toBe('task_question');
      expect(draft.isActionable).toBe(false);
      expect(draft.meta.isConfirmed).toBeFalsy();
    });

    // 7. "Do not ask Riya to bring milk."
    it('Test 7: "Do not ask Riya to bring milk."', () => {
      const transcript = 'Do not ask Riya to bring milk.';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        departments: SAMPLE_DEPARTMENTS,
        referenceDate: refDate
      });

      // Negation respected
      expect(draft.intent).toBe('task_cancel');
      expect(draft.isActionable).toBe(false);
    });

    // 8. "Ask Riya to bring milk. Actually, ask Priya instead."
    it('Test 8: "Ask Riya to bring milk. Actually, ask Priya instead."', () => {
      const transcript = 'Ask Riya to bring milk. Actually, ask Priya instead.';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        departments: SAMPLE_DEPARTMENTS,
        referenceDate: refDate
      });

      // Assignee updated to Priya instead of Riya
      expect(draft.fields.assigneeId).toBe('p3'); // Priya Singh
      expect(draft.fields.title).toBe('Bring milk');
    });

    // 9. Exact Screenshot Case: "Ask the riya to bring the milk from the market daily as per requirement it is urgent"
    it('Screenshot Case: "Ask the riya to bring the milk from the market daily as per requirement it is urgent"', () => {
      const transcript = 'Ask the riya to bring the milk from the market daily as per requirement it is urgent';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        departments: SAMPLE_DEPARTMENTS,
        referenceDate: refDate
      });

      console.log('EXTRACTED DRAFT FIELDS:', JSON.stringify(draft.fields, null, 2));
      console.log('EXTRACTED DRAFT METADATA:', JSON.stringify({
        assignee: draft.meta.assignee,
        action: draft.action,
        object: draft.object,
        location: draft.meta.location
      }, null, 2));

      expect(draft.fields.title).toBe('Bring milk');
      expect(draft.fields.assigneeId).toBe('p8');
    });

    // 10. Second Screenshot Case: "Ask Riya to bring milk from the market."
    it('Screenshot Case 2: "Ask Riya to bring milk from the market."', () => {
      const transcript = 'Ask Riya to bring milk from the market.';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        departments: SAMPLE_DEPARTMENTS,
        referenceDate: refDate
      });

      expect(draft.fields.title).toBe('Bring milk');
      expect(draft.fields.assigneeId).toBe('p8'); // Riya Sen
      expect(draft.meta.assignee.value.name).toBe('Riya Sen');
      expect(draft.fields.location).toBe('Market');
      expect(draft.fields.description).toBe('Bring milk from the market.');
    });
  });
});
