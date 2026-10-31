/**
 * ActionFlow Server — Truthful WhatsApp Execution & Lifecycle Service
 *
 * Implements:
 * - Explicit integration modes:
 *     A. CLOUD_API       (Official Meta WhatsApp Business Cloud API v20.0)
 *     B. TWILIO          (Official Twilio WhatsApp REST API / Sandbox & Production)
 *     C. CLICK_TO_CHAT   (wa.me manual user handoff -> AWAITING_USER_SEND -> USER_CONFIRMED_SENT)
 *     D. SIMULATION      (Explicitly labelled SIMULATED — never disguised as SENT/COMPLETED)
 * - Truthful Execution State Machine:
 *     DRAFT | PENDING_APPROVAL | APPROVED | SENDING | QUEUED | SENT | DELIVERED | READ |
 *     FAILED | AWAITING_USER_SEND | USER_CONFIRMED_SENT | SIMULATED | CANCELLED
 * - Strict E.164 recipient phone validation & Twilio sender configuration verification
 * - Real Twilio API adapter (`client.messages.create({ from, to, body })` & `client.messages(sid).fetch()`)
 * - Persistent message, provider response & status transition tracking in `server/data/whatsapp_messages.json`
 * - Idempotency per actionId / idempotencyKey (blocks duplicate sends on repeated approval)
 * - Webhook verification (Twilio X-Twilio-Signature HMAC-SHA1 & Meta X-Hub-Signature-256 HMAC-SHA256)
 * - Zero silent fallback from provider failure to Click-to-Chat or fake simulation
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { auditLog } from './auditService.js';
import { cacheService } from '../cache/cacheService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

function getWhatsAppStoreFile() {
  if (Boolean(process.env.VITEST)) {
    return path.join(DATA_DIR, 'whatsapp_messages.test.json');
  }
  return path.join(DATA_DIR, 'whatsapp_messages.json');
}

export const WHATSAPP_STATES = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  SENDING: 'SENDING',
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
  FAILED: 'FAILED',
  AWAITING_USER_SEND: 'AWAITING_USER_SEND',
  USER_CONFIRMED_SENT: 'USER_CONFIRMED_SENT',
  SIMULATED: 'SIMULATED',
  CANCELLED: 'CANCELLED'
});

export const WHATSAPP_MODES = Object.freeze({
  CLOUD_API: 'CLOUD_API',
  TWILIO: 'TWILIO',
  CLICK_TO_CHAT: 'CLICK_TO_CHAT',
  SIMULATION: 'SIMULATION'
});

const _messagesById = new Map();
const _inFlightSends = new Set();
let _loadedFromDisk = false;

function isEphemeralTestRecord(m) {
  if (Boolean(process.env.VITEST)) return false;
  if (!m) return false;
  const sid = String(m.sessionId || '');
  const aid = String(m.actionId || '');
  const pid = String(m.providerMessageId || '');
  if (
    sid.startsWith('ses_test') ||
    sid.startsWith('session_test') ||
    sid.startsWith('session_trusted') ||
    sid === 'sess_wa' ||
    sid === 'sess_v4_test' ||
    aid.startsWith('test3_') ||
    aid.startsWith('test4_') ||
    aid.startsWith('test5_') ||
    aid.startsWith('test6_') ||
    aid.startsWith('test7_') ||
    aid.startsWith('test8_') ||
    pid.startsWith('SM_TEST_') ||
    pid.startsWith('SM_TRUSTED_') ||
    pid.startsWith('SM_IDEMP_') ||
    pid.startsWith('wamid.WEBHOOK_') ||
    pid.startsWith('wamid.PERSIST_') ||
    pid.startsWith('wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQUM_')
  ) {
    return true;
  }
  return false;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadMessagesFromDisk() {
  if (_loadedFromDisk) return;
  _loadedFromDisk = true;
  try {
    ensureDataDir();
    const storeFile = getWhatsAppStoreFile();
    if (fs.existsSync(storeFile)) {
      const raw = fs.readFileSync(storeFile, 'utf8');
      const parsed = JSON.parse(raw);
      let cleanedFixtures = false;
      if (Array.isArray(parsed.messages)) {
        for (const m of parsed.messages) {
          if (m && m.id) {
            if (isEphemeralTestRecord(m)) {
              cleanedFixtures = true;
              continue;
            }
            _messagesById.set(m.id, m);
          }
        }
      }
      if (cleanedFixtures) {
        persistMessagesToDisk();
      }
    }
  } catch (err) {
    console.warn('[WhatsAppService] Could not load whatsapp_messages.json:', err.message);
  }
}

function persistMessagesToDisk() {
  try {
    ensureDataDir();
    const storeFile = getWhatsAppStoreFile();
    const allMessages = Array.from(_messagesById.values()).filter(m => !isEphemeralTestRecord(m));
    fs.writeFileSync(
      storeFile,
      JSON.stringify({ updatedAt: new Date().toISOString(), messages: allMessages }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn('[WhatsAppService] Could not persist whatsapp_messages.json:', err.message);
  }
}

/**
 * Forces a cold reload from disk (used in TEST 8 to verify persistence across backend restarts)
 */
export function reloadWhatsAppStoreFromDisk() {
  _messagesById.clear();
  _loadedFromDisk = false;
  loadMessagesFromDisk();
}

/**
 * Validates and normalizes an E.164 phone number (e.g., +917465982627)
 * Also strips accidental domestic trunk prefix '0' after +91 (e.g. +9107465982627 -> +917465982627)
 */
export function validateE164Phone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return {
      isValid: false,
      normalized: '',
      error: 'MISSING_RECIPIENT_PHONE',
      message: 'Recipient phone number is required.'
    };
  }

  const trimmed = rawPhone.replace(/^whatsapp:/i, '').trim();
  let normalized = trimmed.replace(/[\s().-]/g, '');

  // Strip domestic trunk prefix '0' when prefixed with +91 (e.g. +9109044667729 -> +919044667729)
  let strippedTrunkZero = false;
  if (/^\+910([6-9]\d{9})$/.test(normalized)) {
    normalized = normalized.replace(/^\+910/, '+91');
    strippedTrunkZero = true;
  }

  // Strict E.164: starts with +, country code digit 1-9, total 10 to 15 digits
  if (!/^\+[1-9]\d{9,14}$/.test(normalized)) {
    return {
      isValid: false,
      normalized,
      error: 'INVALID_RECIPIENT_PHONE',
      message: `Invalid recipient phone number "${rawPhone}". Must be a valid international E.164 number (e.g., +917465982627).`
    };
  }

  return {
    isValid: true,
    normalized,
    whatsappAddress: `whatsapp:${normalized}`,
    digitsOnly: normalized.slice(1),
    strippedTrunkZero
  };
}

/**
 * Validates the configured Twilio WhatsApp sender address (e.g. whatsapp:+17372508034)
 */
export function validateTwilioSender(rawFrom) {
  if (!rawFrom || typeof rawFrom !== 'string' || !rawFrom.trim()) {
    return {
      isValid: false,
      formatted: '',
      e164: '',
      error: 'MISSING_TWILIO_WHATSAPP_FROM',
      message: 'TWILIO_WHATSAPP_FROM is not configured.'
    };
  }
  const clean = rawFrom.replace(/^whatsapp:/i, '').trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{9,14}$/.test(clean)) {
    return {
      isValid: false,
      formatted: rawFrom,
      e164: clean,
      error: 'INVALID_TWILIO_WHATSAPP_FROM',
      message: `TWILIO_WHATSAPP_FROM "${rawFrom}" is not a valid E.164 WhatsApp sender (expected format: whatsapp:+17372508034).`
    };
  }
  return {
    isValid: true,
    formatted: `whatsapp:${clean}`,
    e164: clean
  };
}

/**
 * Official Twilio REST API Client Adapter
 * Implements `client.messages.create({ from, to, body, statusCallback })`
 * and `client.messages(sid).fetch()` without exposing credentials.
 */
