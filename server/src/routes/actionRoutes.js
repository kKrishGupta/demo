/**
 * ActionFlow AI — Action & Domain Execution Routes (Phase 2 Upgraded)
 *
 * Implements full REST contracts for:
 * - Gateway Actions: /actions/validate, /actions/approve, /actions/execute, /actions/history
 * - Tasks & Assignments: GET/POST /tasks, PATCH /tasks/:id, POST /tasks/:id/assign
 * - Shopping Lists: GET/POST /shopping/items, PATCH /shopping/items/:id/toggle
 * - Personal Reminders: GET/POST /reminders, PATCH /reminders/:id/complete
 * - WhatsApp Messaging: POST /whatsapp/preview, POST /whatsapp/send
 */

import { Router } from 'express';
import { executeAction, getActionState, EXECUTION_STATES } from '../services/executionGateway.js';
import {
  sendWhatsAppMessage,
  buildWhatsAppMessage,
  getWhatsAppIntegrationStatus,
  confirmWhatsAppUserSent,
  verifyWhatsAppWebhookSubscription,
  processWhatsAppWebhook,
  syncTwilioMessageStatus,
  listWhatsAppMessages,
  getWhatsAppMessageById,
  validateE164Phone
} from '../services/whatsappService.js';
import { getGeminiQuotaStatus } from '../services/geminiService.js';
import { auditLog, getAuditEntries } from '../services/auditService.js';
import { cacheService } from '../cache/cacheService.js';
import {
  createOrRegisterTask,
  listTasks,
  getTaskById,
  updateTask,
  completeTask,
  retryCalendarRemoval,
  undoTaskCompletion,
  getTaskAuditHistory,
  TASK_STATUSES
} from '../services/taskManagementService.js';

const router = Router();

// ─── In-Memory Domain Stores ──────────────────────────────────────────────────
const _taskStore = new Map();
const _shoppingStore = new Map(); // sessionId → items[]
const _reminderStore = new Map(); // sessionId → reminders[]
const _actionHistory = new Map();

function addToHistory(sessionId, entry) {
  if (!_actionHistory.has(sessionId)) _actionHistory.set(sessionId, []);
  const hist = _actionHistory.get(sessionId);
  hist.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (hist.length > 100) hist.pop();
}

// ─── POST /actions/validate ───────────────────────────────────────────────────
router.post('/actions/validate', (req, res) => {
  const { action } = req.body;
  const errors = [];

  if (!action?.id) errors.push('Action ID is required.');
  if (!action?.type) errors.push('Action type is required.');
  if (!action?.title) errors.push('Action title is required.');

  return res.status(200).json({
    requestId: req.requestId,
    isValid: errors.length === 0,
    errors,
    action
  });
});

// ─── POST /actions/approve ────────────────────────────────────────────────────
router.post('/actions/approve', async (req, res, next) => {
  const { action } = req.body;
  if (!action?.id || !action?.type) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'action with id and type required.' });
  }

  try {
    const result = await executeAction(action, {
      sessionId: req.sessionId,
      accessToken: req.headers?.['x-google-token'] || req.headers?.['authorization']?.replace('Bearer ', ''),
      isApproved: true
    });

    const isProviderSuccess =
      result?.success === true &&
      (result?.status === EXECUTION_STATES.COMPLETED || result?.status === EXECUTION_STATES.SENT);
    const isHandoffReady = result?.status === EXECUTION_STATES.AWAITING_USER_SEND;
    const isSimulated = result?.status === EXECUTION_STATES.SIMULATED;

    const statusCode = isProviderSuccess ? 200
      : isHandoffReady ? 202
      : isSimulated ? 200
      : result?.isDuplicateInFlight || result?.reconciliationRequired ? 409
      : result?.status === EXECUTION_STATES.READY_FOR_APPROVAL || result?.status === EXECUTION_STATES.QUEUED ? 202
      : result?.errors?.length > 0 ? 400
      : result?.result?.status === 'NOT_CONNECTED' ? 401
      : (result?.httpStatus && result.httpStatus >= 400 && result.httpStatus < 600) ? result.httpStatus
      : 422;

    const executionStage = isProviderSuccess
      ? 'PROVIDER_EXECUTION_SUCCEEDED'
      : isHandoffReady
        ? 'AWAITING_USER_SEND'
        : isSimulated
          ? 'SIMULATED_EXECUTION_ONLY'
          : result?.isDuplicateInFlight
            ? 'PROVIDER_EXECUTION_STARTED'
            : result?.reconciliationRequired
              ? 'RECONCILIATION_REQUIRED'
              : 'PROVIDER_EXECUTION_FAILED';

    addToHistory(req.sessionId, { type: 'APPROVED', actionId: action.id, title: action.title, status: result.status });
    return res.status(statusCode).json({
      requestId: req.requestId,
      success: Boolean(isProviderSuccess || isHandoffReady || isSimulated),
      executionStage,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /actions/execute ────────────────────────────────────────────────────
router.post('/actions/execute', async (req, res, next) => {
  const { action, isApproved = false } = req.body;
  if (!action?.id || !action?.type || !action?.title) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'action with id, type, and title required.' });
  }

  try {
    const result = await executeAction(action, {
      sessionId: req.sessionId,
      accessToken: req.headers['x-google-token'] || req.headers['authorization']?.replace('Bearer ', ''),
      isApproved: Boolean(isApproved)
    });

    const statusCode = result.status === EXECUTION_STATES.COMPLETED ? 200
      : result.status === EXECUTION_STATES.AWAITING_USER_SEND ? 202
      : result.status === EXECUTION_STATES.SIMULATED ? 200
      : result.status === EXECUTION_STATES.READY_FOR_APPROVAL ? 202
      : (result.httpStatus && result.httpStatus >= 400 && result.httpStatus < 600) ? result.httpStatus
      : 422;

    addToHistory(req.sessionId, { type: 'EXECUTED', actionId: action.id, title: action.title, status: result.status });
    return res.status(statusCode).json({ requestId: req.requestId, ...result });
  } catch (err) {
    next(err);
  }
});

