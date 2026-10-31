/**
 * ActionFlow Server — Room Management & Room-Based Task Distribution Routes
 *
 * Implements:
 * - GET /rooms — List all configured rooms with real task counts and stats
 * - POST /rooms — Create a new room
 * - GET /rooms/:roomId — Get room details and stats
 * - PATCH /rooms/:roomId — Update room details, categories, rules, and active status
 * - DELETE /rooms/:roomId — Deactivate or soft-delete room
 * - POST /rooms/reorder — Reorder rooms
 * - GET /rooms/:roomId/tasks — Get tasks specifically belonging to a room
 * - PATCH /tasks/:taskId/room — Reassign task to a different room
 * - POST /tasks/:taskId/reopen — Reopen a completed task
 * - GET /room-routing/rules — List routing rules
 * - POST /room-routing/rules — Create or update routing rule
 * - POST /room-routing/feedback — Record room correction feedback
 * - POST /room-routing/classify — Test or preview room classification for an arbitrary text
 */

import { Router } from 'express';
import {
  listRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  reorderRooms,
  listRoomRules,
  saveRoomRule,
  recordRoomCorrectionFeedback,
  getRoomFeedbackHistory
} from '../services/roomManagementService.js';
import {
  listTasks,
  getTaskById,
  reassignTaskRoom,
  reopenTask,
  TASK_STATUSES
} from '../services/taskManagementService.js';
import { roomClassificationEngine } from '../services/roomClassificationEngine.js';

const router = Router();

