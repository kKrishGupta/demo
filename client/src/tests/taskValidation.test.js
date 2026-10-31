import { describe, it, expect } from 'vitest';
import { validateTaskPayload } from '../services/taskService';

describe('Task Validation Rules', () => {
  it('fails when title, assignee, or due date are missing', () => {
    const invalidTask = {
      title: '',
      assigneeId: '',
      dueDate: '',
      isRecurring: false
    };

    const result = validateTaskPayload(invalidTask);
    expect(result.isValid).toBe(false);
    expect(result.errors.title).toBeDefined();
    expect(result.errors.assigneeId).toBeDefined();
    expect(result.errors.dueDate).toBeDefined();
  });

  it('fails when recurrence is enabled without a recurrence frequency', () => {
    const taskWithoutFreq = {
      title: 'Valid Title',
      assigneeId: 'p1',
      dueDate: '2026-10-30T17:00',
      isRecurring: true,
      recurrenceFrequency: ''
    };

    const result = validateTaskPayload(taskWithoutFreq);
    expect(result.isValid).toBe(false);
    expect(result.errors.recurrenceFrequency).toContain('recurrence frequency');
  });

  it('fails when due date is earlier than start date', () => {
    const reversedDatesTask = {
      title: 'Valid Title',
      assigneeId: 'p1',
      startDate: '2026-10-31T10:00',
      dueDate: '2026-10-29T10:00',
      isRecurring: false
    };

    const result = validateTaskPayload(reversedDatesTask);
    expect(result.isValid).toBe(false);
    expect(result.errors.dueDate).toContain('cannot be earlier than start date');
  });

  it('passes with all valid required fields and normalized schema', () => {
    const validTask = {
      title: 'Select kitchen materials',
      description: 'Vendor selection context',
      assigneeId: 'p1',
      reviewerId: 'p3',
      projectId: 'proj1',
      department: 'Operations',
      priority: 'High',
      startDate: '2026-10-29T10:00',
      dueDate: '2026-10-30T17:00',
      isRecurring: true,
      recurrenceFrequency: 'Weekly'
    };

    const result = validateTaskPayload(validTask);
    expect(result.isValid).toBe(true);
    expect(Object.keys(result.errors).length).toBe(0);
  });
});