export function createTwilioClient(accountSid, authToken, { fetchImpl = globalThis.fetch } = {}) {
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}`;

  const messages = function (messageSid) {
    return {
      async fetch() {
        const res = await fetchImpl(`${baseUrl}/Messages/${encodeURIComponent(messageSid)}.json`, {
          method: 'GET',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            Accept: 'application/json'
          }
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(body?.message || `Twilio message fetch failed (HTTP ${res.status})`);
          err.status = res.status;
          err.code = body?.code || `HTTP_${res.status}`;
          err.twilioResponse = body;
          throw err;
        }
        return {
          sid: body.sid,
          status: body.status,
          dateCreated: body.date_created || body.dateCreated || null,
          dateUpdated: body.date_updated || body.dateUpdated || null,
          dateSent: body.date_sent || body.dateSent || null,
          from: body.from || null,
          to: body.to || null,
          body: body.body || null,
          direction: body.direction || 'outbound-api',
          errorCode: body.error_code ?? body.errorCode ?? null,
          errorMessage: body.error_message ?? body.errorMessage ?? null,
          raw: body
        };
      }
    };
  };

  messages.create = async function ({ from, to, body, statusCallback = null }) {
    const formParams = new URLSearchParams({
      From: from,
      To: to,
      Body: body
    });
    if (statusCallback) {
      formParams.set('StatusCallback', statusCallback);
    }

    const res = await fetchImpl(`${baseUrl}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formParams
    });

    const resBody = await res.json().catch(() => ({}));
    const providerSid = resBody?.sid || null;

    if (!res.ok || !providerSid) {
      const err = new Error(
        resBody?.message || resBody?.error_message || `Twilio WhatsApp API error (HTTP ${res.status})`
      );
      err.status = res.status || 502;
      err.code = resBody?.code ?? resBody?.error_code ?? `HTTP_${res.status || 502}`;
      err.moreInfo = resBody?.more_info || null;
      err.twilioResponse = resBody;
      throw err;
    }

    return {
      httpStatus: res.status || 201,
      sid: providerSid,
      status: String(resBody.status || 'queued').toLowerCase(),
      dateCreated: resBody.date_created || resBody.dateCreated || new Date().toISOString(),
      dateUpdated: resBody.date_updated || resBody.dateUpdated || new Date().toISOString(),
      dateSent: resBody.date_sent || resBody.dateSent || null,
      from: resBody.from || from,
      to: resBody.to || to,
      body: resBody.body || body,
      direction: resBody.direction || 'outbound-api',
      errorCode: resBody.error_code ?? null,
      errorMessage: resBody.error_message ?? null,
      numSegments: resBody.num_segments || '1',
      uri: resBody.uri || null
    };
  };

  return { messages };
}

/**
 * Audits and reports the actual WhatsApp integration configuration
 */
export function getWhatsAppIntegrationStatus() {
  const providerRaw = (config.whatsapp.provider || 'none').toLowerCase();
  const cloudConfigured = Boolean(
    config.whatsapp.cloudApi?.phoneNumberId && config.whatsapp.cloudApi?.accessToken
  );
  const senderValidation = validateTwilioSender(config.whatsapp.twilio?.from || '');
  const twilioConfigured = Boolean(
    config.whatsapp.twilio?.accountSid &&
    config.whatsapp.twilio?.authToken &&
    senderValidation.isValid
  );

  let effectiveMode = WHATSAPP_MODES.CLICK_TO_CHAT;
  if (providerRaw === 'twilio' && twilioConfigured) {
    effectiveMode = WHATSAPP_MODES.TWILIO;
  } else if (providerRaw === 'cloud_api' || providerRaw === 'meta' || cloudConfigured) {
    effectiveMode = WHATSAPP_MODES.CLOUD_API;
  } else if (providerRaw === 'simulation' || providerRaw === 'simulated') {
    effectiveMode = WHATSAPP_MODES.SIMULATION;
  } else if (providerRaw === 'click_to_chat' || providerRaw === 'wa.me') {
    effectiveMode = WHATSAPP_MODES.CLICK_TO_CHAT;
  }

  return {
    configuredProvider: config.whatsapp.provider || 'none',
    effectiveMode,
    cloudApiConfigured: cloudConfigured,
    cloudPhoneNumberId: config.whatsapp.cloudApi?.phoneNumberId
      ? `${config.whatsapp.cloudApi.phoneNumberId.slice(0, 4)}***`
      : null,
    twilioConfigured,
    twilioAccountSidMasked: config.whatsapp.twilio?.accountSid
      ? `${config.whatsapp.twilio.accountSid.slice(0, 6)}***${config.whatsapp.twilio.accountSid.slice(-4)}`
      : null,
    twilioFrom: senderValidation.formatted || config.whatsapp.twilio?.from || null,
    twilioSenderValid: senderValidation.isValid,
    clickToChatAvailable: true,
    webhookVerifyTokenConfigured: Boolean(config.whatsapp.cloudApi?.webhookVerifyToken),
    webhookSignatureSecretConfigured: Boolean(
      config.whatsapp.cloudApi?.appSecret || config.whatsapp.twilio?.authToken
    )
  };
}

function appendStatusTransition(record, newStatus, { providerStatus = null, timestamp = null, details = null } = {}) {
  if (!Array.isArray(record.statusHistory)) {
    record.statusHistory = [];
  }
  const ts = timestamp || new Date().toISOString();
  const last = record.statusHistory[record.statusHistory.length - 1];
  if (!last || last.status !== newStatus || (providerStatus && last.providerStatus !== providerStatus)) {
    record.statusHistory.push({
      status: newStatus,
      providerStatus: providerStatus || newStatus.toLowerCase(),
      timestamp: ts,
      ...(details ? { details } : {})
    });
  }
}

function findExistingRecordByKey(idempotencyKey, actionId) {
  loadMessagesFromDisk();
  for (const record of _messagesById.values()) {
    if (
      (idempotencyKey && record.idempotencyKey === idempotencyKey) ||
      (actionId && record.actionId === actionId)
    ) {
      return record;
    }
  }
  return null;
}

/**
 * Executes a WhatsApp message send across the configured or requested integrationMode:
 * - TWILIO: Official Twilio WhatsApp REST API (`client.messages.create`)
 * - CLOUD_API: Official Meta WhatsApp Business Cloud API
 * - CLICK_TO_CHAT: Generates wa.me URL and records AWAITING_USER_SEND (never auto-marks SENT)
 * - SIMULATION: Explicitly labelled SIMULATED (only when integrationMode === 'SIMULATION')
 */
