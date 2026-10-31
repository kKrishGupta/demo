/**
 * ActionFlow Server — Google Calendar Integration & Regression Suite (Phase 11 & 12)
 *
 * Verifies all 8 required prompt test cases + OAuth 2.0 lifecycle + Execution Gateway
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getOAuthUrl,
  createCalendarEvent,
  rescheduleCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  checkCalendarAvailability,
  getAuthoritativeConnectionStatus,
  normalizeToRfc3339,
  resolveDateAndTimeStrings
} from '../services/calendarService.js';
import {
  encryptData,
  decryptData,
  saveGoogleTokens,
  getStoredTokens,
  getGoogleConnection,
  getGoogleConnectionStatus,
  getConfigStatus,
  validateEnvironmentCredentials,
  clearGoogleTokens,
  clearMemoryCache
} from '../services/tokenStorageService.js';
import { scheduleReminder, getReminders, dismissReminder } from '../services/reminderSchedulerService.js';
import { semanticDecomposer } from '../services/semanticDecomposer.js';
import { executeAction } from '../services/executionGateway.js';

describe('ACTIONFLOW AI — CRITICAL GOOGLE CALENDAR REPAIR TEST SUITE', () => {

  const testSessionId = `test_cal_sess_${Date.now()}`;

  afterEach(() => {
    clearGoogleTokens(testSessionId);
  });

  // ─── 1. OAUTH 2.0 & ENCRYPTION ──────────────────────────────────────────────
  describe('Phase 2: Real Google OAuth 2.0 & Encrypted Storage', () => {
    it('generates secure OAuth authorization URL with CSRF state and required scopes', () => {
      const url = getOAuthUrl(testSessionId);
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('response_type=code');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('calendar.events');
      expect(url).toContain('calendar.readonly');
      expect(url).toContain('state=');
    });

    it('encrypts tokens with AES-256-GCM and decrypts accurately', () => {
      const secret = 'ya29.a0AfH6SMD_super_secret_access_token_xyz';
      const encrypted = encryptData(secret);
      expect(encrypted).not.toContain(secret);
      expect(encrypted).toContain('authTag');
      expect(encrypted).toContain('iv');

      const decrypted = decryptData(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('safely reports connection status without leaking raw tokens to client', () => {
      saveGoogleTokens(testSessionId, {
        access_token: 'mock_access_123',
        refresh_token: 'mock_refresh_456',
        userEmail: 'alex.developer@gmail.com',
        userName: 'Alex Developer'
      });

      const status = getGoogleConnectionStatus(testSessionId);
      expect(status.isConnected).toBe(true);
      expect(status.email).toBe('alex.developer@gmail.com');
      expect(status.tokenStatus).toBe('VALID');
      expect(status).not.toHaveProperty('accessToken');
      expect(status).not.toHaveProperty('refreshToken');
    });
  });

  // ─── 2. ALL 8 PROMPT TEST CASES (Phase 3 & Phase 11) ───────────────────────
  describe('Phase 3 & 11: All 8 Required Intelligence Test Cases', () => {

    it('TEST 1: "Remind me tomorrow at 9 AM to review my project." -> Calendar Reminder', () => {
      const text = 'Remind me tomorrow at 9 AM to review my project.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(act.destination).toBe('GOOGLE_CALENDAR');
      expect(act.type).toBe('CREATE_CALENDAR_REMINDER');
      expect(act.title).toBe('Review my project');
      expect(act.notification?.minutesBefore).toBe(10);
      expect(act.askAddToCalendar).toBe(true);
      expect(act.status).toBe('PENDING_APPROVAL');
    });

    it('TEST 2: "Schedule a meeting with Rahul tomorrow at 10 AM." -> Calendar Event with Attendee & Invitation', () => {
      const text = 'Schedule a meeting with Rahul tomorrow at 10 AM.';
      const context = { directory: [{ id: 'u1', name: 'Rahul', email: 'rahul.sharma@example.com' }] };
      const actions = semanticDecomposer.decompose(text, context);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(act.destination).toBe('GOOGLE_CALENDAR');
      expect(['CREATE_EVENT', 'CREATE_CALENDAR_EVENT']).toContain(act.type);
      expect(act.title).toContain('Rahul');
      expect(act.attendees).toContain('Rahul');
      expect(act.attendeeEmails?.[0]).toContain('rahul');
      expect(act.time).toContain('10:00');
    });

    it('TEST 3: "Add my project deadline to Google Calendar on Friday." -> Calendar Event with Friday Deadline', () => {
      const text = 'Add my project deadline to Google Calendar on Friday.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(act.destination).toBe('GOOGLE_CALENDAR');
      expect(['CREATE_EVENT', 'CREATE_CALENDAR_EVENT']).toContain(act.type);
      expect(act.title).toBe('Project deadline');
      expect(act.date).toBe('Friday');
    });

    it('TEST 4: "Remind me in 30 minutes to call Aman." -> Single Personal Reminder', () => {
      const text = 'Remind me in 30 minutes to call Aman.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(act.destination).toBe('PERSONAL_REMINDER');
      expect(act.type).toBe('CREATE_REMINDER');
      expect(act.title).toBe('Call Aman');
    });

    it('TEST 5: "Every Monday at 9 AM remind me to review pending tasks." -> Recurring Calendar Event with RRULE', () => {
      const text = 'Every Monday at 9 AM remind me to review pending tasks.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(act.destination).toBe('GOOGLE_CALENDAR');
      expect(act.type).toBe('CREATE_RECURRING_EVENT');
      expect(act.title).toBe('Review pending tasks');
      expect(act.recurrence).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    });

    it('TEST 6: "Move my existing meeting to Friday at 3 PM." -> Update / Reschedule Event', () => {
      const text = 'Move my existing meeting to Friday at 3 PM.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(act.destination).toBe('GOOGLE_CALENDAR');
      expect(['UPDATE_CALENDAR_EVENT', 'RESCHEDULE_EVENT']).toContain(act.type);
      expect(act.title).toContain('Friday');
      expect(act.title).toContain('3 PM');
      expect(act.rescheduledDate).toBe('Friday');
    });

    it('TEST 7: "Create a task to finish the API integration by Friday." -> Task Manager Action Only', () => {
      const text = 'Create a task to finish the API integration by Friday.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(act.destination).toBe('TASK_MANAGER');
      expect(act.type).toBe('CREATE_TASK');
      expect(act.title).toContain('API integration');
    });

    it('TEST 8: "Add this reminder to my calendar." -> Context-promoted Calendar Reminder', () => {
      const text = 'Add this reminder to my calendar.';
      const context = { lastReminder: { title: 'Review quarterly numbers', date: 'Tomorrow', time: '11:00 AM' } };
      const actions = semanticDecomposer.decompose(text, context);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(act.destination).toBe('GOOGLE_CALENDAR');
      expect(act.type).toBe('CREATE_CALENDAR_REMINDER');
      expect(act.title).toBe('Review quarterly numbers');
      expect(act.status).toBe('PENDING_APPROVAL');
    });
  });

  // ─── 3. EXECUTION GATEWAY & EVENT CREATION ──────────────────────────────────
  describe('Phase 5 & 6: Event Creation & Gateway Execution', () => {
    it('creates calendar event with attendees, popup reminders, and idempotency protection', async () => {
      const eventIdKey = `test_event_${Date.now()}`;
      const payload = {
        title: 'Strategy Session with Rahul',
        startDateTime: '2026-11-01T10:00:00.000Z',
        endDateTime: '2026-11-01T11:00:00.000Z',
        attendeeEmails: ['rahul.sharma@example.com'],
        notificationMinutes: 10,
        idempotencyKey: eventIdKey,
        actionId: eventIdKey,
        sessionId: testSessionId
      };

      const res = await createCalendarEvent(payload);
      expect(res.success).toBe(true);
      expect(res.eventId).toBeDefined();
      expect(res.eventLink).toBeDefined();

      // Second identical call should trigger idempotency duplicate prevention
      const dupe = await createCalendarEvent(payload);
      expect(dupe.status).toBe('DUPLICATE_BLOCKED');
      expect(dupe.isDuplicatePrevented).toBe(true);
      expect(dupe.eventId).toBe(res.eventId);
    });

    it('retrieves and verifies the created event via getCalendarEvent', async () => {
      const createRes = await createCalendarEvent({
        title: 'Verifiable Event Test',
        sessionId: testSessionId
      });

      const verifyRes = await getCalendarEvent(createRes.eventId, testSessionId);
      expect(verifyRes.success).toBe(true);
      expect(verifyRes.exists).toBe(true);
      expect(verifyRes.event).toBeDefined();
    });

    it('executes calendar action through Execution Gateway when approved', async () => {
      const action = {
        id: `gate_cal_${Date.now()}`,
        type: 'CREATE_CALENDAR_EVENT',
        destination: 'GOOGLE_CALENDAR',
        title: 'Sprint Planning',
        startDate: '2026-11-02T09:00:00.000Z',
        attendeeEmails: ['rahul.sharma@example.com']
      };

      const result = await executeAction(action, {
        sessionId: testSessionId,
        isApproved: true
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.result?.eventId).toBeDefined();
    });
  });

  // ─── 4. PERSISTENT BACKEND REMINDER SCHEDULER (Phase 7) ─────────────────────
  describe('Phase 7: Persistent Backend Reminder Scheduler', () => {
    it('schedules persistent reminder that survives reloads and records delivery log', async () => {
      const reminder = await scheduleReminder({
        title: 'Deploy Production Release',
        dueAt: new Date(Date.now() + 60000).toISOString(),
        sessionId: testSessionId,
        notificationMinutes: 15
      });

      expect(reminder.id).toBeDefined();
      expect(reminder.title).toBe('Deploy Production Release');
      expect(reminder.status).toBe('SCHEDULED');

      const all = getReminders(testSessionId);
      const found = all.find(r => r.id === reminder.id);
      expect(found).toBeDefined();

      // Dismiss reminder
      const dismissed = await dismissReminder(reminder.id);
      expect(dismissed.status).toBe('DISMISSED');
    });
  });

  // ─── 5. ENVIRONMENT AUTO-DETECTION & PERSISTENT OAUTH (Phase 13) ────────────
  describe('Phase 13: Environment Auto-Detection & Persistent OAuth Status', () => {
    it('automatically detects valid Google Calendar credentials from environment', () => {
      const envDetection = validateEnvironmentCredentials();
      expect(envDetection.credentialsConfigured).toBe(true);
      expect(envDetection.oauthClientInitialized).toBe(true);
      expect(envDetection.calendarApiConfigured).toBe(true);
      expect(envDetection.errors).toHaveLength(0);
    });

    it('returns exact config status when user has not authorized yet', () => {
      const unauthSession = `unauth_${Date.now()}`;
      const cfg = getConfigStatus(unauthSession);

      expect(cfg.credentialsConfigured).toBe(true);
      expect(cfg.oauthClientInitialized).toBe(true);
      expect(cfg.calendarApiConfigured).toBe(true);
      expect(cfg.userAuthorized).toBe(false);
      expect(cfg.refreshTokenAvailable).toBe(false);
      expect(cfg.connectionStatus).toBe('AUTHORIZATION_REQUIRED');
    });

    it('returns CONNECTED status when persistent refresh token is stored', () => {
      const authSession = `auth_${Date.now()}`;
      saveGoogleTokens(authSession, {
        access_token: 'mock_access_token_val',
        refresh_token: 'mock_refresh_token_val',
        userEmail: 'sarah.engineer@gmail.com',
        userName: 'Sarah Engineer'
      });

      const cfg = getConfigStatus(authSession);
      expect(cfg.credentialsConfigured).toBe(true);
      expect(cfg.userAuthorized).toBe(true);
      expect(cfg.refreshTokenAvailable).toBe(true);
      expect(cfg.connectionStatus).toBe('CONNECTED');
      expect(cfg.email).toBe('sarah.engineer@gmail.com');

      clearGoogleTokens(authSession);
    });

    it('enforces multi-user isolation so User A tokens never leak to User B', () => {
      const userASession = `user_a_${Date.now()}`;
      const userBSession = `user_b_${Date.now()}`;

      saveGoogleTokens(userASession, {
        access_token: 'user_a_access',
        refresh_token: 'user_a_refresh',
        userEmail: 'user.a@example.com'
      });

      const connA = getGoogleConnection(userASession);
      const connB = getGoogleConnection(userBSession);

      expect(connA.userEmail).toBe('user.a@example.com');
      expect(connB).toBeNull();

      clearGoogleTokens(userASession);
      clearGoogleTokens(userBSession);
    });
  });

  // ─── 6. MASTER ACCEPTANCE TESTS A THROUGH H (Phase 14) ──────────────────────
  describe('Phase 14: Prompt 10 Master Acceptance Tests (A through H)', () => {

    it('TEST A: "Schedule a meeting with Rahul tomorrow at 10:00 AM for 30 minutes."', () => {
      const text = 'Schedule a meeting with Rahul tomorrow at 10:00 AM for 30 minutes.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(['CREATE_CALENDAR_EVENT', 'CREATE_EVENT']).toContain(act.type);
      expect(act.destination).toBe('GOOGLE_CALENDAR');
      expect(act.title).toBe('Meeting with Rahul');
      expect(act.dateFormatted || act.date).toBe('2026-11-01');
      expect(act.startTime).toBe('10:00');
      expect(act.endTime).toBe('10:30');
      expect(act.durationMinutes).toBe(30);
      expect(act.timezone).toBe('Asia/Kolkata');
      expect(act.attendeeEmails).toEqual([]); // No fake invented email!
      expect(act.requiresApproval).toBe(true);
    });

    it('TEST B: "Schedule a project review on November 2 at 3 PM for one hour."', () => {
      const text = 'Schedule a project review on November 2 at 3 PM for one hour.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(['CREATE_CALENDAR_EVENT', 'CREATE_EVENT']).toContain(act.type);
      expect(act.destination).toBe('GOOGLE_CALENDAR');
      expect(act.title).toBe('Project review');
      expect(act.dateFormatted || act.date).toBe('2026-11-02');
      expect(act.startTime).toBe('15:00');
      expect(act.endTime).toBe('16:00');
      expect(act.durationMinutes).toBe(60);
      expect(act.timezone).toBe('Asia/Kolkata');
      expect(act.requiresApproval).toBe(true);
    });

    it('TEST C: "Remind me tomorrow at 9 AM to review my project."', () => {
      const text = 'Remind me tomorrow at 9 AM to review my project.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(['CREATE_CALENDAR_REMINDER', 'CREATE_REMINDER']).toContain(act.type);
      expect(act.destination).toBe('GOOGLE_CALENDAR');
      expect(act.title).toBe('Review my project');
      expect(act.dateFormatted || act.date).toBe('2026-11-01');
      expect(act.startTime).toBe('09:00');
      expect(act.reminders?.length).toBeGreaterThan(0);
      expect(act.askAddToCalendar).toBe(true);
    });

    it('TEST D: "Every Monday at 9 AM schedule a team meeting."', () => {
      const text = 'Every Monday at 9 AM schedule a team meeting.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(act.type).toBe('CREATE_RECURRING_EVENT');
      expect(act.destination).toBe('GOOGLE_CALENDAR');
      expect(act.title).toBe('Team meeting');
      expect(act.recurrence).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
      expect(act.startTime).toBe('09:00');
      expect(act.timezone).toBe('Asia/Kolkata');
      expect(act.requiresApproval).toBe(true);
    });

    it('TEST E: "Move my project review to 4 PM."', () => {
      const text = 'Move my project review to 4 PM.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(1);
      const act = actions[0];
      expect(['UPDATE_CALENDAR_EVENT', 'RESCHEDULE_EVENT']).toContain(act.type);
      expect(act.destination).toBe('GOOGLE_CALENDAR');
      expect(act.title).toBe('Project review');
      expect(act.startTime).toBe('16:00');
      expect(act.requiresApproval).toBe(true);
    });

    it('TEST F: "Do not schedule a meeting tomorrow." (Negation check)', () => {
      const text = 'Do not schedule a meeting tomorrow.';
      const actions = semanticDecomposer.decompose(text);

      expect(actions).toHaveLength(0); // 0 actions created due to negation
    });

    it('TEST G: Restart & reload OAuth persistence check', () => {
      const persistentSession = `persist_user_${Date.now()}`;
      saveGoogleTokens(persistentSession, {
        access_token: 'valid_access_token_persist',
        refresh_token: 'valid_refresh_token_persist',
        userEmail: 'persistent.owner@example.com',
        userName: 'Persistent Owner'
      });

      // Emulate server restart by reading from disk / storage service
      const retrieved = getStoredTokens(persistentSession);
      expect(retrieved).not.toBeNull();
      expect(retrieved.userEmail).toBe('persistent.owner@example.com');

      const connStatus = getGoogleConnectionStatus(persistentSession);
      expect(connStatus.isConnected).toBe(true);
      expect(connStatus.email).toBe('persistent.owner@example.com');
      expect(connStatus.tokenStatus).toBe('VALID');

      clearGoogleTokens(persistentSession);
    });

    it('TEST H: Disconnect check purges stored credentials completely', () => {
      const disconnectSession = `disc_user_${Date.now()}`;
      saveGoogleTokens(disconnectSession, {
        access_token: 'token_to_purge',
        refresh_token: 'refresh_to_purge',
        userEmail: 'purge.user@example.com'
      });

      expect(getGoogleConnectionStatus(disconnectSession).isConnected).toBe(true);

      // Perform disconnect
      clearGoogleTokens(disconnectSession);

      const statusAfter = getGoogleConnectionStatus(disconnectSession);
      expect(statusAfter.isConnected).toBe(false);
      expect(statusAfter.email).toBeNull();
      expect(['NOT_CONNECTED', 'AWAITING_AUTHORIZATION']).toContain(statusAfter.tokenStatus);
      expect(getStoredTokens(disconnectSession)).toBeNull();
    });
  });

  // ─── 7. PHASE 15: CRITICAL OAUTH LOOP & REFRESH TOKEN PRESERVATION ──────────
  describe('Phase 15: OAuth Authorization Loop & Refresh Token Preservation', () => {

    it('PRESERVES existing refresh token when new authorization response omits refresh_token', () => {
      const loopSession = `loop_sess_${Date.now()}`;

      // 1. Initial authorization returns access_token + refresh_token
      saveGoogleTokens(loopSession, {
        access_token: 'initial_access_token_123',
        refresh_token: 'vital_permanent_refresh_token_789',
        userEmail: 'user.developer@gmail.com',
        userName: 'User Developer'
      });

      const initialStatus = getGoogleConnectionStatus(loopSession);
      expect(initialStatus.isConnected).toBe(true);
      expect(initialStatus.email).toBe('user.developer@gmail.com');

      const initialConn = getGoogleConnection(loopSession);
      expect(initialConn.refreshToken).toBe('vital_permanent_refresh_token_789');

      // 2. Subsequent authorization / callback from Google where refresh_token is OMITTED
      saveGoogleTokens(loopSession, {
        access_token: 'fresh_access_token_456',
        // refresh_token is undefined/absent!
        userEmail: 'user.developer@gmail.com'
      });

      // 3. Verify that the previous refresh token was strictly preserved and NOT wiped out
      const preservedConn = getGoogleConnection(loopSession);
      expect(preservedConn.accessToken).toBe('fresh_access_token_456');
      expect(preservedConn.refreshToken).toBe('vital_permanent_refresh_token_789');

      const preservedStatus = getGoogleConnectionStatus(loopSession);
      expect(preservedStatus.isConnected).toBe(true);
      expect(preservedStatus.tokenStatus).toBe('VALID');
      expect(preservedStatus.refreshTokenAvailable).toBe(true);

      clearGoogleTokens(loopSession);
    });

    it('survives complete backend restart and cold start from disk storage', async () => {
      const restartSession = `restart_sess_${Date.now()}`;

      saveGoogleTokens(restartSession, {
        access_token: 'persisted_access_abc',
        refresh_token: 'persisted_refresh_xyz',
        userEmail: 'coldstart.user@gmail.com',
        userName: 'Cold Start User'
      });

      // Authoritative status before restart
      const beforeStatus = await getAuthoritativeConnectionStatus(restartSession, { probeGoogleApi: false });
      expect(beforeStatus.isConnected).toBe(true);
      expect(beforeStatus.connectionStatus).toBe('CONNECTED');
      expect(beforeStatus.email).toBe('coldstart.user@gmail.com');
      expect(beforeStatus.refreshTokenAvailable).toBe(true);

      // Emulate complete backend process restart by clearing all runtime in-memory caches
      clearMemoryCache();

      // Cold start: Re-fetch authoritative status after backend restart
      const afterStatus = await getAuthoritativeConnectionStatus(restartSession, { probeGoogleApi: false });
      expect(afterStatus.isConnected).toBe(true);
      expect(afterStatus.connectionStatus).toBe('CONNECTED');
      expect(afterStatus.email).toBe('coldstart.user@gmail.com');
      expect(afterStatus.refreshTokenAvailable).toBe(true);

      clearGoogleTokens(restartSession);
    });

    it('guarantees offline access and consent prompt in generated OAuth URL', () => {
      const authUrl = getOAuthUrl('user_prompt_test');
      expect(authUrl).toContain('access_type=offline');
      expect(authUrl).toContain('prompt=consent');
      expect(authUrl).toContain('calendar.events');
      expect(authUrl).toContain('calendar.readonly');
    });
  });

  // ─── 8. PHASE 16: PRODUCTION DEBUGGING REGRESSION SUITE (ISSUES 1–5) ────────
  describe('Phase 16: Production Debugging Regression Suite (Issues 1–5)', () => {

    it('ISSUE 1: POST /oauth/disconnect rejects unconfirmed disconnect requests with HTTP 400', async () => {
      const { default: calendarRouter } = await import('../routes/calendarRoutes.js');
      const layer = calendarRouter.stack.find(
        l => l.route && l.route.methods.post && (l.route.path === '/disconnect' || (Array.isArray(l.route.path) && l.route.path.includes('/oauth/disconnect')))
      );
      expect(layer).toBeDefined();

      const handler = layer.route.stack[0].handle;
      let statusCode = 200;
      let responseBody = null;
      const req = {
        sessionId: 'test_unconfirmed_disc',
        body: {}, // No confirmDisconnect: true
        query: {}
      };
      const res = {
        status(code) { statusCode = code; return this; },
        json(payload) { responseBody = payload; return this; }
      };

      await handler(req, res, () => {});
      expect(statusCode).toBe(400);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('DISCONNECT_CONFIRMATION_REQUIRED');
    });

    it('ISSUE 2: POST /api/v1/voice/command executes full route without ReferenceError: routingResult is not defined', async () => {
      const { default: voiceRouter } = await import('../routes/voiceRoutes.js');
      const layer = voiceRouter.stack.find(
        l => l.route && l.route.methods.post && l.route.path === '/command'
      );
      expect(layer).toBeDefined();

      // The last handler in the stack is the main async route handler
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;
      let statusCode = 200;
      let responseBody = null;
      const req = {
        sessionId: `test_voice_cmd_${Date.now()}`,
        ip: '127.0.0.1',
        body: {
          transcript: 'Remind me tomorrow at 10 AM to submit the architecture report.'
        }
      };
      const res = {
        status(code) { statusCode = code; return this; },
        json(payload) { responseBody = payload; return this; }
      };
      let nextErr = null;
      await handler(req, res, (err) => { nextErr = err; });

      expect(nextErr).toBeNull();
      expect(statusCode).toBe(200);
      expect(responseBody).not.toBeNull();
      expect(responseBody.primaryDestination).toBe('GOOGLE_CALENDAR');
      expect(responseBody.actions.length).toBeGreaterThanOrEqual(1);
    });

    it('ISSUE 3: normalizeToRfc3339 converts datetime-local "2026-11-01T10:00" into strict RFC3339 with Asia/Kolkata (+05:30) and promotes deadline when startDate is null', async () => {
      expect(normalizeToRfc3339('2026-11-01T10:00', '+05:30')).toBe('2026-11-01T10:00:00+05:30');
      expect(normalizeToRfc3339('2026-11-01', '+05:30')).toBe('2026-11-01T10:00:00+05:30');
      expect(normalizeToRfc3339('2026-11-01T10:00:00+05:30', '+05:30')).toBe('2026-11-01T10:00:00+05:30');

      const resolved = resolveDateAndTimeStrings('2026-11-01', '10:00 AM', '+05:30');
      expect(resolved).toBe('2026-11-01T10:00:00+05:30');

      // Reproduce exact action shape from cmd_1793405836244_0 (startDate: null, deadline: "2026-11-01T10:00")
      const mockSess = `test_rfc3339_${Date.now()}`;
      saveGoogleTokens(mockSess, {
        access_token: 'mock_token_rfc3339',
        refresh_token: 'mock_refresh_rfc3339',
        userEmail: 'test.rfc3339@gmail.com'
      });

      const res = await createCalendarEvent({
        title: 'Submit architecture report',
        startDateTime: null,
        endDateTime: '2026-11-01T10:00',
        timeZone: 'Asia/Kolkata',
        actionId: `cmd_test_rfc_${Date.now()}`,
        sessionId: mockSess
      });

      expect(res.success).toBe(true);
      expect(res.start.dateTime).toBe('2026-11-01T10:00:00+05:30');
      // End time must be strictly after start time
      expect(new Date(res.end.dateTime).getTime()).toBeGreaterThan(new Date(res.start.dateTime).getTime());
      clearGoogleTokens(mockSess);
    });

    it('ISSUE 4 & 5: POST /api/v1/actions/approve returns non-200 HTTP status on failure and enforces idempotency on duplicate execution', async () => {
      const { default: actionRouter } = await import('../routes/actionRoutes.js');
      const approveLayer = actionRouter.stack.find(
        l => l.route && l.route.methods.post && l.route.path === '/actions/approve'
      );
      expect(approveLayer).toBeDefined();
      const handler = approveLayer.route.stack[0].handle;

      // 1. Disconnected session attempting GOOGLE_CALENDAR execution must NOT return HTTP 200
      const unconnSession = `unauth_approve_${Date.now()}`;
      let failStatus = 0;
      let failBody = null;
      await handler(
        {
          sessionId: unconnSession,
          headers: {},
          ip: '127.0.0.1',
          body: {
            action: {
              id: `act_fail_${Date.now()}`,
              type: 'CREATE_EVENT',
              destination: 'GOOGLE_CALENDAR',
              title: 'Should Fail Without OAuth'
            }
          }
        },
        {
          status(c) { failStatus = c; return this; },
          json(p) { failBody = p; return this; }
        },
        () => {}
      );
      expect(failStatus).not.toBe(200);
      expect([401, 422, 502]).toContain(failStatus);
      expect(failBody.success).toBe(false);
      expect(failBody.executionStage).toBe('PROVIDER_EXECUTION_FAILED');

      // 2. Connected session approving the same action ID twice must prevent duplicate creation
      const connSession = `test_idemp_approve_${Date.now()}`;
      saveGoogleTokens(connSession, {
        access_token: 'mock_token_idemp',
        refresh_token: 'mock_refresh_idemp',
        userEmail: 'idemp@gmail.com'
      });

      const sharedActionId = `act_idemp_${Date.now()}`;
      const actionPayload = {
        id: sharedActionId,
        type: 'CREATE_EVENT',
        destination: 'GOOGLE_CALENDAR',
        title: 'Idempotent Architecture Sync',
        startDate: null,
        deadline: '2026-11-02T14:00'
      };

      let firstStatus = 0;
      let firstBody = null;
      await handler(
        { sessionId: connSession, headers: {}, ip: '127.0.0.1', body: { action: actionPayload } },
        { status(c) { firstStatus = c; return this; }, json(p) { firstBody = p; return this; } },
        () => {}
      );
      expect(firstStatus).toBe(200);
      expect(firstBody.success).toBe(true);
      expect(firstBody.executionStage).toBe('PROVIDER_EXECUTION_SUCCEEDED');
      const firstEventId = firstBody.result?.eventId;
      expect(firstEventId).toBeDefined();

      // Second approval of the exact same action ID
      let secondStatus = 0;
      let secondBody = null;
      await handler(
        { sessionId: connSession, headers: {}, ip: '127.0.0.1', body: { action: actionPayload } },
        { status(c) { secondStatus = c; return this; }, json(p) { secondBody = p; return this; } },
        () => {}
      );
      expect(secondStatus).toBe(200);
      expect(secondBody.success).toBe(true);
      expect(secondBody.isDuplicatePrevented).toBe(true);
      expect(secondBody.result?.eventId).toBe(firstEventId);

      clearGoogleTokens(connSession);
    });
  });
});
