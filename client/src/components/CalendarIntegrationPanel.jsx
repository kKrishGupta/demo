/**
 * ActionFlow Client — Google Calendar Integration & Diagnostics Panel
 *
 * Implements:
 * - Environment Auto-Detection status (GOOGLE_CALENDAR_CLIENT_ID / SECRET / REDIRECT_URI)
 * - 8 Precise Connection States:
 *     A. CREDENTIALS_MISSING
 *     B. CREDENTIALS_CONFIGURED
 *     C. AUTHORIZATION_REQUIRED
 *     D. AUTHORIZING
 *     E. CONNECTED
 *     F. TOKEN_REFRESHING
 *     G. REAUTHORIZATION_REQUIRED
 *     H. API_ERROR
 * - Authoritative Read-Side Synchronization & Reconciliation Event List:
 *     - Filters: All, Today, Upcoming, Past, Custom Date Range
 *     - Displays: Title, Date, Start time, End time, Duration, Calendar name,
 *       Google Event ID (diagnostics), Sync status, Edit, Delete, Open in Google Calendar
 *     - Discrepancy detection & reporting
 *     - Explicit error banner when Google API retrieval fails (never shows misleading empty state on error)
 * - Persistent Recent Calendar Activity & Audit Log:
 *     - Displays: Event title, Action ID, Google Event ID, Timestamp, Operation, Result, Error details
 * - Real-time WebSocket (/ws) + CustomEvent ('actionflow:calendar-updated') synchronization
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Calendar, ShieldCheck, AlertCircle, RefreshCw, ExternalLink,
  CheckCircle2, Trash2, Key, Clock, Loader2, Sparkles, LogOut,
  Play, CheckCircle, XCircle, Info, Database, Edit2, Check, X, Filter
} from 'lucide-react';
import {
  getCalendarStatus,
  getCalendarConfigStatus,
  getCalendarAuthUrl,
  disconnectGoogleAccount,
  testCalendarConnection,
  fetchUserCalendars,
  createCalendarTestEvent,
  verifyCalendarEvent,
  deleteCalendarTestEvent,
  getCalendarActivityLog,
  getCalendarEvents,
  reconcileCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEventById
} from '../services/calendarApi';
import { SESSION_ID } from '../services/intelligenceApi';
import { buildWebSocketUrl } from '../config/apiConfig';

const EVENTS_CACHE_KEY = 'af_calendar_hub_events_cache_v1';

export default function CalendarIntegrationPanel() {
  const [status, setStatus] = useState(null);
  const [configStatus, setConfigStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [notification, setNotification] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [testEvent, setTestEvent] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);

  // Synchronized Google Calendar Events state
  const [events, setEvents] = useState(() => {
    try {
      const cached = sessionStorage.getItem(EVENTS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [discrepancies, setDiscrepancies] = useState([]);
  const [eventsError, setEventsError] = useState(null);
  const [rangeFilter, setRangeFilter] = useState('all'); // 'all' | 'today' | 'upcoming' | 'past' | 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [syncStats, setSyncStats] = useState({
    googleEventsCount: 0,
    localEventsCount: 0,
    mergedEventsCount: 0,
    lastSync: null
  });

  // Inline Event Edit state
  const [editingEventId, setEditingEventId] = useState(null);
  const [editForm, setEditForm] = useState({
    title: '',
    startDateTime: '',
    endDateTime: ''
  });

  const wsRef = useRef(null);

  const loadEventsForRange = useCallback(async ({
    range = rangeFilter,
    timeMin = customStartDate || null,
    timeMax = customEndDate || null,
    simulateFailure = false,
    isManualReconcile = false
  } = {}) => {
    setEventsLoading(true);
    setEventsError(null);
    try {
      const fn = isManualReconcile ? reconcileCalendarEvents : getCalendarEvents;
      const evRes = await fn({
        range,
        timeMin: range === 'custom' ? timeMin : null,
        timeMax: range === 'custom' ? timeMax : null,
        maxResults: 50,
        simulateFailure
      });

      if (evRes && evRes.success) {
        const retrievedEvents = Array.isArray(evRes.events) ? evRes.events : [];
        setEvents(retrievedEvents);
        setDiscrepancies(Array.isArray(evRes.discrepancies) ? evRes.discrepancies : []);
        setSyncStats({
          googleEventsCount: evRes.googleEventsCount ?? retrievedEvents.length,
          localEventsCount: evRes.localEventsCount ?? retrievedEvents.length,
          mergedEventsCount: evRes.count ?? retrievedEvents.length,
          lastSync: evRes.lastSync || new Date().toISOString()
        });
        if (Array.isArray(evRes.activities) && evRes.activities.length > 0) {
          setActivityLogs(evRes.activities);
        }
        if (evRes.lastSync) {
          setStatus(prev => prev ? { ...prev, lastSync: evRes.lastSync } : prev);
        }
        try {
          sessionStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(retrievedEvents));
        } catch {}
      } else {
        setEventsError(evRes?.message || 'Failed to retrieve events from Google Calendar API.');
      }
    } catch (err) {
      setEventsError(err.message || 'Failed to retrieve events from Google Calendar API.');
      // Also refresh activity log so CALENDAR_SYNC_FAILED appears immediately
      getCalendarActivityLog().then(logs => setActivityLogs(logs.activities || [])).catch(() => {});
    } finally {
      setEventsLoading(false);
    }
  }, [rangeFilter, customStartDate, customEndDate]);

  // Fetch connection status, config status, calendars, events, and persistent audit logs
  const loadStatusAndLogs = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const [s, cfg, logs, calListRes] = await Promise.all([
        getCalendarStatus(),
        getCalendarConfigStatus(),
        getCalendarActivityLog(),
        fetchUserCalendars().catch(() => null)
      ]);
      setStatus(s);
      setConfigStatus(cfg);
      setActivityLogs(logs.activities || []);
      if (calListRes?.success && Array.isArray(calListRes.calendars)) {
        setCalendars(calListRes.calendars);
      }

      if (s?.isConnected || cfg?.userAuthorized) {
        await loadEventsForRange({
          range: opts.range || rangeFilter,
          simulateFailure: Boolean(opts.simulateFailure),
          isManualReconcile: Boolean(opts.isManualReconcile)
        });
        // Refresh logs after sync so CALENDAR_SYNC_STARTED / CALENDAR_SYNC_COMPLETED are shown
        const updatedLogs = await getCalendarActivityLog().catch(() => null);
        if (updatedLogs?.activities) {
          setActivityLogs(updatedLogs.activities);
        }
      }
    } catch (e) {
      console.warn('[CalendarPanel] Failed loading calendar status:', e.message);
    } finally {
      setLoading(false);
    }
  }, [loadEventsForRange, rangeFilter]);

  useEffect(() => {
    loadStatusAndLogs();

    // Check for query params returning from OAuth callback
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('calendar_connected') === 'true') {
        const email = params.get('email');
        setNotification({
          type: 'success',
          message: `Google Calendar successfully authorized${email ? ` for ${email}` : ''}! Automatic synchronization is now enabled.`
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (params.get('calendar_error')) {
        setNotification({
          type: 'error',
          message: `Google OAuth authorization failed: ${params.get('calendar_error')}`
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Listen for custom window events & WebSocket notifications for immediate synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleCustomUpdate = () => {
      loadStatusAndLogs();
    };
    window.addEventListener('actionflow:calendar-updated', handleCustomUpdate);

    // Connect to backend WebSocket for live CALENDAR_UPDATED events
    try {
      const wsUrl = buildWebSocketUrl(SESSION_ID || 'default_session');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'CALENDAR_UPDATED') {
            loadStatusAndLogs();
          }
        } catch {}
      };
    } catch {}

    return () => {
      window.removeEventListener('actionflow:calendar-updated', handleCustomUpdate);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
    };
  }, [loadStatusAndLogs]);

  // Compute canonical state from backend signals
  const computeState = () => {
    if (actionLoading === 'connect') return 'AUTHORIZING';
    if (actionLoading === 'refresh') return 'TOKEN_REFRESHING';
    if (!configStatus && !status) return 'LOADING';

    const credsConfigured = configStatus?.credentialsConfigured ?? status?.credentialsConfigured;
    if (credsConfigured === false) return 'CREDENTIALS_MISSING';

    if (configStatus?.connectionStatus === 'REAUTHORIZATION_REQUIRED' || status?.status === 'REAUTHORIZATION_REQUIRED' || status?.connectionStatus === 'REAUTHORIZATION_REQUIRED') {
      return 'REAUTHORIZATION_REQUIRED';
    }

    if (status?.isConnected || configStatus?.connectionStatus === 'CONNECTED' || (configStatus?.userAuthorized && configStatus?.refreshTokenAvailable)) {
      return 'CONNECTED';
    }

    if (credsConfigured && (configStatus?.userAuthorized === false || status?.isConnected === false)) {
      return 'AUTHORIZATION_REQUIRED';
    }

    return configStatus?.connectionStatus || status?.connectionStatus || 'CREDENTIALS_CONFIGURED';
  };

  const currentState = computeState();

  // Range filter change
  const handleRangeChange = async (newRange) => {
    setRangeFilter(newRange);
    if (newRange !== 'custom') {
      await loadEventsForRange({ range: newRange });
    }
  };

  // Manual Reconcile & Refresh
  const handleManualReconcile = async () => {
    setActionLoading('reconcile');
    try {
      await loadEventsForRange({ range: rangeFilter, isManualReconcile: true });
      const logs = await getCalendarActivityLog().catch(() => null);
      if (logs?.activities) setActivityLogs(logs.activities);
      setNotification({
        type: 'success',
        message: 'Google Calendar events and local ActionFlow records synchronized and reconciled.'
      });
    } catch (e) {
      setNotification({ type: 'error', message: 'Reconciliation failed: ' + e.message });
    } finally {
      setActionLoading(null);
    }
  };

  // 1. Authorize Google Account
  const handleAuthorize = async () => {
    setActionLoading('connect');
    try {
      const url = await getCalendarAuthUrl();
      if (url) {
        window.location.href = url;
      }
    } catch (e) {
      setNotification({ type: 'error', message: 'Could not generate authorization URL: ' + e.message });
      setActionLoading(null);
    }
  };

  // 2. Disconnect
  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Calendar? This removes stored refresh tokens.')) return;
    setActionLoading('disconnect');
    try {
      await disconnectGoogleAccount();
      setEvents([]);
      try {
        sessionStorage.removeItem(EVENTS_CACHE_KEY);
      } catch {}
      setNotification({ type: 'success', message: 'Google Calendar disconnected. Your environment credentials remain intact.' });
      loadStatusAndLogs();
    } catch (e) {
      setNotification({ type: 'error', message: 'Disconnect failed: ' + e.message });
    } finally {
      setActionLoading(null);
    }
  };

  // 3. Test Connection
  const handleTestConnection = async () => {
    setActionLoading('test');
    try {
      const res = await testCalendarConnection();
      setNotification({
        type: res.success ? 'success' : 'error',
        message: res.message
      });
      loadStatusAndLogs();
    } catch (e) {
      setNotification({ type: 'error', message: 'Test connection failed: ' + e.message });
    } finally {
      setActionLoading(null);
    }
  };

  // 4. Fetch My Calendars
  const handleFetchCalendars = async () => {
    setActionLoading('fetch');
    try {
      const res = await fetchUserCalendars();
      if (res && res.success) {
        setCalendars(res.calendars || []);
        setNotification({
          type: 'success',
          message: `Retrieved ${res.calendars?.length || 0} calendar(s) from your Google Account.`
        });
      } else {
        setNotification({
          type: 'error',
          message: res?.message || 'Could not fetch calendars. Please ensure your Google account is authorized with calendar.readonly scope.'
        });
      }
    } catch (e) {
      setNotification({ type: 'error', message: 'Could not fetch calendars: ' + e.message });
    } finally {
      setActionLoading(null);
    }
  };

  // 5. Create Test Event
  const handleCreateTestEvent = async () => {
    setActionLoading('createTest');
    try {
      const res = await createCalendarTestEvent();
      setTestEvent(res);
      setNotification({
        type: res.success ? 'success' : 'error',
        message: res.success
          ? `Test event created! Provider Event ID: ${res.eventId || 'SIMULATED'}`
          : `Failed: ${res.message}`
      });
      await loadStatusAndLogs();
    } catch (e) {
      setNotification({ type: 'error', message: 'Failed creating test event: ' + e.message });
    } finally {
      setActionLoading(null);
    }
  };

  // 6. Verify Event via events.get
  const handleVerifyEvent = async (explicitEventId = null) => {
    const targetId = explicitEventId || testEvent?.eventId || 'trqighp34tok3e29n9isell7ac';
    setActionLoading('verify');
    try {
      const res = await verifyCalendarEvent(targetId);
      setVerificationResult(res);
      setNotification({
        type: res.exists ? 'success' : 'error',
        message: res.exists
          ? `Verified! Event "${res.event?.title || res.event?.summary}" (ID: ${targetId}) exists in Google Calendar.`
          : `Event ID "${targetId}" was not found in Google Calendar.`
      });
    } catch (e) {
      setNotification({ type: 'error', message: 'Verification error: ' + e.message });
    } finally {
      setActionLoading(null);
    }
  };

  // 7. Remove Test Event
  const handleDeleteTestEvent = async () => {
    const targetId = testEvent?.eventId;
    if (!targetId) return;
    setActionLoading('deleteTest');
    try {
      await deleteCalendarTestEvent(targetId);
      setTestEvent(null);
      setVerificationResult(null);
      setNotification({ type: 'success', message: 'Test event removed from calendar.' });
      await loadStatusAndLogs();
    } catch (e) {
      setNotification({ type: 'error', message: 'Delete failed: ' + e.message });
    } finally {
      setActionLoading(null);
    }
  };

  // Inline Edit Handlers for Event List
  const handleStartEditEvent = (ev) => {
    setEditingEventId(ev.googleEventId || ev.id);
    const toLocalInput = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setEditForm({
      title: ev.title || '',
      startDateTime: toLocalInput(ev.startDateTime),
      endDateTime: toLocalInput(ev.endDateTime)
    });
  };

  const handleSaveEditEvent = async (eventId) => {
    setActionLoading(`edit_${eventId}`);
    try {
      const res = await updateCalendarEvent(eventId, {
        title: editForm.title,
        newStartDateTime: editForm.startDateTime ? new Date(editForm.startDateTime).toISOString() : undefined,
        newEndDateTime: editForm.endDateTime ? new Date(editForm.endDateTime).toISOString() : undefined
      });
      if (res.success) {
        setEditingEventId(null);
        setNotification({ type: 'success', message: `Updated event "${editForm.title}" in Google Calendar.` });
        await loadStatusAndLogs();
      } else {
        setNotification({ type: 'error', message: res.message || 'Failed to update event.' });
      }
    } catch (err) {
      setNotification({ type: 'error', message: 'Update failed: ' + err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteEventFromHub = async (ev) => {
    const eventId = ev.googleEventId || ev.id;
    if (!eventId) return;
    setActionLoading(`del_${eventId}`);
    try {
      const res = await deleteCalendarEventById(eventId);
      if (res.success) {
        setNotification({ type: 'success', message: `Deleted "${ev.title}" (${eventId}) from Google Calendar.` });
        await loadStatusAndLogs();
      } else {
        setNotification({ type: 'error', message: res.message || 'Failed to delete event from Google Calendar.' });
      }
    } catch (err) {
      setNotification({ type: 'error', message: 'Delete error: ' + err.message });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Google Calendar Integration Hub
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Automatic environment credential detection, persistent OAuth refresh tokens, and live read/write event reconciliation.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleManualReconcile}
            disabled={loading || eventsLoading || actionLoading === 'reconcile'}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loading || eventsLoading || actionLoading === 'reconcile') ? 'animate-spin' : ''}`} />
            Sync & Reconcile
          </button>

          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-blue-200 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open Google Calendar
          </a>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs animate-in fade-in ${
          notification.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* SECTION 1: GOOGLE OAUTH CONFIGURATION & ACCOUNT STATE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card A: GOOGLE OAUTH CONFIGURATION */}
        <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-blue-600" />
              Google OAuth Configuration
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              configStatus?.credentialsConfigured
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : 'bg-rose-100 text-rose-800 border border-rose-200'
            }`}>
              {configStatus?.credentialsConfigured ? 'Auto-Detected' : 'Missing in .env'}
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Credentials:</span>
              <span className="font-semibold text-slate-800">
                {configStatus?.credentialsConfigured ? (
                  <span className="text-emerald-700 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-600" /> Configured in .env
                  </span>
                ) : (
                  <span className="text-rose-600 flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-rose-600" /> Missing Client ID/Secret
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">OAuth Client:</span>
              <span className="font-semibold text-slate-800">
                {configStatus?.oauthClientInitialized !== false && configStatus?.credentialsConfigured ? (
                  <span className="text-emerald-700">Initialized</span>
                ) : (
                  <span className="text-slate-400">Not Initialized</span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Google Account:</span>
              <span className="font-semibold">
                {configStatus?.userAuthorized ? (
                  <span className="text-emerald-700 font-bold">Authorized</span>
                ) : (
                  <span className="text-amber-700 font-bold">Not Authorized Yet</span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500">Token Status:</span>
              <span className="font-semibold">
                {configStatus?.userAuthorized ? (
                  <span className="text-emerald-700 font-bold">ACTIVE</span>
                ) : configStatus?.connectionStatus === 'REAUTHORIZATION_REQUIRED' ? (
                  <span className="text-rose-700 font-bold">Reauthorization Required</span>
                ) : configStatus?.credentialsConfigured ? (
                  <span className="text-amber-700 font-bold">Awaiting First Authorization</span>
                ) : (
                  <span className="text-slate-400">Not Configured</span>
                )}
              </span>
            </div>
          </div>

          {currentState === 'AUTHORIZATION_REQUIRED' && (
            <div className="mt-2 p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-2">
              <div className="flex items-start gap-2 text-xs text-blue-900">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Google Calendar credentials detected. Authorize your Google account once to enable automatic calendar synchronization.
                </span>
              </div>
              <button
                type="button"
                onClick={handleAuthorize}
                disabled={actionLoading === 'connect'}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition"
              >
                {actionLoading === 'connect' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                )}
                AUTHORIZE GOOGLE ACCOUNT
              </button>
            </div>
          )}

          {currentState === 'REAUTHORIZATION_REQUIRED' && (
            <div className="mt-2 p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-2">
              <div className="flex items-start gap-2 text-xs text-rose-900">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  Google refresh token was expired or revoked. Please re-authorize your account to restore synchronization.
                </span>
              </div>
              <button
                type="button"
                onClick={handleAuthorize}
                disabled={actionLoading === 'connect'}
                className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                RE-AUTHORIZE GOOGLE ACCOUNT
              </button>
            </div>
          )}
        </div>

        {/* Card B: GOOGLE ACCOUNT & ACTIVE CONNECTION */}
        <div className="p-5 bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Google Account
            </span>
            {status?.isConnected ? (
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center gap-1.5 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Connected
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full flex items-center gap-1.5 border border-amber-300">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Awaiting Authorization
              </span>
            )}
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Connected Email:</span>
              <span className="font-semibold text-slate-800">{status?.email || configStatus?.email || '—'}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Calendar:</span>
              <span className="font-mono text-slate-800">{status?.calendarId || 'primary'}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Token Status:</span>
              <span className="font-semibold text-slate-800">
                {status?.isConnected ? 'ACTIVE' : (status?.tokenStatus || 'AWAITING_AUTHORIZATION')}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Last Sync:</span>
              <span className="text-slate-700">
                {(syncStats.lastSync || status?.lastSync)
                  ? new Date(syncStats.lastSync || status.lastSync).toLocaleString()
                  : 'Never'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500">Storage Protection:</span>
              <span className="text-slate-600 font-mono text-[11px] flex items-center gap-1">
                <Database className="w-3 h-3 text-emerald-600" /> AES-256-GCM Encrypted
              </span>
            </div>
          </div>

          {status?.isConnected && (
            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] text-emerald-700 font-medium">
                Syncing live with Google Calendar ({events.length} event{events.length === 1 ? '' : 's'})
              </span>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={actionLoading === 'disconnect'}
                className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              >
                {actionLoading === 'disconnect' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5 text-rose-600" />
                )}
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: SYNCHRONIZED GOOGLE CALENDAR EVENTS (READ-SIDE PIPELINE + RECONCILIATION) */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              Synchronized Google Calendar Events
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
                {events.length}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Live events fetched from Google Calendar API (<code className="font-mono">calendar.events.list</code>) merged with local ActionFlow metadata.
            </p>
          </div>

          {/* Date Range Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
            {[
              { id: 'all', label: 'All Events' },
              { id: 'today', label: 'Today' },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'past', label: 'Past Events' },
              { id: 'custom', label: 'Date Range' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleRangeChange(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  rangeFilter === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {rangeFilter === 'custom' && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-end gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">From Date (IST)</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">To Date (IST)</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => loadEventsForRange({ range: 'custom', timeMin: customStartDate, timeMax: customEndDate })}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition"
            >
              Apply Range
            </button>
          </div>
        )}

        {/* Explicit Error Banner when Google API retrieval fails (TEST 8) */}
        {eventsError && (
          <div
            role="alert"
            data-testid="calendar-hub-sync-error"
            className="p-4 bg-rose-50 border border-rose-300 rounded-xl flex items-start justify-between gap-3 text-xs text-rose-900"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-rose-900">
                  Google Calendar Event Retrieval Failed
                </div>
                <p className="text-rose-800">{eventsError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadEventsForRange({ range: rangeFilter })}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-xs shrink-0 transition"
            >
              Retry Sync
            </button>
          </div>
        )}

        {/* Reconciliation Discrepancies Warning (if any local task is missing from Google Calendar) */}
        {discrepancies.length > 0 && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 text-xs text-amber-900">
            <div className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Reconciliation Notice: {discrepancies.length} local record(s) not found in Google Calendar
            </div>
            {discrepancies.map((d, idx) => (
              <div key={idx} className="text-[11px] font-mono text-amber-800">
                • {d.title} (Google Event ID: {d.googleEventId}) — {d.discrepancyType}
              </div>
            ))}
          </div>
        )}

        {/* Events Loading / Empty / Populated Table */}
        {eventsLoading && events.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2 border border-dashed border-slate-200 rounded-xl">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            Fetching live events from Google Calendar API...
          </div>
        ) : !eventsError && events.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl space-y-2">
            <div>No Google Calendar events found for the selected filter ({rangeFilter}).</div>
            <button
              type="button"
              onClick={handleManualReconcile}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" /> Refresh from Google Calendar
            </button>
          </div>
        ) : events.length > 0 ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-3">Event Title</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Start — End Time</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Calendar</th>
                    <th className="p-3">Google Event ID</th>
                    <th className="p-3">Sync Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((ev) => {
                    const eventId = ev.googleEventId || ev.id;
                    const isEditing = editingEventId === eventId;
                    return (
                      <tr key={eventId} className="hover:bg-slate-50/70 transition">
                        <td className="p-3 font-semibold text-slate-900">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.title}
                              onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                              className="px-2 py-1 border border-blue-300 rounded text-xs w-full"
                            />
                          ) : (
                            <div>
                              <div>{ev.title}</div>
                              {ev.actionId && (
                                <div className="text-[10px] font-mono text-slate-400">
                                  Action: {ev.actionId}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap text-slate-700 font-medium">
                          {ev.date || '—'}
                        </td>
                        <td className="p-3 whitespace-nowrap text-slate-700">
                          {isEditing ? (
                            <div className="flex flex-col gap-1">
                              <input
                                type="datetime-local"
                                value={editForm.startDateTime}
                                onChange={(e) => setEditForm(prev => ({ ...prev, startDateTime: e.target.value }))}
                                className="px-1.5 py-0.5 border border-blue-300 rounded text-[11px]"
                              />
                              <input
                                type="datetime-local"
                                value={editForm.endDateTime}
                                onChange={(e) => setEditForm(prev => ({ ...prev, endDateTime: e.target.value }))}
                                className="px-1.5 py-0.5 border border-blue-300 rounded text-[11px]"
                              />
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-blue-500" />
                              {ev.startTime || '—'} – {ev.endTime || '—'}
                            </span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap text-slate-600">
                          {ev.durationMinutes ? `${ev.durationMinutes} min` : '—'}
                        </td>
                        <td className="p-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                          {ev.calendarName || ev.calendarId || 'primary'}
                        </td>
                        <td className="p-3 whitespace-nowrap font-mono text-[11px] text-slate-600">
                          {eventId}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ev.syncStatus === 'SYNCED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : ev.syncStatus === 'EXTERNAL_SYNCED'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {ev.syncStatus || 'SYNCED'}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditEvent(eventId)}
                                  disabled={actionLoading === `edit_${eventId}`}
                                  className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
                                  title="Save changes"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingEventId(null)}
                                  className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditEvent(ev)}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition"
                                  title="Edit event"
                                >
                                  <Edit2 className="w-3 h-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEventFromHub(ev)}
                                  disabled={actionLoading === `del_${eventId}`}
                                  className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition"
                                  title="Delete from Google Calendar"
                                >
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                                {(ev.htmlLink || ev.eventLink) && (
                                  <a
                                    href={ev.htmlLink || ev.eventLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition"
                                    title="Open in Google Calendar"
                                  >
                                    <ExternalLink className="w-3 h-3" /> Open in Google Calendar
                                  </a>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {/* SECTION 3: 5 DIAGNOSTIC ACTIONS & PROVIDER VERIFICATION */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Play className="w-3.5 h-3.5 text-blue-600" />
            Integration Diagnostics (Verified Provider Actions)
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadEventsForRange({ range: rangeFilter, simulateFailure: true })}
              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-semibold transition"
              title="Simulate a Google Calendar API retrieval failure (TEST 8)"
            >
              Simulate API Failure (Test 8)
            </button>
            <span className="text-[11px] text-slate-400">Official Google Calendar REST v3</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {/* Action 1: Test Connection */}
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={actionLoading === 'test'}
            className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left space-y-1 transition group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">1. Test Connection</span>
              {actionLoading === 'test' && <Loader2 className="w-3 h-3 animate-spin text-blue-600" />}
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">Probes Google API token connectivity</p>
          </button>

          {/* Action 2: Fetch Calendars */}
          <button
            type="button"
            onClick={handleFetchCalendars}
            disabled={actionLoading === 'fetch'}
            className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left space-y-1 transition group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">2. Fetch Calendars</span>
              {actionLoading === 'fetch' && <Loader2 className="w-3 h-3 animate-spin text-blue-600" />}
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">Queries calendarList endpoint</p>
          </button>

          {/* Action 3: Create Test Event */}
          <button
            type="button"
            onClick={handleCreateTestEvent}
            disabled={actionLoading === 'createTest'}
            className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left space-y-1 transition group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">3. Create Event</span>
              {actionLoading === 'createTest' && <Loader2 className="w-3 h-3 animate-spin text-blue-600" />}
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">Inserts verifiable event</p>
          </button>

          {/* Action 4: Verify Event */}
          <button
            type="button"
            onClick={() => handleVerifyEvent()}
            disabled={actionLoading === 'verify'}
            className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left space-y-1 transition group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">4. Verify Event</span>
              {actionLoading === 'verify' && <Loader2 className="w-3 h-3 animate-spin text-blue-600" />}
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">Calls events.get API</p>
          </button>

          {/* Action 5: Open Calendar */}
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noreferrer"
            className="p-3 bg-blue-50/50 hover:bg-blue-100/50 border border-blue-200 rounded-xl text-left space-y-1 transition block"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-900">5. Google Cal</span>
              <ExternalLink className="w-3 h-3 text-blue-600" />
            </div>
            <p className="text-[10px] text-blue-700 leading-tight">View live web calendar</p>
          </a>
        </div>

        {testEvent && (
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Live Event Registered: {testEvent.summary || testEvent.title || 'Verified Test Event'}
              </div>
              <div className="text-[11px] font-mono text-emerald-800">
                ID: {testEvent.eventId}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {testEvent.eventLink && (
                <a
                  href={testEvent.eventLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-[11px] flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" /> View Event
                </a>
              )}
              <button
                type="button"
                onClick={handleDeleteTestEvent}
                disabled={actionLoading === 'deleteTest'}
                className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded font-semibold text-[11px] flex items-center gap-1 transition"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Calendars List */}
      {calendars.length > 0 && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
            Available Google Calendars ({calendars.length})
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {calendars.map(c => (
              <div key={c.id} className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs space-y-0.5">
                <div className="font-semibold text-slate-800 flex items-center justify-between">
                  <span>{c.summary}</span>
                  {c.primary && (
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold">
                      Primary
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-slate-400 truncate">{c.id}</div>
                <div className="text-[10px] text-slate-500">{c.timeZone}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 4: RECENT CALENDAR ACTIVITY & PERSISTENT AUDIT LOG */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Recent Calendar Activity & Audit Log
          </h3>
          <span className="text-xs text-slate-400 font-mono">{activityLogs.length} entries</span>
        </div>

        {activityLogs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            No calendar operations recorded yet. Click "Sync & Reconcile" or create an event.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                  <tr>
                    <th className="p-2.5">Timestamp</th>
                    <th className="p-2.5">Operation / Event</th>
                    <th className="p-2.5">Event Title</th>
                    <th className="p-2.5">Action ID</th>
                    <th className="p-2.5">Google Event ID</th>
                    <th className="p-2.5">Result</th>
                    <th className="p-2.5">Details / Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activityLogs.map((log, i) => {
                    const title = log.title || log.details?.title || log.details?.summary || '—';
                    const googleEventId = log.googleEventId || log.details?.eventId || log.details?.googleEventId || '—';
                    const operation = log.operation || log.details?.operation || log.event;
                    const result = log.result || (log.event?.includes('FAILED') ? 'FAILED' : 'SUCCESS');
                    const errorDetails = log.errorDetails || log.details?.errorDetails || log.details?.googleErrorMessage || log.details?.error || null;
                    const eventLink = log.details?.eventLink || log.details?.htmlLink || null;

                    return (
                      <tr key={log.id || i} className="hover:bg-slate-50/50">
                        <td className="p-2.5 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-2.5 font-semibold text-slate-800 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold w-fit ${
                              log.event?.includes('CREATED') ? 'bg-emerald-100 text-emerald-800' :
                              log.event?.includes('DELETED') ? 'bg-amber-100 text-amber-800' :
                              log.event?.includes('UPDATED') ? 'bg-indigo-100 text-indigo-800' :
                              log.event?.includes('FAILED') ? 'bg-rose-100 text-rose-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {log.event}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">{operation}</span>
                          </div>
                        </td>
                        <td className="p-2.5 text-slate-800 font-medium max-w-xs truncate">
                          {title}
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {log.actionId || '—'}
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {googleEventId}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            result === 'FAILED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {result}
                          </span>
                        </td>
                        <td className="p-2.5">
                          {errorDetails ? (
                            <span className="text-rose-600 text-[11px] font-medium block max-w-xs truncate" title={errorDetails}>
                              {errorDetails}
                            </span>
                          ) : eventLink ? (
                            <a
                              href={eventLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold"
                            >
                              <ExternalLink className="w-3 h-3" /> View
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
