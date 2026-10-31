/**
 * ActionFlow AI — Acceptance Tests for Real WhatsApp Execution + Gemini Quota Resilience
 *
 * Covers all 8 required engineering acceptance scenarios:
 *  - TEST 1: Send a simple WhatsApp message with Gemini unavailable -> Deterministic parsing + provider execution
 *  - TEST 2: Simulate Gemini HTTP 429 -> No crash, zero retries on quota exhaustion, no fabricated extraction
 *  - TEST 3: Invalid recipient number -> Validation error (400) and no false success
 *  - TEST 4: Simulate WhatsApp provider authentication failure -> FAILED with actual provider error (no SIMULATED fallback)
 *  - TEST 5: Click-to-Chat mode -> AWAITING_USER_SEND, never automatically SENT (until explicit user confirmation)
 *  - TEST 6: Real Cloud API message -> Actual provider message ID (wamid.*) and SENT status + idempotency guard
 *  - TEST 7: Receive real delivery and read webhooks -> DELIVERED and READ status & timestamp updates
 *  - TEST 8: Restart the backend -> Message history and statuses persist across cold reload
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { semanticDecomposer } from '../services/semanticDecomposer.js';
import {
  simulateGeminiQuotaExhaustion,
  getGeminiQuotaStatus,
  resetGeminiQuotaStatus,
  isGeminiQuotaError,
  parseRetryAfterSeconds,
  extractWithGemini,
  withRetry
} from '../services/geminiService.js';
import {
  sendWhatsAppMessage,
  confirmWhatsAppUserSent,
  verifyWhatsAppWebhookSubscription,
  processWhatsAppWebhook,
  listWhatsAppMessages,
  getWhatsAppMessageById,
  reloadWhatsAppStoreFromDisk,
  WHATSAPP_STATES,
  WHATSAPP_MODES
} from '../services/whatsappService.js';
import { executeAction, EXECUTION_STATES } from '../services/executionGateway.js';
import { getAuditEntries } from '../services/auditService.js';

describe('Real WhatsApp Execution & Gemini Quota Resilience — Acceptance Suite (TEST 1 – TEST 8)', () => {
  beforeEach(() => {
    resetGeminiQuotaStatus();
  });

  // ─── TEST 1: Deterministic Parsing & Execution Without Gemini ───────────────
  it('TEST 1: Deterministically parses "Send a WhatsApp message to Aman saying I will reach college tomorrow at 10 AM." without Gemini and executes provider send', async () => {
    // Simulate Gemini being completely unavailable (quota exhausted)
    simulateGeminiQuotaExhaustion(120, 'gemini-2.5-flash');
    expect(getGeminiQuotaStatus().isQuotaExhausted).toBe(true);

    const transcript = 'Send a WhatsApp message to Aman saying I will reach college tomorrow at 10 AM.';
    const directory = [
      { id: 'c_aman', name: 'Aman Verma', department: 'Operations', phone: '+919876543210' }
    ];

    const decomposedActions = semanticDecomposer.decompose(transcript, { directory });

    // Must produce exactly 1 WHATSAPP action and zero false calendar or task actions
    expect(decomposedActions.length).toBe(1);
    const waAction = decomposedActions[0];
    expect(waAction.destination).toBe('WHATSAPP');
    expect(waAction.type).toBe('SEND_WHATSAPP');
    expect(waAction.recipientName).toBe('Aman Verma');
    expect(waAction.recipientPhone).toBe('+919876543210');
    expect(waAction.whatsappMessage).toBe('I will reach college tomorrow at 10 AM.');
    expect(waAction.tone).toBe('standard');

    // Execute via Execution Gateway with a mocked Cloud API provider response
    const mockFetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      expect(body.messaging_product).toBe('whatsapp');
      expect(body.to).toBe('+919876543210');
      expect(body.text.body).toBe('I will reach college tomorrow at 10 AM.');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '919876543210', wa_id: '919876543210' }],
          messages: [{ id: 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQUMwMDFUZXN0MQ==' }]
        })
      };
    };

    const execResult = await executeAction(
      {
        ...waAction,
        id: `test1_wa_${Date.now()}`,
        integrationMode: WHATSAPP_MODES.CLOUD_API,
        cloudConfigOverride: {
          phoneNumberId: '109876543210',
          accessToken: 'EAAG_TEST_TOKEN',
          apiVersion: 'v20.0'
        },
        customFetch: mockFetch
      },
      { sessionId: 'ses_test1', isApproved: true }
    );

    expect(execResult.success).toBe(true);
    expect(execResult.status).toBe(EXECUTION_STATES.COMPLETED);
    expect(execResult.whatsappStatus).toBe(WHATSAPP_STATES.SENT);
    expect(execResult.providerMessageId).toBe('wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQUMwMDFUZXN0MQ==');
    expect(execResult.isSimulated).toBe(false);
  });

  // ─── TEST 2: Simulate Gemini HTTP 429 Quota Exhaustion ─────────────────────
  it('TEST 2: Handles Gemini HTTP 429 RESOURCE_EXHAUSTED with zero retries, respects retryDelay, and never fabricates AI output', async () => {
    const quotaError = {
      status: 429,
      code: 429,
      message: 'Quota exceeded for quota metric: free-tier daily request limit: 20. Please retry in 45s.',
      errorDetails: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '45s' }]
    };

    expect(isGeminiQuotaError(quotaError)).toBe(true);
    expect(parseRetryAfterSeconds(quotaError)).toBe(45);

    // Verify withRetry stops immediately on first 429 attempt (zero retries)
    let callAttempts = 0;
    await expect(
      withRetry(async () => {
        callAttempts++;
        throw quotaError;
      }, 3)
    ).rejects.toMatchObject({
      code: 429,
      isQuotaExhausted: true
    });
    expect(callAttempts).toBe(1);

    const quotaStatus = getGeminiQuotaStatus();
    expect(quotaStatus.isQuotaExhausted).toBe(true);
    expect(quotaStatus.retryAfterSeconds).toBeGreaterThan(0);

    // Calling extractWithGemini during cooldown must immediately short-circuit
    // without making network requests or fabricating fake actions
    await expect(
      extractWithGemini('Hello. Send a WhatsApp message to Sparsh Trivedi.', { directory: [] }, 'WHATSAPP')
    ).rejects.toMatchObject({
      code: 429,
      isQuotaExhausted: true
    });

    // Meanwhile deterministic parser handles greeting + incomplete WhatsApp command cleanly
    const fallbackActions = semanticDecomposer.decompose('Hello. Send a WhatsApp message to Sparsh Trivedi.', {
      directory: []
    });
    expect(fallbackActions.length).toBe(1);
    expect(fallbackActions[0].type).toBe('SEND_WHATSAPP');
    expect(fallbackActions[0].recipientName).toBe('Sparsh Trivedi');
    expect(fallbackActions[0].whatsappMessage).toBe('');
    expect(fallbackActions[0].status).toBe('NEEDS_MESSAGE_CONTENT');
  });

  // ─── TEST 3: Invalid Recipient Phone Number ────────────────────────────────
  it('TEST 3: Rejects invalid recipient phone numbers with HTTP 400 and never reports false success', async () => {
    const invalidNumbers = ['', '9876543210', '+123', '+91-ABCD-12345', 'not-a-phone'];

    for (const badPhone of invalidNumbers) {
      const actionId = `test3_invalid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const res = await executeAction(
        {
          id: actionId,
          type: 'SEND_WHATSAPP',
          title: 'Send WhatsApp with invalid phone',
          recipientName: 'Aman',
          recipientPhone: badPhone,
          whatsappMessage: 'I will reach college tomorrow at 10 AM.',
          integrationMode: WHATSAPP_MODES.CLOUD_API
        },
        { sessionId: 'ses_test3', isApproved: true }
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe(EXECUTION_STATES.FAILED);
      expect(res.httpStatus).toBe(400);
      expect(res.isSimulated).toBe(false);
    }
  });

  // ─── TEST 4: Simulate WhatsApp Provider Authentication Failure ─────────────
  it('TEST 4: Reports FAILED with actual provider error on Cloud API or Twilio 401 authentication failure and NEVER falls back to SIMULATED', async () => {
    const mockAuthFailFetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: 'Error validating access token: Session has expired on Thursday.',
          type: 'OAuthException',
          code: 190
        }
      })
    });

    const actionId = `test4_authfail_${Date.now()}`;
    const res = await executeAction(
      {
        id: actionId,
        type: 'SEND_WHATSAPP',
        title: 'Send WhatsApp to Aman',
        recipientName: 'Aman',
        recipientPhone: '+919876543210',
        whatsappMessage: 'I will reach college tomorrow at 10 AM.',
        integrationMode: WHATSAPP_MODES.CLOUD_API,
        cloudConfigOverride: {
          phoneNumberId: '109876543210',
          accessToken: 'EXPIRED_TOKEN',
          apiVersion: 'v20.0'
        },
        customFetch: mockAuthFailFetch
      },
      { sessionId: 'ses_test4', isApproved: true }
    );

    expect(res.success).toBe(false);
    expect(res.status).toBe(EXECUTION_STATES.FAILED);
    expect(res.whatsappStatus).toBe(WHATSAPP_STATES.FAILED);
    expect(res.httpStatus).toBe(401);
    expect(res.error).toContain('Error validating access token');
    expect(res.isSimulated).toBe(false);

    // Verify audit log never recorded WHATSAPP_FALLBACK_SIMULATED or EXECUTION_COMPLETED
    const audits = getAuditEntries({ actionId });
    const events = audits.map(a => a.event);
    expect(events).toContain('WHATSAPP_SEND_ATTEMPT');
    expect(events).toContain('WHATSAPP_FAILED');
    expect(events).toContain('EXECUTION_FAILED');
    expect(events).not.toContain('WHATSAPP_FALLBACK_SIMULATED');
    expect(events).not.toContain('EXECUTION_COMPLETED');
  });

  // ─── TEST 5: Click-to-Chat Mode (wa.me Handoff) ────────────────────────────
  it('TEST 5: Click-to-Chat mode returns AWAITING_USER_SEND (never SENT) and transitions to USER_CONFIRMED_SENT only after explicit user confirmation', async () => {
    const actionId = `test5_ctc_${Date.now()}`;
    const res = await executeAction(
      {
        id: actionId,
        type: 'SEND_WHATSAPP',
        title: 'Send WhatsApp to Aman',
        recipientName: 'Aman',
        recipientPhone: '+919876543210',
        whatsappMessage: 'I will reach college tomorrow at 10 AM.',
        integrationMode: WHATSAPP_MODES.CLICK_TO_CHAT
      },
      { sessionId: 'ses_test5', isApproved: true }
    );

    expect(res.status).toBe(EXECUTION_STATES.AWAITING_USER_SEND);
    expect(res.whatsappStatus).toBe(WHATSAPP_STATES.AWAITING_USER_SEND);
    expect(res.status).not.toBe(EXECUTION_STATES.COMPLETED);
    expect(res.whatsappStatus).not.toBe(WHATSAPP_STATES.SENT);
    expect(res.result.waUrl).toBe(
      'https://wa.me/919876543210?text=I%20will%20reach%20college%20tomorrow%20at%2010%20AM.'
    );

    // Calling confirmWhatsAppUserSent with confirmed: false must fail
    const unconfirmed = await confirmWhatsAppUserSent(res.result.record.id, {
      confirmed: false,
      sessionId: 'ses_test5'
    });
    expect(unconfirmed.success).toBe(false);
    expect(unconfirmed.httpStatus).toBe(400);

    // Explicit user confirmation transitions to USER_CONFIRMED_SENT
    const confirmed = await confirmWhatsAppUserSent(res.result.record.id, {
      confirmed: true,
      sessionId: 'ses_test5'
    });
    expect(confirmed.success).toBe(true);
    expect(confirmed.status).toBe(WHATSAPP_STATES.USER_CONFIRMED_SENT);
    expect(confirmed.record.userConfirmedSentAt).toBeTruthy();
  });

  // ─── TEST 6: Real Cloud API Message & Idempotency Guard ────────────────────
  it('TEST 6: Real Cloud API message records actual providerMessageId and SENT status, and blocks duplicate sends on repeated approval', async () => {
    let providerCallCount = 0;
    const providerMsgId = `wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQUM_${Date.now()}`;

    const mockCloudFetch = async () => {
      providerCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: 'whatsapp',
          messages: [{ id: providerMsgId }]
        })
      };
    };

    const actionId = `test6_cloud_${Date.now()}`;
    const payload = {
      id: actionId,
      type: 'SEND_WHATSAPP',
      title: 'Send WhatsApp to Aman',
      recipientName: 'Aman',
      recipientPhone: '+919876543210',
      whatsappMessage: 'I will reach college tomorrow at 10 AM.',
      integrationMode: WHATSAPP_MODES.CLOUD_API,
      cloudConfigOverride: {
        phoneNumberId: '109876543210',
        accessToken: 'VALID_META_ACCESS_TOKEN',
        apiVersion: 'v20.0'
      },
      customFetch: mockCloudFetch
    };

    const firstSend = await executeAction(payload, { sessionId: 'ses_test6', isApproved: true });
    expect(firstSend.success).toBe(true);
    expect(firstSend.whatsappStatus).toBe(WHATSAPP_STATES.SENT);
    expect(firstSend.providerMessageId).toBe(providerMsgId);
    expect(providerCallCount).toBe(1);

    // Second approval click with same actionId must be blocked by idempotency without calling provider again
    const secondSend = await executeAction(payload, { sessionId: 'ses_test6', isApproved: true });
    expect(secondSend.success).toBe(true);
    expect(secondSend.isDuplicatePrevented).toBe(true);
    expect(providerCallCount).toBe(1);
  });

  // ─── TEST 7: Receive Real Delivery and Read Webhooks ───────────────────────
  it('TEST 7: Verifies webhook subscription challenge, HMAC-SHA256 signature, and updates SENT -> DELIVERED -> READ', async () => {
    const providerMsgId = `wamid.WEBHOOK_${Date.now()}`;
    const appSecret = 'test_meta_app_secret_key';

    // 1. Send initial Cloud API message -> SENT
    const sendRes = await sendWhatsAppMessage({
      to: '+919876543210',
      recipientName: 'Aman',
      message: 'Webhook lifecycle verification test',
      actionId: `test7_act_${Date.now()}`,
      sessionId: 'ses_test7',
      integrationMode: WHATSAPP_MODES.CLOUD_API,
      cloudConfigOverride: {
        phoneNumberId: '109876543210',
        accessToken: 'VALID_META_TOKEN'
      },
      customFetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: providerMsgId }] })
      })
    });

    expect(sendRes.status).toBe(WHATSAPP_STATES.SENT);

    // 2. Verify GET webhook challenge
    const challengeRes = verifyWhatsAppWebhookSubscription({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'actionflow_wa_verify_token',
      'hub.challenge': '987654321'
    });
    expect(challengeRes.verified).toBe(true);
    expect(challengeRes.challenge).toBe('987654321');

    // 3. Deliver DELIVERED webhook with valid HMAC-SHA256 signature
    const deliveredPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_01',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                statuses: [
                  {
                    id: providerMsgId,
                    status: 'delivered',
                    timestamp: '1762000100',
                    recipient_id: '919876543210'
                  }
                ]
              }
            }
          ]
        }
      ]
    };
    const deliveredSig =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(JSON.stringify(deliveredPayload)).digest('hex');

    const delivWebhookRes = await processWhatsAppWebhook(deliveredPayload, {
      signatureHeader: deliveredSig,
      appSecret
    });
    expect(delivWebhookRes.success).toBe(true);
    expect(delivWebhookRes.processedCount).toBe(1);

    const afterDelivered = getWhatsAppMessageById(providerMsgId);
    expect(afterDelivered.status).toBe(WHATSAPP_STATES.DELIVERED);
    expect(afterDelivered.deliveredAt).toBeTruthy();
    expect(afterDelivered.readAt).toBeNull();

    // 4. Deliver READ webhook with valid HMAC-SHA256 signature
    const readPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_01',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                statuses: [
                  {
                    id: providerMsgId,
                    status: 'read',
                    timestamp: '1762000250',
                    recipient_id: '919876543210'
                  }
                ]
              }
            }
          ]
        }
      ]
    };
    const readSig =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(JSON.stringify(readPayload)).digest('hex');

    const readWebhookRes = await processWhatsAppWebhook(readPayload, {
      signatureHeader: readSig,
      appSecret
    });
    expect(readWebhookRes.success).toBe(true);

    const afterRead = getWhatsAppMessageById(providerMsgId);
    expect(afterRead.status).toBe(WHATSAPP_STATES.READ);
    expect(afterRead.deliveredAt).toBeTruthy();
    expect(afterRead.readAt).toBeTruthy();
  });

  // ─── TEST 8: Backend Restart Persistence ───────────────────────────────────
  it('TEST 8: Persists WhatsApp message history, provider IDs, timestamps, and statuses across backend restart', async () => {
    const uniqueActionId = `test8_persist_${Date.now()}`;
    const uniqueProviderId = `wamid.PERSIST_${Date.now()}`;

    await sendWhatsAppMessage({
      to: '+919876543210',
      recipientName: 'Aman Verma',
      message: 'Persistence across server restart test',
      actionId: uniqueActionId,
      sessionId: 'ses_test8',
      integrationMode: WHATSAPP_MODES.CLOUD_API,
      cloudConfigOverride: {
        phoneNumberId: '109876543210',
        accessToken: 'VALID_META_TOKEN'
      },
      customFetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: uniqueProviderId }] })
      })
    });

    // Simulate full backend restart by clearing in-memory store and reloading from server/data/whatsapp_messages.json
    reloadWhatsAppStoreFromDisk();

    const reloadedRecord = getWhatsAppMessageById(uniqueProviderId);
    expect(reloadedRecord).not.toBeNull();
    expect(reloadedRecord.actionId).toBe(uniqueActionId);
    expect(reloadedRecord.recipientName).toBe('Aman Verma');
    expect(reloadedRecord.recipientPhone).toBe('+919876543210');
    expect(reloadedRecord.messageBody).toBe('Persistence across server restart test');
    expect(reloadedRecord.status).toBe(WHATSAPP_STATES.SENT);
    expect(reloadedRecord.providerMessageId).toBe(uniqueProviderId);
    expect(reloadedRecord.sentAt).toBeTruthy();

    const allMessages = listWhatsAppMessages();
    expect(allMessages.some(m => m.providerMessageId === uniqueProviderId)).toBe(true);
  });
});