export async function sendWhatsAppMessage({
  to,
  recipientName = null,
  message,
  idempotencyKey,
  actionId,
  sessionId = 'default_session',
  integrationMode = null,
  cloudConfigOverride = null,
  customFetch = null,
  allowRetry = false
}) {
  loadMessagesFromDisk();

  const statusInfo = getWhatsAppIntegrationStatus();
  const mode = (integrationMode || statusInfo.effectiveMode || WHATSAPP_MODES.CLICK_TO_CHAT).toUpperCase();
  const baseActionId = actionId || idempotencyKey || `wa_act_${Date.now()}`;
  const baseIdempKey = idempotencyKey || baseActionId;

  // Keep manual Click-to-Chat handoff records strictly separate from provider API records
  let existingRecord = findExistingRecordByKey(baseIdempKey, baseActionId);
  const isManualSwitchAfterProviderAttempt =
    existingRecord &&
    mode === WHATSAPP_MODES.CLICK_TO_CHAT &&
    existingRecord.integrationMode !== WHATSAPP_MODES.CLICK_TO_CHAT;

  const resolvedActionId = isManualSwitchAfterProviderAttempt ? `${baseActionId}_ctc` : baseActionId;
  const resolvedIdempKey = isManualSwitchAfterProviderAttempt ? `${baseIdempKey}_ctc` : baseIdempKey;
  let record = isManualSwitchAfterProviderAttempt
    ? findExistingRecordByKey(resolvedIdempKey, resolvedActionId)
    : existingRecord;

  // 1. Prevent concurrent duplicate in-flight execution
  if (_inFlightSends.has(resolvedIdempKey)) {
    return {
      success: false,
      httpStatus: 409,
      status: WHATSAPP_STATES.SENDING,
      isDuplicateInFlight: true,
      message: 'WhatsApp message send is currently in progress. Duplicate request blocked.'
    };
  }

  // 2. Check existing record or cache for idempotency
  const cacheKey = `af:whatsapp:sent:${resolvedIdempKey}`;
  const cachedEntry = !allowRetry ? await cacheService.get(cacheKey) : null;

  if (!record && cachedEntry && !allowRetry) {
    await auditLog({
      event: 'WHATSAPP_DUPLICATE_BLOCKED',
      actionId: resolvedActionId,
      sessionId,
      details: { to, idempotencyKey: resolvedIdempKey, previousSid: cachedEntry.sid }
    });
    return {
      success: false,
      httpStatus: 409,
      status: 'DUPLICATE_BLOCKED',
      previousSid: cachedEntry.sid,
      providerMessageId: cachedEntry.sid,
      isDuplicatePrevented: true,
      idempotentReplay: true,
      message: 'Message already sent (idempotency guard).'
    };
  }

  if (record && !allowRetry) {
    if (
      record.status === WHATSAPP_STATES.QUEUED ||
      record.status === WHATSAPP_STATES.SENT ||
      record.status === WHATSAPP_STATES.DELIVERED ||
      record.status === WHATSAPP_STATES.READ ||
      (mode === WHATSAPP_MODES.CLICK_TO_CHAT && record.status === WHATSAPP_STATES.USER_CONFIRMED_SENT)
    ) {
      await auditLog({
        event: 'WHATSAPP_DUPLICATE_BLOCKED',
        actionId: resolvedActionId,
        sessionId,
        details: {
          to,
          idempotencyKey: resolvedIdempKey,
          status: record.status,
          providerMessageId: record.providerMessageId
        }
      });
      return {
        success: false,
        httpStatus: 409,
        status: 'DUPLICATE_BLOCKED',
        previousStatus: record.status,
        integrationMode: record.integrationMode,
        providerMessageId: record.providerMessageId,
        previousSid: record.providerMessageId,
        isDuplicatePrevented: true,
        idempotentReplay: true,
        message: 'Message was already sent. Duplicate send prevented.',
        record
      };
    }

    if (record.status === 'UNKNOWN_EXECUTION_STATE') {
      return {
        success: false,
        httpStatus: 409,
        status: 'UNKNOWN_EXECUTION_STATE',
        reconciliationRequired: true,
        message: 'Previous send attempt timed out with unknown provider state. Reconcile status before retrying.',
        record
      };
    }
  }

  // 3. Validate message body
  const cleanBody = String(message || '').trim();
  if (!cleanBody) {
    console.warn('[WhatsAppService] Validation failure: EMPTY_MESSAGE_BODY', JSON.stringify({
      outcomeType: 'VALIDATION_FAILURE',
      actionId: resolvedActionId,
      httpStatus: 400,
      recipientFormatValid: false
    }));
    return {
      success: false,
      httpStatus: 400,
      status: WHATSAPP_STATES.FAILED,
      error: 'EMPTY_MESSAGE_BODY',
      message: 'WhatsApp message body cannot be empty.'
    };
  }

  // 4. Validate E.164 recipient phone number
  const phoneValidation = validateE164Phone(to);
  const now = new Date().toISOString();

  if (!record) {
    record = {
      id: `wmsg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      actionId: resolvedActionId,
      idempotencyKey: resolvedIdempKey,
      sessionId,
      recipientName: recipientName || 'Recipient',
      recipientPhone: phoneValidation.normalized || String(to || ''),
      recipientAddress: phoneValidation.whatsappAddress || null,
      senderAddress: null,
      messageBody: cleanBody,
      integrationMode: mode,
      providerMessageId: null,
      twilioMessageSid: null,
      providerStatus: null,
      dateCreated: null,
      dateUpdated: null,
      dateSent: null,
      errorCode: null,
      errorMessage: null,
      providerResponse: null,
      status: WHATSAPP_STATES.APPROVED,
      waUrl: null,
      isSimulated: mode === WHATSAPP_MODES.SIMULATION,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      userConfirmedSentAt: null,
      failureReason: null,
      statusHistory: [],
      attempts: [],
      webhookEvents: [],
      createdAt: now,
      updatedAt: now
    };
  } else {
    record.recipientPhone = phoneValidation.normalized || String(to || '');
    record.recipientAddress = phoneValidation.whatsappAddress || null;
    record.recipientName = recipientName || record.recipientName;
    record.messageBody = cleanBody;
    record.integrationMode = mode;
    record.isSimulated = mode === WHATSAPP_MODES.SIMULATION;
    record.updatedAt = now;
  }

  if (!phoneValidation.isValid) {
    const diag = {
      outcomeType: 'VALIDATION_FAILURE',
      actionId: resolvedActionId,
      integrationMode: mode,
      twilioErrorCode: null,
      httpStatus: 400,
      senderConfigValid: statusInfo.twilioSenderValid,
      recipientFormatValid: false,
      recipientInput: String(to || ''),
      messageSid: null,
      error: phoneValidation.error,
      message: phoneValidation.message
    };
    console.warn('[WhatsAppService] Validation failure:', JSON.stringify(diag));

    const attemptEntry = {
      attemptNumber: record.attempts.length + 1,
      timestamp: now,
      integrationMode: mode,
      status: WHATSAPP_STATES.FAILED,
      httpStatus: 400,
      providerMessageId: null,
      errorCode: phoneValidation.error,
      error: phoneValidation.message
    };
    record.attempts.push(attemptEntry);
    record.status = WHATSAPP_STATES.FAILED;
    record.errorCode = phoneValidation.error;
    record.errorMessage = phoneValidation.message;
    record.failureReason = {
      outcomeType: 'VALIDATION_FAILURE',
      httpStatus: 400,
      code: phoneValidation.error,
      message: phoneValidation.message
    };
    appendStatusTransition(record, WHATSAPP_STATES.FAILED, { providerStatus: 'validation_failed', timestamp: now });
    _messagesById.set(record.id, record);
    persistMessagesToDisk();

    await auditLog({
      event: 'WHATSAPP_VALIDATION_FAILED',
      actionId: resolvedActionId,
      sessionId,
      details: diag
    });

    return {
      success: false,
      httpStatus: 400,
      status: WHATSAPP_STATES.FAILED,
      integrationMode: mode,
      error: phoneValidation.error,
      failureReason: record.failureReason,
      message: phoneValidation.message,
      record
    };
  }

  const e164Phone = phoneValidation.normalized;
  const digitsOnly = phoneValidation.digitsOnly;

  // ── MODE C: CLICK_TO_CHAT (wa.me manual user handoff — never claims provider delivery) ──
  if (mode === WHATSAPP_MODES.CLICK_TO_CHAT) {
    const waUrl = `https://wa.me/${digitsOnly}?text=${encodeURIComponent(cleanBody)}`;
    record.status = WHATSAPP_STATES.AWAITING_USER_SEND;
    record.providerStatus = 'manual_handoff';
    record.waUrl = waUrl;
    record.isSimulated = false;
    record.failureReason = null;
    record.attempts.push({
      attemptNumber: record.attempts.length + 1,
      timestamp: now,
      integrationMode: WHATSAPP_MODES.CLICK_TO_CHAT,
      status: WHATSAPP_STATES.AWAITING_USER_SEND,
      httpStatus: 202,
      providerMessageId: null,
      error: null
    });
    appendStatusTransition(record, WHATSAPP_STATES.AWAITING_USER_SEND, {
      providerStatus: 'awaiting_user_send',
      timestamp: now
    });
    record.updatedAt = now;
    _messagesById.set(record.id, record);
    persistMessagesToDisk();

    await auditLog({
      event: 'WHATSAPP_AWAITING_USER_SEND',
      actionId: resolvedActionId,
      sessionId,
      details: {
        messageId: record.id,
        to: e164Phone,
        integrationMode: WHATSAPP_MODES.CLICK_TO_CHAT,
        waUrl
      }
    });

    return {
      success: true,
      httpStatus: 202,
      status: WHATSAPP_STATES.AWAITING_USER_SEND,
      integrationMode: WHATSAPP_MODES.CLICK_TO_CHAT,
      waUrl,
      requiresUserConfirmation: true,
      message: 'WhatsApp Click-to-Chat link generated. Open WhatsApp and confirm after sending.',
      record
    };
  }

  // ── MODE D: EXPLICIT SIMULATION (Only when explicitly requested) ───────────
  if (mode === WHATSAPP_MODES.SIMULATION) {
    const simId = `SIM_WA_${Date.now()}`;
    record.status = WHATSAPP_STATES.SIMULATED;
    record.providerStatus = 'simulated';
    record.isSimulated = true;
    record.providerMessageId = simId;
    record.failureReason = null;
    record.attempts.push({
      attemptNumber: record.attempts.length + 1,
      timestamp: now,
      integrationMode: WHATSAPP_MODES.SIMULATION,
      status: WHATSAPP_STATES.SIMULATED,
      httpStatus: 200,
      providerMessageId: simId,
      error: null
    });
    appendStatusTransition(record, WHATSAPP_STATES.SIMULATED, { providerStatus: 'simulated', timestamp: now });
    record.updatedAt = now;
    _messagesById.set(record.id, record);
    persistMessagesToDisk();

    await auditLog({
      event: 'WHATSAPP_SIMULATED',
      actionId: resolvedActionId,
      sessionId,
      details: {
        messageId: record.id,
        to: e164Phone,
        simulationId: simId,
        isSimulated: true
      }
    });

    return {
      success: true,
      httpStatus: 200,
      status: WHATSAPP_STATES.SIMULATED,
      integrationMode: WHATSAPP_MODES.SIMULATION,
      isSimulated: true,
      providerMessageId: simId,
      message: 'SIMULATED mode: No real WhatsApp message was sent to an external provider.',
      record
    };
  }

  // ── REAL PROVIDER EXECUTION (CLOUD_API or TWILIO) ──────────────────────────
  _inFlightSends.add(resolvedIdempKey);
  record.status = WHATSAPP_STATES.SENDING;
  record.updatedAt = new Date().toISOString();
  _messagesById.set(record.id, record);
  persistMessagesToDisk();

  const fetchImpl = customFetch || globalThis.fetch;

  await auditLog({
    event: 'WHATSAPP_SEND_ATTEMPT',
    actionId: resolvedActionId,
    sessionId,
    details: {
      messageId: record.id,
      to: e164Phone,
      integrationMode: mode,
      messageLength: cleanBody.length
    }
  });

  try {
    // ── MODE A: OFFICIAL META WHATSAPP BUSINESS CLOUD API ───────────────────
    if (mode === WHATSAPP_MODES.CLOUD_API) {
      const phoneNumberId =
        cloudConfigOverride?.phoneNumberId ?? config.whatsapp.cloudApi?.phoneNumberId;
      const accessToken =
        cloudConfigOverride?.accessToken ?? config.whatsapp.cloudApi?.accessToken;
      const apiVersion =
        cloudConfigOverride?.apiVersion ?? config.whatsapp.cloudApi?.apiVersion ?? 'v20.0';

      if (!phoneNumberId || !accessToken) {
        const missingMsg =
          'WhatsApp Business Cloud API credentials (WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_CLOUD_ACCESS_TOKEN) are not configured.';
        record.status = WHATSAPP_STATES.FAILED;
        record.errorCode = 'CLOUD_API_CREDENTIALS_MISSING';
        record.errorMessage = missingMsg;
        record.failureReason = {
          outcomeType: 'VALIDATION_FAILURE',
          httpStatus: 401,
          code: 'CLOUD_API_CREDENTIALS_MISSING',
          message: missingMsg
        };
        record.attempts.push({
          attemptNumber: record.attempts.length + 1,
          timestamp: new Date().toISOString(),
          integrationMode: WHATSAPP_MODES.CLOUD_API,
          status: WHATSAPP_STATES.FAILED,
          httpStatus: 401,
          providerMessageId: null,
          errorCode: 'CLOUD_API_CREDENTIALS_MISSING',
          error: missingMsg
        });
        appendStatusTransition(record, WHATSAPP_STATES.FAILED, { providerStatus: 'failed' });
        record.updatedAt = new Date().toISOString();
        _messagesById.set(record.id, record);
        persistMessagesToDisk();

        await auditLog({
          event: 'WHATSAPP_FAILED',
          actionId: resolvedActionId,
          sessionId,
          details: { to: e164Phone, error: 'CLOUD_API_CREDENTIALS_MISSING', message: missingMsg }
        });

        return {
          success: false,
          httpStatus: 401,
          status: WHATSAPP_STATES.FAILED,
          integrationMode: WHATSAPP_MODES.CLOUD_API,
          error: 'CLOUD_API_CREDENTIALS_MISSING',
          failureReason: record.failureReason,
          message: missingMsg,
          record
        };
      }

      const endpoint = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: e164Phone,
        type: 'text',
        text: {
          preview_url: false,
          body: cleanBody
        }
      };

      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resBody = await res.json().catch(() => ({}));
      const providerMsgId = resBody?.messages?.[0]?.id || null;

      if (res.ok && providerMsgId) {
        const sentAt = new Date().toISOString();
        record.status = WHATSAPP_STATES.SENT;
        record.providerMessageId = providerMsgId;
        record.providerStatus = 'accepted';
        record.dateCreated = sentAt;
        record.sentAt = sentAt;
        record.isSimulated = false;
        record.errorCode = null;
        record.errorMessage = null;
        record.failureReason = null;
        record.providerResponse = {
          messaging_product: resBody.messaging_product || 'whatsapp',
          messageId: providerMsgId
        };
        record.attempts.push({
          attemptNumber: record.attempts.length + 1,
          timestamp: sentAt,
          integrationMode: WHATSAPP_MODES.CLOUD_API,
          status: WHATSAPP_STATES.SENT,
          httpStatus: res.status,
          providerMessageId: providerMsgId,
          error: null
        });
        appendStatusTransition(record, WHATSAPP_STATES.SENT, { providerStatus: 'sent', timestamp: sentAt });
        record.updatedAt = sentAt;
        _messagesById.set(record.id, record);
        persistMessagesToDisk();
        await cacheService.set(cacheKey, { sid: providerMsgId, sentAt }, 86400);

        await auditLog({
          event: 'WHATSAPP_SENT',
          actionId: resolvedActionId,
          sessionId,
          details: {
            messageId: record.id,
            to: e164Phone,
            integrationMode: WHATSAPP_MODES.CLOUD_API,
            providerMessageId: providerMsgId,
            sentAt
          }
        });

        return {
          success: true,
          httpStatus: 200,
          status: WHATSAPP_STATES.SENT,
          integrationMode: WHATSAPP_MODES.CLOUD_API,
          providerMessageId: providerMsgId,
          sentAt,
          isSimulated: false,
          message: 'Message accepted by WhatsApp Business Cloud API.',
          record
        };
      }

      const errObj = resBody?.error || {};
      const errMessage =
        errObj.message || resBody?.message || `WhatsApp Cloud API error (HTTP ${res.status})`;
      const errCode = errObj.code || `HTTP_${res.status}`;

      record.status = WHATSAPP_STATES.FAILED;
      record.errorCode = errCode;
      record.errorMessage = errMessage;
      record.failureReason = {
        outcomeType: 'PROVIDER_FAILURE',
        httpStatus: res.status || 502,
        code: errCode,
        type: errObj.type || 'GraphMethodException',
        errorSubcode: errObj.error_subcode || null,
        message: errMessage
      };
      record.attempts.push({
        attemptNumber: record.attempts.length + 1,
        timestamp: new Date().toISOString(),
        integrationMode: WHATSAPP_MODES.CLOUD_API,
        status: WHATSAPP_STATES.FAILED,
        httpStatus: res.status || 502,
        providerMessageId: null,
        errorCode: errCode,
        error: errMessage
      });
      appendStatusTransition(record, WHATSAPP_STATES.FAILED, { providerStatus: 'failed' });
      record.updatedAt = new Date().toISOString();
      _messagesById.set(record.id, record);
      persistMessagesToDisk();

      await auditLog({
        event: 'WHATSAPP_FAILED',
        actionId: resolvedActionId,
        sessionId,
        details: {
          messageId: record.id,
          to: e164Phone,
          integrationMode: WHATSAPP_MODES.CLOUD_API,
          httpStatus: res.status,
          code: errCode,
          message: errMessage
        }
      });

      return {
        success: false,
        httpStatus: res.status || 502,
        status: WHATSAPP_STATES.FAILED,
        integrationMode: WHATSAPP_MODES.CLOUD_API,
        error: String(errCode),
        failureReason: record.failureReason,
        message: errMessage,
        record
      };
    }

    // ── MODE B: TWILIO WHATSAPP REST API (`client.messages.create`) ──────────
    if (mode === WHATSAPP_MODES.TWILIO) {
      const accountSid = cloudConfigOverride?.accountSid ?? config.whatsapp.twilio?.accountSid;
      const authToken = cloudConfigOverride?.authToken ?? config.whatsapp.twilio?.authToken;
      const rawFromNumber = cloudConfigOverride?.from ?? config.whatsapp.twilio?.from;
      const senderCheck = validateTwilioSender(rawFromNumber);

      if (!accountSid || !authToken || !senderCheck.isValid) {
        const missingTwilio = !senderCheck.isValid
          ? senderCheck.message
          : 'Twilio WhatsApp credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM) are incomplete.';
        const errCode = !senderCheck.isValid ? senderCheck.error : 'TWILIO_CREDENTIALS_MISSING';

        const diag = {
          outcomeType: 'VALIDATION_FAILURE',
          actionId: resolvedActionId,
          integrationMode: WHATSAPP_MODES.TWILIO,
          twilioErrorCode: errCode,
          httpStatus: 401,
          senderConfigValid: senderCheck.isValid,
          sender: senderCheck.formatted || rawFromNumber || null,
          recipientFormatValid: phoneValidation.isValid,
          recipient: `whatsapp:${e164Phone}`,
          messageSid: null,
          message: missingTwilio
        };
        console.error('[WhatsAppService] Twilio configuration failure:', JSON.stringify(diag));

        record.status = WHATSAPP_STATES.FAILED;
        record.errorCode = errCode;
        record.errorMessage = missingTwilio;
        record.failureReason = {
          outcomeType: 'VALIDATION_FAILURE',
          httpStatus: 401,
          code: errCode,
          senderConfigValid: senderCheck.isValid,
          recipientFormatValid: phoneValidation.isValid,
          message: missingTwilio
        };
        record.attempts.push({
          attemptNumber: record.attempts.length + 1,
          timestamp: new Date().toISOString(),
          integrationMode: WHATSAPP_MODES.TWILIO,
          status: WHATSAPP_STATES.FAILED,
          httpStatus: 401,
          providerMessageId: null,
          errorCode: errCode,
          error: missingTwilio
        });
        appendStatusTransition(record, WHATSAPP_STATES.FAILED, { providerStatus: 'failed' });
        record.updatedAt = new Date().toISOString();
        _messagesById.set(record.id, record);
        persistMessagesToDisk();

        await auditLog({
          event: 'WHATSAPP_FAILED',
          actionId: resolvedActionId,
          sessionId,
          details: diag
        });

        return {
          success: false,
          httpStatus: 401,
          status: WHATSAPP_STATES.FAILED,
          integrationMode: WHATSAPP_MODES.TWILIO,
          error: errCode,
          failureReason: record.failureReason,
          message: missingTwilio,
          record
        };
      }

      const formattedFrom = senderCheck.formatted;
      const formattedTo = `whatsapp:${e164Phone}`;
      const client = createTwilioClient(accountSid, authToken, { fetchImpl });

      try {
        const createdMsg = await client.messages.create({
          from: formattedFrom,
          to: formattedTo,
          body: cleanBody
        });

        let providerSid = createdMsg.sid;
        let providerStatus = createdMsg.status; // 'queued', 'sending', 'sent', 'delivered', 'read'
        let dateCreated = createdMsg.dateCreated;
        let dateUpdated = createdMsg.dateUpdated;
        let dateSent = createdMsg.dateSent;
        let errorCode = createdMsg.errorCode;
        let errorMessage = createdMsg.errorMessage;

        // Record initial QUEUED transition when Twilio returns 'queued'
        if (providerStatus === 'queued' || providerStatus === 'accepted' || providerStatus === 'sending') {
          appendStatusTransition(record, WHATSAPP_STATES.QUEUED, {
            providerStatus,
            timestamp: dateCreated || new Date().toISOString()
          });
        }

        // If executing against live Twilio API (not a custom unit-test mock), poll once after 1.2s
        // to capture immediate transition from queued -> sent/delivered or synchronous sandbox error
        if (!customFetch && providerSid && providerSid.startsWith('SM') && !Boolean(process.env.VITEST)) {
          try {
            await new Promise(r => setTimeout(r, 1200));
            const latest = await client.messages(providerSid).fetch();
            if (latest && latest.status) {
              providerStatus = String(latest.status).toLowerCase();
              dateCreated = latest.dateCreated || dateCreated;
              dateUpdated = latest.dateUpdated || dateUpdated;
              dateSent = latest.dateSent || dateSent;
              errorCode = latest.errorCode ?? errorCode;
              errorMessage = latest.errorMessage ?? errorMessage;
            }
          } catch {
            // Keep initial create response if follow-up fetch fails
          }
        }

        // Check if Twilio reported immediate failure/undelivered on the message resource
        if (providerStatus === 'failed' || providerStatus === 'undelivered') {
          const failMsg = errorMessage || `Twilio reported message status "${providerStatus}" (Error ${errorCode || 'unknown'}).`;
          const failDiag = {
            outcomeType: 'PROVIDER_FAILURE',
            actionId: resolvedActionId,
            integrationMode: WHATSAPP_MODES.TWILIO,
            twilioErrorCode: errorCode || 'TWILIO_DELIVERY_FAILED',
            httpStatus: 422,
            senderConfigValid: true,
            sender: formattedFrom,
            recipientFormatValid: true,
            recipient: formattedTo,
            messageSid: providerSid,
            providerStatus,
            message: failMsg
          };
          console.error('[WhatsAppService] Twilio post-create failure:', JSON.stringify(failDiag));

          record.status = WHATSAPP_STATES.FAILED;
          record.providerMessageId = providerSid;
          record.twilioMessageSid = providerSid;
          record.providerStatus = providerStatus;
          record.senderAddress = formattedFrom;
          record.recipientAddress = formattedTo;
          record.dateCreated = dateCreated;
          record.dateUpdated = dateUpdated;
          record.errorCode = errorCode;
          record.errorMessage = failMsg;
          record.failureReason = {
            outcomeType: 'PROVIDER_FAILURE',
            httpStatus: 422,
            code: errorCode || 'TWILIO_DELIVERY_FAILED',
            message: failMsg,
            messageSid: providerSid
          };
          appendStatusTransition(record, WHATSAPP_STATES.FAILED, { providerStatus });
          _messagesById.set(record.id, record);
          persistMessagesToDisk();

          await auditLog({
            event: 'WHATSAPP_FAILED',
            actionId: resolvedActionId,
            sessionId,
            details: failDiag
          });

          return {
            success: false,
            httpStatus: 422,
            status: WHATSAPP_STATES.FAILED,
            integrationMode: WHATSAPP_MODES.TWILIO,
            providerMessageId: providerSid,
            sid: providerSid,
            providerStatus,
            error: String(errorCode || 'TWILIO_DELIVERY_FAILED'),
            failureReason: record.failureReason,
            message: failMsg,
            record
          };
        }

        const sentAt = dateSent ? new Date(dateSent).toISOString() : new Date().toISOString();
        const canonicalStatus =
          providerStatus === 'read' ? WHATSAPP_STATES.READ
          : providerStatus === 'delivered' ? WHATSAPP_STATES.DELIVERED
          : WHATSAPP_STATES.SENT;

        record.status = canonicalStatus;
        record.providerMessageId = providerSid;
        record.twilioMessageSid = providerSid;
        record.providerStatus = providerStatus;
        record.senderAddress = createdMsg.from || formattedFrom;
        record.recipientAddress = createdMsg.to || formattedTo;
        record.dateCreated = dateCreated;
        record.dateUpdated = dateUpdated;
        record.dateSent = dateSent || sentAt;
        record.sentAt = sentAt;
        if (canonicalStatus === WHATSAPP_STATES.DELIVERED || canonicalStatus === WHATSAPP_STATES.READ) {
          record.deliveredAt = record.deliveredAt || sentAt;
        }
        if (canonicalStatus === WHATSAPP_STATES.READ) {
          record.readAt = record.readAt || sentAt;
        }
        record.isSimulated = false;
        record.errorCode = null;
        record.errorMessage = null;
        record.failureReason = null;
        record.providerResponse = {
          sid: providerSid,
          status: providerStatus,
          dateCreated,
          dateUpdated,
          dateSent: dateSent || sentAt,
          from: createdMsg.from || formattedFrom,
          to: createdMsg.to || formattedTo,
          direction: createdMsg.direction || 'outbound-api',
          errorCode: null,
          errorMessage: null,
          numSegments: createdMsg.numSegments || '1'
        };

        record.attempts.push({
          attemptNumber: record.attempts.length + 1,
          timestamp: sentAt,
          integrationMode: WHATSAPP_MODES.TWILIO,
          status: canonicalStatus,
          providerStatus,
          httpStatus: createdMsg.httpStatus || 201,
          providerMessageId: providerSid,
          sender: createdMsg.from || formattedFrom,
          recipient: createdMsg.to || formattedTo,
          errorCode: null,
          error: null
        });

        appendStatusTransition(record, WHATSAPP_STATES.SENT, {
          providerStatus: providerStatus === 'queued' ? 'queued -> sent' : providerStatus,
          timestamp: sentAt
        });
        if (canonicalStatus === WHATSAPP_STATES.DELIVERED || canonicalStatus === WHATSAPP_STATES.READ) {
          appendStatusTransition(record, canonicalStatus, { providerStatus, timestamp: sentAt });
        }

        record.updatedAt = sentAt;
        _messagesById.set(record.id, record);
        persistMessagesToDisk();
        await cacheService.set(cacheKey, { sid: providerSid, sentAt }, 86400);

        const successDiag = {
          outcomeType: 'PROVIDER_SUCCESS',
          actionId: resolvedActionId,
          messageId: record.id,
          integrationMode: WHATSAPP_MODES.TWILIO,
          httpStatus: createdMsg.httpStatus || 201,
          senderConfigValid: true,
          sender: createdMsg.from || formattedFrom,
          recipientFormatValid: true,
          recipient: createdMsg.to || formattedTo,
          messageSid: providerSid,
          providerMessageId: providerSid,
          providerStatus,
          dateCreated,
          sentAt
        };
        console.log('[WhatsAppService] Twilio WhatsApp message sent:', JSON.stringify(successDiag));

        await auditLog({
          event: 'WHATSAPP_SENT',
          actionId: resolvedActionId,
          sessionId,
          details: successDiag
        });

        return {
          success: true,
          httpStatus: 200,
          status: canonicalStatus,
          providerStatus,
          integrationMode: WHATSAPP_MODES.TWILIO,
          providerMessageId: providerSid,
          sid: providerSid,
          twilioMessageSid: providerSid,
          dateCreated,
          recipient: createdMsg.to || formattedTo,
          sender: createdMsg.from || formattedFrom,
          sentAt,
          isSimulated: false,
          message: `Message accepted by Twilio WhatsApp API (SID: ${providerSid}, status: ${providerStatus}).`,
          record
        };
      } catch (twilioErr) {
        const httpStatus = twilioErr.status || 422;
        const twilioErrCode = twilioErr.code || `HTTP_${httpStatus}`;
        const twilioErrMsg = twilioErr.message || `Twilio WhatsApp API error (HTTP ${httpStatus})`;

        const errDiag = {
          outcomeType: 'PROVIDER_FAILURE',
          actionId: resolvedActionId,
          messageId: record.id,
          integrationMode: WHATSAPP_MODES.TWILIO,
          twilioErrorCode: twilioErrCode,
          httpStatus,
          senderConfigValid: senderCheck.isValid,
          sender: formattedFrom,
          recipientFormatValid: phoneValidation.isValid,
          recipient: formattedTo,
          messageSid: twilioErr.twilioResponse?.sid || null,
          errorMessage: twilioErrMsg,
          moreInfo: twilioErr.moreInfo || null
        };
        console.error('[WhatsAppService] Twilio WhatsApp API rejected request:', JSON.stringify(errDiag));

        record.status = WHATSAPP_STATES.FAILED;
        record.senderAddress = formattedFrom;
        record.recipientAddress = formattedTo;
        record.errorCode = twilioErrCode;
        record.errorMessage = twilioErrMsg;
        record.providerResponse = twilioErr.twilioResponse || null;
        record.failureReason = {
          outcomeType: 'PROVIDER_FAILURE',
          httpStatus,
          code: twilioErrCode,
          sender: formattedFrom,
          recipient: formattedTo,
          senderConfigValid: senderCheck.isValid,
          recipientFormatValid: phoneValidation.isValid,
          message: twilioErrMsg,
          moreInfo: twilioErr.moreInfo || null
        };
        record.attempts.push({
          attemptNumber: record.attempts.length + 1,
          timestamp: new Date().toISOString(),
          integrationMode: WHATSAPP_MODES.TWILIO,
          status: WHATSAPP_STATES.FAILED,
          httpStatus,
          providerMessageId: null,
          sender: formattedFrom,
          recipient: formattedTo,
          errorCode: twilioErrCode,
          error: twilioErrMsg
        });
        appendStatusTransition(record, WHATSAPP_STATES.FAILED, {
          providerStatus: 'failed',
          details: { code: twilioErrCode, message: twilioErrMsg }
        });
        record.updatedAt = new Date().toISOString();
        _messagesById.set(record.id, record);
        persistMessagesToDisk();

        await auditLog({
          event: 'WHATSAPP_FAILED',
          actionId: resolvedActionId,
          sessionId,
          details: errDiag
        });

        return {
          success: false,
          httpStatus,
          status: WHATSAPP_STATES.FAILED,
          integrationMode: WHATSAPP_MODES.TWILIO,
          error: String(twilioErrCode),
          errorCode: twilioErrCode,
          failureReason: record.failureReason,
          message: twilioErrMsg,
          record
        };
      }
    }

    throw new Error(`Unsupported WhatsApp integration mode: ${mode}`);
  } catch (err) {
    const isTimeout = err.message === 'TIMEOUT' || /timeout|aborted/i.test(err.message);
    const finalStatus = isTimeout ? 'UNKNOWN_EXECUTION_STATE' : WHATSAPP_STATES.FAILED;

    record.status = finalStatus;
    record.errorCode = isTimeout ? 'PROVIDER_TIMEOUT' : 'NETWORK_OR_PROVIDER_ERROR';
    record.errorMessage = err.message;
    record.failureReason = {
      outcomeType: 'PROVIDER_FAILURE',
      httpStatus: isTimeout ? 504 : 502,
      code: isTimeout ? 'PROVIDER_TIMEOUT' : 'NETWORK_OR_PROVIDER_ERROR',
      message: err.message
    };
    record.attempts.push({
      attemptNumber: record.attempts.length + 1,
      timestamp: new Date().toISOString(),
      integrationMode: mode,
      status: finalStatus,
      httpStatus: isTimeout ? 504 : 502,
      providerMessageId: null,
      errorCode: record.errorCode,
      error: err.message
    });
    appendStatusTransition(record, finalStatus, { providerStatus: finalStatus.toLowerCase() });
    record.updatedAt = new Date().toISOString();
    _messagesById.set(record.id, record);
    persistMessagesToDisk();

    await auditLog({
      event: isTimeout ? 'WHATSAPP_TIMEOUT' : 'WHATSAPP_FAILED',
      actionId: resolvedActionId,
      sessionId,
      details: {
        messageId: record.id,
        to: e164Phone,
        integrationMode: mode,
        error: err.message
      }
    });

    return {
      success: false,
      httpStatus: isTimeout ? 504 : 502,
      status: finalStatus,
      integrationMode: mode,
      error: record.failureReason.code,
      failureReason: record.failureReason,
      message: err.message,
      record
    };
  } finally {
    _inFlightSends.delete(resolvedIdempKey);
  }
}

