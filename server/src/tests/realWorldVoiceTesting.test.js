import { describe, it, expect } from 'vitest';
import { RealWorldTestingEngine, realWorldTestingEngine } from '../services/realWorldTestingEngine.js';

describe('ACTIONFLOW AI — REAL-WORLD VOICE COMMAND TESTING ENGINE (300 CASES)', () => {

  it('1. Dataset loads at least 300 test cases across all 10 categories (A through J)', () => {
    const dataset = realWorldTestingEngine.getDataset();
    expect(dataset.length).toBeGreaterThanOrEqual(300);

    const categories = [...new Set(dataset.map(t => t.category))];
    expect(categories).toHaveLength(10);
    expect(categories).toContain('A_CALENDAR');
    expect(categories).toContain('B_WHATSAPP');
    expect(categories).toContain('C_TASKS');
    expect(categories).toContain('D_SHOPPING');
    expect(categories).toContain('E_MULTI_ACTION');
    expect(categories).toContain('F_MEETINGS');
    expect(categories).toContain('G_LOCATION');
    expect(categories).toContain('H_CONTEXT');
    expect(categories).toContain('I_AMBIGUITY');
    expect(categories).toContain('J_NEGATION');
  });

  it('2. Category E: Benchmark Screenshot multi-action decomposes into exactly 4 actions', async () => {
    const report = await realWorldTestingEngine.runSuite({
      category: 'E_MULTI_ACTION',
      limit: 1
    });

    expect(report.totalEvaluated).toBe(1);
    const testResult = report.results[0];
    expect(testResult.expectedCount).toBe(4);
    expect(testResult.actualCount).toBe(4);
    expect(testResult.verdict).toBe('PASS');

    // Action 1: Calendar
    expect(testResult.actions[0].destination).toBe('GOOGLE_CALENDAR');
    expect(testResult.actions[0].type).toBe('CREATE_EVENT');

    // Action 2: WhatsApp
    expect(testResult.actions[1].destination).toBe('WHATSAPP');
    expect(testResult.actions[1].recipientName).toContain('Aman');
    expect(testResult.actions[1].whatsappMessage).toContain('production report');

    // Action 3 & 4: Bread & Milk
    expect(testResult.actions[2].item).toBe('Bread');
    expect(testResult.actions[3].item).toBe('Milk');
  });

  it('3. Category B: WhatsApp commands extract direct phone and contextual message', async () => {
    const report = await realWorldTestingEngine.runSuite({
      category: 'B_WHATSAPP',
      limit: 10
    });

    expect(report.totalEvaluated).toBe(10);
    expect(report.metrics.exactMatchAccuracy).toBeGreaterThanOrEqual(50);
    expect(report.metrics.intentAccuracy).toBe(100);
  });

  it('4. Category J: Negation, Corrections & Adversarial commands exclude negated targets', async () => {
    const report = await realWorldTestingEngine.runSuite({
      category: 'J_NEGATION',
      limit: 10
    });

    expect(report.totalEvaluated).toBe(10);
    expect(report.metrics.negationAccuracy).toBeGreaterThanOrEqual(95);
  });

  it('5. Safe Execution Modes: DRY RUN evaluates without mutating, LIVE TEST verifies gateway', async () => {
    // DRY RUN
    const dryReport = await realWorldTestingEngine.runSuite({
      category: 'A_CALENDAR',
      mode: 'DRY_RUN',
      limit: 5
    });
    expect(dryReport.mode).toBe('DRY_RUN');
    expect(dryReport.metrics.averageLatencyMs).toBeLessThanOrEqual(50);

    // LIVE TEST
    const liveReport = await realWorldTestingEngine.runSuite({
      category: 'A_CALENDAR',
      mode: 'LIVE_TEST',
      limit: 2
    });
    expect(liveReport.mode).toBe('LIVE_TEST');
    expect(liveReport.metrics.providerExecutionSuccessRate).toBeGreaterThanOrEqual(90);
  });

  it('6. Full 300-test suite execution finishes with real calculated metrics', async () => {
    const fullReport = await realWorldTestingEngine.runSuite({
      limit: 300,
      mode: 'DRY_RUN'
    });

    expect(fullReport.totalEvaluated).toBe(300);
    expect(fullReport.metrics.exactMatchAccuracy).toBeGreaterThanOrEqual(85);
    expect(fullReport.metrics.intentAccuracy).toBeGreaterThanOrEqual(95);
    expect(fullReport.metrics.destinationRoutingAccuracy).toBeGreaterThanOrEqual(85);
    expect(fullReport.metrics.averageLatencyMs).toBeLessThan(100);
  });
});