// ─── GET /rooms — List all configured rooms with aggregate task counts ────────
router.get('/rooms', async (req, res, next) => {
  try {
    const organizationId = req.headers['x-organization-id'] || req.query.organizationId || 'org_default';
    const includeInactive = req.query.includeInactive === 'true';

    const rooms = listRooms({ organizationId, includeInactive });
    const { counts } = await listTasks({ sessionId: req.sessionId });

    const roomsWithStats = rooms.map(room => {
      const taskCount = counts.byRoom?.[room.roomId] || 0;
      return {
        ...room,
        taskCount
      };
    });

    return res.status(200).json({
      requestId: req.requestId,
      success: true,
      totalRooms: roomsWithStats.length,
      rooms: roomsWithStats
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /rooms — Create a new room ──────────────────────────────────────────
router.post('/rooms', async (req, res, next) => {
  try {
    const organizationId = req.headers['x-organization-id'] || req.body.organizationId || 'org_default';
    const room = createRoom(req.body, { organizationId });

    return res.status(201).json({
      requestId: req.requestId,
      success: true,
      room
    });
  } catch (err) {
    if (err.message?.includes('required')) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: err.message });
    }
    next(err);
  }
});

// ─── POST /rooms/reorder — Reorder rooms ───────────────────────────────────────
router.post('/rooms/reorder', async (req, res, next) => {
  try {
    const { orderedRoomIds } = req.body || {};
    if (!Array.isArray(orderedRoomIds)) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'orderedRoomIds array is required.' });
    }

    const organizationId = req.headers['x-organization-id'] || req.body.organizationId || 'org_default';
    const rooms = reorderRooms(orderedRoomIds, { organizationId });

    return res.status(200).json({
      requestId: req.requestId,
      success: true,
      rooms
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /rooms/:roomId — Get room details & task statistics ──────────────────
router.get('/rooms/:roomId', async (req, res, next) => {
  try {
    const organizationId = req.headers['x-organization-id'] || req.query.organizationId || 'org_default';
    const room = getRoomById(req.params.roomId, { organizationId });

    if (!room) {
      return res.status(404).json({ error: 'ROOM_NOT_FOUND', message: `Room "${req.params.roomId}" not found.` });
    }

    const { tasks, stats } = await listTasks({ sessionId: req.sessionId, roomId: room.roomId });

    return res.status(200).json({
      requestId: req.requestId,
      success: true,
      room,
      stats,
      tasks
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /rooms/:roomId — Update room details, categories, rules ───────────
router.patch('/rooms/:roomId', async (req, res, next) => {
  try {
    const organizationId = req.headers['x-organization-id'] || req.body.organizationId || 'org_default';
    const updated = updateRoom(req.params.roomId, req.body, { organizationId });

    return res.status(200).json({
      requestId: req.requestId,
      success: true,
      room: updated
    });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'ROOM_NOT_FOUND', message: err.message });
    }
    next(err);
  }
});

// ─── DELETE /rooms/:roomId — Deactivate or soft-delete room ──────────────────
router.delete('/rooms/:roomId', async (req, res, next) => {
  try {
    const organizationId = req.headers['x-organization-id'] || req.query.organizationId || 'org_default';
    const hardDelete = req.query.hardDelete === 'true';
    const result = deleteRoom(req.params.roomId, { organizationId, hardDelete });

    return res.status(200).json({
      requestId: req.requestId,
      success: true,
      ...result
    });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'ROOM_NOT_FOUND', message: err.message });
    }
    next(err);
  }
});

// ─── GET /rooms/:roomId/tasks — Get tasks specifically belonging to a room ────
router.get('/rooms/:roomId/tasks', async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { filter = 'all', search = '', status } = req.query;

    const result = await listTasks({
      sessionId: req.sessionId,
      roomId,
      filter: status || filter,
      search
    });

    return res.status(200).json({
      requestId: req.requestId,
      success: true,
      roomId,
      tasks: result.tasks,
      stats: result.stats,
      counts: result.counts
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /tasks/:taskId/room — Reassign task to a different room ────────────
router.patch('/tasks/:taskId/room', async (req, res, next) => {
  try {
    const { roomId, reason } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'roomId is required.' });
    }

    const organizationId = req.headers['x-organization-id'] || req.body.organizationId || 'org_default';
    const result = await reassignTaskRoom(req.params.taskId, roomId, {
      reason,
      sessionId: req.sessionId,
      organizationId
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

// ─── POST /tasks/:taskId/reopen — Reopen a completed task ─────────────────────
router.post('/tasks/:taskId/reopen', async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    const accessToken = req.headers?.['x-google-token'] || req.headers?.['authorization']?.replace('Bearer ', '');
    const result = await reopenTask(req.params.taskId, {
      sessionId: req.sessionId,
      accessToken,
      reason
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

// ─── GET /room-routing/rules — List room routing rules ─────────────────────────
router.get('/room-routing/rules', (req, res) => {
  const organizationId = req.headers['x-organization-id'] || req.query.organizationId || 'org_default';
  const rules = listRoomRules({ organizationId });
  return res.status(200).json({
    requestId: req.requestId,
    success: true,
    rules
  });
});

// ─── POST /room-routing/rules — Create or update room routing rule ─────────────
router.post('/room-routing/rules', (req, res, next) => {
  try {
    const organizationId = req.headers['x-organization-id'] || req.body.organizationId || 'org_default';
    const rule = saveRoomRule(req.body, { organizationId });
    return res.status(201).json({
      requestId: req.requestId,
      success: true,
      rule
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /room-routing/feedback — Record correction feedback ─────────────────
router.post('/room-routing/feedback', (req, res, next) => {
  try {
    const organizationId = req.headers['x-organization-id'] || req.body.organizationId || 'org_default';
    const feedback = recordRoomCorrectionFeedback({
      ...req.body,
      sessionId: req.sessionId,
      organizationId
    });
    return res.status(201).json({
      requestId: req.requestId,
      success: true,
      feedback
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /room-routing/classify — Test / Preview Room Classification ─────────
router.post('/room-routing/classify', (req, res, next) => {
  try {
    const { text, intent, destination, fullTranscript } = req.body || {};
    if (!text) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'text is required.' });
    }

    const organizationId = req.headers['x-organization-id'] || req.body.organizationId || 'org_default';
    const classification = roomClassificationEngine.classifyTask({
      text,
      fullTranscript,
      intent,
      destination,
      sessionId: req.sessionId,
      organizationId
    });

    return res.status(200).json({
      requestId: req.requestId,
      success: true,
      classification
    });
  } catch (err) {
    next(err);
  }
});

export default router;

