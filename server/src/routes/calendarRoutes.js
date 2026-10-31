/**
 * ActionFlow Server — Calendar & Google OAuth API Routes
 *
 * Implements:
 * - GET    /config-status          — Backend configuration status (credentialsConfigured, oauthClientInitialized, userAuthorized, etc.)
 * - GET    /status                 — Get connected Google account status & token health
 * - GET/POST /connect, /oauth/url  — Get Google OAuth 2.0 authorization URL
 * - GET    /oauth/callback, /callback — Handle Google OAuth callback & token exchange
 * - POST   /disconnect, /oauth/disconnect — Disconnect Google account & clear encrypted tokens
 * - POST   /test, /test-connection — Verify Google Calendar API connection
 * - GET    /calendars, /list-calendars — List user's Google Calendars
 * - POST   /create-test-event      — Create identifiable test event in Google Calendar
 * - GET    /events/:eventId, /verify-event/:eventId — Verify event existence via Google Calendar API events.get
 * - DELETE /events/:eventId, /delete-test-event/:eventId — Delete event from Google Calendar
 * - GET    /activity-log           — Return recent calendar audit activity
 * - GET    /reminders              — Return persistent scheduled reminders
 * - POST   /events                 — Create calendar event (approval-gated via Gateway)
 * - PATCH  /events/:id             — Reschedule/update calendar event
 * - POST   /check-availability     — FreeBusy check for overlapping slots
 */

import { Router } from 'express';
import {
  getOAuthUrl,
  exchangeOAuthCode,
  getAuthoritativeConnectionStatus,
  listCalendarEvents,
  createCalendarEvent,
  rescheduleCalendarEvent,
  deleteCalendarEvent,
  checkCalendarAvailability,
  getCalendarEvent,
  listUserCalendars
} from '../services/calendarService.js';
import {
  getConfigStatus,
  getGoogleConnectionStatus,
  clearGoogleTokens
} from '../services/tokenStorageService.js';
import { getReminders } from '../services/reminderSchedulerService.js';
import { executeAction } from '../services/executionGateway.js';
import { getAuditEntries, getCalendarActivityEntries } from '../services/auditService.js';
import {
  syncAndReconcileCalendarHub,
  createOrRegisterTask,
  getTaskById,
  updateTask,
  TASK_STATUSES
} from '../services/taskManagementService.js';
import { broadcastCalendarUpdate } from '../websocket/wsServer.js';
import { config } from '../config.js';

const router = Router();

// ─── GET /config-status (Backend Configuration Status Endpoint) ───────────────
router.get('/config-status', async (req, res) => {
  const cfg = await getAuthoritativeConnectionStatus(req.sessionId, { probeGoogleApi: false });
  return res.status(200).json({
    requestId: req.requestId,
    ...cfg
  });
});

// ─── GET /status ──────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const status = await getAuthoritativeConnectionStatus(req.sessionId, { probeGoogleApi: true });
  return res.status(200).json({
    requestId: req.requestId,
    ...status
  });
});

// ─── GET/POST /connect & /oauth/url ───────────────────────────────────────────
const handleGetOAuthUrl = (req, res) => {
  const authUrl = getOAuthUrl(req.sessionId);
  return res.status(200).json({
    requestId: req.requestId,
    connected: Boolean(authUrl && !authUrl.includes('mock=true')),
    authUrl,
    message: 'Redirect user to authUrl to grant Google Calendar permissions'
  });
};
router.get(['/oauth/url', '/connect'], handleGetOAuthUrl);
router.post(['/oauth/url', '/connect'], handleGetOAuthUrl);