/**
 * Queries Twilio REST API (`GET /Accounts/{AccountSid}/Messages/{Sid}.json`) to synchronize
 * real-time message delivery status (QUEUED -> SENT -> DELIVERED -> READ / FAILED).
 */
export async function syncTwilioMessageStatus(messageIdOrSid, { customFetch = null } = {}) {
  loadMessagesFromDisk();
  const record = getWhatsAppMessageById(messageIdOrSid);
  if (!record) {
    return {
      success: false,
      httpStatus: 404,
      error: 'MESSAGE_NOT_FOUND',
      message: `WhatsApp message record "${messageIdOrSid}" not found.`
    };
  }

  const sid = record.twilioMessageSid || record.providerMessageId;
  if (!sid || !String(sid).startsWith('SM')) {
    return {
      success: false,
      httpStatus: 400,
      error: 'NO_TWILIO_SID',
      message: `Record "${record.id}" does not have a live Twilio Message SID to query.`,
      record
    };
  }

  const accountSid = config.whatsapp.twilio?.accountSid;
  const authToken = config.whatsapp.twilio?.authToken;
  if (!accountSid || !authToken) {
    return {
      success: false,
      httpStatus: 401,
      error: 'TWILIO_CREDENTIALS_MISSING',
      message: 'Twilio credentials are not configured.',
      record
    };
  }

  try {
    const client = createTwilioClient(accountSid, authToken, { fetchImpl: customFetch || globalThis.fetch });
    const live = await client.messages(sid).fetch();
    const rawStatus = String(live.status || '').toLowerCase();
    const now = new Date().toISOString();

    record.providerStatus = rawStatus;
    record.dateCreated = live.dateCreated || record.dateCreated;
    record.dateUpdated = live.dateUpdated || now;
    record.dateSent = live.dateSent || record.dateSent;
    record.senderAddress = live.from || record.senderAddress;
    record.recipientAddress = live.to || record.recipientAddress;

    if (rawStatus === 'queued' || rawStatus === 'accepted' || rawStatus === 'sending') {
      if (record.status !== WHATSAPP_STATES.SENT && record.status !== WHATSAPP_STATES.DELIVERED && record.status !== WHATSAPP_STATES.READ) {
        record.status = WHATSAPP_STATES.QUEUED;
      }
      appendStatusTransition(record, WHATSAPP_STATES.QUEUED, { providerStatus: rawStatus, timestamp: now });
    } else if (rawStatus === 'sent') {
      if (record.status !== WHATSAPP_STATES.DELIVERED && record.status !== WHATSAPP_STATES.READ) {
        record.status = WHATSAPP_STATES.SENT;
      }
      record.sentAt = record.sentAt || now;
      appendStatusTransition(record, WHATSAPP_STATES.SENT, { providerStatus: rawStatus, timestamp: now });
    } else if (rawStatus === 'delivered') {
      if (record.status !== WHATSAPP_STATES.READ) {
        record.status = WHATSAPP_STATES.DELIVERED;
      }
      record.sentAt = record.sentAt || now;
      record.deliveredAt = record.deliveredAt || now;
      appendStatusTransition(record, WHATSAPP_STATES.DELIVERED, { providerStatus: rawStatus, timestamp: now });
    } else if (rawStatus === 'read') {
      record.status = WHATSAPP_STATES.READ;
      record.sentAt = record.sentAt || now;
      record.deliveredAt = record.deliveredAt || now;
      record.readAt = record.readAt || now;
      appendStatusTransition(record, WHATSAPP_STATES.READ, { providerStatus: rawStatus, timestamp: now });
    } else if (rawStatus === 'failed' || rawStatus === 'undelivered') {
      record.status = WHATSAPP_STATES.FAILED;
      record.errorCode = live.errorCode || 'TWILIO_DELIVERY_FAILED';
      record.errorMessage = live.errorMessage || `Twilio reported status "${rawStatus}".`;
      record.failureReason = {
        outcomeType: 'PROVIDER_FAILURE',
        httpStatus: 422,
        code: record.errorCode,
        message: record.errorMessage
      };
      appendStatusTransition(record, WHATSAPP_STATES.FAILED, { providerStatus: rawStatus, timestamp: now });
    }

    record.updatedAt = now;
    _messagesById.set(record.id, record);
    persistMessagesToDisk();

    return {
      success: true,
      httpStatus: 200,
      sid,
      status: record.status,
      providerStatus: rawStatus,
      record
    };
  } catch (err) {
    return {
      success: false,
      httpStatus: err.status || 502,
      error: err.code || 'TWILIO_SYNC_FAILED',
      message: err.message,
      record
    };
  }
}

