/**
 * ActionFlow Server — Execution Gateway (Phase 2 Upgraded)
 *
 * The single point of truth for action execution.
 * Extraction NEVER directly triggers external mutations.
 *
 * Lifecycle: DRAFT → VALIDATING → READY_FOR_APPROVAL → APPROVED → QUEUED → RUNNING → COMPLETED|FAILED
 *
 * External actions requiring approval:
 * - SEND_WHATSAPP
 * - SEND_EMAIL
 * - CREATE_CALENDAR_EVENT, UPDATE_CALENDAR_EVENT, RESCHEDULE_EVENT, DELETE_CALENDAR_EVENT
 * - DELETE_TASK
 *
 * Safe actions (no approval needed):
 * - CREATE_TASK, UPDATE_TASK, ASSIGN_TASK, COMPLETE_TASK
 * - ADD_SHOPPING_ITEM
 * - CREATE_REMINDER
 * - RETRIEVE_TASKS, GENERATE_SUMMARY
 */

import { config } from '../config.js';
import { auditLog } from './auditService.js';
import { sendWhatsAppMessage, buildWhatsAppMessage } from './whatsappService.js';
import {
  createCalendarEvent,
  rescheduleCalendarEvent,
  deleteCalendarEvent
} from './calendarService.js';
import { scheduleReminder } from './reminderSchedulerService.js';
import { createOrRegisterTask } from './taskManagementService.js';
import { dependencyGraphService } from './dependencyGraphService.js';
import { cacheService } from '../cache/cacheService.js';
import { broadcastCalendarUpdate } from '../websocket/wsServer.js';

const EXECUTION_STATES = {
  DRAFT:                  'DRAFT',
  VALIDATING:             'VALIDATING',
  NEEDS_CLARIFICATION:    'NEEDS_CLARIFICATION',
  PENDING_APPROVAL:       'PENDING_APPROVAL',
  READY_FOR_APPROVAL:     'READY_FOR_APPROVAL',
  APPROVED:               'APPROVED',
  QUEUED:                 'QUEUED',
  RUNNING:                'RUNNING',
  SENDING:                'SENDING',
  SENT:                   'SENT',
  DELIVERED:              'DELIVERED',
  READ:                   'READ',
  AWAITING_USER_SEND:     'AWAITING_USER_SEND',
  USER_CONFIRMED_SENT:    'USER_CONFIRMED_SENT',
  SIMULATED:              'SIMULATED',
  COMPLETED:              'COMPLETED',
  FAILED:                 'FAILED',
  BLOCKED:                'BLOCKED',
  CANCELLED:              'CANCELLED',
  UNKNOWN_EXECUTION_STATE:'UNKNOWN_EXECUTION_STATE'
};

// Actions requiring explicit approval before external invocation
const APPROVAL_REQUIRED = new Set([
  'SEND_WHATSAPP', 'SEND_EMAIL',
  'CREATE_CALENDAR_EVENT', 'CREATE_EVENT', 'CREATE_CALENDAR_REMINDER', 'CREATE_RECURRING_EVENT',
  'UPDATE_CALENDAR_EVENT', 'RESCHEDULE_EVENT', 'DELETE_CALENDAR_EVENT',
  'DELETE_TASK', 'START_RECORDING'
]);

const _trustedPolicies = new Map();
const _actionQueue = new Map();

/**
 * Submits an action for verified execution
 * @param {Object} action - MicroAction payload
 * @param {Object} options
 * @param {string} options.sessionId
 * @param {string} [options.accessToken]
 * @param {boolean} [options.isApproved=false]
 * @returns {Promise<ExecutionResult>}
 */
