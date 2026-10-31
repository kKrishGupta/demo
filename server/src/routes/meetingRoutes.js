/**
 * ActionFlow Server — Meeting Intelligence API Routes (Phase 3)
 *
 * POST /api/meetings/start       — Initialize meeting session
 * POST /api/meetings/chunk       — Stream audio/transcript chunk
 * POST /api/meetings/:id/end     — Finalize meeting and generate summary + actions
 * GET  /api/meetings/:id         — Retrieve meeting details
 * GET  /api/meetings             — List recent meetings for session
 */

import { Router } from 'express';
import { meetingService } from '../services/meetingService.js';

const router = Router();

// ─── POST /meetings/start ─────────────────────────────────────────────────────
router.post('/meetings/start', (req, res) => {
  const { title, participants = [], agenda = [] } = req.body;
  const meeting = meetingService.startMeeting({
    title: title || 'Strategic Team Sync',
    sessionId: req.sessionId,
    participants,
    agenda
  });

  return res.status(201).json({
    requestId: req.requestId,
    success: true,
    meeting
  });
});

// ─── POST /meetings/chunk ─────────────────────────────────────────────────────
router.post('/meetings/chunk', async (req, res, next) => {
  const {
    meetingId,
    chunkIndex = 0,
    audio,
    mimeType = 'audio/webm',
    transcript = '',
    speaker = null,
    timestampStart = 0,
    timestampEnd = 0
  } = req.body;

  if (!meetingId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'meetingId is required.' });
  }

  try {
    const result = await meetingService.processMeetingChunk({
      meetingId,
      chunkIndex: parseInt(chunkIndex, 10),
      audio,
      mimeType,
      transcript,
      speaker,
      timestampStart,
      timestampEnd,
      sessionId: req.sessionId
    });

    return res.status(200).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /meetings/:id/end ───────────────────────────────────────────────────
router.post('/meetings/:id/end', async (req, res, next) => {
  const { id } = req.params;

  try {
    const meeting = await meetingService.endMeeting({
      meetingId: id,
      sessionId: req.sessionId
    });

    return res.status(200).json({
      requestId: req.requestId,
      success: true,
      meeting
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /meetings/:id ────────────────────────────────────────────────────────
router.get('/meetings/:id', (req, res) => {
  const meeting = meetingService.getMeeting(req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: 'NOT_FOUND', message: `Meeting ${req.params.id} not found.` });
  }
  return res.status(200).json({
    requestId: req.requestId,
    success: true,
    meeting
  });
});

// ─── GET /meetings ────────────────────────────────────────────────────────────
router.get('/meetings', (req, res) => {
  const meetings = meetingService.listMeetings(req.sessionId);
  return res.status(200).json({
    requestId: req.requestId,
    count: meetings.length,
    meetings
  });
});

export default router;

