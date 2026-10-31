/**
 * ActionFlow Server — Audit Routes
 * GET /api/v1/audit           — Recent audit entries
 * GET /api/v1/audit/:actionId — Entries for a specific action
 */

import { Router } from 'express';
import { getAuditEntries } from '../services/auditService.js';

const router = Router();

router.get('/', (req, res) => {
  const { limit = 50, event } = req.query;
  const entries = getAuditEntries({
    sessionId: req.sessionId,
    event: event || undefined,
    limit: Math.min(parseInt(limit, 10) || 50, 200)
  });
  return res.status(200).json({
    requestId: req.requestId,
    count: entries.length,
    entries
  });
});

router.get('/:actionId', (req, res) => {
  const entries = getAuditEntries({
    actionId: req.params.actionId,
    limit: 50
  });
  return res.status(200).json({
    requestId: req.requestId,
    actionId: req.params.actionId,
    count: entries.length,
    entries
  });
});

export default router;
