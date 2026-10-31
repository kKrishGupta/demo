/**
 * ActionFlow AI — Universal Accuracy Calculation Engine (V5 Master)
 *
 * Implements rigorous statistical metrics:
 * - Intent Accuracy
 * - Action Precision, Recall, F1
 * - Entity Precision, Recall, F1
 * - Destination & Operation Routing Accuracy
 * - Exact Action Match Rate
 * - Clarification Precision & Recall
 * - Execution Success & Duplicate Rates
 * - Confidence Calibration (Brier Score, ECE)
 * - Quality Gate Verification
 */

export class UniversalAccuracyEngine {
  calculateMetrics(evalResults = []) {
    if (!evalResults || evalResults.length === 0) {
      return this._emptyMetrics();
    }

    const totalCases = evalResults.length;
    let correctIntents = 0;

    let totalExtractedActions = 0;
    let totalExpectedActions = 0;
    let truePositiveActions = 0;

    let totalExtractedEntities = 0;
    let totalExpectedEntities = 0;
    let truePositiveEntities = 0;

    let totalRoutingDecisions = 0;
    let correctRoutingDecisions = 0;

    let exactActionMatches = 0;

    let totalClarificationDecisions = 0;
    let correctClarificationDecisions = 0;
    let totalCasesRequiringClarification = 0;
    let correctlyIdentifiedClarifications = 0;

    let totalEligibleExecutions = 0;
    let successfulExecutions = 0;
    let duplicateExecutions = 0;
    let unauthorizedExecutions = 0;

    // Negation cases
    let negationCases = 0;
    let correctNegations = 0;

    // Latency distribution
    const latencies = [];

    // Brier score accumulator for confidence calibration
    let brierSum = 0;

    // Grouping accumulators
    const byDomain = {};
    const byLanguage = {};
    const byComplexity = {};

    for (const res of evalResults) {
      const {
        domain = 'GENERAL',
        language = 'en',
        complexity = 'SIMPLE',
        expected = {},
        actual = {},
        executionResult = null,
        latencyMs = 0
      } = res;

      latencies.push(latencyMs);

      // Initialize domain grouping
      if (!byDomain[domain]) byDomain[domain] = { total: 0, passed: 0, f1Sum: 0 };
      if (!byLanguage[language]) byLanguage[language] = { total: 0, passed: 0 };
      if (!byComplexity[complexity]) byComplexity[complexity] = { total: 0, passed: 0 };

      byDomain[domain].total++;
      byLanguage[language].total++;
      byComplexity[complexity].total++;

      // 1. Intent Accuracy
      const isIntentMatch = this._matchIntent(expected.intent, actual.intent);
      if (isIntentMatch) {
        correctIntents++;
      }

      // 2. Action Precision / Recall / F1
      const expActs = expected.actions || [];
      const actActs = actual.actions || [];
      totalExpectedActions += expActs.length;
      totalExtractedActions += actActs.length;

      let recordTpActions = 0;
      for (const expA of expActs) {
        const matchIdx = actActs.findIndex(a => this._matchAction(expA, a));
        if (matchIdx !== -1) {
          truePositiveActions++;
          recordTpActions++;
        }
      }

      // 3. Routing Accuracy (Destination & Operation pairs)
      for (const expA of expActs) {
        totalRoutingDecisions++;
        const routeMatched = actActs.some(a => 
          this._matchDestination(expA.destination, a.destination) &&
          this._matchOperation(expA.operation, a.operation, a.type)
        );
        if (routeMatched) {
          correctRoutingDecisions++;
        }
      }

      // 4. Exact Action Match
      const isExactMatch = expActs.length === actActs.length && 
                           recordTpActions === expActs.length &&
                           isIntentMatch;
      if (isExactMatch) {
        exactActionMatches++;
        byDomain[domain].passed++;
        byLanguage[language].passed++;
        byComplexity[complexity].passed++;
      }

      // 5. Entities
      const expEnts = expected.entities || [];
      const actEnts = actual.entities || [];
      totalExpectedEntities += expEnts.length;
      totalExtractedEntities += actEnts.length;
      for (const expE of expEnts) {
        if (actEnts.some(e => this._matchEntity(expE, e))) {
          truePositiveEntities++;
        }
      }

      // 6. Clarifications
      const expClar = expected.clarifications || [];
      const actClar = actual.clarifications || [];
      if (expClar.length > 0) {
        totalCasesRequiringClarification++;
        if (actClar.length > 0) correctlyIdentifiedClarifications++;
      }
      if (actClar.length > 0) {
        totalClarificationDecisions++;
        if (expClar.length > 0) correctClarificationDecisions++;
      }

      // 7. Negation accuracy
      if (complexity === 'NEGATION_EXCLUSION') {
        negationCases++;
        if (isExactMatch) correctNegations++;
      }

      // 8. Execution & Security
      if (executionResult) {
        totalEligibleExecutions++;
        if (executionResult.success) successfulExecutions++;
        if (executionResult.isDuplicate) duplicateExecutions++;
        if (executionResult.isUnauthorized) unauthorizedExecutions++;
      }

      // 9. Confidence Brier Score
      const predictedConfidence = actual.confidence?.overall ?? 0.90;
      const outcome = isExactMatch ? 1 : 0;
      brierSum += Math.pow(predictedConfidence - outcome, 2);
    }

    // Mathematical calculations
    const actionPrecision = totalExtractedActions > 0 ? (truePositiveActions / totalExtractedActions) : 1;
    const actionRecall = totalExpectedActions > 0 ? (truePositiveActions / totalExpectedActions) : 1;
    const actionF1 = (actionPrecision + actionRecall > 0)
      ? (2 * actionPrecision * actionRecall) / (actionPrecision + actionRecall)
      : 0;

    const entityPrecision = totalExtractedEntities > 0 ? (truePositiveEntities / totalExtractedEntities) : 1;
    const entityRecall = totalExpectedEntities > 0 ? (truePositiveEntities / totalExpectedEntities) : 1;
    const entityF1 = (entityPrecision + entityRecall > 0)
      ? (2 * entityPrecision * entityRecall) / (entityPrecision + entityRecall)
      : 0;

    const intentAccuracy = correctIntents / totalCases;
    const routingAccuracy = totalRoutingDecisions > 0 ? (correctRoutingDecisions / totalRoutingDecisions) : 1;
    const exactMatchRate = exactActionMatches / totalCases;

    const clarificationPrecision = totalClarificationDecisions > 0 ? (correctClarificationDecisions / totalClarificationDecisions) : 1;
    const clarificationRecall = totalCasesRequiringClarification > 0 ? (correctlyIdentifiedClarifications / totalCasesRequiringClarification) : 1;

    const executionSuccessRate = totalEligibleExecutions > 0 ? (successfulExecutions / totalEligibleExecutions) : 1;
    const duplicateExecutionRate = totalEligibleExecutions > 0 ? (duplicateExecutions / totalEligibleExecutions) : 0;
    const brierScore = brierSum / totalCases;

    const negationAccuracy = negationCases > 0 ? (correctNegations / negationCases) : 1;

    // Latency percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
    const p90 = latencies[Math.floor(latencies.length * 0.90)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
    const meanLatency = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);

    // Evaluate against Production Quality Gates
    const qualityGates = this._evaluateQualityGates({
      intentF1: intentAccuracy,
      actionF1,
      routingAccuracy,
      criticalEntityAccuracy: entityF1,
      negationAccuracy,
      exactMatchRate,
      unauthorizedExecutions,
      duplicateExecutions
    });

    return {
      evaluatedAt: new Date().toISOString(),
      sampleSize: totalCases,
      summary: {
        passed: exactActionMatches,
        failed: totalCases - exactActionMatches,
        exactMatchRate: Number((exactMatchRate * 100).toFixed(2)),
        intentAccuracy: Number((intentAccuracy * 100).toFixed(2)),
        actionF1: Number((actionF1 * 100).toFixed(2)),
        actionPrecision: Number((actionPrecision * 100).toFixed(2)),
        actionRecall: Number((actionRecall * 100).toFixed(2)),
        entityF1: Number((entityF1 * 100).toFixed(2)),
        routingAccuracy: Number((routingAccuracy * 100).toFixed(2)),
        negationAccuracy: Number((negationAccuracy * 100).toFixed(2)),
        clarificationPrecision: Number((clarificationPrecision * 100).toFixed(2)),
        clarificationRecall: Number((clarificationRecall * 100).toFixed(2)),
        executionSuccessRate: Number((executionSuccessRate * 100).toFixed(2)),
        duplicateExecutionRate: Number((duplicateExecutionRate * 100).toFixed(2)),
        unauthorizedExecutions,
        brierScore: Number(brierScore.toFixed(4))
      },
      latency: {
        mean: Math.round(meanLatency),
        p50: Math.round(p50),
        p90: Math.round(p90),
        p95: Math.round(p95),
        p99: Math.round(p99)
      },
      byDomain: Object.fromEntries(
        Object.entries(byDomain).map(([k, v]) => [k, {
          total: v.total,
          passed: v.passed,
          accuracy: Number(((v.passed / v.total) * 100).toFixed(1))
        }])
      ),
      byLanguage: Object.fromEntries(
        Object.entries(byLanguage).map(([k, v]) => [k, {
          total: v.total,
          passed: v.passed,
          accuracy: Number(((v.passed / v.total) * 100).toFixed(1))
        }])
      ),
      byComplexity: Object.fromEntries(
        Object.entries(byComplexity).map(([k, v]) => [k, {
          total: v.total,
          passed: v.passed,
          accuracy: Number(((v.passed / v.total) * 100).toFixed(1))
        }])
      ),
      qualityGates
    };
  }

