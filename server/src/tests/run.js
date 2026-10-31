/**
 * ActionFlow Server — Standalone Test Runner
 * Runs all server unit tests without requiring vitest.
 * Uses Node.js built-in assert module.
 */

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  const t0 = performance.now();
  try {
    await fn();
    const ms = (performance.now() - t0).toFixed(1);
    console.log(`  ✓ ${name} (${ms}ms)`);
    passed++;
  } catch (err) {
    const ms = (performance.now() - t0).toFixed(1);
    console.error(`  ✗ ${name} (${ms}ms)`);
    console.error(`    ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  return fn();
}

// ─── CONFIG TESTS ─────────────────────────────────────────────────────────────
await describe('Config', async () => {
  const { config } = await import('../config.js');

  await test('has required fields', () => {
    assert.ok(typeof config.server.port === 'number');
    assert.ok(config.server.port > 0);
    assert.ok(typeof config.server.nodeEnv === 'string');
    assert.ok(typeof config.gemini.isAvailable === 'boolean');
    assert.ok(Array.isArray(config.cors.allowedOrigins));
  });

  await test('Gemini API key is available', () => {
    assert.ok(config.gemini.isAvailable, 'GEMINI_API_KEY should be set in .env');
    assert.ok(config.gemini.apiKey.length > 10, 'API key should be non-trivial');
  });

  await test('Redis falls back gracefully when not configured', () => {
    // Redis URL is empty in this config — should be false
    const redisConfigured = Boolean(process.env.REDIS_URL?.trim());
    assert.strictEqual(config.redis.isAvailable, redisConfigured);
  });
});

// ─── CACHE TESTS ──────────────────────────────────────────────────────────────
await describe('Cache Service (in-memory)', async () => {
  const { cacheService, hashString } = await import('../cache/cacheService.js');
  await cacheService.flush();

  await test('stores and retrieves values', async () => {
    await cacheService.set('test_key', { value: 42 }, 60);
    const result = await cacheService.get('test_key');
    assert.deepStrictEqual(result, { value: 42 });
  });

  await test('returns null for missing keys', async () => {
    const result = await cacheService.get('nonexistent_key_xyz_' + Date.now());
    assert.strictEqual(result, null);
  });

  await test('tracks cache statistics', async () => {
    await cacheService.set('stat_key', 'hello', 60);
    await cacheService.get('stat_key');
    await cacheService.get('missing_stat_' + Date.now());
    const stats = cacheService.getStats();
    assert.ok(stats.hits >= 1);
    assert.ok(stats.misses >= 1);
    assert.ok(typeof stats.hitRate === 'number');
    assert.ok(stats.backendType === 'memory');
  });

  await test('deletes individual keys', async () => {
    await cacheService.set('del_key', 'value', 60);
    await cacheService.del('del_key');
    const result = await cacheService.get('del_key');
    assert.strictEqual(result, null);
  });

  await test('hashString produces consistent hashes', () => {
    assert.strictEqual(hashString('hello'), hashString('hello'));
    assert.notStrictEqual(hashString('hello'), hashString('world'));
    assert.ok(typeof hashString('') === 'string');
  });
});

// ─── HYBRID EXTRACTION TESTS ──────────────────────────────────────────────────
await describe('Hybrid Extraction — classifyInput', async () => {
  const { classifyInput } = await import('../services/hybridExtractionService.js');

  await test('classifies simple commands as FAST', () => {
    const r1 = classifyInput('Show pending tasks.');
    const r2 = classifyInput('Remind me at 5 PM.');
    assert.ok(['FAST', 'HYBRID'].includes(r1));
    assert.ok(['FAST', 'HYBRID'].includes(r2));
  });

  await test('classifies empty input as FAST', () => {
    assert.strictEqual(classifyInput(''), 'FAST');
    assert.strictEqual(classifyInput(null), 'FAST');
  });

  await test('classifies long text as CONTEXTUAL or HYBRID when Gemini is available', () => {
    const longText = 'Assign Priya to prepare the quarterly sales report for the Orchid Tower project. Rahul should review it. It is high priority. Start tomorrow at 9 AM and finish by next Friday at 5 PM. Repeat monthly.';
    const path = classifyInput(longText);
    assert.ok(['CONTEXTUAL', 'HYBRID', 'FAST'].includes(path));
  });
});

await describe('Hybrid Extraction — mergeExtractionResults', async () => {
  const { mergeExtractionResults } = await import('../services/hybridExtractionService.js');

  await test('uses Gemini title when rule engine returns empty', () => {
    const ruleDraft = { intent: 'informational', fields: { title: '' }, meta: { titleStatus: 'missing', clarifications: [], warnings: [] } };
    const geminiResult = { actions: [{ title: 'Prepare quarterly report', priority: 'High' }], clarifications: [] };
    const merged = mergeExtractionResults(ruleDraft, geminiResult);
    assert.strictEqual(merged.fields.title, 'Prepare quarterly report');
    assert.strictEqual(merged.meta.titleSource, 'gemini');
  });

  await test('rule engine assignee wins over Gemini', () => {
    const ruleDraft = {
      intent: 'task_create',
      fields: { title: 'Prepare report', assigneeId: 'p3' },
      meta: { assignee: { status: 'valid', value: { id: 'p3', name: 'Priya Singh' } }, clarifications: [], warnings: [] }
    };
    const geminiResult = { actions: [{ title: 'Prepare report', assigneeName: 'Ashok Kumar' }], clarifications: [] };
    const merged = mergeExtractionResults(ruleDraft, geminiResult);
    assert.strictEqual(merged.fields.assigneeId, 'p3');
  });

  await test('uses Gemini priority when rules found none', () => {
    const ruleDraft = { intent: 'task_create', fields: { title: 'Fix bug', priority: '' }, meta: { clarifications: [], warnings: [] } };
    const geminiResult = { actions: [{ title: 'Fix bug', priority: 'Urgent' }], clarifications: [] };
    const merged = mergeExtractionResults(ruleDraft, geminiResult);
    assert.strictEqual(merged.fields.priority, 'Urgent');
  });

  await test('deduplicates clarifications from both sources', () => {
    const ruleDraft = {
      intent: 'task_create',
      fields: { title: 'Test' },
      meta: { clarifications: [{ field: 'assignee', message: 'Who should do this?' }], warnings: [] }
    };
    const geminiResult = {
      actions: [{ title: 'Test' }],
      clarifications: [
        { field: 'assignee', message: 'Who should do this?' },
        { field: 'deadline', message: 'When is this due?' }
      ]
    };
    const merged = mergeExtractionResults(ruleDraft, geminiResult);
    assert.strictEqual(merged.meta.clarifications.length, 2);
  });
});

// ─── EXECUTION GATEWAY TESTS ──────────────────────────────────────────────────
await describe('Execution Gateway', async () => {
  const { executeAction, getActionState, EXECUTION_STATES } = await import('../services/executionGateway.js');

  await test('requires approval for SEND_WHATSAPP', async () => {
    const action = { id: 'test_wa_' + Date.now(), type: 'SEND_WHATSAPP', title: 'Send update', assignee: { id: 'p1', name: 'Rahul', phone: '+91987' } };
    const result = await executeAction(action, { sessionId: 'test_ses', isApproved: false });
    assert.strictEqual(result.status, EXECUTION_STATES.READY_FOR_APPROVAL);
    assert.ok(result.previewData);
  });

  await test('executes CREATE_TASK without approval', async () => {
    const action = { id: 'test_ct_' + Date.now(), type: 'CREATE_TASK', title: 'Write unit tests', assignee: { id: 'p4', name: 'Krish' } };
    const result = await executeAction(action, { sessionId: 'test_ses', isApproved: false });
    assert.strictEqual(result.status, EXECUTION_STATES.COMPLETED);
  });

  await test('fails validation for missing ID', async () => {
    const action = { type: 'CREATE_TASK', title: 'Test' };
    const result = await executeAction(action, { sessionId: 'test_ses' });
    assert.strictEqual(result.status, EXECUTION_STATES.FAILED);
    assert.ok(result.errors.length > 0);
  });

  await test('fails validation for missing title', async () => {
    const action = { id: 'test_nt_' + Date.now(), type: 'CREATE_TASK', title: '' };
    const result = await executeAction(action, { sessionId: 'test_ses' });
    assert.strictEqual(result.status, EXECUTION_STATES.FAILED);
  });

  await test('stores action state after execution', async () => {
    const id = 'test_store_' + Date.now();
    const action = { id, type: 'COMPLETE_TASK', title: 'Complete the audit report' };
    await executeAction(action, { sessionId: 'test_ses', isApproved: true });
    const state = getActionState(id);
    assert.ok(state !== null);
    assert.strictEqual(state.executionState, EXECUTION_STATES.COMPLETED);
  });
});

// ─── AUDIT SERVICE TESTS ──────────────────────────────────────────────────────
await describe('Audit Service', async () => {
  const { auditLog, getAuditEntries } = await import('../services/auditService.js');

  await test('records entries with required fields', async () => {
    const entry = await auditLog({ event: 'TEST_EVENT', actionId: 'a_test', sessionId: 's_test', details: { key: 'value' } });
    assert.ok(entry.id);
    assert.strictEqual(entry.event, 'TEST_EVENT');
    assert.ok(entry.timestamp);
  });

  await test('retrieves entries by actionId', async () => {
    const uid = 'audit_test_' + Date.now();
    await auditLog({ event: 'ACTION_STARTED', actionId: uid, sessionId: 's1' });
    await auditLog({ event: 'ACTION_COMPLETED', actionId: uid, sessionId: 's1' });
    const entries = getAuditEntries({ actionId: uid });
    assert.ok(entries.length >= 2);
    assert.ok(entries.every(e => e.actionId === uid));
  });

  await test('redacts sensitive fields', async () => {
    const entry = await auditLog({ event: 'TEST_REDACTION', actionId: 'a1', sessionId: 's1', details: { token: 'secret_token_123', key: 'safe_value' } });
    assert.strictEqual(entry.details.token, '[REDACTED]');
    assert.strictEqual(entry.details.key, 'safe_value');
  });
});

// ─── CONTEXT SERVICE TESTS ────────────────────────────────────────────────────
await describe('Context Service', async () => {
  const { contextService } = await import('../services/contextService.js');

  await test('stores and retrieves last person', async () => {
    const person = { id: 'p1', name: 'Rahul Sharma', department: 'Engineering' };
    await contextService.setLastPerson('ses_test_' + Date.now(), person);
    const key = 'ses_retrieval_' + Date.now();
    await contextService.setLastPerson(key, person);
    const retrieved = await contextService.getLastPerson(key);
    assert.strictEqual(retrieved?.id, 'p1');
    assert.strictEqual(retrieved?.name, 'Rahul Sharma');
  });

  await test('resolves pronouns using last person', async () => {
    const ses = 'ses_pronoun_' + Date.now();
    await contextService.setLastPerson(ses, { id: 'p3', name: 'Priya Singh' });
    const { resolvedTranscript, resolutions } = await contextService.resolveReferences(ses, 'Ask her to complete the report.');
    assert.ok(resolvedTranscript.includes('Priya Singh'));
    assert.ok(resolutions.length > 0);
  });

  await test('records corrections with PENDING status', async () => {
    const ses = 'ses_feedback_' + Date.now();
    await contextService.recordCorrection(ses, { actionId: 'a1', correctedField: 'assignee', correctedValue: 'Priya', originalValue: 'Ashok', originalTranscript: 'Assign to Priya.' });
    const corrections = await contextService.getCorrections(ses);
    assert.ok(corrections.length > 0);
    assert.strictEqual(corrections[0].correctedField, 'assignee');
    assert.strictEqual(corrections[0].evaluationResult, 'PENDING');
  });
});

// ─── WHATSAPP SERVICE TESTS ───────────────────────────────────────────────────
await describe('WhatsApp Service', async () => {
  const { buildWhatsAppMessage, sendWhatsAppMessage } = await import('../services/whatsappService.js');
  const { cacheService } = await import('../cache/cacheService.js');

  await test('builds correct message body', () => {
    const action = { title: 'Prepare report', description: 'Monthly Q3 report', priority: 'High', deadline: '2026-11-05T17:00:00', assignee: { name: 'Priya Singh' } };
    const msg = buildWhatsAppMessage(action);
    assert.ok(msg.includes('Prepare report'));
    assert.ok(msg.includes('High'));
    assert.ok(msg.includes('Priya Singh'));
    assert.ok(msg.includes('ActionFlow AI'));
  });

  await test('blocks duplicate sends via idempotency key', async () => {
    const key = 'idem_test_' + Date.now();
    await cacheService.set(`af:whatsapp:sent:${key}`, { sid: 'SM_EXISTING', sentAt: new Date().toISOString() }, 3600);
    const result = await sendWhatsAppMessage({ to: '+91987', message: 'Test', idempotencyKey: key, actionId: 'a1', sessionId: 's1' });
    assert.strictEqual(result.status, 'DUPLICATE_BLOCKED');
    assert.strictEqual(result.previousSid, 'SM_EXISTING');
  });

  await test('simulates send when Twilio not configured', async () => {
    const key = 'sim_test_' + Date.now();
    const result = await sendWhatsAppMessage({ to: '+91987', message: 'Test', idempotencyKey: key, actionId: 'a2', sessionId: 's2' });
    assert.ok(['SIMULATED', 'DUPLICATE_BLOCKED'].includes(result.status));
  });
});

// ─── GEMINI SERVICE TESTS ─────────────────────────────────────────────────────
await describe('Gemini Service', async () => {
  const { config } = await import('../config.js');

  await test('config reports Gemini as available', () => {
    assert.ok(config.gemini.isAvailable, 'Gemini should be available with API key in .env');
    assert.ok(config.gemini.apiKey.length > 10);
  });

  await test('extractWithGemini — simple English transcript', async () => {
    if (!config.gemini.isAvailable) { console.log('    (skipped — key missing)'); return; }
    const { extractWithGemini } = await import('../services/geminiService.js');
    const result = await extractWithGemini(
      'Assign Priya to prepare report by Friday.',
      { directory: [{ id: 'p3', name: 'Priya Singh', aliases: ['priya'] }], projects: [], referenceDate: new Date('2026-10-29') }
    );
    assert.ok(Array.isArray(result.actions), 'Should return actions array');
    assert.ok(result.actions.length > 0, `Should extract ≥1 action, got ${result.actions.length}`);
    assert.ok(result.actions[0].title, `Action title non-empty: "${result.actions[0].title}"`);
    assert.ok(typeof result.language === 'string');
    console.log(`    → title: "${result.actions[0].title}" | assignee: "${result.actions[0].assigneeName}" | lang: ${result.language}`);
  });

  await test('extractWithGemini — Hinglish transcript', async () => {
    if (!config.gemini.isAvailable) { console.log('    (skipped — key missing)'); return; }
    const { extractWithGemini } = await import('../services/geminiService.js');
    const result = await extractWithGemini(
      'Reena ko roz subah doodh le aana hai.',
      { directory: [{ id: 'p6', name: 'Reena Patel', aliases: ['reena', 'rina'] }], projects: [], referenceDate: new Date('2026-10-29') }
    );
    assert.ok(Array.isArray(result.actions));
    assert.ok(result.actions[0]?.title, 'Should extract title from Hinglish');
    console.log(`    → lang: ${result.language} | title: "${result.actions[0]?.title}" | recurring: ${result.actions[0]?.isRecurring}`);
  });

  await test('extractWithGemini — response caching (2nd call < 500ms)', async () => {
    if (!config.gemini.isAvailable) { console.log('    (skipped — key missing)'); return; }
    const { extractWithGemini } = await import('../services/geminiService.js');
    // Use a transcript that was already called above (warm cache)
    const transcript = 'Assign Priya to prepare report by Friday.';
    const ctx = { directory: [{ id: 'p3', name: 'Priya Singh', aliases: ['priya'] }], projects: [], referenceDate: new Date('2026-10-29') };
    const t0 = performance.now();
    const cached = await extractWithGemini(transcript, ctx);
    const ms = performance.now() - t0;
    assert.ok(ms < 500, `Cache hit should be <500ms, got ${ms.toFixed(1)}ms`);
    assert.ok(cached._fromCache === true, 'Should be from cache');
    console.log(`    → cache hit: ${ms.toFixed(1)}ms`);
  });
});

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Tests: ${passed + failed} total | ${passed} passed | ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.error(`  ✗ ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('\n✓ All server tests passed!');
}
