/**
 * ActionFlow Server — Conversational Context API Routes (Phase 3)
 *
 * POST   /api/context/resolve     — Resolve pronouns & references in transcript
 * POST   /api/context/correction  — Record & apply conversational corrections
 * POST   /api/context/ambiguity   — Check contact ambiguity against directory
 * GET    /api/context             — Retrieve active session context
 * DELETE /api/context             — Clear active session context
 */

import { Router } from 'express';
import { contextService } from '../services/contextService.js';

const router = Router();

// ─── POST /context/resolve ────────────────────────────────────────────────────
router.post('/context/resolve', async (req, res, next) => {
  const { transcript } = req.body;
  if (!transcript) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'transcript is required.' });
  }

  try {
    const result = await contextService.resolveReferences(req.sessionId, transcript);
    return res.status(200).json({
      requestId: req.requestId,
      original: transcript,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /context/correction ─────────────────────────────────────────────────
router.post('/context/correction', async (req, res, next) => {
  const { transcript, directory = [] } = req.body;
  if (!transcript) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'transcript is required.' });
  }

  try {
    const result = await contextService.handleConversationalCorrection(req.sessionId, transcript, directory);
    return res.status(200).json({
      requestId: req.requestId,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /context/ambiguity ──────────────────────────────────────────────────
router.post('/context/ambiguity', (req, res) => {
  const { name, directory = [] } = req.body;
  const result = contextService.resolveAmbiguousContact(name, directory);
  return res.status(200).json({
    requestId: req.requestId,
    ...result
  });
});

// ─── GET /context ─────────────────────────────────────────────────────────────
router.get('/context', async (req, res, next) => {
  try {
    const lastAction = await contextService.getLastAction(req.sessionId);
    const lastPerson = await contextService.getLastPerson(req.sessionId);
    const recentPeople = await contextService.getRecentPeople(req.sessionId);
    const activeProject = await contextService.getActiveProject(req.sessionId);
    const corrections = await contextService.getCorrections(req.sessionId);

    return res.status(200).json({
      requestId: req.requestId,
      sessionId: req.sessionId,
      context: {
        lastAction,
        lastPerson,
        recentPeople,
        activeProject,
        correctionsCount: corrections.length
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /context ──────────────────────────────────────────────────────────
router.delete('/context', async (req, res, next) => {
  try {
    await contextService.clearSession(req.sessionId);
    return res.status(200).json({
      requestId: req.requestId,
      message: 'Session context cleared.'
    });
  } catch (err) {
    next(err);
  }
});

export default router;

