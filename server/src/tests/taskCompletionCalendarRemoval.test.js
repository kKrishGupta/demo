/**
 * ActionFlow Server — Task Completion Checkbox + Google Calendar Event Removal
 * Acceptance Test Suite (Tests A through G + Undo & Resource Separation)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  saveGoogleTokens,
  clearGoogleTokens
} from '../services/tokenStorageService.js';
import {
  getCalendarEvent,
  deleteCalendarEvent
} from '../services/calendarService.js';
import {
  reloadTaskStoreFromDisk,
  TASK_STATUSES,
  LINKED_RESOURCE_TYPES
} from '../services/taskManagementService.js';
import actionRouter from '../routes/actionRoutes.js';

// Helper to invoke Express route handlers on actionRouter directly
async function callRoute(method, routePath, { sessionId, params = {}, query = {}, body = {}, headers = {} } = {}) {
  const layer = actionRouter.stack.find(
    l => l.route && l.route.methods[method.toLowerCase()] && l.route.path === routePath
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${routePath} not found on actionRouter`);
  }

  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  let statusCode = 200;
  let responseBody = null;
  let nextErr = null;

  const req = {
    requestId: `req_test_${Date.now()}`,
    sessionId,
    params,
    query,
    body,
    headers
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      responseBody = payload;
      return this;
    }
  };

  await handler(req, res, (err) => {
    nextErr = err;
  });

  if (nextErr) throw nextErr;
  return { statusCode, body: responseBody };
}

describe('FEATURE: TASK COMPLETION CHECKBOX + GOOGLE CALENDAR EVENT REMOVAL (TESTS A–G)', () => {
  const testSessionId = `test_task_cal_${Date.now()}`;
  let createdTaskId = null;
  let createdGoogleEventId = null;

  beforeAll(() => {
    saveGoogleTokens(testSessionId, {
      access_token: 'mock_access_task_cal_123',
      refresh_token: 'mock_refresh_task_cal_456',
      userEmail: 'test.owner@gmail.com',
      userName: 'Test Owner'
    });
  });

  afterAll(() => {
    clearGoogleTokens(testSessionId);
  });

  it('TEST A: Create a calendar event called "Project Review" -> Unchecked, PENDING, linked GOOGLE_CALENDAR_EVENT', async () => {
    const { statusCode, body } = await callRoute('POST', '/tasks', {
      sessionId: testSessionId,
      body: {
        title: 'Project Review',
        description: 'Q4 architecture & milestone review',
        scheduledStart: '2026-11-03T10:00:00+05:30',
        durationMinutes: 60,
        timeZone: 'Asia/Kolkata',
        createInCalendar: true
      }
    });

    expect(statusCode).toBe(201);
    expect(body.success).toBe(true);
    expect(body.task).toBeDefined();

    const task = body.task;
    createdTaskId = task.id;
    createdGoogleEventId = task.googleEventId;

    expect(task.title).toBe('Project Review');
    expect(task.completed).toBe(false);
    expect(task.status).toBe(TASK_STATUSES.PENDING);
    expect(task.googleEventId).toBeDefined();
    expect(task.resourceType).toBe(LINKED_RESOURCE_TYPES.GOOGLE_CALENDAR_EVENT);
    expect(task.linkedResources.googleCalendarEvent.resourceType).toBe('GOOGLE_CALENDAR_EVENT');
    expect(task.linkedResources.googleCalendarEvent.eventId).toBe(createdGoogleEventId);
    expect(task.linkedResources.googleTask).toBeNull();

    // Verify the event exists in the calendar provider before completion
    const verifyBefore = await getCalendarEvent(createdGoogleEventId, testSessionId);
    expect(verifyBefore.exists).toBe(true);
  });

  it('TEST F: Cancel completion confirmation (missing confirmComplete) -> Event remains unchanged in Google Calendar & PENDING', async () => {
    // Attempt completion without confirmComplete: true
    const { statusCode, body } = await callRoute('POST', '/tasks/:taskId/complete', {
      sessionId: testSessionId,
      params: { taskId: createdTaskId },
      body: { confirmComplete: false }
    });

    expect(statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('CONFIRMATION_REQUIRED');
    expect(body.task.status).toBe(TASK_STATUSES.PENDING);
    expect(body.task.completed).toBe(false);

    // Verify event still exists in Google Calendar
    const verifyStillThere = await getCalendarEvent(createdGoogleEventId, testSessionId);
    expect(verifyStillThere.exists).toBe(true);
  });

  it('TEST E: Simulate Google API deletion failure -> CALENDAR_REMOVAL_FAILED, visible recovery action, no false success', async () => {
    const { statusCode, body } = await callRoute('POST', '/tasks/:taskId/complete', {
      sessionId: testSessionId,
      params: { taskId: createdTaskId },
      body: {
        confirmComplete: true,
        simulateFailure: true
      }
    });

    expect(statusCode).toBe(503);
    expect(body.success).toBe(false);
    expect(body.status).toBe(TASK_STATUSES.CALENDAR_REMOVAL_FAILED);
    expect(body.retryAvailable).toBe(true);
    expect(body.task.status).toBe(TASK_STATUSES.CALENDAR_REMOVAL_FAILED);
    expect(body.task.completed).toBe(false);
    // Do not hide an event that is still present in Google Calendar
    expect(body.task.googleEventId).toBe(createdGoogleEventId);

    const verifyStillPresent = await getCalendarEvent(createdGoogleEventId, testSessionId);
    expect(verifyStillPresent.exists).toBe(true);
  });

  it('TEST B: Check completion checkbox and confirm (or retry removal) -> COMPLETED and actual Google Calendar event deleted', async () => {
    const { statusCode, body } = await callRoute('POST', '/tasks/:taskId/complete', {
      sessionId: testSessionId,
      params: { taskId: createdTaskId },
      body: {
        confirmComplete: true
      }
    });

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe(TASK_STATUSES.COMPLETED);
    expect(body.task.status).toBe(TASK_STATUSES.COMPLETED);
    expect(body.task.completed).toBe(true);
    expect(body.task.completedAt).toBeDefined();
    expect(body.task.originalTitle).toBe('Project Review');
    expect(body.task.originalGoogleEventId).toBe(createdGoogleEventId);
    expect(body.calendarRemovalResult.success).toBe(true);
    expect(body.calendarRemovalResult.status).toBe('DELETED');
    expect(body.calendarRemovalResult.verifiedAbsent).toBe(true);

    // Verify actual Google Calendar event is now deleted
    const verifyAfter = await getCalendarEvent(createdGoogleEventId, testSessionId);
    expect(verifyAfter.exists).toBe(false);
  });

  it('TEST C: Reload the application -> Completed status persists and event does not reappear in upcoming events', async () => {
    // Emulate cold application/server reload from disk
    reloadTaskStoreFromDisk();

    // 1. Fetch upcoming tasks — completed event must NOT reappear in upcoming list
    const upcomingRes = await callRoute('GET', '/tasks', {
      sessionId: testSessionId,
      query: { filter: 'upcoming' }
    });
    expect(upcomingRes.statusCode).toBe(200);
    const foundInUpcoming = upcomingRes.body.tasks.find(t => t.id === createdTaskId);
    expect(foundInUpcoming).toBeUndefined();

    // 2. Fetch completed tasks — completed status and metadata must persist
    const completedRes = await callRoute('GET', '/tasks', {
      sessionId: testSessionId,
      query: { filter: 'completed' }
    });
    expect(completedRes.statusCode).toBe(200);
    const persistedTask = completedRes.body.tasks.find(t => t.id === createdTaskId);
    expect(persistedTask).toBeDefined();
    expect(persistedTask.status).toBe(TASK_STATUSES.COMPLETED);
    expect(persistedTask.originalGoogleEventId).toBe(createdGoogleEventId);
  });

  it('TEST D: Attempt to complete an event that has already been deleted -> Idempotent handling without errors or duplicate deletion', async () => {
    // 1. Repeat completion call on already-completed task
    const repeatRes = await callRoute('POST', '/tasks/:taskId/complete', {
      sessionId: testSessionId,
      params: { taskId: createdTaskId },
      body: { confirmComplete: true }
    });

    expect(repeatRes.statusCode).toBe(200);
    expect(repeatRes.body.success).toBe(true);
    expect(repeatRes.body.idempotentReplay).toBe(true);
    expect(repeatRes.body.status).toBe(TASK_STATUSES.COMPLETED);

    // 2. Also test completing a task whose Google Calendar event was already deleted externally (404 ALREADY_ABSENT)
    const extCreate = await callRoute('POST', '/tasks', {
      sessionId: testSessionId,
      body: {
        title: 'Externally Removed Sync',
        scheduledStart: '2026-11-04T15:00:00+05:30',
        createInCalendar: true
      }
    });
    const extTask = extCreate.body.task;
    // Delete the event from calendar directly first to simulate external deletion (404)
    await deleteCalendarEvent({ eventId: extTask.googleEventId, sessionId: testSessionId });

    // Now complete the task — should handle 404 as ALREADY_ABSENT cleanly
    const extComplete = await callRoute('POST', '/tasks/:taskId/complete', {
      sessionId: testSessionId,
      params: { taskId: extTask.id },
      body: { confirmComplete: true }
    });
    expect(extComplete.statusCode).toBe(200);
    expect(extComplete.body.success).toBe(true);
    expect(extComplete.body.status).toBe(TASK_STATUSES.COMPLETED);
    expect(extComplete.body.calendarRemovalResult.status).toBe('ALREADY_ABSENT');
  });

  it('TEST G + UNDO: Verify deleting an event preserves audit history and Undo Completion recreates the Google Calendar event with a new ID', async () => {
    // 1. Undo completion of "Project Review"
    const undoRes = await callRoute('POST', '/tasks/:taskId/undo-completion', {
      sessionId: testSessionId,
      params: { taskId: createdTaskId }
    });

    expect(undoRes.statusCode).toBe(200);
    expect(undoRes.body.success).toBe(true);
    expect(undoRes.body.status).toBe(TASK_STATUSES.PENDING);
    expect(undoRes.body.recreatedGoogleEventId).toBeDefined();
    expect(undoRes.body.recreatedGoogleEventId).not.toBe(createdGoogleEventId);

    // Re-complete so final state is COMPLETED and all lifecycle audit events are present
    await callRoute('POST', '/tasks/:taskId/complete', {
      sessionId: testSessionId,
      params: { taskId: createdTaskId },
      body: { confirmComplete: true }
    });

    // 2. Retrieve task & audit history (TEST G)
    const detailRes = await callRoute('GET', '/tasks/:taskId', {
      sessionId: testSessionId,
      params: { taskId: createdTaskId }
    });

    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.body.task).toBeDefined();
    const auditEvents = detailRes.body.auditTrail.map(e => e.event);

    expect(auditEvents).toContain('TASK_CREATED');
    expect(auditEvents).toContain('TASK_COMPLETION_REQUESTED');
    expect(auditEvents).toContain('CALENDAR_REMOVAL_FAILED');
    expect(auditEvents).toContain('CALENDAR_EVENT_DELETED');
    expect(auditEvents).toContain('TASK_COMPLETED');
    expect(auditEvents).toContain('TASK_COMPLETION_UNDONE');
  });
});
