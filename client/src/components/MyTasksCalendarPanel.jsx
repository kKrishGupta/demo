/**
 * ActionFlow Client — "My Tasks & Calendar" Lifecycle & Cleanup Interface
 *
 * Implements:
 * - Task & Calendar Event Management table/cards with filters:
 *     All | Upcoming | Pending | Completed | Cancelled
 * - Real-time search by task/event title
 * - Responsive completion checkbox that ONLY updates after backend + Google Calendar confirmation
 * - Explicit confirmation modal:
 *     "Mark this task as completed and remove it from Google Calendar?"
 *     Buttons: "Confirm" and "Cancel"
 * - Distinct status badges:
 *     PENDING | IN_PROGRESS | COMPLETION_REQUESTED | COMPLETED | CALENDAR_REMOVAL_FAILED | CANCELLED
 * - Separate linked resource badges:
 *     GOOGLE_CALENDAR_EVENT vs GOOGLE_TASK
 * - Recovery workflow for CALENDAR_REMOVAL_FAILED ("Retry Calendar Removal")
 * - Undo Completion workflow (recreates the deleted Google Calendar event with a new Google Event ID)
 * - Completed History & Preserved Audit Trail (never physically erases task history)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  CheckSquare, Square, Calendar, Clock, Search, RefreshCw, ExternalLink,
  AlertTriangle, CheckCircle2, RotateCcw, Edit3, XCircle, Plus, ShieldCheck,
  History, Loader2, Sparkles, Filter
} from 'lucide-react';
import {
  fetchTasks,
  createTaskWithCalendar,
  updateTaskDetails,
  updateTaskStatus,
  completeTaskAndRemoveEvent,
  retryTaskCalendarRemoval,
  undoTaskCompletion
} from '../services/taskApi';

const STATUS_BADGE_STYLES = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETION_REQUESTED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  COMPLETED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CALENDAR_REMOVAL_FAILED: 'bg-rose-50 text-rose-800 border-rose-300',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200'
};

function formatDateTime(isoStr) {
  if (!isoStr) return 'Unscheduled';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function toDatetimeLocalValue(isoStr) {
  if (!isoStr) {
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setHours(10, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    return `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T10:00`;
  }
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MyTasksCalendarPanel() {
  const [tasks, setTasks] = useState([]);
  const [counts, setCounts] = useState({ all: 0, upcoming: 0, pending: 0, completed: 0, cancelled: 0, removalFailed: 0 });
  const [completedHistory, setCompletedHistory] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState(null);

  // Per-task in-flight operation state (taskId -> 'completing' | 'retrying' | 'undoing' | 'editing' | 'cancelling')
  const [taskBusyMap, setTaskBusyMap] = useState({});

  // Confirmation modal state for completion checkbox
  const [confirmModalTask, setConfirmModalTask] = useState(null);

  // Edit modal state
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editDuration, setEditDuration] = useState(60);

  // Quick-create new calendar task form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStart, setNewStart] = useState(() => toDatetimeLocalValue(null));
  const [newDuration, setNewDuration] = useState(60);
  const [newCreateInCalendar, setNewCreateInCalendar] = useState(true);
  const [creating, setCreating] = useState(false);

  const setTaskBusy = (taskId, state) => {
    setTaskBusyMap(prev => {
      const next = { ...prev };
      if (!state) delete next[taskId];
      else next[taskId] = state;
      return next;
    });
  };

  const loadTasks = useCallback(async ({ withSync = false } = {}) => {
    if (withSync) setSyncing(true);
    else setLoading(true);

    try {
      const data = await fetchTasks({ filter, search, sync: withSync });
      setTasks(data.tasks || []);
      setCounts(data.counts || { all: 0, upcoming: 0, pending: 0, completed: 0, cancelled: 0, removalFailed: 0 });
      setCompletedHistory(data.completedHistory || []);
      setAuditEntries(data.auditEntries || []);
    } catch (err) {
      setBanner({ type: 'error', message: `Failed to load tasks: ${err.message}` });
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [filter, search]);

  useEffect(() => {
    loadTasks({ withSync: true });
  }, [loadTasks]);

  // ── 1. Checkbox click -> Open confirmation dialog (never mutate checkbox locally before backend confirms)
  const handleCheckboxClick = (task) => {
    if (taskBusyMap[task.id]) return;
    if (task.status === 'COMPLETED') {
      // Offer undo if already completed
      handleUndoCompletion(task);
      return;
    }
    setConfirmModalTask(task);
  };

  // ── 2. Confirm completion & Google Calendar removal
  const handleConfirmComplete = async () => {
    const task = confirmModalTask;
    if (!task) return;
    setConfirmModalTask(null);
    setTaskBusy(task.id, 'completing');

    // Reflect COMPLETION_REQUESTED while waiting for backend + Google API confirmation
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status: 'COMPLETION_REQUESTED' } : t)));

    try {
      const res = await completeTaskAndRemoveEvent(task.id, { confirmComplete: true });
      if (res.success && res.status === 'COMPLETED') {
        const removalMsg = res.calendarRemovalResult?.googleEventId
          ? `Google Calendar event (${res.calendarRemovalResult.googleEventId}) removed (${res.calendarRemovalResult.status}).`
          : 'Task marked as completed.';
        setBanner({
          type: 'success',
          message: `Completed "${task.title}". ${removalMsg}`,
          undoTaskId: task.id
        });
      } else if (res.status === 'CALENDAR_REMOVAL_FAILED') {
        setBanner({
          type: 'error',
          message: `Calendar removal failed for "${task.title}": ${res.message || 'Provider error'}. The event is still present in Google Calendar — click "Retry Removal" to recover.`
        });
      } else {
        setBanner({
          type: 'error',
          message: res.message || 'Could not complete task.'
        });
      }
      await loadTasks({ withSync: false });
    } catch (err) {
      setBanner({ type: 'error', message: `Completion error: ${err.message}` });
      await loadTasks({ withSync: false });
    } finally {
      setTaskBusy(task.id, null);
    }
  };

  // ── 3. Cancel confirmation dialog -> Keep task & Google Calendar event untouched
  const handleCancelConfirmModal = () => {
    setConfirmModalTask(null);
  };

  // ── 4. Retry Google Calendar removal when in CALENDAR_REMOVAL_FAILED state
  const handleRetryCalendarRemoval = async (task) => {
    if (taskBusyMap[task.id]) return;
    setTaskBusy(task.id, 'retrying');
    try {
      const res = await retryTaskCalendarRemoval(task.id);
      if (res.success && res.status === 'COMPLETED') {
        setBanner({
          type: 'success',
          message: `Retry succeeded! Removed event (${res.calendarRemovalResult?.googleEventId}) from Google Calendar and marked "${task.title}" COMPLETED.`
        });
      } else {
        setBanner({
          type: 'error',
          message: `Retry failed: ${res.message || 'Google Calendar API error'}`
        });
      }
      await loadTasks({ withSync: false });
    } catch (err) {
      setBanner({ type: 'error', message: `Retry error: ${err.message}` });
    } finally {
      setTaskBusy(task.id, null);
    }
  };

  // ── 5. Undo Completion -> Recreate event in Google Calendar and restore PENDING
  const handleUndoCompletion = async (task) => {
    if (taskBusyMap[task.id]) return;
    setTaskBusy(task.id, 'undoing');
    try {
      const res = await undoTaskCompletion(task.id);
      if (res.success && res.status === 'PENDING') {
        setBanner({
          type: 'success',
          message: res.recreatedGoogleEventId
            ? `Completion undone! Recreated Google Calendar event with new ID: ${res.recreatedGoogleEventId} and restored "${task.title}" to PENDING.`
            : `Completion undone! Restored "${task.title}" to PENDING.`
        });
      } else {
        setBanner({
          type: 'error',
          message: `Undo failed: ${res.message || 'Could not recreate Google Calendar event.'}`
        });
      }
      await loadTasks({ withSync: false });
    } catch (err) {
      setBanner({ type: 'error', message: `Undo error: ${err.message}` });
    } finally {
      setTaskBusy(task.id, null);
    }
  };

  // ── 6. Edit task modal
  const openEditModal = (task) => {
    setEditingTask(task);
    setEditTitle(task.title || '');
    setEditStart(toDatetimeLocalValue(task.scheduledStart));
    setEditDuration(task.durationMinutes || 60);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim()) return;
    const targetId = editingTask.id;
    setTaskBusy(targetId, 'editing');
    try {
      const scheduledStartIso = editStart ? `${editStart}:00+05:30` : editingTask.scheduledStart;
      await updateTaskDetails(targetId, {
        title: editTitle.trim(),
        scheduledStart: scheduledStartIso,
        durationMinutes: Number(editDuration) || 60
      });
      setEditingTask(null);
      setBanner({ type: 'success', message: `Updated "${editTitle.trim()}".` });
      await loadTasks({ withSync: false });
    } catch (err) {
      setBanner({ type: 'error', message: `Update failed: ${err.message}` });
    } finally {
      setTaskBusy(targetId, null);
    }
  };

  // ── 7. Cancel task / Delete from active schedule (preserves audit history)
  const handleCancelTask = async (task) => {
    if (taskBusyMap[task.id]) return;
    setTaskBusy(task.id, 'cancelling');
    try {
      await updateTaskStatus(task.id, 'CANCELLED');
      setBanner({ type: 'success', message: `Marked "${task.title}" as CANCELLED (history preserved).` });
      await loadTasks({ withSync: false });
    } catch (err) {
      setBanner({ type: 'error', message: `Cancel failed: ${err.message}` });
    } finally {
      setTaskBusy(task.id, null);
    }
  };

  // ── 8. Create a new task / Google Calendar event
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    try {
      const scheduledStartIso = newStart ? `${newStart}:00+05:30` : null;
      const res = await createTaskWithCalendar({
        title: newTitle.trim(),
        scheduledStart: scheduledStartIso,
        durationMinutes: Number(newDuration) || 60,
        timeZone: 'Asia/Kolkata',
        createInCalendar: newCreateInCalendar
      });

      if (res.success && res.task) {
        setNewTitle('');
        setShowCreateForm(false);
        setBanner({
          type: 'success',
          message: res.task.googleEventId
            ? `Created "${res.task.title}" and synced to Google Calendar (Event ID: ${res.task.googleEventId}).`
            : `Created task "${res.task.title}".`
        });
        await loadTasks({ withSync: false });
      }
    } catch (err) {
      setBanner({ type: 'error', message: `Failed to create task/event: ${err.message}` });
    } finally {
      setCreating(false);
    }
  };

  const filterTabs = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
    { id: 'pending', label: 'Pending', count: counts.pending },
    { id: 'completed', label: 'Completed', count: counts.completed },
    { id: 'cancelled', label: 'Cancelled', count: counts.cancelled }
  ];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">My Tasks &amp; Calendar</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Check off completed tasks to automatically verify and remove their linked events from Google Calendar while preserving full audit history.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Task / Event</span>
            </button>
            <button
              type="button"
              onClick={() => loadTasks({ withSync: true })}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-600' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Calendar'}</span>
            </button>
          </div>
        </div>

        {/* Quick Create Form */}
        {showCreateForm && (
          <form onSubmit={handleCreateTask} className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end bg-slate-50/70 p-4 rounded-xl">
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                Task / Event Title
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g., Project Review"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                Scheduled Date &amp; Time (IST)
              </label>
              <input
                type="datetime-local"
                value={newStart}
                onChange={e => setNewStart(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                Duration (min)
              </label>
              <input
                type="number"
                min="5"
                max="480"
                step="5"
                value={newDuration}
                onChange={e => setNewDuration(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newCreateInCalendar}
                  onChange={e => setNewCreateInCalendar(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Add to Google Cal</span>
              </label>
              <button
                type="submit"
                disabled={creating}
                className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        )}

        {/* Notification Banner with Optional Undo */}
        {banner && (
          <div
            className={`mt-4 p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
              banner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{banner.message}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {banner.undoTaskId && (
                <button
                  type="button"
                  onClick={() => handleUndoCompletion({ id: banner.undoTaskId, title: 'Task' })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 text-[11px] font-semibold transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Undo Completion</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-slate-400 hover:text-slate-600 px-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Filter Pills & Search Bar */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Task Filters">
            {filterTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                onClick={() => setFilter(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                  filter === tab.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    filter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search task or event title..."
              aria-label="Search task or event title"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Main Task & Calendar List */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            <span>Showing {tasks.length} item(s) — Filter: {filter.toUpperCase()}</span>
          </div>
          {counts.removalFailed > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
              <AlertTriangle className="w-3 h-3" />
              {counts.removalFailed} Calendar Removal Failed
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs">Loading tasks and Google Calendar events...</span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-10 text-center text-slate-500 space-y-2">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No tasks or calendar events match this view</p>
            <p className="text-xs text-slate-400">
              Create a new event via Voice Command or click &ldquo;New Task / Event&rdquo; above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map(task => {
              const isCompleted = task.status === 'COMPLETED';
              const isRemovalFailed = task.status === 'CALENDAR_REMOVAL_FAILED';
              const busyState = taskBusyMap[task.id];
              const badgeStyle = STATUS_BADGE_STYLES[task.status] || STATUS_BADGE_STYLES.PENDING;

              return (
                <div
                  key={task.id}
                  data-testid={`task-row-${task.id}`}
                  className={`p-4 sm:px-5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isCompleted
                      ? 'bg-emerald-50/25'
                      : isRemovalFailed
                      ? 'bg-rose-50/40'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    {/* Completion Checkbox */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isCompleted}
                      aria-label={`Mark "${task.title}" as completed`}
                      disabled={Boolean(busyState)}
                      onClick={() => handleCheckboxClick(task)}
                      className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center transition shrink-0 border ${
                        isCompleted
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : isRemovalFailed
                          ? 'bg-rose-50 border-rose-400 text-rose-600 hover:bg-rose-100'
                          : 'bg-white border-slate-300 text-transparent hover:border-blue-500'
                      } disabled:opacity-50 cursor-pointer`}
                    >
                      {busyState === 'completing' || busyState === 'retrying' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      ) : isCompleted ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300" />
                      )}
                    </button>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isCompleted ? 'line-through text-slate-500' : 'text-slate-900'
                          }`}
                        >
                          {task.title}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${badgeStyle}`}
                        >
                          {task.status}
                        </span>

                        {/* Resource Type Badge (GOOGLE_CALENDAR_EVENT vs GOOGLE_TASK) */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          <Calendar className="w-2.5 h-2.5 text-blue-600" />
                          {task.resourceType || 'ACTIONFLOW_TASK'}
                        </span>
                      </div>

                      {/* Metadata Row: Date/Time, Duration, Calendar Name, Google Event ID */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDateTime(task.scheduledStart)}</span>
                        </span>

                        <span className="text-slate-400">•</span>
                        <span>Duration: <strong className="text-slate-700">{task.durationMinutes || 60} min</strong></span>

                        <span className="text-slate-400">•</span>
                        <span>Calendar: <strong className="text-slate-700">{task.calendarName || 'Primary Calendar'}</strong></span>

                        {(task.googleEventId || task.originalGoogleEventId) && (
                          <>
                            <span className="text-slate-400">•</span>
                            <span className="font-mono text-[11px] text-slate-600">
                              Google Event ID: {task.googleEventId || `${task.originalGoogleEventId} (removed)`}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Error notice when CALENDAR_REMOVAL_FAILED */}
                      {isRemovalFailed && (
                        <div className="mt-1.5 p-2 rounded-lg bg-rose-100/80 border border-rose-200 text-[11px] text-rose-900 flex items-center justify-between gap-2">
                          <span>
                            <strong>Google Calendar deletion failed:</strong>{' '}
                            {task.calendarRemovalResult?.message || 'Event is still present in Google Calendar.'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRetryCalendarRemoval(task)}
                            disabled={Boolean(busyState)}
                            className="px-2.5 py-1 rounded-md bg-rose-700 text-white hover:bg-rose-800 font-semibold shrink-0 transition"
                          >
                            {busyState === 'retrying' ? 'Retrying...' : 'Retry Calendar Removal'}
                          </button>
                        </div>
                      )}

                      {/* Completion Details when COMPLETED */}
                      {isCompleted && (
                        <div className="text-[11px] text-emerald-700 font-medium flex flex-wrap items-center gap-2 pt-0.5">
                          <span>✓ Completed at {formatDateTime(task.completedAt)}</span>
                          {task.calendarRemovalResult?.status && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px]">
                              Calendar Removal: {task.calendarRemovalResult.status}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right-Side Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Google Calendar Link (only shown while active in Google Calendar) */}
                    {task.eventLink && task.googleEventId && !isCompleted && (
                      <a
                        href={task.eventLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>View in Calendar</span>
                      </a>
                    )}

                    {!isCompleted && task.status !== 'CANCELLED' && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(task)}
                          disabled={Boolean(busyState)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmModalTask(task)}
                          disabled={Boolean(busyState)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Complete</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCancelTask(task)}
                          disabled={Boolean(busyState)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Cancel</span>
                        </button>
                      </>
                    )}

                    {isCompleted && (
                      <button
                        type="button"
                        onClick={() => handleUndoCompletion(task)}
                        disabled={Boolean(busyState)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{busyState === 'undoing' ? 'Recreating Event...' : 'Undo Completion'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed History & Preserved Audit Trail Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completed History Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Completed History ({completedHistory.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">Non-destructive archive</span>
          </div>

          {completedHistory.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              No completed tasks yet. Checked tasks appear here with their original Google Event ID and removal confirmation.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {completedHistory.map(item => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{item.originalTitle || item.title}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      COMPLETED
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>Scheduled: {formatDateTime(item.originalScheduledStart || item.scheduledStart)}</span>
                    <span>•</span>
                    <span>Completed: {formatDateTime(item.completedAt)}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-600 flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span>Original Google Event ID: {item.originalGoogleEventId || 'N/A'}</span>
                    <span className="text-emerald-700 font-semibold">
                      Removal: {item.calendarRemovalResult?.status || 'VERIFIED'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preserved Audit Trail Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Preserved Audit Log
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">Immutable lifecycle trail</span>
          </div>

          {auditEntries.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">No audit events recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {auditEntries.slice(0, 25).map(entry => (
                <div
                  key={entry.id}
                  className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] flex items-start justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <span className="font-mono font-bold text-blue-700">{entry.event}</span>
                    <div className="text-slate-600">
                      Action/Task: <span className="font-mono">{entry.actionId || '—'}</span>
                      {entry.details?.eventId || entry.details?.googleEventId || entry.details?.originalGoogleEventId ? (
                        <span className="ml-2 font-mono text-slate-500">
                          • Event ID: {entry.details.eventId || entry.details.googleEventId || entry.details.originalGoogleEventId}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-slate-400 font-mono shrink-0">
                    {new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog Modal ("Mark this task as completed and remove it from Google Calendar?") */}
      {confirmModalTask && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="complete-confirm-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 id="complete-confirm-title" className="text-base font-bold text-slate-900">
                  Mark this task as completed and remove it from Google Calendar?
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Task: <strong>{confirmModalTask.title}</strong>
                </p>
                {confirmModalTask.googleEventId && (
                  <p className="text-[11px] font-mono text-slate-500 mt-1">
                    Linked Google Event ID: {confirmModalTask.googleEventId}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-2">
                  Confirming will call the Google Calendar <code className="font-mono">events.delete</code> API for this event and record the completed task in your Completed History.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleCancelConfirmModal}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmComplete}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-xs"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEdit}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900">Edit Task &amp; Calendar Event</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
              <input
                type="text"
                required
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Scheduled Date &amp; Time</label>
              <input
                type="datetime-local"
                value={editStart}
                onChange={e => setEditStart(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (minutes)</label>
              <input
                type="number"
                min="5"
                max="480"
                value={editDuration}
                onChange={e => setEditDuration(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

