/**
 * ActionFlow Client — Room Management & Distribution API Service
 *
 * Implements client-side calls for:
 * - Room configuration & CRUD (GET/POST/PATCH/DELETE /api/v1/rooms)
 * - Room-specific tasks (GET /api/v1/rooms/:roomId/tasks)
 * - Task room reassignment (PATCH /api/v1/tasks/:taskId/room)
 * - Task reopen (POST /api/v1/tasks/:taskId/reopen)
 * - Room routing rules & feedback (GET/POST /api/v1/room-routing/*)
 */

import { SESSION_ID } from './intelligenceApi.js';
import { buildApiUrl } from '../config/apiConfig.js';

async function roomRequest(path, options = {}, { returnBodyOnError = false } = {}) {
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

/**
 * Fetch all rooms with aggregate task counts
 */
export async function fetchRooms({ includeInactive = false, organizationId = 'org_default' } = {}) {
  const params = new URLSearchParams();
  if (includeInactive) params.set('includeInactive', 'true');
  if (organizationId) params.set('organizationId', organizationId);
  return roomRequest(`/rooms?${params.toString()}`);
}

/**
 * Fetch a single room with its stats and tasks
 */
export async function fetchRoomById(roomId) {
  return roomRequest(`/rooms/${encodeURIComponent(roomId)}`);
}

/**
 * Create a new room
 */
export async function createRoom(payload) {
  return roomRequest('/rooms', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Update room details, categories, rules, and active status
 */
export async function updateRoom(roomId, updates) {
  return roomRequest(`/rooms/${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
}

/**
 * Deactivate or delete room
 */
export async function deleteRoom(roomId, { hardDelete = false } = {}) {
  const params = new URLSearchParams();
  if (hardDelete) params.set('hardDelete', 'true');
  return roomRequest(`/rooms/${encodeURIComponent(roomId)}?${params.toString()}`, {
    method: 'DELETE'
  });
}

/**
 * Reorder rooms
 */
export async function reorderRooms(orderedRoomIds) {
  return roomRequest('/rooms/reorder', {
    method: 'POST',
    body: JSON.stringify({ orderedRoomIds })
  });
}

/**
 * Fetch tasks for a specific room
 */
export async function fetchRoomTasks(roomId, { filter = 'all', search = '', status } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  else if (filter) params.set('filter', filter);
  if (search) params.set('search', search);
  return roomRequest(`/rooms/${encodeURIComponent(roomId)}/tasks?${params.toString()}`);
}

/**
 * Reassign a task to a different room
 */
export async function reassignTaskRoom(taskId, roomId, reason = 'User manual reassignment') {
  return roomRequest(`/tasks/${encodeURIComponent(taskId)}/room`, {
    method: 'PATCH',
    body: JSON.stringify({ roomId, reason })
  });
}

/**
 * Reopen a completed task
 */
export async function reopenTask(taskId, reason = 'Reopened by user') {
  return roomRequest(`/tasks/${encodeURIComponent(taskId)}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  });
}

/**
 * Fetch room routing rules
 */
export async function fetchRoomRoutingRules() {
  return roomRequest('/room-routing/rules');
}

/**
 * Save custom room routing rule
 */
export async function saveRoomRoutingRule(rulePayload) {
  return roomRequest('/room-routing/rules', {
    method: 'POST',
    body: JSON.stringify(rulePayload)
  });
}

/**
 * Record feedback on room assignment correction
 */
export async function recordRoomFeedback(feedbackPayload) {
  return roomRequest('/room-routing/feedback', {
    method: 'POST',
    body: JSON.stringify(feedbackPayload)
  });
}

/**
 * Test / preview room classification for arbitrary text
 */
export async function classifyTextToRoom(text, { intent, destination, fullTranscript } = {}) {
  return roomRequest('/room-routing/classify', {
    method: 'POST',
    body: JSON.stringify({ text, intent, destination, fullTranscript })
  });
}
