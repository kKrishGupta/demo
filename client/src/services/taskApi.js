/**
 * ActionFlow Client — Task & Calendar Lifecycle API Service
 *
 * Connects the "My Tasks & Calendar" interface to:
 * - GET /api/v1/tasks
 * - GET /api/v1/tasks/:taskId
 * - POST /api/v1/tasks
 * - PATCH /api/v1/tasks/:taskId
 * - PATCH /api/v1/tasks/:taskId/status
 * - POST /api/v1/tasks/:taskId/complete
 * - POST /api/v1/tasks/:taskId/retry-calendar-removal
 * - POST /api/v1/tasks/:taskId/undo-completion
 */

import { SESSION_ID } from './intelligenceApi.js';
import { buildApiUrl } from '../config/apiConfig.js';

async function taskRequest(path, options = {}, { returnBodyOnError = false } = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': SESSION_ID,
      ...(options.headers || {})
    }
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (returnBodyOnError) {
      return { ...body, httpStatus: res.status, success: false };
    }
    const err = new Error(body.message || body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return { ...body, httpStatus: res.status };
}

export async function fetchTasks({ filter = 'all', search = '', sync = false } = {}) {
  const params = new URLSearchParams();
  if (filter) params.set('filter', filter);
  if (search) params.set('search', search);
  if (sync) params.set('sync', 'true');
  return taskRequest(`/tasks?${params.toString()}`);
}

export async function fetchTaskById(taskId) {
  return taskRequest(`/tasks/${encodeURIComponent(taskId)}`);
}

export async function createTaskWithCalendar(payload) {
  return taskRequest('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateTaskDetails(taskId, updates) {
  return taskRequest(`/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
}

export async function updateTaskStatus(taskId, status) {
  return taskRequest(`/tasks/${encodeURIComponent(taskId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}

export async function completeTaskAndRemoveEvent(taskId, { confirmComplete = true, simulateFailure = false } = {}) {
  return taskRequest(
    `/tasks/${encodeURIComponent(taskId)}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({ confirmComplete, simulateFailure })
    },
    { returnBodyOnError: true }
  );
}

export async function retryTaskCalendarRemoval(taskId, { simulateFailure = false } = {}) {
  return taskRequest(
    `/tasks/${encodeURIComponent(taskId)}/retry-calendar-removal`,
    {
      method: 'POST',
      body: JSON.stringify({ simulateFailure })
    },
    { returnBodyOnError: true }
  );
}

export async function undoTaskCompletion(taskId) {
  return taskRequest(
    `/tasks/${encodeURIComponent(taskId)}/undo-completion`,
    {
      method: 'POST'
    },
    { returnBodyOnError: true }
  );
}