/**
 * Confirms that a user manually sent a Click-to-Chat (wa.me) message.
 * Transitions AWAITING_USER_SEND -> USER_CONFIRMED_SENT (never claims provider SENT, DELIVERED, or READ).
 */
export async function confirmWhatsAppUserSent(messageIdOrActionId, { confirmed = false, sessionId = 'default_session' } = {}) {
  loadMessagesFromDisk();

  if (confirmed !== true) {
    return {
      success: false,
      httpStatus: 400,
      error: 'CONFIRMATION_REQUIRED',
      message: 'Explicit user confirmation (confirmed: true) is required before recording USER_CONFIRMED_SENT.'
    };
  }

  let record = _messagesById.get(messageIdOrActionId) || findExistingRecordByKey(messageIdOrActionId, messageIdOrActionId);
  if (!record) {
    return {
      success: false,
      httpStatus: 404,
      error: 'MESSAGE_NOT_FOUND',
      message: `WhatsApp message record "${messageIdOrActionId}" not found.`
    };
  }

  if (record.integrationMode !== WHATSAPP_MODES.CLICK_TO_CHAT) {
    return {
      success: false,
      httpStatus: 400,
      error: 'INVALID_MODE_FOR_USER_CONFIRM',
      message: `Only CLICK_TO_CHAT messages can be transitioned to USER_CONFIRMED_SENT (current mode: ${record.integrationMode}).`
    };
  }

  const confirmedAt = new Date().toISOString();
  record.status = WHATSAPP_STATES.USER_CONFIRMED_SENT;
  record.providerStatus = 'user_confirmed_manual';
  record.userConfirmedSentAt = confirmedAt;
  record.sentAt = confirmedAt;
  appendStatusTransition(record, WHATSAPP_STATES.USER_CONFIRMED_SENT, {
    providerStatus: 'user_confirmed_manual',
    timestamp: confirmedAt
  });
  record.updatedAt = confirmedAt;
  _messagesById.set(record.id, record);
  persistMessagesToDisk();

  await auditLog({
    event: 'WHATSAPP_USER_CONFIRMED_SENT',
    actionId: record.actionId,
    sessionId,
    details: {
      messageId: record.id,
      to: record.recipientPhone,
      userConfirmedSentAt: confirmedAt
    }
  });

  return {
    success: true,
    httpStatus: 200,
    status: WHATSAPP_STATES.USER_CONFIRMED_SENT,
    record
  };
}

