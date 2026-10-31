import { useState, useEffect, useCallback, useId } from 'react';
import {
  MessageSquare, User, Phone, Check, Copy, ExternalLink,
  Sparkles, AlertCircle, RefreshCw, Send, CheckCheck,
  ShieldAlert, Clock, Activity
} from 'lucide-react';
import { apiFetch } from '../config/apiConfig.js';

export const COUNTRY_CODES = [
  { code: '+91', country: 'India', flag: '🇮🇳' },
  { code: '+1', country: 'USA / Canada', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+971', country: 'UAE', flag: '🇦🇪' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+49', country: 'Germany', flag: '🇩🇪' },
  { code: '+65', country: 'Singapore', flag: '🇸🇬' },
  { code: '+33', country: 'France', flag: '🇫🇷' },
  { code: '+81', country: 'Japan', flag: '🇯🇵' },
  { code: '+966', country: 'Saudi Arabia', flag: '🇸🇦' }
];

const STATUS_BADGE_STYLES = {
  QUEUED: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  SENT: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  DELIVERED: 'bg-teal-100 text-teal-900 border-teal-300',
  READ: 'bg-blue-100 text-blue-900 border-blue-300',
  AWAITING_USER_SEND: 'bg-amber-100 text-amber-900 border-amber-300',
  USER_CONFIRMED_SENT: 'bg-sky-100 text-sky-900 border-sky-300',
  SIMULATED: 'bg-purple-100 text-purple-900 border-purple-300',
  FAILED: 'bg-rose-100 text-rose-800 border-rose-300',
  SENDING: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  PENDING_APPROVAL: 'bg-slate-100 text-slate-700 border-slate-300',
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-300'
};

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return iso;
  }
}