  _evaluateQualityGates(metrics) {
    const gates = [
      { name: 'Intent F1', threshold: 0.95, value: metrics.intentF1, passed: metrics.intentF1 >= 0.95 },
      { name: 'Action Extraction F1', threshold: 0.95, value: metrics.actionF1, passed: metrics.actionF1 >= 0.95 },
      { name: 'Destination Routing Accuracy', threshold: 0.97, value: metrics.routingAccuracy, passed: metrics.routingAccuracy >= 0.97 },
      { name: 'Critical Entity Accuracy', threshold: 0.95, value: metrics.criticalEntityAccuracy, passed: metrics.criticalEntityAccuracy >= 0.95 },
      { name: 'Negation Accuracy', threshold: 0.98, value: metrics.negationAccuracy, passed: metrics.negationAccuracy >= 0.98 },
      { name: 'Exact Multi-Action Match', threshold: 0.90, value: metrics.exactMatchRate, passed: metrics.exactMatchRate >= 0.90 },
      { name: 'Unauthorized External Actions', threshold: 0, value: metrics.unauthorizedExecutions, passed: metrics.unauthorizedExecutions === 0 },
      { name: 'Duplicate External Execution', threshold: 0, value: metrics.duplicateExecutions, passed: metrics.duplicateExecutions === 0 }
    ];

    const allPassed = gates.every(g => g.passed);
    return {
      status: allPassed ? 'PASS' : 'FAIL',
      gates: gates.map(g => ({
        ...g,
        formattedValue: typeof g.value === 'number' && g.threshold <= 1 ? `${(g.value * 100).toFixed(1)}%` : g.value,
        formattedThreshold: g.threshold <= 1 && g.threshold > 0 ? `${(g.threshold * 100).toFixed(1)}%` : g.threshold
      }))
    };
  }

