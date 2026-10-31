import { describe, it, expect } from 'vitest';
import {
  UNIVERSAL_OPERATIONS,
  EXECUTION_RISK_LEVELS,
  createUniversalAction,
  taxonomyRegistry
} from '../services/universalActionTaxonomy.js';
import { ConnectorRegistry, connectorRegistry } from '../services/connectorRegistry.js';
import { UniversalAccuracyEngine, universalAccuracyEngine } from '../services/universalAccuracyEngine.js';
import { UniversalEvaluationRunner, universalEvaluationRunner } from '../services/universalEvaluationRunner.js';
import { FeedbackPipeline, feedbackPipeline } from '../services/feedbackPipeline.js';

describe('ACTIONFLOW AI — UNIVERSAL PRODUCTION INTELLIGENCE BENCHMARK V5', () => {

  // ── TEST 1: Universal Action Taxonomy & Schema ──────────────────────────────
  it('1. Universal Action Taxonomy creates valid schema with risk levels & canonical properties', () => {
    const act = createUniversalAction({
      intent: 'schedule_client_meeting',
      operation: UNIVERSAL_OPERATIONS.SCHEDULE,
      target: 'Client Strategy Review',
      destination: 'GOOGLE_CALENDAR',
      parameters: { time: '10:00', durationMinutes: 60 }
    });

    expect(act.actionId).toMatch(/^act_/);
    expect(act.operation).toBe('SCHEDULE');
    expect(act.destination).toBe('GOOGLE_CALENDAR');
    expect(act.approval.required).toBe(true);
    expect(act.confidence.overall).toBeGreaterThanOrEqual(0.9);
    expect(act.execution.status).toBe('DRAFT');
  });

  it('1b. Dynamic taxonomy registry supports custom domain operations', () => {
    const op = taxonomyRegistry.registerCustomOperation('DISPATCH_DRONE_SURVEY', {
      description: 'Autonomous aerial survey',
      riskLevel: EXECUTION_RISK_LEVELS.CRITICAL
    });

    expect(op).toBe('DISPATCH_DRONE_SURVEY');
    expect(taxonomyRegistry.isOperationSupported('DISPATCH_DRONE_SURVEY')).toBe(true);
    const meta = taxonomyRegistry.getOperationMeta('DISPATCH_DRONE_SURVEY');
    expect(meta.riskLevel).toBe('CRITICAL');
  });

  // ── TEST 2: Connector Registry & Extensibility ───────────────────────────────
  it('2. Connector Registry validates operations, rate limits, and idempotency contracts', () => {
    const registry = new ConnectorRegistry();

    // Register custom enterprise connector
    registry.registerConnector({
      connectorId: 'CUSTOM_ERP',
      name: 'Custom ERP Hub',
      supportedOperations: ['CREATE', 'UPDATE', 'APPROVE'],
      idempotencySupport: true,
      isMock: true
    });

    const conn = registry.getConnector('CUSTOM_ERP');
    expect(conn).toBeDefined();
    expect(conn.supportedOperations.has('APPROVE')).toBe(true);

    // Validation passes for supported operation
    const validCheck = registry.validateActionForConnector({
      destination: 'CUSTOM_ERP',
      operation: 'APPROVE'
    });
    expect(validCheck.isValid).toBe(true);

    // Validation fails for unsupported operation
    const invalidCheck = registry.validateActionForConnector({
      destination: 'CUSTOM_ERP',
      operation: 'DELETE'
    });
    expect(invalidCheck.isValid).toBe(false);
    expect(invalidCheck.failingStage).toBe('OPERATION_CLASSIFICATION');
  });

  // ── TEST 3: 2,000-Record Universal Benchmark Dataset Coverage ────────────────
  it('3. Universal benchmark dataset covers 2,000 test cases across 20 distinct domains', () => {
    const stats = universalEvaluationRunner.getDatasetStats();

    expect(stats.totalRecords).toBe(2000);
    expect(stats.domains.length).toBe(20);
    expect(stats.domains).toContain('HEALTHCARE');
    expect(stats.domains).toContain('FINANCE_ACCOUNTING');
    expect(stats.domains).toContain('INDUSTRIAL_MINING');
    expect(stats.domains).toContain('LOGISTICS_SUPPLY_CHAIN');
    expect(stats.languages).toContain('en');
    expect(stats.languages).toContain('hinglish');
  });

  // ── TEST 4: Mathematical Accuracy Calculation & Quality Gates ────────────────
  it('4. Universal Accuracy Engine calculates exact mathematical precision, recall, F1, and Brier score', () => {
    const engine = new UniversalAccuracyEngine();

    const mockEvalResults = [
      {
        domain: 'SALES_CRM',
        language: 'en',
        complexity: 'SIMPLE',
        expected: {
          intent: 'assign_task',
          actions: [{ operation: 'ASSIGN', destination: 'SALESFORCE_CRM' }],
          entities: [{ text: 'Rahul', type: 'PERSON' }]
        },
        actual: {
          intent: 'assign_task',
          actions: [{ operation: 'ASSIGN', destination: 'SALESFORCE_CRM', type: 'ASSIGN_TASK' }],
          entities: [{ text: 'Rahul', type: 'PERSON' }],
          confidence: { overall: 0.96 }
        },
        executionResult: { success: true, isDuplicate: false, isUnauthorized: false },
        latencyMs: 4
      },
      {
        domain: 'FINANCE_ACCOUNTING',
        language: 'hinglish',
        complexity: 'NEGATION_EXCLUSION',
        expected: {
          intent: 'add_shopping_items',
          actions: [{ operation: 'CREATE', destination: 'SHOPPING_LIST', item: 'Bread' }]
        },
        actual: {
          intent: 'add_shopping_items',
          actions: [{ operation: 'CREATE', destination: 'SHOPPING_LIST', item: 'Bread', type: 'ADD_ITEM' }],
          confidence: { overall: 0.95 }
        },
        executionResult: { success: true, isDuplicate: false, isUnauthorized: false },
        latencyMs: 3
      }
    ];

    const metrics = engine.calculateMetrics(mockEvalResults);

    expect(metrics.sampleSize).toBe(2);
    expect(metrics.summary.exactMatchRate).toBe(100);
    expect(metrics.summary.actionPrecision).toBe(100);
    expect(metrics.summary.actionRecall).toBe(100);
    expect(metrics.summary.actionF1).toBe(100);
    expect(metrics.summary.routingAccuracy).toBe(100);
    expect(metrics.summary.negationAccuracy).toBe(100);
    expect(metrics.summary.unauthorizedExecutions).toBe(0);
    expect(metrics.summary.brierScore).toBeLessThan(0.1);
    expect(metrics.qualityGates.status).toBe('PASS');
  });

  it('4b. Quality Gates strictly fail if unauthorized external actions occur', () => {
    const engine = new UniversalAccuracyEngine();

    const mockResultsWithBreach = [
      {
        expected: { actions: [] },
        actual: { actions: [] },
        executionResult: { success: false, isUnauthorized: true },
        latencyMs: 5
      }
    ];

    const metrics = engine.calculateMetrics(mockResultsWithBreach);
    expect(metrics.qualityGates.status).toBe('FAIL');
    const unauthorizedGate = metrics.qualityGates.gates.find(g => g.name === 'Unauthorized External Actions');
    expect(unauthorizedGate.passed).toBe(false);
  });

  // ── TEST 5: Continuous Learning & Feedback Pipeline ──────────────────────────
  it('5. Continuous Feedback Pipeline records corrections, redacts PII, and synthesizes regression cases', async () => {
    const pipeline = new FeedbackPipeline();

    const correction = await pipeline.recordCorrection({
      originalInput: 'Credit card 4111-2222-3333-4444 par charge karo and assign Rahul',
      extractedAction: { id: 'act_01', type: 'ASSIGN_TASK', assignee: 'Rahul' },
      correctedAction: { id: 'act_01', type: 'TRANSFER_FUNDS', target: 'Payment Gateway' },
      failingStage: 'INTENT_UNDERSTANDING',
      sessionId: 'sess_user_qa'
    });

    expect(correction.feedbackId).toMatch(/^fb_/);
    expect(correction.reviewStatus).toBe('PENDING_REVIEW');
    // PII Redaction verification
    expect(correction.originalInput).not.toContain('4111-2222-3333-4444');
    expect(correction.originalInput).toContain('[REDACTED_CC]');

    // Approve into regression test
    const regCase = pipeline.approveForRegression(correction.feedbackId, 'Lead Architect');
    expect(regCase).toBeDefined();
    expect(regCase.testId).toMatch(/^reg_fb_/);
    expect(pipeline.getRegressionCandidates().length).toBe(1);
  });

  // ── TEST 6: Fast Benchmark Execution Run ─────────────────────────────────────
  it('6. Evaluation Runner executes 50 benchmark cases with real latency percentiles', async () => {
    const runner = new UniversalEvaluationRunner();
    const res = await runner.runBenchmark({ limit: 50 });

    expect(res.totalEvaluated).toBe(50);
    expect(res.durationMs).toBeGreaterThan(0);
    expect(res.throughputRps).toBeGreaterThan(0);
    expect(res.metrics.latency.p50).toBeGreaterThanOrEqual(0);
    expect(res.metrics.latency.p95).toBeGreaterThanOrEqual(0);
    expect(res.metrics.summary.actionF1).toBeGreaterThanOrEqual(80);
  });
});
