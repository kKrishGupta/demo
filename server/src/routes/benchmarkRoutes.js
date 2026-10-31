/**
 * ActionFlow AI — Universal Benchmark & Evaluation API Routes (V5 Master)
 */

import { Router } from 'express';
import { universalEvaluationRunner } from '../services/universalEvaluationRunner.js';
import { connectorRegistry } from '../services/connectorRegistry.js';
import { feedbackPipeline } from '../services/feedbackPipeline.js';

const router = Router();

// GET /api/v1/benchmark/stats
router.get('/stats', (req, res) => {
  const stats = universalEvaluationRunner.getDatasetStats();
  res.json({ status: 'ok', ...stats });
});

// POST /api/v1/benchmark/run
router.post('/run', async (req, res) => {
  const { limit = 200, domain, language, complexity } = req.body || {};
  try {
    const result = await universalEvaluationRunner.runBenchmark({
      limit: Math.min(Number(limit) || 200, 2000),
      domain,
      language,
      complexity
    });
    res.json({ status: 'ok', ...result });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /api/v1/benchmark/connectors
router.get('/connectors', (req, res) => {
  const connectors = connectorRegistry.listConnectors();
  res.json({ status: 'ok', total: connectors.length, connectors });
});

// POST /api/v1/benchmark/feedback
router.post('/feedback', async (req, res) => {
  try {
    const entry = await feedbackPipeline.recordCorrection({
      ...req.body,
      sessionId: req.sessionId || 'session_benchmark_lab'
    });
    res.json({ status: 'ok', entry });
  } catch (err) {
    res.status(400).json({ status: 'error', error: err.message });
  }
});

// GET /api/v1/benchmark/feedback
router.get('/feedback', (req, res) => {
  const queue = feedbackPipeline.getReviewQueue(req.query.status || 'ALL');
  res.json({ status: 'ok', count: queue.length, queue });
});

// POST /api/v1/benchmark/feedback/:id/approve
router.post('/feedback/:id/approve', (req, res) => {
  const regressionCase = feedbackPipeline.approveForRegression(
    req.params.id,
    req.body.reviewerName || 'QA Lead'
  );
  if (!regressionCase) {
    return res.status(404).json({ status: 'error', message: 'Feedback entry not found' });
  }
  res.json({ status: 'ok', regressionCase });
});

export default router;