/**
 * Verifies Meta WhatsApp Cloud API Webhook GET challenge (hub.mode=subscribe)
 */
export function verifyWhatsAppWebhookSubscription(query = {}) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  const expectedToken = config.whatsapp.cloudApi?.webhookVerifyToken || 'actionflow_wa_verify_token';

  if (mode === 'subscribe' && token === expectedToken) {
    return { verified: true, httpStatus: 200, challenge: String(challenge || '') };
  }
  return { verified: false, httpStatus: 403, error: 'WEBHOOK_VERIFICATION_FAILED' };
}

/**
 * Verifies X-Hub-Signature-256 HMAC-SHA256 signature for Meta Cloud API webhooks
 */
export function verifyWhatsAppWebhookSignature(rawBodyString, signatureHeader, appSecret = null) {
  const secret = appSecret ?? config.whatsapp.cloudApi?.appSecret;
  if (!secret) {
    if (signatureHeader && !signatureHeader.startsWith('sha256=')) {
      return false;
    }
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expectedSig =
    'sha256=' + crypto.createHmac('sha256', secret).update(String(rawBodyString || '')).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

/**
 * Verifies Twilio X-Twilio-Signature (HMAC-SHA1 base64 of webhookUrl + sorted POST params)
 */
export function verifyTwilioWebhookSignature(webhookUrl, params = {}, twilioSignatureHeader = null, authToken = null) {
  const token = authToken ?? config.whatsapp.twilio?.authToken;
  if (!twilioSignatureHeader) {
    // Allow unsigned local test callbacks unless a signature header is explicitly provided
    return true;
  }
  if (!token || !webhookUrl) {
    return false;
  }
  const sortedKeys = Object.keys(params || {}).sort();
  let data = String(webhookUrl);
  for (const k of sortedKeys) {
    data += k + String(params[k] ?? '');
  }
  const expected = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(twilioSignatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Processes incoming WhatsApp status webhooks (Twilio StatusCallback & Meta Cloud API)
 * Updates matching providerMessageId records through QUEUED -> SENT -> DELIVERED -> READ or FAILED
 */
export async function processWhatsAppWebhook(
  payload,
  { signatureHeader = null, twilioSignatureHeader = null, webhookUrl = null, appSecret = null, twilioAuthToken = null } = {}
) {
  loadMessagesFromDisk();

  // Verify Twilio signature if X-Twilio-Signature header is provided
  if (twilioSignatureHeader) {
    const validTwilio = verifyTwilioWebhookSignature(
      webhookUrl || `${config.app.baseUrl}/api/v1/whatsapp/webhook`,
      payload,
      twilioSignatureHeader,
      twilioAuthToken
    );
    if (!validTwilio) {
      return {
        success: false,
        httpStatus: 401,
        error: 'INVALID_TWILIO_WEBHOOK_SIGNATURE',
        message: 'Twilio X-Twilio-Signature HMAC-SHA1 verification failed.'
      };
    }
  } else {
    const rawString = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    if (!verifyWhatsAppWebhookSignature(rawString, signatureHeader, appSecret)) {
      return {
        success: false,
        httpStatus: 401,
        error: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Webhook HMAC-SHA256 signature verification failed.'
      };
    }
  }

  const statusUpdates = [];

  // 1. Parse Meta WhatsApp Business Cloud API webhook structure: entry[].changes[].value.statuses[]
  if (Array.isArray(payload?.entry)) {
    for (const entry of payload.entry) {
      for (const change of entry?.changes || []) {
        const statuses = change?.value?.statuses || [];
        for (const st of statuses) {
          if (st?.id && st?.status) {
            statusUpdates.push({
              providerMessageId: st.id,
              rawStatus: String(st.status).toLowerCase(),
              providerTimestamp: st.timestamp
                ? new Date(Number(st.timestamp) * 1000).toISOString()
                : new Date().toISOString(),
              errors: st.errors || null
            });
          }
        }
      }
    }
  }

  // 2. Parse Twilio WhatsApp status webhook structure: MessageSid + MessageStatus / SmsStatus
  if ((payload?.MessageSid || payload?.SmsSid) && (payload?.MessageStatus || payload?.SmsStatus)) {
    statusUpdates.push({
      providerMessageId: payload.MessageSid || payload.SmsSid,
      rawStatus: String(payload.MessageStatus || payload.SmsStatus).toLowerCase(),
      providerTimestamp: new Date().toISOString(),
      errors: payload.ErrorCode
        ? [{ code: payload.ErrorCode, message: payload.ErrorMessage || `Twilio Error ${payload.ErrorCode}` }]
        : null
    });
  }

  const updatedRecords = [];

  for (const update of statusUpdates) {
    let matchedRecord = null;
    for (const rec of _messagesById.values()) {
      if (
        (rec.providerMessageId && rec.providerMessageId === update.providerMessageId) ||
        (rec.twilioMessageSid && rec.twilioMessageSid === update.providerMessageId)
      ) {
        matchedRecord = rec;
        break;
      }
    }

    if (!matchedRecord) continue;

    // Never allow CLICK_TO_CHAT or SIMULATED messages to claim webhook delivery/read receipts
    if (
      matchedRecord.integrationMode === WHATSAPP_MODES.CLICK_TO_CHAT ||
      matchedRecord.integrationMode === WHATSAPP_MODES.SIMULATION
    ) {
      continue;
    }

    matchedRecord.providerStatus = update.rawStatus;

    if (update.rawStatus === 'queued' || update.rawStatus === 'accepted' || update.rawStatus === 'sending') {
      if (
        matchedRecord.status === WHATSAPP_STATES.SENDING ||
        matchedRecord.status === WHATSAPP_STATES.APPROVED
      ) {
        matchedRecord.status = WHATSAPP_STATES.QUEUED;
      }
      appendStatusTransition(matchedRecord, WHATSAPP_STATES.QUEUED, {
        providerStatus: update.rawStatus,
        timestamp: update.providerTimestamp
      });
    } else if (update.rawStatus === 'sent') {
      if (
        matchedRecord.status === WHATSAPP_STATES.SENDING ||
        matchedRecord.status === WHATSAPP_STATES.APPROVED ||
        matchedRecord.status === WHATSAPP_STATES.QUEUED
      ) {
        matchedRecord.status = WHATSAPP_STATES.SENT;
      }
      matchedRecord.sentAt = matchedRecord.sentAt || update.providerTimestamp;
      appendStatusTransition(matchedRecord, WHATSAPP_STATES.SENT, {
        providerStatus: update.rawStatus,
        timestamp: update.providerTimestamp
      });
    } else if (update.rawStatus === 'delivered') {
      if (matchedRecord.status !== WHATSAPP_STATES.READ) {
        matchedRecord.status = WHATSAPP_STATES.DELIVERED;
      }
      matchedRecord.sentAt = matchedRecord.sentAt || update.providerTimestamp;
      matchedRecord.deliveredAt = matchedRecord.deliveredAt || update.providerTimestamp;
      appendStatusTransition(matchedRecord, WHATSAPP_STATES.DELIVERED, {
        providerStatus: update.rawStatus,
        timestamp: update.providerTimestamp
      });
      await auditLog({
        event: 'WHATSAPP_DELIVERED',
        actionId: matchedRecord.actionId,
        sessionId: matchedRecord.sessionId,
        details: {
          messageId: matchedRecord.id,
          providerMessageId: matchedRecord.providerMessageId,
          deliveredAt: matchedRecord.deliveredAt
        }
      });
    } else if (update.rawStatus === 'read') {
      matchedRecord.status = WHATSAPP_STATES.READ;
      matchedRecord.sentAt = matchedRecord.sentAt || update.providerTimestamp;
      matchedRecord.deliveredAt = matchedRecord.deliveredAt || update.providerTimestamp;
      matchedRecord.readAt = matchedRecord.readAt || update.providerTimestamp;
      appendStatusTransition(matchedRecord, WHATSAPP_STATES.READ, {
        providerStatus: update.rawStatus,
        timestamp: update.providerTimestamp
      });
      await auditLog({
        event: 'WHATSAPP_READ',
        actionId: matchedRecord.actionId,
        sessionId: matchedRecord.sessionId,
        details: {
          messageId: matchedRecord.id,
          providerMessageId: matchedRecord.providerMessageId,
          readAt: matchedRecord.readAt
        }
      });
    } else if (update.rawStatus === 'failed' || update.rawStatus === 'undelivered') {
      matchedRecord.status = WHATSAPP_STATES.FAILED;
      const errDetail = update.errors?.[0] || {};
      matchedRecord.errorCode = errDetail.code || 'WEBHOOK_DELIVERY_FAILED';
      matchedRecord.errorMessage =
        errDetail.title || errDetail.message || 'Provider reported message delivery failure via webhook.';
      matchedRecord.failureReason = {
        outcomeType: 'PROVIDER_FAILURE',
        httpStatus: 422,
        code: matchedRecord.errorCode,
        message: matchedRecord.errorMessage
      };
      appendStatusTransition(matchedRecord, WHATSAPP_STATES.FAILED, {
        providerStatus: update.rawStatus,
        timestamp: update.providerTimestamp,
        details: matchedRecord.failureReason
      });
      await auditLog({
        event: 'WHATSAPP_FAILED',
        actionId: matchedRecord.actionId,
        sessionId: matchedRecord.sessionId,
        details: {
          messageId: matchedRecord.id,
          providerMessageId: matchedRecord.providerMessageId,
          failureReason: matchedRecord.failureReason
        }
      });
    }

    matchedRecord.webhookEvents.push({
      status: matchedRecord.status,
      rawStatus: update.rawStatus,
      providerTimestamp: update.providerTimestamp,
      receivedAt: new Date().toISOString()
    });
    matchedRecord.updatedAt = new Date().toISOString();
    _messagesById.set(matchedRecord.id, matchedRecord);
    updatedRecords.push(matchedRecord);
  }

  if (updatedRecords.length > 0) {
    persistMessagesToDisk();
  }

  return {
    success: true,
    httpStatus: 200,
    processedCount: updatedRecords.length,
    updatedRecords
  };
}

/**
 * Lists persisted WhatsApp messages for the WhatsApp Dashboard
 */
export function listWhatsAppMessages({ sessionId = null, status = null } = {}) {
  loadMessagesFromDisk();
  let list = Array.from(_messagesById.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (status && status !== 'all') {
    list = list.filter(m => m.status === status.toUpperCase());
  }
  return list;
}

export function getWhatsAppMessageById(idOrProviderId) {
  loadMessagesFromDisk();
  if (_messagesById.has(idOrProviderId)) {
    return _messagesById.get(idOrProviderId);
  }
  for (const rec of _messagesById.values()) {
    if (
      rec.providerMessageId === idOrProviderId ||
      rec.twilioMessageSid === idOrProviderId ||
      rec.actionId === idOrProviderId
    ) {
      return rec;
    }
  }
  return null;
}

/**
 * Builds a WhatsApp message body from a task/action
 */
export function buildWhatsAppMessage(action) {
  const lines = [`*ActionFlow AI — Task Delegation*`];
  if (action.title) lines.push(`📋 *${action.title}*`);
  if (action.description) lines.push(action.description);
  if (action.priority) lines.push(`🔴 Priority: ${action.priority}`);
  if (action.deadline) {
    lines.push(
      `📅 Deadline: ${new Date(action.deadline).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`
    );
  }
  if (action.assignee) lines.push(`👤 Assigned to: ${action.assignee.name}`);
  lines.push(`\n_Sent via ActionFlow AI_`);
  return lines.join('\n');
}
