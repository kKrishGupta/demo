/**
 * ActionFlow Server — Execution Routes
 *
 * POST /api/v1/execution/approve  — Approve action for execution
 * POST /api/v1/execution/execute  — Execute an approved action
 * POST /api/v1/execution/cancel   — Cancel an action
 * GET  /api/v1/execution/:id      — Get action execution state
 * GET  /api/v1/audit              — Get audit log entries
 */

import { Router } from 'express';
import {
  executeAction,
  getActionState,
  registerTrustedPolicy,
  EXECUTION_STATES
} from '../services/executionGateway.js';
import { auditLog, getAuditEntries } from '../services/auditService.js';

const router = Router();

// ─── POST /approve ────────────────────────────────────────────────────────────
router.post('/approve', async (req, res, next) => {
  const { actionId, action } = req.body;

  if (!actionId || !action) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'actionId and action are required.' });
  }

  try {
    const result = await executeAction(action, {
      sessionId: req.sessionId,
      accessToken: req.headers['x-google-token'],
      isApproved: true
    });

    const isSuccess = result?.success === true && result?.status === EXECUTION_STATES.COMPLETED;
    const statusCode = isSuccess ? 200
      : result?.isDuplicateInFlight ? 409
      : result?.status === EXECUTION_STATES.READY_FOR_APPROVAL || result?.status === EXECUTION_STATES.QUEUED ? 202
      : result?.errors?.length > 0 ? 400
      : result?.result?.status === 'NOT_CONNECTED' ? 401
      : (result?.httpStatus && result.httpStatus >= 400 && result.httpStatus < 600) ? result.httpStatus
      : 422;

    return res.status(statusCode).json({
      requestId: req.requestId,
      success: isSuccess,
      executionStage: isSuccess ? 'PROVIDER_EXECUTION_SUCCEEDED' : (result?.isDuplicateInFlight ? 'PROVIDER_EXECUTION_STARTED' : 'PROVIDER_EXECUTION_FAILED'),
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /execute ─────────────────────────────────────────────────────────────
router.post('/execute', async (req, res, next) => {
  const { action, isApproved = false } = req.body;
  if (!action?.id || !action?.type || !action?.title) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'action with id, type, and title is required.' });
  }

  try {
    const result = await executeAction(action, {
      sessionId: req.sessionId,
      accessToken: req.headers['x-google-token'],
      isApproved: Boolean(isApproved)
    });

    const statusCode = result.status === EXECUTION_STATES.READY_FOR_APPROVAL ? 202
                     : result.status === EXECUTION_STATES.COMPLETED ? 200
                     : result.status === EXECUTION_STATES.FAILED ? 500
                     : 200;

    return res.status(statusCode).json({ requestId: req.requestId, ...result });
  } catch (err) {
    next(err);
  }
});

// ─── POST /cancel ─────────────────────────────────────────────────────────────
router.post('/cancel', async (req, res, next) => {
  const { actionId } = req.body;
  if (!actionId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'actionId is required.' });
  }

  try {
    await auditLog({
      event: 'ACTION_CANCELLED',
      actionId,
      sessionId: req.sessionId,
      details: { cancelledBy: 'user' }
    });

    return res.status(200).json({
      requestId: req.requestId,
      actionId,
      status: EXECUTION_STATES.CANCELLED,
      message: 'Action cancelled successfully.'
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id — Get execution state ──────────────────────────────────────────
router.get('/:id', (req, res) => {
  const state = getActionState(req.params.id);
  if (!state) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: `Action ${req.params.id} not found in execution queue.`
    });
  }
  return res.status(200).json({
    requestId: req.requestId,
    actionId: req.params.id,
    executionState: state.executionState,
    completedAt: state.completedAt,
    result: state.executionResult
  });
});

// ─── POST /trusted-policy ─────────────────────────────────────────────────────
router.post('/trusted-policy', (req, res) => {
  const { type, assigneeId } = req.body;
  if (!type) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'type is required.' });
  }

  registerTrustedPolicy(req.sessionId, { type, assigneeId });
  return res.status(201).json({
    requestId: req.requestId,
    success: true,
    message: `Trusted policy registered for action type: ${type}`
  });
});

export default router;