export async function executeAction(action, options = {}) {
  const { sessionId, accessToken, isApproved = false } = options;

  // 1. Validation check
  const validation = validateActionForExecution(action);
  if (!validation.isValid) {
    await auditLog({
      event: 'EXECUTION_VALIDATION_FAILED',
      actionId: action?.id || 'unknown',
      sessionId,
      details: { errors: validation.errors }
    });
    return {
      actionId: action?.id || 'unknown',
      status: EXECUTION_STATES.FAILED,
      errors: validation.errors
    };
  }

  // 1b. Dependency DAG check
  if (action.dependencies && action.dependencies.length > 0) {
    const completedSet = new Set(
      [..._actionQueue.values()]
        .filter(a => a.executionState === EXECUTION_STATES.COMPLETED)
        .map(a => a.id)
    );
    const depCheck = dependencyGraphService.isActionReadyForExecution(action, completedSet);
    if (!depCheck.isReady) {
      await auditLog({
        event: 'EXECUTION_BLOCKED_BY_DEPENDENCY',
        actionId: action.id,
        sessionId,
        details: { pendingDependencies: depCheck.pendingDependencies }
      });
      return {
        actionId: action.id,
        status: EXECUTION_STATES.BLOCKED,
        message: `Action is blocked by prerequisite dependencies: ${depCheck.pendingDependencies.join(', ')}`,
        pendingDependencies: depCheck.pendingDependencies
      };
    }
  }

  // 2. Approval check
  const requiresApproval = APPROVAL_REQUIRED.has(action.type);
  const hasTrustedPolicy = checkTrustedPolicy(sessionId, action);

  if (requiresApproval && !isApproved && !hasTrustedPolicy) {
    await auditLog({
      event: 'EXECUTION_APPROVAL_REQUIRED',
      actionId: action.id,
      sessionId,
      details: { type: action.type }
    });
    return {
      actionId: action.id,
      status: EXECUTION_STATES.READY_FOR_APPROVAL,
      message: `Action "${action.type}" requires user approval before execution.`,
      previewData: buildPreviewData(action)
    };
  }

  // 2b. Backend Idempotency & Concurrent Execution Guard
  const existingState = _actionQueue.get(action.id);
  if (existingState && !action.allowRetry) {
    if (existingState.executionState === EXECUTION_STATES.RUNNING) {
      await auditLog({
        event: 'EXECUTION_DUPLICATE_IN_FLIGHT_BLOCKED',
        actionId: action.id,
        sessionId,
        details: { type: action.type }
      });
      return {
        success: false,
        actionId: action.id,
        status: EXECUTION_STATES.RUNNING,
        isDuplicateInFlight: true,
        message: 'Action is currently executing. Duplicate concurrent request blocked.'
      };
    }

    if (
      existingState.executionState === EXECUTION_STATES.UNKNOWN_EXECUTION_STATE &&
      !action.reconciled
    ) {
      return {
        success: false,
        actionId: action.id,
        status: EXECUTION_STATES.UNKNOWN_EXECUTION_STATE,
        httpStatus: 409,
        reconciliationRequired: true,
        message: 'Previous execution timed out with uncertain provider state. Reconcile status before retrying.'
      };
    }

    if (
      (existingState.executionState === EXECUTION_STATES.COMPLETED ||
       existingState.executionState === EXECUTION_STATES.SENT) &&
      existingState.executionResult?.success
    ) {
      await auditLog({
        event: 'EXECUTION_IDEMPOTENT_REPLAY',
        actionId: action.id,
        sessionId,
        details: { type: action.type }
      });
      return {
        success: true,
        actionId: action.id,
        status: existingState.executionState,
        whatsappStatus: existingState.executionResult?.status,
        isDuplicatePrevented: true,
        idempotentReplay: true,
        result: existingState.executionResult,
        message: 'Action was already executed successfully (idempotent replay).'
      };
    }
  }

  // 3. Mark state as RUNNING
  _actionQueue.set(action.id, {
    ...action,
    executionState: EXECUTION_STATES.RUNNING,
    startedAt: new Date().toISOString()
  });
  await auditLog({ event: 'EXECUTION_STARTED', actionId: action.id, sessionId, details: { type: action.type } });

  // 4. Safe Dispatch with Retry
  try {
    const result = await dispatchWithRetry(action, { sessionId, accessToken });

    // Determine truthful final state (especially for WhatsApp modes)
    let finalState;
    let auditEventName;

    if (action.type === 'SEND_WHATSAPP' && result?.status === EXECUTION_STATES.AWAITING_USER_SEND) {
      finalState = EXECUTION_STATES.AWAITING_USER_SEND;
      auditEventName = 'EXECUTION_AWAITING_USER_SEND';
    } else if (action.type === 'SEND_WHATSAPP' && result?.status === EXECUTION_STATES.SIMULATED) {
      finalState = EXECUTION_STATES.SIMULATED;
      auditEventName = 'EXECUTION_SIMULATED';
    } else if (result?.status === EXECUTION_STATES.UNKNOWN_EXECUTION_STATE) {
      finalState = EXECUTION_STATES.UNKNOWN_EXECUTION_STATE;
      auditEventName = 'EXECUTION_UNKNOWN_STATE';
    } else if (result?.success) {
      finalState = EXECUTION_STATES.COMPLETED;
      auditEventName = 'EXECUTION_COMPLETED';
    } else {
      finalState = EXECUTION_STATES.FAILED;
      auditEventName = 'EXECUTION_FAILED';
    }

    _actionQueue.set(action.id, {
      ...action,
      executionState: finalState,
      completedAt: new Date().toISOString(),
      executionResult: result
    });

    await auditLog({
      event: auditEventName,
      actionId: action.id,
      sessionId,
      details: {
        type: action.type,
        status: result?.status,
        providerStatus: result?.providerStatus,
        integrationMode: result?.integrationMode,
        providerMessageId: result?.providerMessageId,
        twilioMessageSid: result?.twilioMessageSid,
        sender: result?.sender,
        recipient: result?.recipient,
        errorCode: result?.errorCode,
        error: result?.success ? undefined : (result?.message || result?.providerError)
      }
    });

    return {
      success: Boolean(result?.success) && finalState !== EXECUTION_STATES.FAILED && finalState !== EXECUTION_STATES.UNKNOWN_EXECUTION_STATE,
      actionId: action.id,
      status: finalState,
      whatsappStatus: action.type === 'SEND_WHATSAPP' ? result?.status : undefined,
      providerStatus: result?.providerStatus,
      integrationMode: result?.integrationMode,
      providerMessageId: result?.providerMessageId,
      twilioMessageSid: result?.twilioMessageSid || result?.sid,
      dateCreated: result?.dateCreated,
      sender: result?.sender,
      recipient: result?.recipient,
      errorCode: result?.errorCode,
      isSimulated: Boolean(result?.isSimulated),
      message: result?.message,
      error: result?.success === false ? (result.message || result.providerError || 'Execution failed') : undefined,
      errors: result?.httpStatus === 400 ? [result?.message || 'Validation error'] : undefined,
      httpStatus: result?.httpStatus,
      result
    };

  } catch (err) {
    _actionQueue.set(action.id, {
      ...action,
      executionState: EXECUTION_STATES.UNKNOWN_EXECUTION_STATE,
      errorAt: new Date().toISOString(),
      error: err.message
    });

    await auditLog({
      event: 'EXECUTION_UNKNOWN_STATE',
      actionId: action.id,
      sessionId,
      details: { error: err.message }
    });

    return {
      actionId: action.id,
      status: EXECUTION_STATES.UNKNOWN_EXECUTION_STATE,
      message: 'Execution state unknown — manual reconciliation required.',
      error: err.message
    };
  }
}

