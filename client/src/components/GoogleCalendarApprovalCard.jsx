/**
 * ActionFlow Client — Google Calendar Approval Card (Phase 4, 6, 10)
 *
 * Implements:
 * - Dedicated "ADD TO GOOGLE CALENDAR?" confirmation workflow
 * - Google Account connection verification & Connect Google Account CTA
 * - Editable title, date, time, timezone, and popup notification lead time
 * - Two-person attendee email resolution and invitation status
 * - Idempotent event creation via backend execution gateway
 * - Direct link to "Open in Google Calendar" once created
 */

import { useState, useEffect } from 'react';
import {
  Calendar, Clock, Bell, User, Check, AlertCircle, ExternalLink,
  Loader2, Edit2, RotateCcw, ShieldCheck, Mail, Globe, Sparkles
} from 'lucide-react';
import { getCalendarStatus, getCalendarAuthUrl } from '../services/calendarApi';

export default function GoogleCalendarApprovalCard({
  action,
  directory = [],
  onApprove,
  onDismiss,
  onUpdateAction
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [calendarConn, setCalendarConn] = useState({ isConnected: false, email: null });

  // Editable Form State
  const [title, setTitle] = useState(action.title || 'Scheduled Event');
  const [date, setDate] = useState(action.date || 'Tomorrow');
  const [time, setTime] = useState(action.time || '10:00 AM');
  const [notificationMins, setNotificationMins] = useState(action.notification?.minutesBefore || 10);
  const [attendeeEmail, setAttendeeEmail] = useState(
    action.attendeeEmails?.[0] || action.attendee?.email || ''
  );

  // Check Google OAuth connection status
  useEffect(() => {
    getCalendarStatus().then(setCalendarConn).catch(() => {});
  }, []);

  const isReminder = action.type === 'CREATE_CALENDAR_REMINDER' || action.title?.toLowerCase().includes('remind');
  const isDone = action.stage === 'COMPLETED' || (result?.success === true && (result?.status === 'COMPLETED' || result?.result?.status === 'COMPLETED' || result?.result?.status === 'SIMULATED'));
  const isFailed = action.stage === 'FAILED' || (result && (result.success === false || result.status === 'FAILED' || result?.result?.status === 'FAILED'));

  const handleConnectGoogle = async () => {
    try {
      const url = await getCalendarAuthUrl();
      if (url) {
        window.location.href = url;
      }
    } catch (e) {
      alert('Could not generate Google authorization link: ' + e.message);
    }
  };

  const handleConfirmAndAdd = async () => {
    if (submitting || isDone) return;
    setSubmitting(true);
    try {
      const updatedPayload = {
        ...action,
        title,
        date,
        time,
        notification: { enabled: true, minutesBefore: parseInt(notificationMins, 10) || 10 },
        attendeeEmails: attendeeEmail ? [attendeeEmail] : [],
        isApproved: true
      };
      const res = await onApprove(updatedPayload);
      setResult(res);
      onUpdateAction?.({
        ...updatedPayload,
        stage: res?.success ? 'COMPLETED' : 'FAILED',
        eventLink: res?.eventLink || res?.result?.eventLink,
        eventId: res?.eventId || res?.result?.eventId
      });
      if (typeof window !== 'undefined' && res?.success) {
        window.dispatchEvent(new CustomEvent('actionflow:calendar-updated', { detail: res }));
      }
    } catch (err) {
      setResult({ success: false, status: 'FAILED', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const eventUrl = result?.eventLink || result?.result?.eventLink || action.eventLink;
  const createdEventId = result?.eventId || result?.result?.eventId || action.eventId;

  return (
    <div className={`mt-3 rounded-xl border transition-all overflow-hidden ${
      isDone ? 'bg-emerald-50/50 border-emerald-300' :
      isFailed ? 'bg-rose-50/40 border-rose-300' :
      'bg-white border-blue-200 shadow-sm'
    }`}>
      {/* Top Header Banner */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-200" />
          <span className="text-xs font-bold tracking-wide uppercase">
            {isReminder ? 'ADD REMINDER TO GOOGLE CALENDAR?' : 'CONFIRM GOOGLE CALENDAR EVENT'}
          </span>
        </div>

        {/* Account Status Badge */}
        {calendarConn.isConnected ? (
          <span className="text-[11px] bg-white/20 text-white px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3 h-3 text-emerald-300" />
            {calendarConn.email || 'Google Connected'}
          </span>
        ) : (
          <button
            type="button"
            onClick={handleConnectGoogle}
            className="text-[10px] bg-amber-400 hover:bg-amber-300 text-amber-950 px-2 py-0.5 rounded font-bold transition shadow-xs flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3 text-amber-800" />
            Connect Google Account
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Connection Notice if Not Connected */}
        {!calendarConn.isConnected && !isDone && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {calendarConn.credentialsConfigured
                  ? 'Google Calendar credentials detected. Authorize your Google account once to sync live events.'
                  : 'Connect your Google Calendar to add this reminder to your live calendar.'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleConnectGoogle}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded text-[11px] shrink-0 transition"
            >
              {calendarConn.credentialsConfigured ? 'Authorize' : 'Connect'}
            </button>
          </div>
        )}

        {/* View Mode vs Edit Mode */}
        {!isEditing ? (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-slate-800">{title}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {action.meetingType === 'ONLINE_MEETING' ? '🌐 Google Meet / Online Meeting' : '📅 Primary Calendar Event'}
                </p>
              </div>
              {!isDone && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              )}
            </div>

            {/* Event Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="p-2 bg-slate-50 border border-slate-200/80 rounded-lg">
                <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-blue-500" /> Date
                </span>
                <span className="font-semibold text-slate-700 block mt-0.5">{date}</span>
              </div>

              <div className="p-2 bg-slate-50 border border-slate-200/80 rounded-lg">
                <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3 text-indigo-500" /> Time
                </span>
                <span className="font-semibold text-slate-700 block mt-0.5">{time}</span>
              </div>

              <div className="p-2 bg-slate-50 border border-slate-200/80 rounded-lg">
                <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                  <Bell className="w-3 h-3 text-amber-500" /> Popup Alert
                </span>
                <span className="font-semibold text-slate-700 block mt-0.5">{notificationMins} min before</span>
              </div>

              <div className="p-2 bg-slate-50 border border-slate-200/80 rounded-lg">
                <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                  <Globe className="w-3 h-3 text-emerald-500" /> Timezone
                </span>
                <span className="font-semibold text-slate-700 block mt-0.5">Asia/Kolkata</span>
              </div>
            </div>

            {/* Attendee / Invitation Pill */}
            {attendeeEmail && (
              <div className="p-2 bg-blue-50/70 border border-blue-200/80 rounded-lg text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-slate-700 font-medium">Attendee:</span>
                  <span className="font-mono text-blue-900 bg-white px-1.5 py-0.5 rounded border border-blue-200 text-[11px]">
                    {attendeeEmail}
                  </span>
                </div>
                <span className="text-[10px] text-blue-700 font-medium">Google invite will be sent</span>
              </div>
            )}
          </div>
        ) : (
          /* Inline Editor */
          <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Event Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Date</label>
                <input
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Time</label>
                <input
                  type="text"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Notification Lead Time</label>
                <select
                  value={notificationMins}
                  onChange={(e) => setNotificationMins(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                >
                  <option value={0}>At event time</option>
                  <option value={5}>5 minutes before</option>
                  <option value={10}>10 minutes before (Default)</option>
                  <option value={15}>15 minutes before</option>
                  <option value={30}>30 minutes before</option>
                  <option value={60}>1 hour before</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Attendee Email (Optional)</label>
              <input
                type="email"
                value={attendeeEmail}
                onChange={(e) => setAttendeeEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-800 text-xs"
              >
                Done Editing
              </button>
            </div>
          </div>
        )}

        {/* Action Button Bar */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          {/* Status Message */}
          <div>
            {submitting && (
              <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                Provider execution started (Google Calendar events.insert)...
              </span>
            )}
            {!submitting && isDone && (
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 flex-wrap">
                <Check className="w-4 h-4 text-emerald-600" />
                {result?.isGoogleLiveEvent || result?.result?.isGoogleLiveEvent
                  ? `Provider execution succeeded! ${createdEventId ? `(Event ID: ${createdEventId})` : ''}`
                  : 'Event scheduled in Calendar (Local Simulation)'}
              </span>
            )}
            {!submitting && isFailed && (
              <span className="text-xs font-semibold text-rose-700 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Provider execution failed: {result?.message || result?.result?.message || result?.error || 'Failed to create event in Google Calendar.'}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {eventUrl && (
              <a
                href={eventUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-blue-200 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open in Google Calendar
              </a>
            )}

            {!isDone && onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(action)}
                className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs font-medium rounded hover:bg-slate-50 transition"
              >
                Not Now
              </button>
            )}

            {!isDone && (
              <button
                type="button"
                onClick={handleConfirmAndAdd}
                disabled={submitting}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding to Calendar...
                  </>
                ) : (
                  <>
                    <Calendar className="w-3.5 h-3.5" /> Confirm & Add
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