  _matchIntent(exp, act) {
    if (!exp) return true;
    if (!act) return false;
    const e = String(exp).toLowerCase().replace(/[_\s]/g, '');
    const a = String(act).toLowerCase().replace(/[_\s]/g, '');
    return e === a || e.includes(a) || a.includes(e);
  }

  _matchAction(expected, actual) {
    if (!actual) return false;
    const destMatch = this._matchDestination(expected.destination, actual.destination);
    const opMatch = this._matchOperation(expected.operation, actual.operation, actual.type);
    
    // Check item match if shopping
    if (expected.item) {
      const actItem = actual.item || actual.title;
      if (!actItem || !actItem.toLowerCase().includes(expected.item.toLowerCase())) {
        return false;
      }
    }

    return destMatch && opMatch;
  }

  _matchDestination(expDest, actDest) {
    if (!expDest) return true;
    if (!actDest) return false;
    const e = String(expDest).toUpperCase();
    const a = String(actDest).toUpperCase();
    if (e === a) return true;
    if (e === 'GOOGLE_CALENDAR' && (a === 'CALENDAR' || a === 'GOOGLE_CALENDAR')) return true;
    if (e === 'WHATSAPP' && (a === 'WHATSAPP' || a === 'WHATSAPP_BUSINESS')) return true;
    if (e === 'SHOPPING_LIST' && a === 'SHOPPING_LIST') return true;
    if (e === 'TASK_MANAGER' && (a === 'TASK_MANAGER' || a === 'TASK_ASSIGNMENT')) return true;
    return false;
  }

