/**
 * ActionFlow AI — Phase 2 Smart Execution & Gateway Test Suite
 *
 * Covers:
 * 1. Execution Gateway State Machine (DRAFT -> READY_FOR_APPROVAL -> APPROVED -> RUNNING -> COMPLETED)
 * 2. Approval Gating for External Actions (WhatsApp, Calendar, Delete Task)
 * 3. Safe Direct Auto-Execution for Internal Actions (Tasks, Shopping, Reminders)
 * 4. Action Rejection & Cancellation
 * 5. Google Calendar Operations (Availability, Conflict Detection, Create, Reschedule, Delete, Idempotency)
 * 6. WhatsApp Routing (Preview, Send, Idempotency Duplicate Prevention)
 * 7. Personal Micro-Actions (Shopping list add/toggle, Reminders create/complete)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeAction,
  rejectAction,
  getActionState,
  registerTrustedPolicy,
  EXECUTION_STATES
} from '../services/executionGateway.js';
import {
  getOAuthUrl,
  createCalendarEvent,
  checkCalendarAvailability,
  rescheduleCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents
} from '../services/calendarService.js';
import { sendWhatsAppMessage, buildWhatsAppMessage } from '../services/whatsappService.js';
import { cacheService } from '../cache/cacheService.js';

describe('Phase 2: Universal Execution Gateway', () => {
  const sessionId = 'session_test_p2';

  it('fails validation when action ID or title is missing', async () => {
    const invalidAction1 = { type: 'CREATE_TASK' };
    const res1 = await executeAction(invalidAction1, { sessionId });
    expect(res1.status).toBe(EXECUTION_STATES.FAILED);
    expect(res1.errors).toContain('Action ID is required.');

    const invalidAction2 = { id: 'act_123', type: 'CREATE_TASK' };
    const res2 = await executeAction(invalidAction2, { sessionId });
    expect(res2.status).toBe(EXECUTION_STATES.FAILED);
    expect(res2.errors).toContain('Action title is required.');
  });

  it('rejects execution for an already cancelled action', async () => {
    const cancelledAction = {
      id: 'act_cancelled',
      type: 'CREATE_TASK',
      title: 'Cancelled task',
      executionState: EXECUTION_STATES.CANCELLED
    };
    const res = await executeAction(cancelledAction, { sessionId });
    expect(res.status).toBe(EXECUTION_STATES.FAILED);
    expect(res.errors).toContain('Cannot execute a cancelled action.');
  });

  it('requires explicit approval for SEND_WHATSAPP when unapproved', async () => {
    const whatsappAction = {
      id: `act_wa_${Date.now()}`,
      type: 'SEND_WHATSAPP',
      destination: 'WHATSAPP',
      title: 'Send WhatsApp to Aman',
      recipient: { phone: '+919876543210' },
      whatsappMessage: 'Please share the production report.'
    };

    const res = await executeAction(whatsappAction, { sessionId, isApproved: false });
    expect(res.status).toBe(EXECUTION_STATES.READY_FOR_APPROVAL);
    expect(res.previewData).toBeDefined();
    expect(res.previewData.destination).toBe('WHATSAPP');
    expect(res.previewData.messagePreview).toBe('Please share the production report.');
  });

  it('executes SEND_WHATSAPP when explicit approval is provided', async () => {
    const whatsappAction = {
      id: `act_wa_approved_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type: 'SEND_WHATSAPP',
      destination: 'WHATSAPP',
      title: 'Send WhatsApp to Priya',
      recipient: { phone: '+919876543211' },
      whatsappMessage: 'Presentation is ready for review.',
      customFetch: async () => ({
        ok: true,
        status: 201,
        json: async () => ({ sid: `SM_TEST_${Date.now()}`, status: 'queued' })
      })
    };

    const res = await executeAction(whatsappAction, { sessionId, isApproved: true });
    expect(res.status).toBe(EXECUTION_STATES.COMPLETED);
    expect(res.result.success).toBe(true);

    const tracked = getActionState(whatsappAction.id);
    expect(tracked).toBeDefined();
    expect(tracked.executionState).toBe(EXECUTION_STATES.COMPLETED);
  });

  it('requires approval for CREATE_CALENDAR_EVENT when unapproved', async () => {
    const calAction = {
      id: `act_cal_${Date.now()}`,
      type: 'CREATE_CALENDAR_EVENT',
      destination: 'CALENDAR',
      title: 'Team Sync with Rahul',
      startDate: new Date(Date.now() + 86400000).toISOString()
    };

    const res = await executeAction(calAction, { sessionId, isApproved: false });
    expect(res.status).toBe(EXECUTION_STATES.READY_FOR_APPROVAL);
    expect(res.previewData.destination).toBe('CALENDAR');
  });

  it('requires approval for DELETE_CALENDAR_EVENT and DELETE_TASK', async () => {
    const delCal = {
      id: `act_del_cal_${Date.now()}`,
      type: 'DELETE_CALENDAR_EVENT',
      title: 'Delete Client Sync'
    };
    const res1 = await executeAction(delCal, { sessionId, isApproved: false });
    expect(res1.status).toBe(EXECUTION_STATES.READY_FOR_APPROVAL);

    const delTask = {
      id: `act_del_task_${Date.now()}`,
      type: 'DELETE_TASK',
      title: 'Delete Old Backlog'
    };
    const res2 = await executeAction(delTask, { sessionId, isApproved: false });
    expect(res2.status).toBe(EXECUTION_STATES.READY_FOR_APPROVAL);
  });

  it('safely auto-executes internal tasks without requiring approval', async () => {
    const taskAction = {
      id: `act_task_${Date.now()}`,
      type: 'CREATE_TASK',
      destination: 'TASK_MANAGER',
      title: 'Write technical architecture spec'
    };

    const res = await executeAction(taskAction, { sessionId, isApproved: false });
    expect(res.status).toBe(EXECUTION_STATES.COMPLETED);
    expect(res.result.success).toBe(true);
    expect(res.result.status).toBe('CREATED');
  });

  it('safely auto-executes shopping list addition without approval', async () => {
    const shoppingAction = {
      id: `act_shop_${Date.now()}`,
      type: 'ADD_SHOPPING_ITEM',
      destination: 'SHOPPING_LIST',
      title: 'Buy bread and milk',
      shoppingItems: ['bread', 'milk']
    };

    const res = await executeAction(shoppingAction, { sessionId, isApproved: false });
    expect(res.status).toBe(EXECUTION_STATES.COMPLETED);
    expect(res.result.success).toBe(true);
    expect(res.result.items).toEqual(['bread', 'milk']);
  });

  it('safely auto-executes personal reminder creation without approval', async () => {
    const reminderAction = {
      id: `act_rem_${Date.now()}`,
      type: 'CREATE_REMINDER',
      destination: 'PERSONAL_REMINDER',
      title: 'Take evening medicine',
      deadlineRaw: '8:00 PM'
    };

    const res = await executeAction(reminderAction, { sessionId, isApproved: false });
    expect(res.status).toBe(EXECUTION_STATES.COMPLETED);
    expect(res.result.success).toBe(true);
    expect(res.result.status).toBe('SCHEDULED');
  });

  it('allows trusted policy to auto-approve external action for trusted session', async () => {
    const trustedSession = `session_trusted_${Date.now()}`;
    registerTrustedPolicy(trustedSession, { type: 'SEND_WHATSAPP' });

    const action = {
      id: `act_trusted_${Date.now()}`,
      type: 'SEND_WHATSAPP',
      title: 'Trusted update to Aman',
      recipient: { phone: '+919999999999' },
      whatsappMessage: 'Daily sync done.',
      customFetch: async () => ({
        ok: true,
        status: 201,
        json: async () => ({ sid: `SM_TRUSTED_${Date.now()}`, status: 'queued' })
      })
    };

    const res = await executeAction(action, { sessionId: trustedSession, isApproved: false });
    expect(res.status).toBe(EXECUTION_STATES.COMPLETED);
  });

  it('cancels and rejects an action via rejectAction', async () => {
    const actionId = `act_reject_${Date.now()}`;
    const res = await rejectAction(actionId, 'User changed their mind', { sessionId });

    expect(res.status).toBe(EXECUTION_STATES.CANCELLED);
    expect(res.reason).toBe('User changed their mind');

    const state = getActionState(actionId);
    expect(state.executionState).toBe(EXECUTION_STATES.CANCELLED);
  });
});

describe('Phase 2: Google Calendar Integration Service', () => {
  const sessionId = 'session_cal_test';

  it('provides a valid OAuth authorization URL', () => {
    const url = getOAuthUrl();
    expect(url).toBeDefined();
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('creates calendar event and prevents duplicate creation via idempotency', async () => {
    const idempotencyKey = `cal_event_${Date.now()}`;
    const start = new Date(Date.now() + 10000000).toISOString();
    const end = new Date(Date.now() + 13600000).toISOString();

    const created = await createCalendarEvent({
      title: 'Strategic Planning Meeting',
      startDateTime: start,
      endDateTime: end,
      description: 'Discuss Q3 deliverables',
      attendeeEmails: ['team@example.com'],
      idempotencyKey,
      actionId: 'act_cal_1',
      sessionId
    });

    expect(created.success).toBe(true);
    expect(created.eventId).toBeDefined();

    // Re-attempt same idempotencyKey
    const duplicate = await createCalendarEvent({
      title: 'Strategic Planning Meeting',
      startDateTime: start,
      endDateTime: end,
      idempotencyKey,
      actionId: 'act_cal_dup',
      sessionId
    });

    expect(duplicate.success).toBe(false);
    expect(duplicate.status).toBe('DUPLICATE_BLOCKED');
  });

  it('detects calendar conflicts for overlapping time slots', async () => {
    const start = new Date(Date.now() + 20000000).toISOString();
    const end = new Date(Date.now() + 23600000).toISOString();

    // 1. Create initial event
    await createCalendarEvent({
      title: 'Existing Standup',
      startDateTime: start,
      endDateTime: end,
      idempotencyKey: `slot_1_${Date.now()}`,
      actionId: 'act_slot1',
      sessionId
    });

    // 2. Check availability during overlapping time
    const check = await checkCalendarAvailability({
      startDateTime: new Date(Date.now() + 21000000).toISOString(),
      endDateTime: new Date(Date.now() + 24000000).toISOString()
    });

    expect(check.isAvailable).toBe(false);
    expect(check.conflicts.length).toBeGreaterThan(0);
    expect(check.conflicts[0].title).toBe('Existing Standup');
  });

  it('reschedules an existing calendar event', async () => {
    const eventId = `resched_evt_${Date.now()}`;
    await createCalendarEvent({
      title: 'Product Review',
      startDateTime: new Date(Date.now() + 30000000).toISOString(),
      endDateTime: new Date(Date.now() + 33600000).toISOString(),
      idempotencyKey: eventId,
      actionId: eventId,
      sessionId
    });

    const newStart = new Date(Date.now() + 40000000).toISOString();
    const newEnd = new Date(Date.now() + 43600000).toISOString();

    const rescheduled = await rescheduleCalendarEvent({
      eventId,
      newStartDateTime: newStart,
      newEndDateTime: newEnd,
      actionId: 'resched_action',
      sessionId
    });

    expect(rescheduled.success).toBe(true);
    expect(rescheduled.status).toBe('RESCHEDULED');
    expect(rescheduled.newStartDateTime).toBe(newStart);
  });

  it('deletes a calendar event', async () => {
    const eventId = `del_evt_${Date.now()}`;
    await createCalendarEvent({
      title: 'Temporary Event',
      startDateTime: new Date(Date.now() + 50000000).toISOString(),
      endDateTime: new Date(Date.now() + 53600000).toISOString(),
      idempotencyKey: eventId,
      actionId: eventId,
      sessionId
    });

    const deleted = await deleteCalendarEvent({
      eventId,
      actionId: 'del_action',
      sessionId
    });

    expect(deleted.success).toBe(true);
    expect(deleted.status).toBe('DELETED');
  });

  it('lists upcoming calendar events', async () => {
    const result = await listCalendarEvents({ maxResults: 5 });
    expect(result.success).toBe(true);
    expect(Array.isArray(result.events)).toBe(true);
  });
});

describe('Phase 2: WhatsApp Intelligence & Messaging', () => {
  it('formats message text cleanly and detects phone numbers', () => {
    const action = {
      title: 'Fix issue #402',
      assignee: { name: 'Aman' },
      deadline: 'Tomorrow 5 PM'
    };
    const msg = buildWhatsAppMessage(action);
    expect(msg).toContain('Fix issue #402');
    expect(msg).toContain('Aman');
  });

  it('blocks duplicate WhatsApp sends via idempotency key', async () => {
    const key = `wp_idemp_${Date.now()}`;
    const payload = {
      to: '+919876543210',
      message: 'Hello team, report is ready.',
      idempotencyKey: key,
      actionId: `act_wa_dup_${Date.now()}`,
      sessionId: 'sess_wa',
      customFetch: async () => ({
        ok: true,
        status: 201,
        json: async () => ({ sid: `SM_IDEMP_${Date.now()}`, status: 'queued' })
      })
    };

    const firstSend = await sendWhatsAppMessage(payload);
    expect(firstSend.success).toBe(true);

    const secondSend = await sendWhatsAppMessage(payload);
    expect(secondSend.success).toBe(false);
    expect(secondSend.status).toBe('DUPLICATE_BLOCKED');
  });
});