// ─── GET /actions/history ─────────────────────────────────────────────────────
router.get('/actions/history', (req, res) => {
  const history = _actionHistory.get(req.sessionId) || [];
  return res.status(200).json({ requestId: req.requestId, count: history.length, history });
});

// ─── TASKS & CALENDAR LIFECYCLE MANAGEMENT ────────────────────────────────────

// GET /api/v1/tasks — List tasks with filter (all|upcoming|pending|completed|cancelled) & search
router.get('/tasks', async (req, res, next) => {
  try {
    const filter = req.query?.filter || 'all';
    const search = req.query?.search || '';
    const syncCalendar = req.query?.sync === 'true';

    const result = await listTasks({
      sessionId: req.sessionId,
      filter,
      search,
      syncCalendar
    });

    const auditHistory = getTaskAuditHistory(null, req.sessionId);

    return res.status(200).json({
      requestId: req.requestId,
      success: true,
      count: result.tasks.length,
      counts: result.counts,
      tasks: result.tasks,
      completedHistory: result.completedHistory,
      auditEntries: auditHistory.globalAuditEntries
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tasks/:taskId — Retrieve single task + preserved audit trail
router.get('/tasks/:taskId', (req, res) => {
  const task = getTaskById(req.params.taskId, req.sessionId);
  if (!task) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: `Task "${req.params.taskId}" not found.`
    });
  }

  const auditHistory = getTaskAuditHistory(task.id, req.sessionId);
  return res.status(200).json({
    requestId: req.requestId,
    success: true,
    task,
    auditTrail: auditHistory.taskAuditTrail,
    globalAuditEntries: auditHistory.globalAuditEntries
  });
});

// POST /api/v1/tasks — Create task (and optionally create linked Google Calendar event)
router.post('/tasks', async (req, res, next) => {
  try {
    const { title } = req.body || {};
    if (!title?.trim()) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'title is required.' });
    }

    const accessToken = req.headers?.['x-google-token'] || req.headers?.['authorization']?.replace('Bearer ', '');
    const result = await createOrRegisterTask(req.body, {
      sessionId: req.sessionId,
      accessToken
    });

    if (!result.success) {
      return res.status(result.httpStatus || 422).json({
        requestId: req.requestId,
        success: false,
        error: result.error,
        message: result.message
      });
    }

    addToHistory(req.sessionId, {
      type: 'TASK_CREATED',
      actionId: result.task.id,
      title: result.task.title,
      googleEventId: result.task.googleEventId
    });

    return res.status(201).json({
      requestId: req.requestId,
      success: true,
      task: result.task
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/tasks/:taskId — Edit task details or status
router.patch('/tasks/:taskId', async (req, res, next) => {
  try {
    const accessToken = req.headers?.['x-google-token'] || req.headers?.['authorization']?.replace('Bearer ', '');
    const result = await updateTask(req.params.taskId, req.body || {}, {
      sessionId: req.sessionId,
      accessToken
    });

    if (!result.success) {
      return res.status(result.httpStatus || 404).json({
        requestId: req.requestId,
        success: false,
        error: result.error,
        message: result.message
      });
    }

    return res.status(200).json({
      requestId: req.requestId,
      success: true,
      task: result.task
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/tasks/:taskId/status — Update task status explicitly
router.patch('/tasks/:taskId/status', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!status) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'status is required.' });
    }

    // If caller tries to mark COMPLETED via status patch without complete endpoint, require complete flow if calendar event attached
    const accessToken = req.headers?.['x-google-token'] || req.headers?.['authorization']?.replace('Bearer ', '');
    const result = await updateTask(req.params.taskId, { status }, {
      sessionId: req.sessionId,
      accessToken
    });

    if (!result.success) {
      return res.status(result.httpStatus || 400).json({
        requestId: req.requestId,
        success: false,
        error: result.error,
        message: result.message
      });
    }

    return res.status(200).json({
      requestId: req.requestId,
      success: true,
      task: result.task
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tasks/:taskId/complete — Complete task and delete linked Google Calendar event
router.post('/tasks/:taskId/complete', async (req, res, next) => {
  try {
    const confirmComplete = Boolean(
      req.body?.confirmComplete === true ||
      req.body?.confirmed === true ||
      req.query?.confirm === 'true'
    );
    const simulateFailure = Boolean(req.body?.simulateFailure === true);
    const accessToken = req.headers?.['x-google-token'] || req.headers?.['authorization']?.replace('Bearer ', '');

    const result = await completeTask(req.params.taskId, {
      sessionId: req.sessionId,
      accessToken,
      confirmComplete,
      simulateFailure
    });

    addToHistory(req.sessionId, {
      type: result.success ? 'TASK_COMPLETED' : 'CALENDAR_REMOVAL_FAILED',
      actionId: req.params.taskId,
      status: result.status
    });

    return res.status(result.httpStatus || (result.success ? 200 : 422)).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tasks/:taskId/retry-calendar-removal — Retry Google Calendar removal after CALENDAR_REMOVAL_FAILED
router.post('/tasks/:taskId/retry-calendar-removal', async (req, res, next) => {
  try {
    const simulateFailure = Boolean(req.body?.simulateFailure === true);
    const accessToken = req.headers?.['x-google-token'] || req.headers?.['authorization']?.replace('Bearer ', '');

    const result = await retryCalendarRemoval(req.params.taskId, {
      sessionId: req.sessionId,
      accessToken,
      simulateFailure
    });

    return res.status(result.httpStatus || (result.success ? 200 : 502)).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tasks/:taskId/undo-completion — Undo completion by recreating the Google Calendar event
router.post('/tasks/:taskId/undo-completion', async (req, res, next) => {
  try {
    const accessToken = req.headers?.['x-google-token'] || req.headers?.['authorization']?.replace('Bearer ', '');
    const result = await undoTaskCompletion(req.params.taskId, {
      sessionId: req.sessionId,
      accessToken
    });

    return res.status(result.httpStatus || (result.success ? 200 : 422)).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tasks/:id/assign — Assign task to team member
router.post('/tasks/:id/assign', async (req, res, next) => {
  try {
    const { assigneeId, assigneeName } = req.body || {};
    const result = await updateTask(req.params.id, { assigneeId, assigneeName }, {
      sessionId: req.sessionId
    });

    if (!result.success) {
      return res.status(404).json({ error: 'NOT_FOUND', message: `Task ${req.params.id} not found.` });
    }

    await auditLog({
      event: 'TASK_ASSIGNED',
      actionId: result.task.id,
      sessionId: req.sessionId,
      details: { assigneeName: result.task.assigneeName }
    });

    return res.status(200).json({ requestId: req.requestId, success: true, task: result.task });
  } catch (err) {
    next(err);
  }
});

// ─── SHOPPING LIST (Personal Micro-Action Engine) ─────────────────────────────
router.get('/shopping/items', (req, res) => {
  const listKey = `shop_${req.sessionId}`;
  const items = _shoppingStore.get(listKey) || [];
  return res.status(200).json({ requestId: req.requestId, count: items.length, items });
});

router.post('/shopping/items', (req, res) => {
  const { items, item, category = 'Groceries', quantity = 1 } = req.body;
  const itemNames = Array.isArray(items) ? items : item ? [item] : [];

  if (itemNames.length === 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'items array or item name required.' });
  }

  const listKey = `shop_${req.sessionId}`;
  const existing = _shoppingStore.get(listKey) || [];

  const added = itemNames.map(name => ({
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    name: String(name).trim(),
    category,
    quantity,
    completed: false,
    addedAt: new Date().toISOString()
  }));

  const updated = [...existing, ...added];
  _shoppingStore.set(listKey, updated);

  return res.status(201).json({
    requestId: req.requestId,
    success: true,
    addedCount: added.length,
    items: added,
    totalInList: updated.length
  });
});

router.patch('/shopping/items/:id/toggle', (req, res) => {
  const listKey = `shop_${req.sessionId}`;
  const items = _shoppingStore.get(listKey) || [];
  const target = items.find(i => i.id === req.params.id);

  if (!target) {
    return res.status(404).json({ error: 'NOT_FOUND', message: `Item ${req.params.id} not found.` });
  }

  target.completed = !target.completed;
  _shoppingStore.set(listKey, items);

  return res.status(200).json({ requestId: req.requestId, success: true, item: target });
});

// ─── PERSONAL REMINDERS ───────────────────────────────────────────────────────
router.get('/reminders', (req, res) => {
  const remKey = `rem_${req.sessionId}`;
  const reminders = _reminderStore.get(remKey) || [];
  return res.status(200).json({ requestId: req.requestId, count: reminders.length, reminders });
});

router.post('/reminders', (req, res) => {
  const { title, reminderTime, context, recurring = false } = req.body;

  if (!title?.trim()) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'title is required.' });
  }

  const remKey = `rem_${req.sessionId}`;
  const existing = _reminderStore.get(remKey) || [];

  const reminder = {
    id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    title: title.trim(),
    reminderTime: reminderTime || 'today evening',
    context: context || '',
    recurring: Boolean(recurring),
    status: 'Scheduled',
    createdAt: new Date().toISOString()
  };

  _reminderStore.set(remKey, [reminder, ...existing]);

  return res.status(201).json({
    requestId: req.requestId,
    success: true,
    reminder
  });
});

router.patch('/reminders/:id/complete', (req, res) => {
  const remKey = `rem_${req.sessionId}`;
  const reminders = _reminderStore.get(remKey) || [];
  const target = reminders.find(r => r.id === req.params.id);

  if (!target) {
    return res.status(404).json({ error: 'NOT_FOUND', message: `Reminder ${req.params.id} not found.` });
  }

  target.status = 'Completed';
  _reminderStore.set(remKey, reminders);

  return res.status(200).json({ requestId: req.requestId, success: true, reminder: target });
});

// ─── WHATSAPP EXECUTION, MESSAGE TRACKER & WEBHOOK ROUTES ─────────────────────

// GET /api/v1/whatsapp/status — Returns integration audit status + Gemini quota status
router.get('/whatsapp/status', (req, res) => {
  return res.status(200).json({
    requestId: req.requestId,
    success: true,
    whatsapp: getWhatsAppIntegrationStatus(),
    geminiQuota: getGeminiQuotaStatus()
  });
});

// GET /api/v1/whatsapp/messages — Persistent message status tracker (ISSUE 5 & TEST 8)
router.get('/whatsapp/messages', async (req, res) => {
  const statusFilter = req.query?.status || 'all';
  const syncLive = req.query?.sync === 'true';

  if (syncLive) {
    const currentList = listWhatsAppMessages({ sessionId: req.sessionId, status: 'all' });
    for (const msg of currentList.slice(0, 5)) {
      if (
        msg.integrationMode === 'TWILIO' &&
        msg.providerMessageId?.startsWith('SM') &&
        (msg.status === 'QUEUED' || msg.status === 'SENT')
      ) {
        await syncTwilioMessageStatus(msg.id).catch(() => {});
      }
    }
  }

  const messages = listWhatsAppMessages({
    sessionId: req.sessionId,
    status: statusFilter
  });
  return res.status(200).json({
    requestId: req.requestId,
    success: true,
    count: messages.length,
    integrationStatus: getWhatsAppIntegrationStatus(),
    messages
  });
});

// POST /api/v1/whatsapp/messages/:id/sync-status — Query Twilio API for live status transition
router.post('/whatsapp/messages/:id/sync-status', async (req, res, next) => {
  try {
    const result = await syncTwilioMessageStatus(req.params.id);
    return res.status(result.httpStatus || 200).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/whatsapp/messages/:id — Retrieve single WhatsApp message record
router.get('/whatsapp/messages/:id', (req, res) => {
  const record = getWhatsAppMessageById(req.params.id);
  if (!record) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: `WhatsApp message "${req.params.id}" not found.`
    });
  }
  return res.status(200).json({
    requestId: req.requestId,
    success: true,
    record
  });
});

// POST /api/v1/whatsapp/preview — Validate and preview a WhatsApp draft without auto-sending
router.post('/whatsapp/preview', (req, res) => {
  const { recipientName, recipientPhone, messageIntent, contextText } = req.body || {};

  if (!recipientName && !recipientPhone) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'recipientName or recipientPhone required.' });
  }

  const message = (messageIntent || contextText || '').trim();
  if (!message) {
    return res.status(400).json({ error: 'EMPTY_MESSAGE_BODY', message: 'Exact message text is required before previewing.' });
  }

  const phoneValidation = recipientPhone ? validateE164Phone(recipientPhone) : { isValid: false, normalized: '' };
  const previewId = `wp_prev_${Date.now()}`;

  return res.status(200).json({
    requestId: req.requestId,
    previewId,
    recipientName: recipientName || 'Recipient',
    recipientPhone: phoneValidation.normalized || recipientPhone || '',
    phoneValid: phoneValidation.isValid,
    phoneError: phoneValidation.isValid ? null : phoneValidation.message,
    messagePreview: message,
    requiresApproval: true,
    status: 'PENDING_APPROVAL'
  });
});

// POST /api/v1/whatsapp/send — Execute WhatsApp send (or generate Click-to-Chat handoff)
router.post('/whatsapp/send', async (req, res, next) => {
  const {
    recipientPhone,
    recipientName = null,
    message,
    actionId,
    idempotencyKey,
    integrationMode = null,
    cloudConfigOverride = null,
    isApproved = false,
    allowRetry = false
  } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({
      error: 'EMPTY_MESSAGE_BODY',
      status: 'FAILED',
      message: 'WhatsApp message body is required.'
    });
  }

  const phoneValidation = validateE164Phone(recipientPhone);
  if (!phoneValidation.isValid) {
    return res.status(400).json({
      requestId: req.requestId,
      success: false,
      status: 'FAILED',
      error: phoneValidation.error,
      message: phoneValidation.message
    });
  }

  const actionPayload = {
    id: actionId || idempotencyKey || `wp_send_${Date.now()}`,
    idempotencyKey: idempotencyKey || actionId,
    type: 'SEND_WHATSAPP',
    destination: 'WHATSAPP',
    title: `Send WhatsApp to ${recipientName || phoneValidation.normalized}`,
    whatsappMessage: String(message).trim(),
    recipientName,
    recipientPhone: phoneValidation.normalized,
    recipient: { name: recipientName, phone: phoneValidation.normalized },
    integrationMode,
    cloudConfigOverride,
    allowRetry: Boolean(allowRetry)
  };

  try {
    const result = await executeAction(actionPayload, {
      sessionId: req.sessionId,
      isApproved: Boolean(isApproved),
      integrationMode
    });

    const statusCode =
      result.status === EXECUTION_STATES.READY_FOR_APPROVAL ? 202
      : result.status === EXECUTION_STATES.AWAITING_USER_SEND ? 202
      : result.status === EXECUTION_STATES.SIMULATED ? 200
      : result.status === EXECUTION_STATES.COMPLETED ? 200
      : (result.httpStatus && result.httpStatus >= 400 && result.httpStatus < 600) ? result.httpStatus
      : 422;

    return res.status(statusCode).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/whatsapp/messages/:id/confirm-user-sent — Confirm Click-to-Chat message was sent manually (TEST 5)
router.post('/whatsapp/messages/:id/confirm-user-sent', async (req, res, next) => {
  try {
    const confirmed = Boolean(req.body?.confirmed === true);
    const result = await confirmWhatsAppUserSent(req.params.id, {
      confirmed,
      sessionId: req.sessionId
    });
    return res.status(result.httpStatus || 200).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/whatsapp/webhook — Meta WhatsApp Business Cloud API Webhook verification challenge
router.get('/whatsapp/webhook', (req, res) => {
  const check = verifyWhatsAppWebhookSubscription(req.query || {});
  if (check.verified) {
    return res.status(200).send(check.challenge);
  }
  return res.status(check.httpStatus || 403).json({
    error: check.error || 'WEBHOOK_VERIFICATION_FAILED'
  });
});

// POST /api/v1/whatsapp/webhook — Meta Cloud API & Twilio status webhook receiver (TEST 7)
router.post('/whatsapp/webhook', async (req, res, next) => {
  try {
    const signatureHeader = req.headers?.['x-hub-signature-256'] || null;
    const twilioSignatureHeader = req.headers?.['x-twilio-signature'] || null;
    const webhookUrl = req.headers?.['x-forwarded-proto'] && req.headers?.host
      ? `${req.headers['x-forwarded-proto']}://${req.headers.host}${req.originalUrl}`
      : req.body?.webhookUrl || null;
    const result = await processWhatsAppWebhook(req.body || {}, {
      signatureHeader,
      twilioSignatureHeader,
      webhookUrl
    });
    return res.status(result.httpStatus || 200).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

export default router;