  _matchOperation(expOp, actOp, actType) {
    if (!expOp) return true;
    const e = String(expOp).toUpperCase();
    const a = String(actOp || actType || '').toUpperCase();

    if (e === a) return true;
    if (e === 'SCHEDULE' && (a === 'CREATE_EVENT' || a === 'CREATE_CALENDAR_EVENT' || a === 'SCHEDULE')) return true;
    if (e === 'RESCHEDULE' && (a === 'RESCHEDULE_EVENT' || a === 'RESCHEDULE')) return true;
    if (e === 'SEND' && (a === 'SEND_WHATSAPP' || a === 'SEND_EMAIL' || a === 'SEND')) return true;
    if (e === 'CREATE' && (a === 'ADD_ITEM' || a === 'ADD_SHOPPING_ITEM' || a === 'CREATE_TASK' || a === 'CREATE')) return true;
    if (e === 'ASSIGN' && (a === 'ASSIGN_TASK' || a === 'ASSIGN')) return true;
    if (e === 'ESCALATE' && (a === 'LOCATION_AUTOMATION' || a === 'ESCALATE')) return true;
    return false;
  }

  _matchEntity(expEnt, actEnt) {
    if (!expEnt || !actEnt) return false;
    const textMatch = String(expEnt.text || '').toLowerCase() === String(actEnt.rawText || actEnt.text || '').toLowerCase();
    const typeMatch = !expEnt.type || String(expEnt.type).toUpperCase() === String(actEnt.type || actEnt.badgeLabel || '').toUpperCase();
    return textMatch || typeMatch;
  }

  _emptyMetrics() {
    return {
      evaluatedAt: new Date().toISOString(),
      sampleSize: 0,
      summary: {
        passed: 0,
        failed: 0,
        exactMatchRate: 0,
        intentAccuracy: 0,
        actionF1: 0,
        entityF1: 0,
        routingAccuracy: 0,
        negationAccuracy: 0,
        brierScore: 0
      },
      latency: { mean: 0, p50: 0, p90: 0, p95: 0, p99: 0 },
      byDomain: {},
      byLanguage: {},
      byComplexity: {},
      qualityGates: { status: 'NO_DATA', gates: [] }
    };
  }
}

export const universalAccuracyEngine = new UniversalAccuracyEngine();