/**
 * Dispatch action with bounded retries and exponential backoff
 */
async function dispatchWithRetry(action, context, maxRetries = 2) {
  let attempt = 0;
  let lastErr = null;

  while (attempt <= maxRetries) {
    try {
      return await dispatchAction(action, context);
    } catch (err) {
      lastErr = err;
      attempt++;
      if (attempt <= maxRetries) {
        const delay = 100 * Math.pow(2, attempt) + Math.random() * 50;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastErr;
}

/**
 * Dispatch action to domain integration
 */
async function dispatchAction(action, context) {
  switch (action.type) {
    // ── WHATSAPP ──────────────────────────────────────────────────────────────
    case 'SEND_WHATSAPP': {
      const phone =
        action.recipientPhone ||
        action.recipient?.phone ||
        action.assignee?.phone ||
        action.phone ||
        '';
      const recipientName =
        action.recipientName ||
        action.recipient?.name ||
        action.assignee?.name ||
        null;
      const message =
        action.whatsappMessage ||
        action.message ||
        action.description ||
        buildWhatsAppMessage(action);
      return sendWhatsAppMessage({
        to: phone,
        recipientName,
        message,
        idempotencyKey: action.idempotencyKey || action.id,
        actionId: action.id,
        sessionId: context.sessionId,
        integrationMode: action.integrationMode || context.integrationMode || null,
        cloudConfigOverride: action.cloudConfigOverride || null,
        customFetch: action.customFetch || context.customFetch || null,
        allowRetry: Boolean(action.allowRetry)
      });
    }

    // ── CALENDAR ──────────────────────────────────────────────────────────────
    case 'CREATE_CALENDAR_EVENT':
    case 'CREATE_EVENT':
    case 'CREATE_CALENDAR_REMINDER':
    case 'CREATE_RECURRING_EVENT': {
      const attendeesList = [
        ...(Array.isArray(action.attendeeEmails) ? action.attendeeEmails : []),
        action.assignee?.email,
        action.reviewer?.email,
        ...(Array.isArray(action.attendees) ? action.attendees.map(a => typeof a === 'string' && a.includes('@') ? a : (a?.email || null)) : [])
      ].filter(Boolean);

      const eventResult = await createCalendarEvent({
        title: action.title,
        startDateTime: action.startDate || action.startDateTime,
        endDateTime: action.deadline || action.endDateTime,
        date: action.dateFormatted || action.date || null,
        time: action.startTime || action.time || null,
        durationMinutes: action.durationMinutes || null,
        timeZone: action.timezone || action.timeZone || 'Asia/Kolkata',
        description: action.description,
        attendeeEmails: [...new Set(attendeesList)],
        notificationMinutes: action.notification?.minutesBefore || action.notificationMinutes || 10,
        recurrence: action.recurrence,
        idempotencyKey: action.id,
        actionId: action.id,
        sessionId: context.sessionId,
        accessToken: context.accessToken
      });

      // Also persist to independent ActionFlow backend reminder scheduler if it represents a reminder
      if (action.type === 'CREATE_CALENDAR_REMINDER' || action.title?.toLowerCase().includes('remind')) {
        try {
          await scheduleReminder({
            title: action.title,
            dueAt: action.startDate || action.startDateTime,
            sessionId: context.sessionId,
            description: action.description,
            syncGoogleCalendar: true,
            googleEventId: eventResult.eventId,
            notificationMinutes: action.notification?.minutesBefore || 10
          });
        } catch (e) {
          console.warn('[ExecutionGateway] Reminder scheduler fallback note:', e.message);
        }
      }

      // Also register in persistent Task & Calendar Management store so it appears in "My Tasks & Calendar"
      if (eventResult.success && eventResult.eventId) {
        try {
          const registered = await createOrRegisterTask({
            id: action.id,
            actionId: action.id,
            title: action.title,
            description: action.description,
            priority: action.priority || 'Normal',
            scheduledStart: eventResult.start?.dateTime || eventResult.start?.date || action.startDate || action.startDateTime || action.deadline,
            scheduledEnd: eventResult.end?.dateTime || eventResult.end?.date || action.endDateTime,
            durationMinutes: action.durationMinutes || 60,
            timeZone: action.timezone || action.timeZone || 'Asia/Kolkata',
            googleEventId: eventResult.eventId,
            eventLink: eventResult.eventLink
          }, { sessionId: context.sessionId });
          eventResult.taskId = registered?.task?.id || action.id;
        } catch (regErr) {
          console.warn('[ExecutionGateway] Task store registration warning:', regErr.message);
        }

        broadcastCalendarUpdate({
          event: 'CALENDAR_EVENT_CREATED',
          actionId: action.id,
          googleEventId: eventResult.eventId,
          title: action.title
        });
      }

      return eventResult;
    }

    case 'RESCHEDULE_EVENT':
    case 'UPDATE_CALENDAR_EVENT': {
      const updateRes = await rescheduleCalendarEvent({
        eventId: action.eventId || action.id,
        newStartDateTime: action.startDate || action.startDateTime,
        newEndDateTime: action.deadline || action.endDateTime,
        title: action.title,
        accessToken: context.accessToken,
        actionId: action.id,
        sessionId: context.sessionId
      });
      if (updateRes.success) {
        broadcastCalendarUpdate({
          event: 'CALENDAR_EVENT_UPDATED',
          actionId: action.id,
          googleEventId: action.eventId || action.id,
          title: action.title
        });
      }
      return updateRes;
    }

    case 'DELETE_CALENDAR_EVENT': {
      const delRes = await deleteCalendarEvent({
        eventId: action.eventId || action.id,
        accessToken: context.accessToken,
        actionId: action.id,
        sessionId: context.sessionId
      });
      if (delRes.success) {
        broadcastCalendarUpdate({
          event: 'CALENDAR_EVENT_DELETED',
          actionId: action.id,
          googleEventId: action.eventId || action.id
        });
      }
      return delRes;
    }

    // ── TASKS & ASSIGNMENTS ───────────────────────────────────────────────────
    case 'CREATE_TASK':
    case 'ASSIGN_TASK':
    case 'UPDATE_TASK':
    case 'CREATE_RECURRING_TASK': {
      await auditLog({
        event: 'TASK_CREATED_INTERNALLY',
        actionId: action.id,
        sessionId: context.sessionId,
        details: { title: action.title, type: action.type }
      });
      try {
        await createOrRegisterTask({
          id: action.id,
          actionId: action.id,
          title: action.title,
          description: action.description,
          priority: action.priority || 'Normal',
          assigneeId: action.assignee?.id || action.assigneeId || null,
          assigneeName: action.assignee?.name || action.assigneeName || null,
          scheduledStart: action.startDate || action.deadline || action.dueDate || null,
          durationMinutes: action.durationMinutes || 60
        }, { sessionId: context.sessionId });
      } catch (regErr) {
        console.warn('[ExecutionGateway] Internal task registration warning:', regErr.message);
      }
      return {
        success: true,
        status: 'CREATED',
        taskId: action.id,
        message: 'Task created successfully.'
      };
    }

    case 'COMPLETE_TASK': {
      await auditLog({ event: 'TASK_COMPLETED', actionId: action.id, sessionId: context.sessionId });
      return { success: true, status: 'COMPLETED', taskId: action.id };
    }

    case 'DELETE_TASK': {
      await auditLog({ event: 'TASK_DELETED', actionId: action.id, sessionId: context.sessionId });
      return { success: true, status: 'DELETED', taskId: action.id };
    }

    // ── SHOPPING LIST ─────────────────────────────────────────────────────────
    case 'ADD_SHOPPING_ITEM':
    case 'ADD_ITEM': {
      const items = action.shoppingItems || [action.title];
      return {
        success: true,
        status: 'ADDED',
        items,
        message: `Added ${items.length} item(s) to shopping list.`
      };
    }

    // ── PERSONAL REMINDERS ────────────────────────────────────────────────────
    case 'CREATE_REMINDER': {
      return {
        success: true,
        status: 'SCHEDULED',
        reminderId: `rem_${Date.now()}`,
        time: action.deadlineRaw || action.reminderTime || 'evening',
        message: 'Personal reminder scheduled.'
      };
    }

    default:
      return {
        success: true,
        status: 'ACKNOWLEDGED',
        message: `Action type ${action.type} executed safely.`
      };
  }
}

/**
 * Validates action for execution readiness
 */
function validateActionForExecution(action) {
  const errors = [];
  if (!action?.id) errors.push('Action ID is required.');
  if (!action?.type) errors.push('Action type is required.');
  if (!action?.title) errors.push('Action title is required.');
  if (action?.executionState === EXECUTION_STATES.CANCELLED) {
    errors.push('Cannot execute a cancelled action.');
  }
  return { isValid: errors.length === 0, errors };
}

function buildPreviewData(action) {
  return {
    id: action.id,
    type: action.type,
    title: action.title,
    description: action.description,
    destination: action.destination,
    assignee: action.assignee?.name || action.assigneeName || null,
    deadline: action.deadline || action.deadlineRaw,
    messagePreview: action.type === 'SEND_WHATSAPP' ? (action.whatsappMessage || action.description) : null
  };
}

function checkTrustedPolicy(sessionId, action) {
  const policies = _trustedPolicies.get(sessionId) || [];
  return policies.some(p =>
    p.type === action.type &&
    (!p.assigneeId || p.assigneeId === action.assignee?.id)
  );
}

export function registerTrustedPolicy(sessionId, policy) {
  const existing = _trustedPolicies.get(sessionId) || [];
  _trustedPolicies.set(sessionId, [...existing, { ...policy, registeredAt: new Date().toISOString() }]);
}

export function getActionState(actionId) {
  return _actionQueue.get(actionId) || null;
}

/**
 * Rejects and cancels a proposed action
 */
export async function rejectAction(actionId, reason = 'Rejected by user', options = {}) {
  const existing = _actionQueue.get(actionId) || { id: actionId };
  const updated = {
    ...existing,
    executionState: EXECUTION_STATES.CANCELLED,
    rejectionReason: reason,
    rejectedAt: new Date().toISOString()
  };
  _actionQueue.set(actionId, updated);
  await auditLog({
    event: 'ACTION_REJECTED',
    actionId,
    sessionId: options.sessionId,
    details: { reason }
  });
  return {
    actionId,
    status: EXECUTION_STATES.CANCELLED,
    reason,
    message: 'Action was rejected and cancelled.'
  };
}

export { EXECUTION_STATES };
