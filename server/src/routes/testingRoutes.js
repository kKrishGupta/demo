/**
 * ActionFlow AI — Real-World Testing Lab API Routes (V5 Master)
 */

import { Router } from 'express';
import { realWorldTestingEngine } from '../services/realWorldTestingEngine.js';

const router = Router();

// GET /api/v1/testing/dataset
router.get('/dataset', (req, res) => {
  const tests = realWorldTestingEngine.getDataset();
  res.json({
    status: 'ok',
    total: tests.length,
    tests
  });
});

// POST /api/v1/testing/run
router.post('/run', async (req, res) => {
  const { category, mode = 'DRY_RUN', inputMode = 'ALL', limit = 300 } = req.body || {};
  try {
    const report = await realWorldTestingEngine.runSuite({
      category,
      mode,
      inputMode,
      limit: Math.min(Number(limit) || 300, 300)
    });
    res.json({ status: 'ok', ...report });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// POST /api/v1/testing/benchmark-screenshot
router.post('/benchmark-screenshot', async (req, res) => {
  const screenshotTest = {
    id: 'RW_SCREENSHOT_BUG',
    category: 'E_MULTI_ACTION',
    utterance: 'Kal Rahul ke saath 10 baje meeting fix kar do, Aman ko WhatsApp kar dena ki production report bhej de, aur bread aur milk laana hai.',
    expected: {
      actionCount: 4,
      actions: [
        { type: 'CREATE_EVENT', destination: 'GOOGLE_CALENDAR', attendee: 'Rahul Sharma' },
        { type: 'SEND_WHATSAPP', destination: 'WHATSAPP', recipient: 'Aman Verma' },
        { type: 'ADD_ITEM', destination: 'SHOPPING_LIST', item: 'Bread' },
        { type: 'ADD_ITEM', destination: 'SHOPPING_LIST', item: 'Milk' }
      ]
    }
  };

  try {
    const report = await realWorldTestingEngine.runSuite({
      limit: 1,
      mode: 'DRY_RUN'
    });
    res.json({ status: 'ok', benchmarkCase: screenshotTest, report });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

export default router;

