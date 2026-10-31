/**
 * ActionFlow AI — Continuous Learning & Feedback Pipeline (V5 Master)
 *
 * Implements:
 * - Structured user correction recording
 * - Failing pipeline stage attribution (Transcribe, Intent, Decomposition, Entity, Routing, Execution)
 * - PII & sensitive data redaction
 * - Human-in-the-loop review queue
 * - Automated regression test case synthesizer
 */

import { auditLog } from './auditService.js';

export class FeedbackPipeline {
  constructor() {
    this._correctionQueue = [];
    this._regressionCandidates = [];
  }

  /**
   * Records a user correction on an action or field
   */
  async recordCorrection(params) {
    const {
      originalInput,
      extractedAction,
      correctedAction,
      failingStage = 'DECOMPOSITION',
      userNote = '',
      sessionId = 'anon'
    } = params;

    const sanitizedInput = this._redactPII(originalInput);
    const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const entry = {
      feedbackId,
      timestamp: new Date().toISOString(),
      originalInput: sanitizedInput,
      extractedAction,
      correctedAction,
      failingStage,
      userNote,
      reviewStatus: 'PENDING_REVIEW', // PENDING_REVIEW, APPROVED_FOR_DATASET, REJECTED
      reviewedBy: null,
      reviewedAt: null
    };

    this._correctionQueue.unshift(entry);
    if (this._correctionQueue.length > 500) {
      this._correctionQueue.pop();
    }

    await auditLog({
      event: 'USER_CORRECTION_SUBMITTED',
      actionId: extractedAction?.id || feedbackId,
      sessionId,
      details: {
        feedbackId,
        failingStage,
        inputSnippet: sanitizedInput.slice(0, 50)
      }
    });

    return entry;
  }

  /**
   * Approves a user correction into a gold-standard regression test
   */
  approveForRegression(feedbackId, reviewerName = 'QA Reviewer') {
    const item = this._correctionQueue.find(f => f.feedbackId === feedbackId);
    if (!item) return null;

    item.reviewStatus = 'APPROVED_FOR_DATASET';
    item.reviewedBy = reviewerName;
    item.reviewedAt = new Date().toISOString();

    const regressionCase = {
      testId: `reg_fb_${feedbackId}`,
      input: { text: item.originalInput, mode: 'VOICE_TRANSCRIBED' },
      expected: {
        actions: [item.correctedAction]
      },
      evaluation: {
        expectedActionCount: 1,
        source: 'USER_FEEDBACK'
      }
    };

    this._regressionCandidates.push(regressionCase);
    return regressionCase;
  }

  getReviewQueue(status = 'ALL') {
    if (status === 'ALL') return this._correctionQueue;
    return this._correctionQueue.filter(f => f.reviewStatus === status);
  }

  getRegressionCandidates() {
    return this._regressionCandidates;
  }

  _redactPII(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      // Redact credit cards
      .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_CC]')
      // Redact sensitive government IDs/SSNs
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]')
      // Redact passwords / auth tokens
      .replace(/(?:password|secret|token)\s*[:=]\s*\S+/gi, '$1: [REDACTED_CREDENTIAL]');
  }
}

export const feedbackPipeline = new FeedbackPipeline();

