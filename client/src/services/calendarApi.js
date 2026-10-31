/**
 * ActionFlow Client — Google Calendar API Service (Phase 2, 8, 9)
 *
 * Provides real Google Calendar integration client methods:
 * - OAuth connection status & authorization URL
 * - Disconnect & Reconnect
 * - Event creation & verification
 * - Diagnostics: test connection, list calendars, create/verify test events
 * - Activity log retrieval
 */

import { SESSION_ID } from './intelligenceApi.js';
import { buildApiUrl } from '../config/apiConfig.js';

async function request(path, options = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': SESSION_ID,
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || errBody.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Get Google Calendar OAuth connection status & token health
 */
export async function getCalendarStatus() {
  try {
    return await request('/calendar/status');
  } catch (err) {
    console.warn('[CalendarAPI] Could not fetch status, returning disconnected:', err.message);
    return { isConnected: false, status: 'NOT_CONNECTED', email: null };
  }
}

/**
 * Get Google Calendar Backend Configuration Status (Phase 13 Auto-Detection)
 */
export async function getCalendarConfigStatus() {
  try {
    return await request('/calendar/config-status');
  } catch (err) {
    console.warn('[CalendarAPI] Could not fetch config status:', err.message);
    return {
      credentialsConfigured: false,
      oauthClientInitialized: false,
      calendarApiConfigured: false,
      userAuthorized: false,
      refreshTokenAvailable: false,
      connectionStatus: 'CREDENTIALS_MISSING'
    };
  }
}

/**
 * Get Google OAuth 2.0 authorization URL
 */
export async function getCalendarAuthUrl() {
  const data = await request('/calendar/oauth/url');
  return data.authUrl;
}

/**
 * Disconnect Google Account (requires explicit user confirmation)
 */
export async function disconnectGoogleAccount() {
  return await request('/calendar/oauth/disconnect', {
    method: 'POST',
    body: JSON.stringify({ confirmDisconnect: true, userInitiated: true })
  });
}

/**
 * Test live Google Calendar connection
 */
export async function testCalendarConnection() {
  return await request('/calendar/test-connection', { method: 'POST' });
}

/**
 * List user's Google Calendars
 */
export async function fetchUserCalendars() {
  return await request('/calendar/list-calendars');
}

/**
 * Create identifiable test event
 */
export async function createCalendarTestEvent() {
  return await request('/calendar/create-test-event', { method: 'POST' });
}

/**
 * Verify event existence in Google Calendar via events.get
 */
export async function verifyCalendarEvent(eventId) {
  return await request(`/calendar/verify-event/${encodeURIComponent(eventId)}`);
}

/**
 * Delete test event
 */
export async function deleteCalendarTestEvent(eventId) {
  return await request(`/calendar/delete-test-event/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
}

/**
 * Get calendar audit activity log
 */
export async function getCalendarActivityLog() {
  return await request('/calendar/activity-log');
}

/**
 * Get persistent scheduled reminders
 */
export async function getPersistentReminders() {
  return await request('/calendar/reminders');
}

/**
 * Approve & create a calendar event
 */
export async function executeCalendarEvent(actionPayload) {
  return await request('/actions/approve', {
    method: 'POST',
    body: JSON.stringify({ action: actionPayload })
  });
}

/**
 * Fetch synchronized & reconciled Google Calendar events
 */
export async function getCalendarEvents({
  range = 'all',
  timeMin = null,
  timeMax = null,
  calendarId = 'primary',
  maxResults = 50,
  simulateFailure = false
} = {}) {
  const params = new URLSearchParams();
  if (range) params.set('range', range);
  if (timeMin) params.set('timeMin', timeMin);
  if (timeMax) params.set('timeMax', timeMax);
  if (calendarId) params.set('calendarId', calendarId);
  if (maxResults) params.set('maxResults', String(maxResults));
  if (simulateFailure) params.set('simulateFailure', 'true');
  return await request(`/calendar/events?${params.toString()}`);
}

/**
 * Trigger explicit read-side reconciliation & sync with Google Calendar
 */
export async function reconcileCalendarEvents({
  range = 'all',
  timeMin = null,
  timeMax = null,
  calendarId = 'primary',
  maxResults = 50,
  simulateFailure = false
} = {}) {
  return await request('/calendar/reconcile', {
    method: 'POST',
    body: JSON.stringify({ range, timeMin, timeMax, calendarId, maxResults, simulateFailure })
  });
}

/**
 * Update/reschedule an existing Google Calendar event by Google Event ID
 */
export async function updateCalendarEvent(eventId, payload = {}) {
  return await request(`/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...payload, isApproved: true })
  });
}

/**
 * Delete an existing Google Calendar event by Google Event ID
 */
export async function deleteCalendarEventById(eventId) {
  return await request(`/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE'
  });
}