export default function WhatsAppComposer({
  action,
  directory = [],
  onUpdateAction,
  onSend,
  isSubmitting = false
}) {
  const methodId = useId();
  const contactSelectId = useId();
  const countryCodeId = useId();
  const phoneInputId = useId();
  const recipientNameId = useId();
  const toneSelectId = useId();
  const messageInputId = useId();
  const modeSelectId = useId();

  const initialPhone = action.recipientPhone || action.recipient?.phone || '';
  const initialName = action.recipientName || action.recipient?.name || '';
  const hasMatchedContact = directory.some(
    d => d.name === initialName || (initialPhone && d.phone === initialPhone)
  );

  const [method, setMethod] = useState(
    hasMatchedContact ? 'contact' : initialPhone ? 'manual' : 'contact'
  );
  const [selectedContactId, setSelectedContactId] = useState(
    directory.find(d => d.name === initialName || (initialPhone && d.phone === initialPhone))?.id || ''
  );

  const [countryCode, setCountryCode] = useState('+91');
  const [localNumber, setLocalNumber] = useState(initialPhone.replace(/^\+\d{1,4}/, '') || '');
  const [manualName, setManualName] = useState(initialName || '');

  // Never fabricate a message body if none was spoken
  const [message, setMessage] = useState(action.whatsappMessage || '');
  const [tone, setTone] = useState(action.tone || 'standard');
  const [copied, setCopied] = useState(false);

  // Integration Mode & Persistent Message Status Tracker state
  const [integrationMode, setIntegrationMode] = useState(action.integrationMode || '');
  const [integrationInfo, setIntegrationInfo] = useState(null);
  const [trackedMessages, setTrackedMessages] = useState([]);
  const [loadingTracker, setLoadingTracker] = useState(false);
  const [lastExecutionRecord, setLastExecutionRecord] = useState(null);
  const [executionError, setExecutionError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [showTracker, setShowTracker] = useState(true);

  const fetchTrackerAndStatus = useCallback(async () => {
    setLoadingTracker(true);
    try {
      const [statusRes, msgsRes] = await Promise.all([
        apiFetch('/api/v1/whatsapp/status'),
        apiFetch('/api/v1/whatsapp/messages?sync=true')
      ]);
      if (statusRes.ok) {
        const sData = await statusRes.json();
        setIntegrationInfo(sData.whatsapp || null);
        if (!integrationMode && sData.whatsapp?.effectiveMode) {
          setIntegrationMode(sData.whatsapp.effectiveMode);
        }
      }
      if (msgsRes.ok) {
        const mData = await msgsRes.json();
        const list = Array.isArray(mData.messages) ? mData.messages : [];
        setTrackedMessages(list);
        const matching = list.find(m => m.actionId === action.id);
        if (matching) {
          setLastExecutionRecord(matching);
        }
      }
    } catch {
      // Non-blocking
    } finally {
      setLoadingTracker(false);
    }
  }, [action.id, integrationMode]);

  useEffect(() => {
    fetchTrackerAndStatus();
  }, [fetchTrackerAndStatus]);

  // International E.164 Normalization (strip accidental trunk '0' on 10-digit Indian numbers)
  const rawDigits = localNumber.replace(/\D/g, '');
  const cleanDigits = countryCode === '+91'
    ? rawDigits.replace(/^0+(?=[6-9]\d{9}$)/, '')
    : rawDigits.replace(/^0+/, '');
  const normalizedPhone =
    method === 'contact'
      ? directory.find(d => d.id === selectedContactId)?.phone || initialPhone || ''
      : cleanDigits
        ? `${countryCode}${cleanDigits}`
        : '';

  const activeRecipientName =
    method === 'contact'
      ? directory.find(d => d.id === selectedContactId)?.name || initialName || 'Recipient'
      : manualName || 'Recipient';

  const isValidPhone = /^\+[1-9]\d{9,14}$/.test(normalizedPhone);
  const hasMessageBody = message.trim().length > 0;

  // Sync changes up to parent action
  const handleMessageChange = (newMsg) => {
    setMessage(newMsg);
    onUpdateAction?.({
      ...action,
      whatsappMessage: newMsg,
      recipientName: activeRecipientName,
      recipientPhone: normalizedPhone,
      integrationMode: integrationMode || undefined
    });
  };

  const handleContactSelect = (contactId) => {
    setSelectedContactId(contactId);
    const contact = directory.find(d => d.id === contactId);
    if (contact) {
      const updatedPhone = contact.phone || '';
      onUpdateAction?.({
        ...action,
        recipient: {
          id: contact.id,
          name: contact.name,
          phone: updatedPhone,
          verifiedContact: Boolean(updatedPhone)
        },
        recipientName: contact.name,
        recipientPhone: updatedPhone
      });
    }
  };

  // Explicit user-selected tone transformation (never triggered automatically)
  const applyTone = (selectedTone) => {
    setTone(selectedTone);
    if (!message.trim()) return;
    const firstName = activeRecipientName.split(' ')[0] || 'there';
    const coreIntent =
      action.messageIntent ||
      message.replace(/^(?:Hi|Dear|Hey)\s+[^,]+,\s*/i, '').replace(/^[.\s]+/, '') ||
      message.trim();

    let formatted = message;
    switch (selectedTone) {
      case 'polite':
        formatted = `Dear ${firstName}, ${coreIntent} Thank you!`;
        break;
      case 'urgent':
        formatted = `Hi ${firstName}, urgent update: ${coreIntent}`;
        break;
      case 'casual':
        formatted = `Hey ${firstName}, ${coreIntent}`;
        break;
      case 'standard':
      default:
        formatted = coreIntent;
    }
    handleMessageChange(formatted);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // WhatsApp wa.me manual handoff URL
  const waHandoffUrl =
    isValidPhone && hasMessageBody
      ? `https://wa.me/${normalizedPhone.replace('+', '')}?text=${encodeURIComponent(message.trim())}`
      : null;

  // Execute via selected mode
  const handleExecuteSend = async (overrideMode = null) => {
    setExecutionError(null);
    const modeToUse = overrideMode || integrationMode || integrationInfo?.effectiveMode || 'CLICK_TO_CHAT';
    const payload = {
      ...action,
      whatsappMessage: message.trim(),
      recipientPhone: normalizedPhone,
      recipientName: activeRecipientName,
      integrationMode: modeToUse,
      allowRetry: lastExecutionRecord?.status === 'FAILED'
    };

    if (onSend) {
      const res = await onSend(payload);
      const record = res?.result?.record || res?.record || null;
      if (record) {
        setLastExecutionRecord(record);
      }
      if (res?.status === 'FAILED' || res?.success === false) {
        setExecutionError(res?.error || res?.message || res?.result?.message || 'WhatsApp execution failed.');
      }
      await fetchTrackerAndStatus();
      return res;
    }
    return null;
  };

  // Click-to-Chat handoff handler: records AWAITING_USER_SEND (never auto-marks SENT)
  const handleOpenClickToChat = async () => {
    if (!waHandoffUrl) return;
    window.open(waHandoffUrl, '_blank', 'noopener,noreferrer');
    await handleExecuteSend('CLICK_TO_CHAT');
  };

  // Confirm user manually sent the Click-to-Chat message in WhatsApp
  const handleConfirmUserSent = async (recordId) => {
    if (!recordId) return;
    setConfirmingId(recordId);
    try {
      const res = await apiFetch(`/api/v1/whatsapp/messages/${encodeURIComponent(recordId)}/confirm-user-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true })
      });
      const data = await res.json();
      if (data.record) {
        setLastExecutionRecord(data.record);
      }
      await fetchTrackerAndStatus();
    } catch (err) {
      setExecutionError(err.message);
    } finally {
      setConfirmingId(null);
    }
  };

  const currentStatus =
    lastExecutionRecord?.status ||
    action.whatsappStatus ||
    action.status ||
    'PENDING_APPROVAL';

  return (
    <div className="mt-3 p-3.5 bg-gradient-to-b from-emerald-50/80 to-teal-50/40 border border-emerald-200 rounded-xl space-y-3.5 text-xs">
      {/* Header with Title, Integration Mode Selector & Method Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-emerald-200/60">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-emerald-950 font-bold">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span>WhatsApp Execution & Status Pipeline</span>
          </div>
          {integrationInfo && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-emerald-300 text-emerald-800 font-mono">
              Mode: {integrationMode || integrationInfo.effectiveMode}
            </span>
          )}
        </div>

        {/* Method Toggle: Contact Selection vs Manual Phone Input */}
        <div className="flex items-center gap-1 bg-emerald-100/70 p-0.5 rounded-lg w-fit">
          <label htmlFor={methodId} className="sr-only">Recipient selection method</label>
          <select
            id={methodId}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="sr-only"
          >
            <option value="contact">Select Contact</option>
            <option value="manual">Manual Phone Number</option>
          </select>
          <button
            type="button"
            onClick={() => setMethod('contact')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition flex items-center gap-1 ${
              method === 'contact' ? 'bg-white text-emerald-900 shadow-2xs' : 'text-emerald-700 hover:text-emerald-900'
            }`}
          >
            <User className="w-3 h-3" /> Select Contact
          </button>
          <button
            type="button"
            onClick={() => setMethod('manual')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition flex items-center gap-1 ${
              method === 'manual' ? 'bg-white text-emerald-900 shadow-2xs' : 'text-emerald-700 hover:text-emerald-900'
            }`}
          >
            <Phone className="w-3 h-3" /> Manual Phone Number
          </button>
        </div>
      </div>

      {/* Integration Mode Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center bg-white/80 p-2.5 rounded-lg border border-emerald-200/80">
        <div>
          <label htmlFor={modeSelectId} className="block text-[11px] font-semibold text-slate-700">
            WhatsApp Execution Channel:
          </label>
          <p className="text-[10px] text-slate-500">
            Real API calls never fall back to fake simulation on failure.
          </p>
        </div>
        <select
          id={modeSelectId}
          value={integrationMode || integrationInfo?.effectiveMode || 'CLICK_TO_CHAT'}
          onChange={(e) => setIntegrationMode(e.target.value)}
          className="p-2 bg-white border border-emerald-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="CLOUD_API">
            Meta WhatsApp Cloud API {integrationInfo?.cloudApiConfigured ? '(Configured)' : '(Credentials Missing)'}
          </option>
          <option value="TWILIO">
            Twilio WhatsApp API {integrationInfo?.twilioConfigured ? '(Configured)' : '(Credentials Missing)'}
          </option>
          <option value="CLICK_TO_CHAT">
            Click-to-Chat (wa.me Manual User Send)
          </option>
          <option value="SIMULATION">
            Explicit Simulation Mode (Testing Only — Never Sent)
          </option>
        </select>
      </div>

      {/* METHOD A: CONTACT SELECTION */}
      {method === 'contact' && (
        <div className="space-y-1.5">
          <label htmlFor={contactSelectId} className="block text-[11px] font-semibold text-slate-700">
            Saved Directory Contact:
          </label>
          <select
            id={contactSelectId}
            value={selectedContactId}
            onChange={(e) => handleContactSelect(e.target.value)}
            className="w-full p-2 bg-white border border-emerald-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">-- Choose verified team member --</option>
            {directory.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.department ? `(${c.department})` : ''} — {c.phone || 'No phone on file'}
              </option>
            ))}
          </select>

          {isValidPhone ? (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 font-mono mt-1">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Verified Directory E.164 Number: <strong className="font-bold">{normalizedPhone}</strong></span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 mt-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                {initialName ? `"${initialName}" is not in your verified contact directory with a phone number. ` : ''}
                Select a contact with a phone number or switch to Manual Phone Number.
              </span>
            </div>
          )}
        </div>
      )}

      {/* METHOD B: MANUAL PHONE NUMBER INPUT */}
      {method === 'manual' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label htmlFor={countryCodeId} className="block text-[11px] font-semibold text-slate-700 mb-1">
              Country & Dial Code:
            </label>
            <div className="flex items-center gap-1.5">
              <select
                id={countryCodeId}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-28 p-2 bg-white border border-emerald-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 shrink-0"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} ({c.country})
                  </option>
                ))}
              </select>
              <label htmlFor={phoneInputId} className="sr-only">Phone Number (digits only)</label>
              <input
                id={phoneInputId}
                type="tel"
                value={localNumber}
                onChange={(e) => setLocalNumber(e.target.value)}
                placeholder="e.g. 9876543210"
                className="flex-1 p-2 bg-white border border-emerald-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor={recipientNameId} className="block text-[11px] font-semibold text-slate-700 mb-1">
              Recipient Display Name:
            </label>
            <input
              id={recipientNameId}
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g. Aman Verma"
              className="w-full p-2 bg-white border border-emerald-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between text-[11px] text-slate-600 font-mono">
            <span>
              E.164 Format:{' '}
              <strong className={isValidPhone ? 'text-emerald-700 font-bold' : 'text-rose-600'}>
                {normalizedPhone || 'Missing Phone Number'}
              </strong>
            </span>
            {!isValidPhone && cleanDigits.length > 0 && (
              <span className="text-rose-600 text-[10px]">Must be a valid E.164 international phone number</span>
            )}
          </div>
        </div>
      )}

      {/* CUSTOM MESSAGE EDITOR WITH EXPLICIT TONE SELECTOR */}
      <div className="space-y-1.5 pt-1 border-t border-emerald-200/60">
        <div className="flex items-center justify-between">
          <label htmlFor={messageInputId} className="text-[11px] font-semibold text-slate-800 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-600" />
            WhatsApp Message Body (Required):
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-mono">
              {message.length} chars · {message.trim().split(/\s+/).filter(Boolean).length} words
            </span>
            <button
              type="button"
              onClick={copyToClipboard}
              disabled={!hasMessageBody}
              className="text-[10px] text-emerald-700 hover:text-emerald-900 font-medium flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-emerald-100/60 transition"
              title="Copy message to clipboard"
            >
              {copied ? <CheckCheck className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Tone Selector Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <label htmlFor={toneSelectId} className="sr-only">Message Tone</label>
          <select
            id={toneSelectId}
            value={tone}
            onChange={(e) => applyTone(e.target.value)}
            className="sr-only"
          >
            <option value="standard">Standard</option>
            <option value="polite">Polite</option>
            <option value="urgent">Urgent</option>
            <option value="casual">Casual</option>
          </select>
          <span className="text-[10px] text-slate-500 font-medium">Tone:</span>
          {[
            { id: 'standard', label: 'Standard' },
            { id: 'polite', label: 'Polite / Professional' },
            { id: 'urgent', label: 'Urgent' },
            { id: 'casual', label: 'Casual' }
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTone(t.id)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                tone === t.id
                  ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                  : 'bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-100/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <textarea
          id={messageInputId}
          rows={3}
          value={message}
          onChange={(e) => handleMessageChange(e.target.value)}
          className="w-full text-xs p-2.5 border border-emerald-300 rounded-lg bg-white text-slate-800 leading-relaxed focus:outline-none focus:ring-1 focus:ring-emerald-500"
          placeholder="What message would you like to send? Enter exact message text..."
        />
        {!hasMessageBody && (
          <p className="text-[11px] text-amber-700 font-medium">
            Clarification needed: Please enter the exact message text before sending.
          </p>
        )}
      </div>

      {/* EXECUTION ERROR BANNER (Truthful Provider Error Reporting) */}
      {(executionError || lastExecutionRecord?.failureReason) && (
        <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg text-rose-900 text-[11px] flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <div className="font-bold">
              Provider Execution Failed ({lastExecutionRecord?.errorCode || lastExecutionRecord?.failureReason?.code || 'ERROR'})
              {lastExecutionRecord?.failureReason?.httpStatus ? ` — HTTP ${lastExecutionRecord.failureReason.httpStatus}` : ''}
            </div>
            <div>{lastExecutionRecord?.errorMessage || lastExecutionRecord?.failureReason?.message || executionError}</div>
            <div className="text-[10px] text-rose-700">
              No silent simulation or Click-to-Chat fallback was triggered. Verify Twilio Sandbox sender/recipient configuration and retry.
            </div>
          </div>
        </div>
      )}

      {/* CLICK-TO-CHAT USER CONFIRMATION BANNER (AWAITING_USER_SEND -> USER_CONFIRMED_SENT) */}
      {lastExecutionRecord?.status === 'AWAITING_USER_SEND' && (
        <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-950 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Status: AWAITING_USER_SEND (Click-to-Chat Handoff Opened)</span>
            </div>
            <p className="text-[10px] text-amber-800">
              Click-to-Chat cannot automatically verify delivery. Click confirm below only after you press Send in WhatsApp.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleConfirmUserSent(lastExecutionRecord.id)}
            disabled={confirmingId === lastExecutionRecord.id}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-semibold shrink-0 transition"
          >
            {confirmingId === lastExecutionRecord.id ? 'Confirming...' : 'Confirm I Sent This in WhatsApp'}
          </button>
        </div>
      )}

      {/* SIMULATION INDICATOR BANNER */}
      {lastExecutionRecord?.status === 'SIMULATED' && (
        <div className="p-2 bg-purple-50 border border-purple-300 rounded-lg text-purple-900 text-[11px] font-medium flex items-center justify-between">
          <span>SIMULATED EXECUTION ONLY — No real WhatsApp message was transmitted to any external provider.</span>
          <span className="px-2 py-0.5 bg-purple-200 text-purple-900 rounded font-bold text-[10px]">SIMULATED</span>
        </div>
      )}

      {/* EXECUTION & MANUAL HANDOFF CONTROLS */}
      <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t border-emerald-200/60">
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-600">
          <span className={`px-2 py-0.5 rounded border font-bold ${STATUS_BADGE_STYLES[currentStatus] || STATUS_BADGE_STYLES.PENDING_APPROVAL}`}>
            Status: {currentStatus}
          </span>
          {(lastExecutionRecord?.twilioMessageSid || lastExecutionRecord?.providerMessageId) && (
            <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
              SID: {lastExecutionRecord.twilioMessageSid || lastExecutionRecord.providerMessageId}
            </span>
          )}
          {lastExecutionRecord?.providerStatus && (
            <span className="font-mono bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800">
              Provider: {lastExecutionRecord.providerStatus}
            </span>
          )}
          {isValidPhone ? (
            <span className="text-emerald-700 font-semibold">E.164 Valid ✓</span>
          ) : (
            <span className="text-amber-700 font-semibold">Valid E.164 Phone Required</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Direct WhatsApp Web / Mobile Handoff Button — shown ONLY when CLICK_TO_CHAT mode is explicitly selected */}
          {(integrationMode || integrationInfo?.effectiveMode) === 'CLICK_TO_CHAT' && (
            <button
              type="button"
              onClick={handleOpenClickToChat}
              disabled={!isValidPhone || !hasMessageBody || isSubmitting}
              className={`min-h-[38px] px-3 py-1.5 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition ${
                isValidPhone && hasMessageBody
                  ? 'bg-white border-emerald-300 hover:bg-emerald-50 text-emerald-800'
                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              title="Open in WhatsApp (sets status to AWAITING_USER_SEND)"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
              <span>Open in WhatsApp (wa.me)</span>
            </button>
          )}

          {/* Approve & Send via Selected Integration Mode */}
          {onSend && (
            <button
              type="button"
              onClick={() => handleExecuteSend()}
              disabled={isSubmitting || !isValidPhone || !hasMessageBody}
              className={`min-h-[38px] px-4 py-1.5 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition ${
                isValidPhone && hasMessageBody
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>
                {lastExecutionRecord?.status === 'FAILED' ? 'Retry Send' : `Approve & Execute (${integrationMode || integrationInfo?.effectiveMode || 'Send'})`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ISSUE 5: PERSISTENT WHATSAPP MESSAGE STATUS TRACKER DASHBOARD */}
      <div className="pt-2.5 border-t border-emerald-200/80 space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowTracker(!showTracker)}
            className="text-[11px] font-bold text-emerald-950 flex items-center gap-1.5 hover:underline"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            <span>WhatsApp Message Status Tracker ({trackedMessages.length})</span>
          </button>
          <button
            type="button"
            onClick={fetchTrackerAndStatus}
            disabled={loadingTracker}
            className="text-[10px] text-emerald-700 hover:text-emerald-900 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-emerald-100/60"
          >
            <RefreshCw className={`w-3 h-3 ${loadingTracker ? 'animate-spin' : ''}`} />
            <span>Refresh Status</span>
          </button>
        </div>

        {showTracker && (
          <div className="bg-white border border-emerald-200 rounded-lg overflow-x-auto max-h-60 overflow-y-auto">
            {trackedMessages.length === 0 ? (
              <div className="p-3 text-center text-[11px] text-slate-400">
                No WhatsApp execution attempts recorded yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-[10px]">
                <thead>
                  <tr className="bg-emerald-50/70 border-b border-emerald-200 text-emerald-950 font-bold">
                    <th className="p-2">Recipient / Sender</th>
                    <th className="p-2">Message</th>
                    <th className="p-2">Mode</th>
                    <th className="p-2">Twilio SID / Provider ID</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Created / Sent / Deliv / Read</th>
                    <th className="p-2">Details / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trackedMessages.slice(0, 15).map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/80">
                      <td className="p-2 font-medium text-slate-800 whitespace-nowrap">
                        <div>{rec.recipientName || 'Recipient'}</div>
                        <div className="font-mono text-slate-500">{rec.recipientAddress || rec.recipientPhone}</div>
                        {rec.senderAddress && (
                          <div className="font-mono text-[9px] text-slate-400">From: {rec.senderAddress}</div>
                        )}
                      </td>
                      <td className="p-2 text-slate-700 max-w-[180px] truncate" title={rec.messageBody}>
                        {rec.messageBody}
                      </td>
                      <td className="p-2 font-mono whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                          {rec.integrationMode}
                        </span>
                        {rec.isSimulated && (
                          <span className="ml-1 px-1 py-0.5 rounded bg-purple-100 text-purple-800 font-bold">
                            SIM
                          </span>
                        )}
                      </td>
                      <td className="p-2 font-mono text-slate-600 whitespace-nowrap">
                        <div>{rec.twilioMessageSid || rec.providerMessageId || '—'}</div>
                        {rec.providerStatus && (
                          <div className="text-[9px] text-emerald-700">provider: {rec.providerStatus}</div>
                        )}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded border font-bold ${STATUS_BADGE_STYLES[rec.status] || STATUS_BADGE_STYLES.DRAFT}`}>
                          {rec.status}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-slate-500 whitespace-nowrap">
                        {rec.dateCreated && <div>Created: {formatTime(rec.dateCreated)}</div>}
                        <div>Sent: {formatTime(rec.sentAt)}</div>
                        {rec.deliveredAt && <div className="text-teal-700">Deliv: {formatTime(rec.deliveredAt)}</div>}
                        {rec.readAt && <div className="text-blue-700">Read: {formatTime(rec.readAt)}</div>}
                      </td>
                      <td className="p-2">
                        {rec.failureReason || rec.errorCode ? (
                          <span className="text-rose-700 font-medium">
                            [{rec.errorCode || rec.failureReason?.code || rec.failureReason?.httpStatus}] {rec.errorMessage || rec.failureReason?.message}
                          </span>
                        ) : rec.status === 'AWAITING_USER_SEND' ? (
                          <button
                            type="button"
                            onClick={() => handleConfirmUserSent(rec.id)}
                            className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold"
                          >
                            Confirm Sent
                          </button>
                        ) : rec.status === 'USER_CONFIRMED_SENT' ? (
                          <span className="text-sky-700 font-medium">Manual User Confirmed (No Provider SID)</span>
                        ) : rec.isSimulated ? (
                          <span className="text-purple-700">Simulated only</span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">Twilio Verified</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
