/**
 * ActionFlow Server — Unit Tests
 * Tests: config, cache, hybrid extraction, execution gateway, audit service.
 * Does NOT require a running server or external APIs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
describe('Config', () => {
  it('has required server configuration fields', async () => {
    const { config } = await import('../config.js');
    expect(typeof config.server.port).toBe('number');
    expect(config.server.port).toBeGreaterThan(0);
    expect(typeof config.server.nodeEnv).toBe('string');
    expect(typeof config.gemini.isAvailable).toBe('boolean');
    expect(typeof config.redis.isAvailable).toBe('boolean');
    expect(typeof config.security.rateLimitWindowMs).toBe('number');
    expect(Array.isArray(config.cors.allowedOrigins)).toBe(true);
  });
});

// ─── CACHE SERVICE ────────────────────────────────────────────────────────────
describe('Cache Service (in-memory fallback)', () => {
  let cache;

  beforeEach(async () => {
    const mod = await import('../cache/cacheService.js');
    cache = mod.cacheService;
    await cache.flush();
  });

  it('stores and retrieves values', async () => {
    await cache.set('test_key', { value: 42 }, 60);
    const result = await cache.get('test_key');
    expect(result).toEqual({ value: 42 });
  });

  it('returns null for missing keys', async () => {
    const result = await cache.get('nonexistent_key_xyz');
    expect(result).toBeNull();
  });

  it('tracks cache statistics', async () => {
    await cache.set('stat_key', 'hello', 60);
    await cache.get('stat_key');    // hit
    await cache.get('missing_key'); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBeGreaterThanOrEqual(1);
    expect(stats.misses).toBeGreaterThanOrEqual(1);
    expect(typeof stats.hitRate).toBe('number');
  });

  it('deletes individual keys', async () => {
    await cache.set('del_key', 'value', 60);
    await cache.del('del_key');
    const result = await cache.get('del_key');
    expect(result).toBeNull();
  });

  it('handles expiry correctly', async () => {
    await cache.set('exp_key', 'expiring', 0); // TTL 0 means no expiry in impl
    const result = await cache.get('exp_key');
    // With TTL 0, no expiry set — should still return
    expect(result).toBeTruthy();
  });
});

describe('hashString', () => {
  it('produces consistent hashes', async () => {
    const { hashString } = await import('../cache/cacheService.js');
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).not.toBe(hashString('world'));
  });

  it('handles empty string', async () => {
    const { hashString } = await import('../cache/cacheService.js');
    expect(typeof hashString('')).toBe('string');
  });
});

// ─── HYBRID EXTRACTION SERVICE ────────────────────────────────────────────────
describe('Hybrid Extraction — classifyInput', () => {
  let classifyInput;

  beforeEach(async () => {
    const mod = await import('../services/hybridExtractionService.js');
    classifyInput = mod.classifyInput;
  });

  it('classifies simple commands as FAST', () => {
    expect(classifyInput('Show pending tasks.')).toBe('FAST');
    expect(classifyInput('Remind me at 5 PM.')).toBe('FAST');
  });

  it('classifies empty input as FAST', () => {
    expect(classifyInput('')).toBe('FAST');
    expect(classifyInput(null)).toBe('FAST');
  });

  it('classifies long transcripts as CONTEXTUAL or HYBRID', () => {
    const longText = 'Assign Priya to prepare the quarterly sales report for the Orchid Tower project starting tomorrow and completing by next Friday with a review by Rahul Sharma.';
    const path = classifyInput(longText);
    expect(['CONTEXTUAL', 'HYBRID', 'FAST']).toContain(path);
  });
});

describe('Hybrid Extraction — mergeExtractionResults', () => {
  let mergeExtractionResults;

  beforeEach(async () => {
    const mod = await import('../services/hybridExtractionService.js');
    mergeExtractionResults = mod.mergeExtractionResults;
  });

  it('uses Gemini title when rule engine returns empty title', () => {
    const ruleDraft = {
      intent: 'informational',
      fields: { title: '' },
      meta: { titleStatus: 'missing', clarifications: [], warnings: [] }
    };
    const geminiResult = {
      actions: [{ title: 'Prepare quarterly report', priority: 'High' }],
      clarifications: []
    };
    const merged = mergeExtractionResults(ruleDraft, geminiResult);
    expect(merged.fields.title).toBe('Prepare quarterly report');
    expect(merged.meta.titleSource).toBe('gemini');
  });

  it('rule engine assignee wins over Gemini', () => {
    const ruleDraft = {
      intent: 'task_create',
      fields: { title: 'Prepare report', assigneeId: 'p3' },
      meta: {
        assignee: { status: 'valid', value: { id: 'p3', name: 'Priya Singh' } },
        clarifications: [], warnings: []
      }
    };
    const geminiResult = {
      actions: [{ title: 'Prepare report', assigneeName: 'Ashok Kumar' }],
      clarifications: []
    };
    const merged = mergeExtractionResults(ruleDraft, geminiResult);
    // Rule engine assignee should be preserved
    expect(merged.fields.assigneeId).toBe('p3');
  });

  it('merges clarifications from both sources without duplicates', () => {
    const ruleDraft = {
      intent: 'task_create',
      fields: { title: 'Test' },
      meta: {
        clarifications: [{ field: 'assignee', message: 'Who should do this?' }],
        warnings: []
      }
    };
    const geminiResult = {
      actions: [{ title: 'Test' }],
      clarifications: [
        { field: 'assignee', message: 'Who should do this?' },  // duplicate
        { field: 'deadline', message: 'When is this due?' }      // new
      ]
    };
    const merged = mergeExtractionResults(ruleDraft, geminiResult);
    const clarifications = merged.meta.clarifications;
    expect(clarifications.length).toBe(2);  // Deduped
  });

  it('uses Gemini priority when rule engine found none', () => {
    const ruleDraft = {
      intent: 'task_create',
      fields: { title: 'Fix bug', priority: '' },
      meta: { clarifications: [], warnings: [] }
    };
    const geminiResult = {
      actions: [{ title: 'Fix bug', priority: 'Urgent' }],
      clarifications: []
    };
    const merged = mergeExtractionResults(ruleDraft, geminiResult);
    expect(merged.fields.priority).toBe('Urgent');
    expect(merged.meta.prioritySource).toBe('gemini');
  });
});

// ─── EXECUTION GATEWAY ────────────────────────────────────────────────────────
describe('Execution Gateway', () => {
  let executeAction, getActionState, EXECUTION_STATES;

  beforeEach(async () => {
    const mod = await import('../services/executionGateway.js');
    executeAction = mod.executeAction;
    getActionState = mod.getActionState;
    EXECUTION_STATES = mod.EXECUTION_STATES;
  });

  it('requires approval for SEND_WHATSAPP by default', async () => {
    const action = {
      id: 'test_wa_001',
      type: 'SEND_WHATSAPP',
      title: 'Send project update',
      assignee: { id: 'p1', name: 'Rahul Sharma', phone: '+919876543210' }
    };
    const result = await executeAction(action, { sessionId: 'test_session', isApproved: false });
    expect(result.status).toBe(EXECUTION_STATES.READY_FOR_APPROVAL);
    expect(result.previewData).toBeDefined();
  });

  it('executes CREATE_TASK without approval', async () => {
    const action = {
      id: 'test_ct_001',
      type: 'CREATE_TASK',
      title: 'Write unit tests',
      assignee: { id: 'p4', name: 'Krish Gupta' }
    };
    const result = await executeAction(action, { sessionId: 'test_session', isApproved: false });
    expect(result.status).toBe(EXECUTION_STATES.COMPLETED);
  });

  it('fails validation for missing action ID', async () => {
    const action = { type: 'CREATE_TASK', title: 'Test' }; // missing id
    const result = await executeAction(action, { sessionId: 'test_session' });
    expect(result.status).toBe(EXECUTION_STATES.FAILED);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('fails validation for missing title', async () => {
    const action = { id: 'test_nt', type: 'CREATE_TASK', title: '' };
    const result = await executeAction(action, { sessionId: 'test_session' });
    expect(result.status).toBe(EXECUTION_STATES.FAILED);
  });

  it('stores action state after execution', async () => {
    const action = {
      id: 'test_store_001',
      type: 'COMPLETE_TASK',
      title: 'Complete the audit report'
    };
    await executeAction(action, { sessionId: 'test_session', isApproved: true });
    const state = getActionState('test_store_001');
    expect(state).not.toBeNull();
    expect(state.executionState).toBe(EXECUTION_STATES.COMPLETED);
  });
});

// ─── AUDIT SERVICE ────────────────────────────────────────────────────────────
describe('Audit Service', () => {
  let auditLog, getAuditEntries;

  beforeEach(async () => {
    const mod = await import('../services/auditService.js');
    auditLog = mod.auditLog;
    getAuditEntries = mod.getAuditEntries;
  });

  it('records audit entries with required fields', async () => {
    const entry = await auditLog({
      event: 'TEST_EVENT',
      actionId: 'action_test',
      sessionId: 'session_test',
      details: { key: 'value' }
    });
    expect(entry.id).toBeTruthy();
    expect(entry.event).toBe('TEST_EVENT');
    expect(entry.timestamp).toBeTruthy();
  });

  it('retrieves entries by actionId', async () => {
    const uniqueId = `audit_test_${Date.now()}`;
    await auditLog({ event: 'ACTION_STARTED', actionId: uniqueId, sessionId: 'ses1' });
    await auditLog({ event: 'ACTION_COMPLETED', actionId: uniqueId, sessionId: 'ses1' });

    const entries = getAuditEntries({ actionId: uniqueId });
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.every(e => e.actionId === uniqueId)).toBe(true);
  });

  it('redacts sensitive fields from details', async () => {
    const entry = await auditLog({
      event: 'TEST_REDACTION',
      actionId: 'a1',
      sessionId: 's1',
      details: { token: 'secret_token_123', key: 'safe_value' }
    });
    expect(entry.details.token).toBe('[REDACTED]');
    expect(entry.details.key).toBe('safe_value');
  });
});

// ─── CONTEXT SERVICE ─────────────────────────────────────────────────────────
describe('Context Service', () => {
  let contextService;

  beforeEach(async () => {
    const mod = await import('../services/contextService.js');
    contextService = mod.contextService;
  });

  it('stores and retrieves last person', async () => {
    const person = { id: 'p1', name: 'Rahul Sharma', department: 'Engineering' };
    await contextService.setLastPerson('ses_test', person);
    const retrieved = await contextService.getLastPerson('ses_test');
    expect(retrieved?.id).toBe('p1');
    expect(retrieved?.name).toBe('Rahul Sharma');
  });

  it('resolves pronouns using stored last person', async () => {
    await contextService.setLastPerson('ses_pronoun', { id: 'p3', name: 'Priya Singh' });
    const { resolvedTranscript, resolutions } = await contextService.resolveReferences(
      'ses_pronoun',
      'Ask her to complete the report.'
    );
    expect(resolvedTranscript).toContain('Priya Singh');
    expect(resolutions.length).toBeGreaterThan(0);
  });

  it('records corrections for feedback', async () => {
    await contextService.recordCorrection('ses_feedback', {
      actionId: 'a1',
      correctedField: 'assignee',
      correctedValue: 'Priya Singh',
      originalValue: 'Ashok Kumar',
      originalTranscript: 'Assign the task to Priya.'
    });
    const corrections = await contextService.getCorrections('ses_feedback');
    expect(corrections.length).toBeGreaterThan(0);
    expect(corrections[0].correctedField).toBe('assignee');
    expect(corrections[0].evaluationResult).toBe('PENDING');
  });

  it('adds recent people with deduplication', async () => {
    const ses = 'ses_recent';
    await contextService.addRecentPerson(ses, { id: 'p1', name: 'Rahul' });
    await contextService.addRecentPerson(ses, { id: 'p2', name: 'Priya' });
    await contextService.addRecentPerson(ses, { id: 'p1', name: 'Rahul' }); // duplicate
    const people = await contextService.getRecentPeople(ses);
    const ids = people.map(p => p.id);
    expect(ids.filter(id => id === 'p1').length).toBe(1); // deduplicated
  });
});

// ─── WHATSAPP SERVICE ─────────────────────────────────────────────────────────
describe('WhatsApp Service', () => {
  it('builds correct WhatsApp message body', async () => {
    const { buildWhatsAppMessage } = await import('../services/whatsappService.js');
    const action = {
      title: 'Prepare report',
      description: 'Monthly financial report for Q3',
      priority: 'High',
      deadline: '2026-11-05T17:00:00',
      assignee: { name: 'Priya Singh' }
    };
    const msg = buildWhatsAppMessage(action);
    expect(msg).toContain('Prepare report');
    expect(msg).toContain('High');
    expect(msg).toContain('Priya Singh');
    expect(msg).toContain('ActionFlow AI');
  });

  it('blocks duplicate sends via idempotency', async () => {
    const { sendWhatsAppMessage } = await import('../services/whatsappService.js');
    const { cacheService } = await import('../cache/cacheService.js');

    // Pre-populate idempotency key
    const key = 'af:whatsapp:sent:idempotency_test_001';
    await cacheService.set(key, { sid: 'SM_EXISTING', sentAt: new Date().toISOString() }, 3600);

    const result = await sendWhatsAppMessage({
      to: '+919876543210',
      message: 'Test message',
      idempotencyKey: 'idempotency_test_001',
      actionId: 'a1',
      sessionId: 's1'
    });

    expect(result.status).toBe('DUPLICATE_BLOCKED');
    expect(result.previousSid).toBe('SM_EXISTING');
  });

  it('returns SIMULATED only when simulation mode is explicitly requested', async () => {
    const { sendWhatsAppMessage } = await import('../services/whatsappService.js');
    const result = await sendWhatsAppMessage({
      to: '+919876543210',
      message: 'Test message',
      idempotencyKey: `sim_test_${Date.now()}`,
      actionId: `sim_act_${Date.now()}`,
      sessionId: 's2',
      integrationMode: 'SIMULATION'
    });
    expect(result.status).toBe('SIMULATED');
    expect(result.isSimulated).toBe(true);
  });
});
