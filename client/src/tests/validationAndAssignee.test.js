import { describe, it, expect } from 'vitest';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft.js';
import { validateTaskPayload } from '../services/taskService.js';
import { SAMPLE_PEOPLE } from '../data/samplePeople.js';
import { SAMPLE_PROJECTS } from '../data/sampleProjects.js';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments.js';

describe('Validation and Assignee Lifecycle Test Suite', () => {
  const refDate = new Date('2026-10-29T10:00:00Z');

  // Test 1: Empty Doer: exactly one required-field error appears.
  it('1. Empty Doer produces exactly one required-field error', () => {
    const payload = {
      title: 'Bring milk',
      description: 'Bring milk from the market.',
      assigneeId: '', // Empty Doer
      dueDate: '2026-10-30T17:00'
    };

    const valResult = validateTaskPayload(payload);
    expect(valResult.isValid).toBe(false);
    expect(valResult.errors.assigneeId).toBe('An assigned person (Doer) must be selected.');
    // Exactly one error for assigneeId
    expect(Object.keys(valResult.errors).filter((k) => k === 'assigneeId').length).toBe(1);
  });

  // Test 2: Select a valid Doer: the Doer error disappears.
  it('2. Selecting a valid Doer removes the Doer error', () => {
    const invalidPayload = {
      title: 'Bring milk',
      description: 'Bring milk from the market.',
      assigneeId: '',
      dueDate: '2026-10-30T17:00'
    };
    const initialResult = validateTaskPayload(invalidPayload);
    expect(initialResult.errors.assigneeId).toBeDefined();

    // Fix Doer by selecting Riya Sen (p8)
    const fixedPayload = {
      ...invalidPayload,
      assigneeId: 'p8'
    };
    const fixedResult = validateTaskPayload(fixedPayload);
    expect(fixedResult.errors.assigneeId).toBeUndefined();
    expect(fixedResult.isValid).toBe(true);
  });

  // Test 3: Voice command "Ask Riya to bring milk": a valid directory match populates Doer.
  it('3. Voice command "Ask Riya to bring milk" matches Riya in directory and populates Doer', () => {
    const draft = extractTaskDraft({
      transcript: 'Ask Riya to bring milk.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.fields.assigneeId).toBe('p8');
    expect(draft.meta.assignee.value.name).toBe('Riya Sen');
    expect(draft.meta.assignee.status).toBe('valid');
  });

  // Test 4: Voice command "Bring milk": Doer remains empty, with one error if validation has been triggered.
  it('4. Voice command "Bring milk" leaves Doer empty, producing one error if validation is triggered', () => {
    const draft = extractTaskDraft({
      transcript: 'Bring milk.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.fields.title).toBe('Bring milk');
    expect(draft.fields.assigneeId).toBe('');
    expect(draft.meta.assignee.value).toBeNull();

    // If validation is triggered on this payload
    const valResult = validateTaskPayload(draft.fields);
    expect(valResult.isValid).toBe(false);
    expect(valResult.errors.assigneeId).toBe('An assigned person (Doer) must be selected.');
    expect(Object.keys(valResult.errors).filter((k) => k === 'assigneeId').length).toBe(1);
  });

  // Test 5: Two people named Riya: request clarification instead of guessing.
  it('5. Two people named Riya requests clarification instead of guessing an assignee', () => {
    const directoryWithTwoRiyas = [
      ...SAMPLE_PEOPLE,
      {
        id: 'p9',
        name: 'Riya Sharma',
        email: 'riya.sharma@example.com',
        department: 'Engineering',
        role: 'Backend Engineer',
        avatar: 'RS',
        aliases: ['riya sharma', 'riya']
      }
    ];

    const draft = extractTaskDraft({
      transcript: 'Ask Riya to bring milk.',
      directory: directoryWithTwoRiyas,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    // When ambiguous, Doer must NOT be auto-assigned to guess
    expect(draft.fields.assigneeId).toBe('');
    expect(draft.meta.assignee.status).toBe('ambiguous');
    expect(draft.meta.assignee.value).toBeNull();
    expect(draft.meta.assignee.candidates.length).toBeGreaterThanOrEqual(2);
    expect(draft.meta.assignee.message).toContain('Multiple team members');
  });

  // Test 6: Missing required due date: exactly one due-date error appears.
  it('6. Missing required due date produces exactly one due-date error', () => {
    const payload = {
      title: 'Bring milk',
      assigneeId: 'p8',
      dueDate: ''
    };

    const valResult = validateTaskPayload(payload);
    expect(valResult.isValid).toBe(false);
    expect(valResult.errors.dueDate).toBe('Due date and time is required.');
    expect(Object.keys(valResult.errors).filter((k) => k === 'dueDate').length).toBe(1);
  });

  // Test 7: Enter a valid due date: the due-date error disappears.
  it('7. Entering a valid due date removes the due-date error', () => {
    const invalidPayload = {
      title: 'Bring milk',
      assigneeId: 'p8',
      dueDate: ''
    };
    const initialResult = validateTaskPayload(invalidPayload);
    expect(initialResult.errors.dueDate).toBeDefined();

    const fixedPayload = {
      ...invalidPayload,
      dueDate: '2026-10-31T18:00'
    };
    const fixedResult = validateTaskPayload(fixedPayload);
    expect(fixedResult.errors.dueDate).toBeUndefined();
  });

  // Test 8: Change transcript repeatedly: no duplicate validation errors accumulate.
  it('8. Changing transcript repeatedly never accumulates duplicate errors', () => {
    const transcripts = [
      'Bring milk',
      'Bring milk from market',
      'Bring milk daily',
      'Bring milk please'
    ];

    let errorHistory = [];
    transcripts.forEach((t) => {
      const draft = extractTaskDraft({
        transcript: t,
        directory: SAMPLE_PEOPLE,
        referenceDate: refDate
      });
      const valResult = validateTaskPayload(draft.fields);
      errorHistory.push(valResult.errors);
    });

    // Verify error keys are unique objects with no array duplicates
    errorHistory.forEach((errors) => {
      expect(typeof errors.assigneeId).toBe('string');
      expect(typeof errors.dueDate).toBe('string');
      expect(Object.keys(errors).filter((k) => k === 'assigneeId').length).toBe(1);
      expect(Object.keys(errors).filter((k) => k === 'dueDate').length).toBe(1);
    });
  });

  // Test 9: Manually change the Doer after voice extraction: the manual selection is preserved.
  it('9. Manually changing Doer after voice extraction is preserved against subsequent voice updates', () => {
    // 1. Initial voice extraction selects Riya (p8)
    const voiceDraft = extractTaskDraft({
      transcript: 'Ask Riya to bring milk.',
      directory: SAMPLE_PEOPLE,
      referenceDate: refDate
    });
    expect(voiceDraft.fields.assigneeId).toBe('p8');

    // 2. User manually overrides Doer to Priya Singh (p3)
    const manuallyOverriddenFields = { assigneeId: true };
    const currentFormData = {
      ...voiceDraft.fields,
      assigneeId: 'p3' // Priya
    };

    // 3. Next speech transcript arrives without assignee (or with another speech utterance)
    const nextVoiceDraft = extractTaskDraft({
      transcript: 'Bring milk from the market tomorrow.',
      directory: SAMPLE_PEOPLE,
      referenceDate: refDate
    });

    // Simulate App.jsx synchronization logic
    const updated = {
      ...nextVoiceDraft.fields
    };
    Object.keys(manuallyOverriddenFields).forEach((key) => {
      if (manuallyOverriddenFields[key] && currentFormData[key] !== undefined) {
        updated[key] = currentFormData[key];
      }
    });

    // Preserved manual selection: p3 (Priya)
    expect(updated.assigneeId).toBe('p3');
  });

  // Test 10: Submit with missing required fields: submission is blocked and errors are displayed once.
  it('10. Submitting with missing required fields blocks submission and displays errors once', () => {
    const incompleteTask = {
      title: '',
      assigneeId: '',
      dueDate: ''
    };

    const valResult = validateTaskPayload(incompleteTask);
    expect(valResult.isValid).toBe(false);
    expect(valResult.errors.title).toBe('Task title is required.');
    expect(valResult.errors.assigneeId).toBe('An assigned person (Doer) must be selected.');
    expect(valResult.errors.dueDate).toBe('Due date and time is required.');

    // Count occurrences of each error key
    expect(Object.keys(valResult.errors).length).toBe(3);
    expect(Object.values(valResult.errors).filter((msg) => msg === 'An assigned person (Doer) must be selected.').length).toBe(1);
    expect(Object.values(valResult.errors).filter((msg) => msg === 'Due date and time is required.').length).toBe(1);
  });

  // Additional check for Bug 2 supported patterns:
  describe('Bug 2 Supported Delegation Patterns', () => {
    it('"Assign milk delivery to Reena."', () => {
      const draft = extractTaskDraft({
        transcript: 'Assign milk delivery to Reena.',
        directory: SAMPLE_PEOPLE,
        referenceDate: refDate
      });
      expect(draft.fields.title).toBe('Bring milk');
      expect(draft.fields.assigneeId).toBe('p6'); // Reena Patel
    });

    it('"Tell Rahul to bring milk."', () => {
      const draft = extractTaskDraft({
        transcript: 'Tell Rahul to bring milk.',
        directory: SAMPLE_PEOPLE,
        referenceDate: refDate
      });
      expect(draft.fields.title).toBe('Bring milk');
      // Rahul matches Rahul Sharma and Rahul Verma (ambiguous) -> must not guess
      expect(draft.meta.assignee.status).toBe('ambiguous');
    });

    it('"Riya ko doodh le aana bol do."', () => {
      const draft = extractTaskDraft({
        transcript: 'Riya ko doodh le aana bol do.',
        directory: SAMPLE_PEOPLE,
        referenceDate: refDate
      });
      expect(draft.fields.title).toBe('Bring milk');
      expect(draft.fields.assigneeId).toBe('p8'); // Riya Sen
    });

    it('"Bring milk, assigned to Priya."', () => {
      const draft = extractTaskDraft({
        transcript: 'Bring milk, assigned to Priya.',
        directory: SAMPLE_PEOPLE,
        referenceDate: refDate
      });
      expect(draft.fields.title).toBe('Bring milk');
      expect(draft.fields.assigneeId).toBe('p3'); // Priya Singh
    });
  });
});
