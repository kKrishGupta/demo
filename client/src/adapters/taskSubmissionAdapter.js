/**
 * TaskSubmissionAdapter
 * Enterprise client adapter for dispatching confirmed tasks with idempotency and duplicate protection.
 */

import { validateTaskPayload } from '../services/taskService';

export class TaskSubmissionAdapter {
  constructor(endpoint = null) {
    this._endpoint = endpoint;
    this._lastSubmittedFingerprint = null;
    this._isSubmitting = false;
  }

  /**
   * Generates a stable structural fingerprint for idempotency checking
   * @param {Object} payload 
   * @returns {string}
   */
  getFingerprint(payload) {
    if (!payload) return '';
    return `${payload.title || ''}|${payload.assigneeId || ''}|${payload.dueDate || ''}|${payload.startDate || ''}|${payload.projectId || ''}|${payload.priority || ''}`;
  }

  /**
   * Submits a validated task payload
   * @param {Object} taskPayload 
   * @returns {Promise<{ success: boolean, taskId: string, task: Object, timestamp: string }>}
   */
  async submitTask(taskPayload) {
    // 1. Guard against concurrent in-flight submissions
    if (this._isSubmitting) {
      throw new Error('A task submission is already in progress. Please wait.');
    }

    // 2. Validate payload completeness
    const validation = validateTaskPayload(taskPayload);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${Object.values(validation.errors).join(', ')}`);
    }

    // 3. Duplicate submission prevention
    const currentFingerprint = this.getFingerprint(taskPayload);
    if (this._lastSubmittedFingerprint && this._lastSubmittedFingerprint === currentFingerprint) {
      throw new Error('Duplicate submission detected. This identical task was already dispatched.');
    }

    this._isSubmitting = true;

    try {
      // In production, delegate to real HTTP POST endpoint if configured
      if (this._endpoint) {
        const response = await fetch(this._endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskPayload)
        });
        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }
        const data = await response.json();
        this._lastSubmittedFingerprint = currentFingerprint;
        return data;
      }

      // Simulated local API resolution with 300ms network feel
      await new Promise((resolve) => setTimeout(resolve, 300));

      const confirmedTask = {
        id: `TASK-${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`,
        ...taskPayload,
        createdAt: new Date().toISOString(),
        status: 'Created',
        submittedVia: taskPayload._creationMethod || 'manual'
      };

      this._lastSubmittedFingerprint = currentFingerprint;

      return {
        success: true,
        taskId: confirmedTask.id,
        task: confirmedTask,
        timestamp: new Date().toISOString()
      };
    } finally {
      this._isSubmitting = false;
    }
  }

  resetDuplicateLock() {
    this._lastSubmittedFingerprint = null;
  }
}

export const defaultTaskSubmissionAdapter = new TaskSubmissionAdapter();
