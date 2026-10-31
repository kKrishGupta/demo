import { isDueBeforeStart } from '../utils/dateTime';

/**
 * Validates a task payload against business rules
 * 
 * @param {Object} task 
 * @returns {{ isValid: boolean, errors: Object }}
 */
export function validateTaskPayload(task) {
  const errors = {};

  // 1. Title is required
  if (!task.title || !task.title.trim()) {
    errors.title = 'Task title is required.';
  }

  // 2. Assignee is required
  if (!task.assigneeId) {
    errors.assigneeId = 'An assigned person (Doer) must be selected.';
  }

  // 3. Due Date is required
  if (!task.dueDate) {
    errors.dueDate = 'Due date and time is required.';
  }

  // 4. If Start Date is provided, Due Date cannot be before Start Date
  if (task.startDate && task.dueDate && isDueBeforeStart(task.startDate, task.dueDate)) {
    errors.dueDate = 'Due date cannot be earlier than start date.';
  }

  // 5. Recurrence frequency required if recurrence enabled
  if (task.isRecurring && !task.recurrenceFrequency) {
    errors.recurrenceFrequency = 'Please select a recurrence frequency (Daily, Weekly, or Monthly).';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Task Service Client Interface
 * In this demo, submits to a simulated local API service and returns structured confirmation payload.
 * In production, this can be swapped with fetch() calls to the Task Delegation API.
 */
export const taskService = {
  /**
   * Submits a newly created or voice-generated task
   * @param {Object} taskPayload 
   * @returns {Promise<{ success: boolean, taskId: string, task: Object, timestamp: string }>}
   */
  async submitTask(taskPayload) {
    const validation = validateTaskPayload(taskPayload);
    if (!validation.isValid) {
      throw new Error(`Task validation failed: ${Object.values(validation.errors).join(', ')}`);
    }

    // Simulate network delay of 400ms for realistic enterprise feel
    await new Promise((resolve) => setTimeout(resolve, 400));

    const confirmedTask = {
      id: `TASK-${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`,
      ...taskPayload,
      createdAt: new Date().toISOString(),
      status: 'Created',
      submittedVia: taskPayload._creationMethod || 'manual'
    };

    return {
      success: true,
      taskId: confirmedTask.id,
      task: confirmedTask,
      timestamp: new Date().toISOString()
    };
  }
};