// ─── GET /oauth/callback (Main Google OAuth Callback) ─────────────────────────
router.get(['/oauth/callback', '/callback'], async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.warn('[CalendarRoutes] Google OAuth returned error:', error);
    return res.redirect(`${config.app.baseUrl}?calendar_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code from Google OAuth.');
  }

  try {
    const exchange = await exchangeOAuthCode(code, state, req.sessionId);
    console.log(`[CalendarRoutes] Google account connected successfully: ${exchange.userEmail}`);

    // Redirect user back to ActionFlow frontend with confirmation & session sync
    return res.redirect(`${config.app.baseUrl}?calendar_connected=true&email=${encodeURIComponent(exchange.userEmail)}&sessionId=${encodeURIComponent(exchange.resolvedSessionId || req.sessionId || '')}`);
  } catch (err) {
    console.error('[CalendarRoutes] OAuth exchange error:', err.message);
    return res.redirect(`${config.app.baseUrl}?calendar_error=${encodeURIComponent(err.message)}`);
  }
});

// ─── POST /disconnect & /oauth/disconnect ────────────────────────────────────
router.post(['/disconnect', '/oauth/disconnect'], (req, res) => {
  const confirmed = req.body?.confirmDisconnect === true || req.query?.confirm === 'true';
  if (!confirmed) {
    console.warn(`[CalendarRoutes] Blocked unconfirmed OAuth disconnect attempt for session "${req.sessionId}". Explicit confirmDisconnect: true is required.`);
    return res.status(400).json({
      requestId: req.requestId,
      success: false,
      error: 'DISCONNECT_CONFIRMATION_REQUIRED',
      message: 'Explicit user confirmation (confirmDisconnect: true) is required to disconnect Google Calendar.'
    });
  }

  clearGoogleTokens(req.sessionId, { confirmGlobalDisconnect: true });
  return res.status(200).json({
    requestId: req.requestId,
    success: true,
    message: 'Google Calendar disconnected successfully.',
    isConnected: false
  });
});

// ─── POST /test & /test-connection ───────────────────────────────────────────
router.post(['/test', '/test-connection'], async (req, res) => {
  try {
    const result = await listUserCalendars(req.sessionId);
    if (result.success) {
      return res.status(200).json({
        requestId: req.requestId,
        success: true,
        calendarCount: result.calendars?.length || 0,
        message: `Connection verified. Found ${result.calendars?.length || 0} accessible calendar(s).`
      });
    }

    return res.status(200).json({
      requestId: req.requestId,
      success: false,
      message: 'Google Calendar API responded, but account is not authorized or token is expired.'
    });
  } catch (err) {
    return res.status(500).json({
      requestId: req.requestId,
      success: false,
      error: 'TEST_CONNECTION_FAILED',
      message: err.message
    });
  }
});

// ─── GET /calendars & /list-calendars ─────────────────────────────────────────
router.get(['/calendars', '/list-calendars'], async (req, res) => {
  try {
    const result = await listUserCalendars(req.sessionId);
    return res.status(200).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    return res.status(500).json({
      requestId: req.requestId,
      success: false,
      error: 'LIST_CALENDARS_FAILED',
      message: err.message
    });
  }
});

// ─── POST /create-test-event ──────────────────────────────────────────────────
router.post('/create-test-event', async (req, res, next) => {
  try {
    const start = req.body?.startDateTime || new Date(Date.now() + 3600000).toISOString();
    const end = req.body?.endDateTime || new Date(new Date(start).getTime() + 3600000).toISOString();
    const title = req.body?.title || 'ActionFlow Verified Test Event';
    const actionId = `diag_test_${Date.now()}`;

    const result = await createCalendarEvent({
      title,
      startDateTime: start,
      endDateTime: end,
      description: req.body?.description || 'Diagnostic verification event created by ActionFlow AI Google Calendar Hub.',
      attendeeEmails: ['test-attendee@example.com'],
      notificationMinutes: 10,
      sessionId: req.sessionId,
      actionId
    });

    if (result.success && result.eventId) {
      await createOrRegisterTask({
        id: `task_${actionId}`,
        actionId,
        title: result.summary || title,
        description: req.body?.description || 'Diagnostic verification event created by ActionFlow AI Google Calendar Hub.',
        scheduledStart: result.start?.dateTime || result.start?.date || start,
        scheduledEnd: result.end?.dateTime || result.end?.date || end,
        googleEventId: result.eventId,
        eventLink: result.eventLink
      }, { sessionId: req.sessionId });

      broadcastCalendarUpdate({
        event: 'CALENDAR_EVENT_CREATED',
        actionId,
        googleEventId: result.eventId,
        title: result.summary || title
      });
    }

    return res.status(result.success ? 201 : (result.httpStatus || 502)).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /events/:eventId & /verify-event/:eventId ───────────────────────────
router.get(['/events/:eventId', '/verify-event/:eventId'], async (req, res, next) => {
  const { eventId } = req.params;
  try {
    const result = await getCalendarEvent(eventId, req.sessionId);
    return res.status(200).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /events/:eventId & /delete-test-event/:eventId ────────────────────
router.delete(['/events/:eventId', '/delete-test-event/:eventId'], async (req, res, next) => {
  const { eventId } = req.params;
  const actionId = `del_${Date.now()}`;
  try {
    const result = await deleteCalendarEvent({
      eventId,
      sessionId: req.sessionId,
      actionId
    });

    if (result.success) {
      const linkedTask = getTaskById(eventId, req.sessionId);
      if (linkedTask) {
        await updateTask(linkedTask.id, { status: TASK_STATUSES.COMPLETED }, { sessionId: req.sessionId });
      }
      broadcastCalendarUpdate({
        event: 'CALENDAR_EVENT_DELETED',
        actionId,
        googleEventId: eventId
      });
    }

    return res.status(result.success ? 200 : (result.httpStatus || 502)).json({
      requestId: req.requestId,
      ...result,
      message: result.message || 'Event deleted from calendar.'
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /activity-log ────────────────────────────────────────────────────────
router.get('/activity-log', async (req, res) => {
  const limit = Math.max(1, Math.min(250, parseInt(req.query.limit || '100', 10) || 100));
  const calendarEntries = await getCalendarActivityEntries({
    sessionId: req.sessionId,
    limit
  });

  return res.status(200).json({
    requestId: req.requestId,
    count: calendarEntries.length,
    activities: calendarEntries
  });
});

// ─── GET /reminders ───────────────────────────────────────────────────────────
router.get('/reminders', (req, res) => {
  const list = getReminders(req.sessionId);
  return res.status(200).json({
    requestId: req.requestId,
    count: list.length,
    reminders: list
  });
});

// ─── GET /events (Authoritative Read-Side Sync + Reconciliation) ─────────────
router.get('/events', async (req, res, next) => {
  const {
    maxResults = 50,
    range = 'all',
    timeMin = null,
    timeMax = null,
    calendarId = 'primary',
    pageToken = null,
    simulateFailure = false
  } = req.query;

  try {
    const result = await syncAndReconcileCalendarHub({
      sessionId: req.sessionId,
      calendarId,
      range,
      timeMin,
      timeMax,
      maxResults: parseInt(maxResults, 10) || 50,
      pageToken,
      simulateFailure: simulateFailure === 'true' || simulateFailure === true
    });

    if (!result.success) {
      return res.status(result.httpStatus || 502).json({
        requestId: req.requestId,
        ...result
      });
    }

    return res.status(200).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /reconcile & /sync (Manual Refresh & Safe Reconciliation) ──────────
router.post(['/reconcile', '/sync'], async (req, res, next) => {
  const {
    maxResults = 50,
    range = 'all',
    timeMin = null,
    timeMax = null,
    calendarId = 'primary',
    simulateFailure = false
  } = { ...req.query, ...req.body };

  try {
    const result = await syncAndReconcileCalendarHub({
      sessionId: req.sessionId,
      calendarId,
      range,
      timeMin,
      timeMax,
      maxResults: parseInt(maxResults, 10) || 50,
      simulateFailure: simulateFailure === 'true' || simulateFailure === true
    });

    if (!result.success) {
      return res.status(result.httpStatus || 502).json({
        requestId: req.requestId,
        ...result
      });
    }

    broadcastCalendarUpdate({
      event: 'CALENDAR_SYNC_COMPLETED',
      count: result.count,
      lastSync: result.lastSync
    });

    return res.status(200).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /events ─────────────────────────────────────────────────────────────
router.post('/events', async (req, res, next) => {
  const {
    title,
    startDateTime,
    endDateTime,
    description,
    attendeeEmails = [],
    notificationMinutes = 10,
    recurrence,
    isApproved = false
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'title is required.' });
  }

  const actionPayload = {
    id: `cal_act_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type: recurrence ? 'CREATE_RECURRING_EVENT' : 'CREATE_CALENDAR_EVENT',
    destination: 'GOOGLE_CALENDAR',
    title,
    startDate: startDateTime,
    deadline: endDateTime,
    description: description || '',
    attendeeEmails,
    notificationMinutes,
    recurrence
  };

  try {
    const result = await executeAction(actionPayload, {
      sessionId: req.sessionId,
      isApproved: Boolean(isApproved)
    });

    const statusCode = result.status === 'READY_FOR_APPROVAL' ? 202 : result.status === 'COMPLETED' ? 201 : 500;
    return res.status(statusCode).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /events/:id ────────────────────────────────────────────────────────
router.patch('/events/:id', async (req, res, next) => {
  const { id } = req.params;
  const { newStartDateTime, newEndDateTime, startDateTime, endDateTime, title, description, isApproved = false } = req.body;
  const resolvedStart = newStartDateTime || startDateTime;
  const resolvedEnd = newEndDateTime || endDateTime;

  try {
    // Direct edit from Calendar Hub (when isApproved is true)
    if (isApproved) {
      const updateRes = await rescheduleCalendarEvent({
        eventId: id,
        newStartDateTime: resolvedStart,
        newEndDateTime: resolvedEnd,
        title,
        description,
        sessionId: req.sessionId,
        actionId: `edit_${Date.now()}`
      });

      if (updateRes.success) {
        const linkedTask = getTaskById(id, req.sessionId);
        if (linkedTask) {
          await updateTask(linkedTask.id, {
            title: title || linkedTask.title,
            description: description !== undefined ? description : linkedTask.description,
            scheduledStart: updateRes.startDateTime || resolvedStart || linkedTask.scheduledStart,
            scheduledEnd: updateRes.endDateTime || resolvedEnd || linkedTask.scheduledEnd
          }, { sessionId: req.sessionId });
        }
        broadcastCalendarUpdate({
          event: 'CALENDAR_EVENT_UPDATED',
          googleEventId: id,
          title: updateRes.title || title
        });
      }

      return res.status(updateRes.success ? 200 : 502).json({
        requestId: req.requestId,
        ...updateRes
      });
    }

    const actionPayload = {
      id: `resched_${Date.now()}`,
      eventId: id,
      type: 'RESCHEDULE_EVENT',
      destination: 'GOOGLE_CALENDAR',
      title: title || `Reschedule event ${id}`,
      startDate: resolvedStart,
      deadline: resolvedEnd
    };

    const result = await executeAction(actionPayload, {
      sessionId: req.sessionId,
      isApproved: Boolean(isApproved)
    });

    const statusCode = result.status === 'READY_FOR_APPROVAL' ? 202 : 200;
    return res.status(statusCode).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /check-availability ─────────────────────────────────────────────────
router.post('/check-availability', async (req, res, next) => {
  const { startDateTime, endDateTime } = req.body;

  if (!startDateTime) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'startDateTime is required.' });
  }

  try {
    const check = await checkCalendarAvailability({
      startDateTime,
      endDateTime,
      sessionId: req.sessionId
    });

    return res.status(200).json({
      requestId: req.requestId,
      ...check
    });
  } catch (err) {
    next(err);
  }
});

export default router;
