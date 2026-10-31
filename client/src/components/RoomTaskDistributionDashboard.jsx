/**
 * ActionFlow Client — Centralized Room-Based Task Distribution Dashboard
 *
 * Implements:
 * - Single-system software architecture (all tasks routed through single microphone / software gateway)
 * - 13 Default Canonical Room categories + Custom Administrator Rooms:
 *     All Rooms, Kitchen, Reception, Drawing Room, Living Room, Bedroom, Bathroom,
 *     Office, Meeting Room, Store Room, Dining Room, Parking Area, General, Unassigned
 * - Live real-time WebSocket (/ws) updates & instant optimistic feedback
 * - Room-level and global task analytics (Total, Pending, In-Progress, Completed, Overdue, High Priority, Recent)
 * - Intelligent Room Confidence & Review indicators (AUTO_ASSIGNED vs NEEDS_REVIEW)
 * - Full task lifecycle management (Start, Complete, Reopen, Edit, Reassign Room, View Audit History)
 * - Room configuration management (Add, Edit, Reorder, Deactivate, Custom Keywords & Categories)
 * - Multi-lingual voice provenance tracking (preserves original transcript)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Layers, Utensils, UserCheck, Sofa, Tv, Bed, Droplet, Briefcase, Users,
  Archive, Coffee, Car, HelpCircle, CheckCircle2, Clock, AlertTriangle,
  Search, Filter, Plus, Edit2, RotateCcw, Check, X, ArrowRight,
  ExternalLink, Calendar, User, Tag, ChevronDown, RefreshCw, Settings,
  Eye, ArrowUpDown, ShieldCheck, Sparkles, AlertCircle
} from 'lucide-react';
import {
  fetchRooms,
  fetchRoomTasks,
  createRoom,
  updateRoom,
  deleteRoom,
  reorderRooms,
  reassignTaskRoom,
  reopenTask,
  recordRoomFeedback,
  classifyTextToRoom
} from '../services/roomApi';
import {
  fetchTasks,
  createTaskWithCalendar,
  updateTaskDetails,
  updateTaskStatus,
  completeTaskAndRemoveEvent
} from '../services/taskApi';
import { SESSION_ID } from '../services/intelligenceApi';
import useActionFlowWS from '../hooks/useActionFlowWS';
import { SAMPLE_PEOPLE } from '../data/samplePeople';

// ─── Room Icon Mapping ────────────────────────────────────────────────────────
const ROOM_ICONS = {
  Utensils,
  UserCheck,
  Sofa,
  Tv,
  Bed,
  Droplet,
  Briefcase,
  Users,
  Archive,
  Coffee,
  Car,
  Layers,
  HelpCircle
};

const ROOM_COLORS = {
  amber:  { badge: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500', light: 'bg-amber-50' },
  blue:   { badge: 'bg-blue-100 text-blue-800 border-blue-300', dot: 'bg-blue-500', light: 'bg-blue-50' },
  indigo: { badge: 'bg-indigo-100 text-indigo-800 border-indigo-300', dot: 'bg-indigo-500', light: 'bg-indigo-50' },
  purple: { badge: 'bg-purple-100 text-purple-800 border-purple-300', dot: 'bg-purple-500', light: 'bg-purple-50' },
  rose:   { badge: 'bg-rose-100 text-rose-800 border-rose-300', dot: 'bg-rose-500', light: 'bg-rose-50' },
  cyan:   { badge: 'bg-cyan-100 text-cyan-800 border-cyan-300', dot: 'bg-cyan-500', light: 'bg-cyan-50' },
  violet: { badge: 'bg-violet-100 text-violet-800 border-violet-300', dot: 'bg-violet-500', light: 'bg-violet-50' },
  emerald:{ badge: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500', light: 'bg-emerald-50' },
  teal:   { badge: 'bg-teal-100 text-teal-800 border-teal-300', dot: 'bg-teal-500', light: 'bg-teal-50' },
  orange: { badge: 'bg-orange-100 text-orange-800 border-orange-300', dot: 'bg-orange-500', light: 'bg-orange-50' },
  slate:  { badge: 'bg-slate-100 text-slate-800 border-slate-300', dot: 'bg-slate-500', light: 'bg-slate-50' },
  sky:    { badge: 'bg-sky-100 text-sky-800 border-sky-300', dot: 'bg-sky-500', light: 'bg-sky-50' },
  gray:   { badge: 'bg-gray-100 text-gray-800 border-gray-300', dot: 'bg-gray-500', light: 'bg-gray-50' }
};

function getRoomColorStyles(colorKey) {
  return ROOM_COLORS[colorKey] || ROOM_COLORS.blue;
}

export default function RoomTaskDistributionDashboard({ onNavigateToVoice }) {
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState('all'); // 'all' or specific roomId
  const [tasks, setTasks] = useState([]);
  const [counts, setCounts] = useState({});
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    highPriority: 0,
    recentlyAdded: 0
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'in_progress' | 'needs_review' | 'completed'
  const [priorityFilter, setPriorityFilter] = useState('all'); // 'all' | 'Urgent' | 'High' | 'Normal' | 'Low'
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'dueDate' | 'priority' | 'confidence'

  // Modals & Panels
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRoomAdminModalOpen, setIsRoomAdminModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [reassigningTask, setReassigningTask] = useState(null);
  const [viewingAuditTask, setViewingAuditTask] = useState(null);
  const [notification, setNotification] = useState(null);

  // New Task Form State
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    description: '',
    roomId: 'room_unassigned',
    category: '',
    priority: 'Normal',
    assigneeId: '',
    dueDate: '',
    createInCalendar: false
  });

  // Room Admin Form State
  const [newRoomForm, setNewRoomForm] = useState({
    name: '',
    description: '',
    icon: 'Layers',
    color: 'blue',
    categories: '',
    routingKeywords: ''
  });

  // ─── WebSocket Real-Time Sync ───────────────────────────────────────────────
  useActionFlowWS({
    sessionId: SESSION_ID,
    onMessage: useCallback((msg) => {
      if (
        msg.type === 'task:room_assigned' ||
        msg.type === 'task:room_reassigned' ||
        msg.type === 'task:updated' ||
        msg.type === 'task:completed' ||
        msg.type === 'task:reopened' ||
        msg.type === 'room:updated' ||
        msg.type === 'CALENDAR_UPDATED'
      ) {
        loadData(false);
      }
    }, [])
  });

  // ─── Load Data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setRefreshing(true);
    try {
      const [roomsRes, tasksRes] = await Promise.all([
        fetchRooms(),
        fetchTasks({ filter: 'all' })
      ]);

      if (roomsRes?.rooms) {
        setRooms(roomsRes.rooms);
      }

      if (tasksRes?.tasks) {
        setTasks(tasksRes.tasks);
        setCounts(tasksRes.counts || {});
        if (tasksRes.stats) {
          setStats(tasksRes.stats);
        }
      }
    } catch (err) {
      console.warn('[RoomDashboard] Failed loading data:', err.message);
    } finally {
      if (showLoader) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // Selected room details
  const activeRoom = useMemo(() => {
    if (selectedRoomId === 'all') return null;
    return rooms.find(r => r.roomId === selectedRoomId) || null;
  }, [rooms, selectedRoomId]);

  // Available categories across selected room or all rooms
  const availableCategories = useMemo(() => {
    if (activeRoom) {
      return activeRoom.categories || [];
    }
    const set = new Set();
    rooms.forEach(r => (r.categories || []).forEach(c => set.add(c)));
    return Array.from(set);
  }, [activeRoom, rooms]);

  // Filtered & Sorted Tasks
  const displayedTasks = useMemo(() => {
    let result = [...tasks];

    // Room filter
    if (selectedRoomId !== 'all') {
      result = result.filter(t => (t.roomId || 'room_unassigned') === selectedRoomId);
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        result = result.filter(t => t.status === 'PENDING' || t.status === 'NEEDS_ROOM_REVIEW' || t.status === 'NEEDS_CLARIFICATION');
      } else if (statusFilter === 'in_progress') {
        result = result.filter(t => t.status === 'IN_PROGRESS');
      } else if (statusFilter === 'needs_review') {
        result = result.filter(t => t.requiresRoomReview || t.status === 'NEEDS_ROOM_REVIEW');
      } else if (statusFilter === 'completed') {
        result = result.filter(t => t.status === 'COMPLETED');
      }
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      result = result.filter(t => t.priority === priorityFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(t => t.roomCategory === categoryFilter);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(t =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.roomNameSnapshot && t.roomNameSnapshot.toLowerCase().includes(q)) ||
        (t.assigneeName && t.assigneeName.toLowerCase().includes(q)) ||
        (t.sourceTranscriptId && t.sourceTranscriptId.toLowerCase().includes(q))
      );
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'dueDate') {
        const da = a.dueDate || a.scheduledStart ? new Date(a.dueDate || a.scheduledStart).getTime() : Infinity;
        const db = b.dueDate || b.scheduledStart ? new Date(b.dueDate || b.scheduledStart).getTime() : Infinity;
        return da - db;
      }
      if (sortBy === 'priority') {
        const score = { Urgent: 4, High: 3, Normal: 2, Low: 1 };
        return (score[b.priority] || 0) - (score[a.priority] || 0);
      }
      if (sortBy === 'confidence') {
        return (b.classificationConfidence || 0) - (a.classificationConfidence || 0);
      }
      // 'newest'
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    return result;
  }, [tasks, selectedRoomId, statusFilter, priorityFilter, categoryFilter, searchQuery, sortBy]);

  // Recalculate stats for the active room or global
  const activeStats = useMemo(() => {
    const list = selectedRoomId === 'all'
      ? tasks
      : tasks.filter(t => (t.roomId || 'room_unassigned') === selectedRoomId);

    const nowMs = Date.now();
    return {
      total: list.length,
      pending: list.filter(t => t.status === 'PENDING' || t.status === 'NEEDS_ROOM_REVIEW' || t.status === 'NEEDS_CLARIFICATION').length,
      inProgress: list.filter(t => t.status === 'IN_PROGRESS').length,
      completed: list.filter(t => t.status === 'COMPLETED').length,
      overdue: list.filter(t =>
        t.status !== 'COMPLETED' &&
        t.status !== 'CANCELLED' &&
        t.dueDate &&
        new Date(t.dueDate).getTime() < nowMs
      ).length,
      highPriority: list.filter(t => t.priority === 'Urgent' || t.priority === 'High').length,
      recentlyAdded: list.filter(t => new Date(t.createdAt).getTime() >= nowMs - 24 * 3600 * 1000).length
    };
  }, [tasks, selectedRoomId]);

  // ─── Actions ────────────────────────────────────────────────────────────────
  const handleReassign = async (task, newRoomId) => {
    try {
      const res = await reassignTaskRoom(task.id, newRoomId, 'User reassigned via Room Dashboard');
      if (res.success) {
        setNotification({
          type: 'success',
          message: `Moved task "${task.title}" to ${res.task.roomNameSnapshot || 'new room'}.`
        });
        setReassigningTask(null);
        await loadData(false);
      }
    } catch (err) {
      setNotification({ type: 'error', message: `Reassignment failed: ${err.message}` });
    }
  };

  const handleToggleComplete = async (task) => {
    try {
      if (task.status === 'COMPLETED') {
        const res = await reopenTask(task.id, 'Reopened from Room Dashboard');
        if (res.success) {
          setNotification({ type: 'success', message: `Reopened task "${task.title}".` });
          await loadData(false);
        }
      } else {
        const res = await completeTaskAndRemoveEvent(task.id, { confirmComplete: true });
        if (res.success) {
          setNotification({ type: 'success', message: `Completed task "${task.title}".` });
          await loadData(false);
        }
      }
    } catch (err) {
      setNotification({ type: 'error', message: `Update failed: ${err.message}` });
    }
  };

  const handleSetInProgress = async (task) => {
    try {
      const res = await updateTaskStatus(task.id, 'IN_PROGRESS');
      if (res.success) {
        setNotification({ type: 'success', message: `Task "${task.title}" is now In Progress.` });
        await loadData(false);
      }
    } catch (err) {
      setNotification({ type: 'error', message: `Status update failed: ${err.message}` });
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskForm.title.trim()) return;

    try {
      const selectedPerson = SAMPLE_PEOPLE.find(p => p.id === newTaskForm.assigneeId);
      const res = await createTaskWithCalendar({
        title: newTaskForm.title.trim(),
        description: newTaskForm.description.trim(),
        roomId: newTaskForm.roomId,
        roomCategory: newTaskForm.category || 'General',
        priority: newTaskForm.priority,
        assigneeId: newTaskForm.assigneeId || null,
        assigneeName: selectedPerson?.name || null,
        dueDate: newTaskForm.dueDate || null,
        scheduledStart: newTaskForm.dueDate || null,
        createInCalendar: newTaskForm.createInCalendar
      });

      if (res.success) {
        setNotification({
          type: 'success',
          message: `Created task "${res.task.title}" in ${res.task.roomNameSnapshot}!`
        });
        setIsCreateModalOpen(false);
        setNewTaskForm({
          title: '',
          description: '',
          roomId: selectedRoomId !== 'all' ? selectedRoomId : 'room_unassigned',
          category: '',
          priority: 'Normal',
          assigneeId: '',
          dueDate: '',
          createInCalendar: false
        });
        await loadData(false);
      }
    } catch (err) {
      setNotification({ type: 'error', message: `Task creation failed: ${err.message}` });
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomForm.name.trim()) return;

    try {
      const categories = newRoomForm.categories.split(',').map(s => s.trim()).filter(Boolean);
      const routingKeywords = newRoomForm.routingKeywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

      const res = await createRoom({
        name: newRoomForm.name.trim(),
        description: newRoomForm.description.trim(),
        icon: newRoomForm.icon,
        color: newRoomForm.color,
        categories: categories.length > 0 ? categories : ['General'],
        routingKeywords: routingKeywords.length > 0 ? routingKeywords : [newRoomForm.name.toLowerCase()]
      });

      if (res.success) {
        setNotification({ type: 'success', message: `Created new room "${res.room.name}"!` });
        setIsRoomAdminModalOpen(false);
        setNewRoomForm({
          name: '',
          description: '',
          icon: 'Layers',
          color: 'blue',
          categories: '',
          routingKeywords: ''
        });
        await loadData(false);
      }
    } catch (err) {
      setNotification({ type: 'error', message: `Failed to create room: ${err.message}` });
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Top Header & Controls ────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-200">
              <Layers className="w-5 h-5 text-blue-600" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Room-Based Task Distribution
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Intelligently classifies and distributes single-mic voice commands into dedicated room sections.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => loadData(false)}
            disabled={refreshing}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition border border-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Sync
          </button>

          <button
            type="button"
            onClick={() => setIsRoomAdminModalOpen(true)}
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-slate-200 transition"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            Manage Rooms
          </button>

          <button
            type="button"
            onClick={() => {
              setNewTaskForm(prev => ({
                ...prev,
                roomId: selectedRoomId !== 'all' ? selectedRoomId : 'room_unassigned'
              }));
              setIsCreateModalOpen(true);
            }}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Task
          </button>
        </div>
      </div>

      {/* ─── Notification Toast ───────────────────────────────────────────── */}
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
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Room Navigation Pills ────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
          <span className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
            Rooms &amp; Workspaces ({rooms.length})
          </span>
          <span className="text-[11px] text-slate-400">
            Click a room to filter tasks
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {/* 'All Rooms' Pill */}
          <button
            type="button"
            onClick={() => setSelectedRoomId('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition border ${
              selectedRoomId === 'all'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>All Rooms</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              selectedRoomId === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800'
            }`}>
              {tasks.length}
            </span>
          </button>

          {/* Individual Room Pills */}
          {rooms.map(room => {
            const Icon = ROOM_ICONS[room.icon] || ROOM_ICONS.Layers;
            const count = counts.byRoom?.[room.roomId] || 0;
            const isSelected = selectedRoomId === room.roomId;
            const colorStyles = getRoomColorStyles(room.color);

            return (
              <button
                key={room.roomId}
                type="button"
                onClick={() => setSelectedRoomId(room.roomId)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${colorStyles.dot}`} />
                <Icon className="w-3.5 h-3.5" />
                <span>{room.name}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : count > 0 ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Room Summary Metric Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total</span>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{activeStats.total}</p>
          <span className="text-[10px] text-slate-400">In {activeRoom ? activeRoom.name : 'All Rooms'}</span>
        </div>

        <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-amber-700 uppercase tracking-wider">Pending</span>
          <p className="text-xl font-bold text-amber-900 mt-0.5">{activeStats.pending}</p>
          <span className="text-[10px] text-amber-700">Awaiting action</span>
        </div>

        <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">In Progress</span>
          <p className="text-xl font-bold text-blue-900 mt-0.5">{activeStats.inProgress}</p>
          <span className="text-[10px] text-blue-700">Underway</span>
        </div>

        <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider">Completed</span>
          <p className="text-xl font-bold text-emerald-900 mt-0.5">{activeStats.completed}</p>
          <span className="text-[10px] text-emerald-700">Resolved</span>
        </div>

        <div className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-rose-700 uppercase tracking-wider">Overdue</span>
          <p className="text-xl font-bold text-rose-900 mt-0.5">{activeStats.overdue}</p>
          <span className="text-[10px] text-rose-700">Past deadline</span>
        </div>

        <div className="p-3.5 bg-purple-50/60 border border-purple-200 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-purple-700 uppercase tracking-wider">High Priority</span>
          <p className="text-xl font-bold text-purple-900 mt-0.5">{activeStats.highPriority}</p>
          <span className="text-[10px] text-purple-700">Urgent / High</span>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Recent</span>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{activeStats.recentlyAdded}</p>
          <span className="text-[10px] text-slate-500">Last 24 hours</span>
        </div>
      </div>

      {/* ─── Search, Filters, & Sorting Bar ──────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks, descriptions, assignees..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="needs_review">Needs Room Review</option>
            <option value="completed">Completed</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
          >
            <option value="all">All Priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Normal">Normal</option>
            <option value="Low">Low</option>
          </select>

          {/* Category Filter */}
          {availableCategories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
            >
              <option value="all">All Categories</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
          >
            <option value="newest">Sort: Newest</option>
            <option value="dueDate">Sort: Due Date</option>
            <option value="priority">Sort: Priority</option>
            <option value="confidence">Sort: AI Confidence</option>
          </select>
        </div>
      </div>

      {/* ─── Task List View ──────────────────────────────────────────────── */}
      {displayedTasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            No tasks found in {activeRoom ? activeRoom.name : 'this view'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
              ? 'Try relaxing your filters or clearing the search query.'
              : 'Speak a voice command to extract and assign tasks, or click "Add Task" to create one manually.'}
          </p>
          {onNavigateToVoice && (
            <button
              type="button"
              onClick={onNavigateToVoice}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              🎙️ Speak a Voice Command
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedTasks.map(task => {
            const taskRoom = rooms.find(r => r.roomId === task.roomId) || {
              roomId: task.roomId || 'room_unassigned',
              name: task.roomNameSnapshot || 'General',
              color: 'slate',
              icon: 'Layers'
            };
            const RoomIcon = ROOM_ICONS[taskRoom.icon] || ROOM_ICONS.Layers;
            const colorStyles = getRoomColorStyles(taskRoom.color);
            const isCompleted = task.status === 'COMPLETED';
            const isNeedsReview = task.requiresRoomReview || task.status === 'NEEDS_ROOM_REVIEW';

            return (
              <div
                key={task.id}
                className={`bg-white border rounded-2xl p-5 shadow-xs transition hover:shadow-sm space-y-4 ${
                  isCompleted ? 'border-slate-200 opacity-75' : isNeedsReview ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
                }`}
              >
                {/* Header: Room Pill & Confidence */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${colorStyles.badge}`}>
                      <RoomIcon className="w-3.5 h-3.5" />
                      <span>{task.roomNameSnapshot || taskRoom.name}</span>
                    </span>

                    {task.roomCategory && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {task.roomCategory}
                      </span>
                    )}
                  </div>

                  {/* AI Confidence / Review Badge */}
                  {isNeedsReview ? (
                    <button
                      type="button"
                      onClick={() => setReassigningTask(task)}
                      className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-300 rounded text-[10px] font-bold flex items-center gap-1 hover:bg-amber-100 transition"
                      title="AI suggested this room with low confidence. Click to confirm or reassign."
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      Needs Review
                    </button>
                  ) : (
                    <span
                      className="text-[10px] text-slate-400 font-mono flex items-center gap-1"
                      title={task.classificationReason || 'Auto-assigned by ActionFlow Room Engine'}
                    >
                      <Sparkles className="w-3 h-3 text-blue-500" />
                      {Math.round((task.classificationConfidence || 0.95) * 100)}% Match
                    </span>
                  )}
                </div>

                {/* Title & Description */}
                <div className="space-y-1">
                  <h4 className={`text-sm font-bold tracking-tight text-slate-900 ${isCompleted ? 'line-through text-slate-400' : ''}`}>
                    {task.title}
                  </h4>
                  {task.description && (
                    <p className="text-xs text-slate-600 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                </div>

                {/* Metadata Row: Priority, Assignee, Due Date */}
                <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500 pt-1 border-t border-slate-100">
                  {task.priority && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      task.priority === 'Urgent' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      task.priority === 'High' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                      'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {task.priority}
                    </span>
                  )}

                  {task.assigneeName && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-slate-700">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {task.assigneeName}
                    </span>
                  )}

                  {(task.dueDate || task.scheduledStart) && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-500">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(task.dueDate || task.scheduledStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}

                  {task.googleEventId && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-blue-600" />
                      Synced
                    </span>
                  )}
                </div>

                {/* Footer Controls: Quick Actions */}
                <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleComplete(task)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                        isCompleted
                          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                      }`}
                    >
                      {isCompleted ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" /> Reopen
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" /> Mark Done
                        </>
                      )}
                    </button>

                    {!isCompleted && task.status !== 'IN_PROGRESS' && (
                      <button
                        type="button"
                        onClick={() => handleSetInProgress(task)}
                        className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition border border-blue-200"
                      >
                        Start
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setReassigningTask(task)}
                      className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg font-medium transition"
                      title="Reassign to another room"
                    >
                      Move Room
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewingAuditTask(task)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                      title="View audit history"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── MODAL 1: Create Task Modal ───────────────────────────────────── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Add New Room Task
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  value={newTaskForm.title}
                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Repair drawing room chandelier lights"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newTaskForm.description}
                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Additional context or notes..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Destination Room *</label>
                  <select
                    value={newTaskForm.roomId}
                    onChange={(e) => setNewTaskForm(prev => ({ ...prev, roomId: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium"
                  >
                    {rooms.map(r => (
                      <option key={r.roomId} value={r.roomId}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Priority</label>
                  <select
                    value={newTaskForm.priority}
                    onChange={(e) => setNewTaskForm(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium"
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Normal">Normal</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Assignee</label>
                  <select
                    value={newTaskForm.assigneeId}
                    onChange={(e) => setNewTaskForm(prev => ({ ...prev, assigneeId: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                  >
                    <option value="">Unassigned</option>
                    {SAMPLE_PEOPLE.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.department || 'Staff'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Due Date</label>
                  <input
                    type="datetime-local"
                    value={newTaskForm.dueDate}
                    onChange={(e) => setNewTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3.5 py-2 text-slate-600 hover:text-slate-900 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: Room Reassignment Dropdown Modal ────────────────────── */}
      {reassigningTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-blue-600" />
                Move Task to Room
              </h3>
              <button
                type="button"
                onClick={() => setReassigningTask(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Target Task</span>
              <p className="font-bold text-slate-900">{reassigningTask.title}</p>
              <p className="text-slate-500 text-[11px]">
                Current room: <span className="font-semibold text-slate-800">{reassigningTask.roomNameSnapshot || 'General'}</span>
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Select New Destination Room:</label>
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                {rooms.map(r => {
                  const Icon = ROOM_ICONS[r.icon] || ROOM_ICONS.Layers;
                  const isCurrent = reassigningTask.roomId === r.roomId;
                  return (
                    <button
                      key={r.roomId}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => handleReassign(reassigningTask, r.roomId)}
                      className={`p-2.5 rounded-xl border text-left text-xs flex items-center gap-2 transition ${
                        isCurrent
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-800 border-slate-200 shadow-2xs'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-blue-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-bold block truncate">{r.name}</span>
                        <span className="text-[10px] text-slate-400 block truncate">{r.categories?.[0] || 'Room'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setReassigningTask(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: Audit Trail Viewer ─────────────────────────────────── */}
      {viewingAuditTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Task Audit History
              </h3>
              <button
                type="button"
                onClick={() => setViewingAuditTask(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <p className="font-bold text-slate-900">{viewingAuditTask.title}</p>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>ID: <code className="font-mono text-slate-700">{viewingAuditTask.id}</code></span>
                <span>•</span>
                <span>Room: <strong className="text-slate-800">{viewingAuditTask.roomNameSnapshot}</strong></span>
              </div>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {Array.isArray(viewingAuditTask.auditTrail) && viewingAuditTask.auditTrail.length > 0 ? (
                viewingAuditTask.auditTrail.map((entry, idx) => (
                  <div key={entry.id || idx} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-900 font-mono text-[11px]">{entry.event}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <pre className="text-[10px] font-mono text-slate-600 bg-white p-1.5 rounded border border-slate-200 overflow-x-auto">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 text-center py-4">No audit entries recorded.</p>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingAuditTask(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: Manage Rooms Modal ─────────────────────────────────── */}
      {isRoomAdminModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600" />
                Room Management &amp; Configuration
              </h3>
              <button
                type="button"
                onClick={() => setIsRoomAdminModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Existing Rooms List */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                Configured Rooms ({rooms.length})
              </span>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                {rooms.map(r => {
                  const Icon = ROOM_ICONS[r.icon] || ROOM_ICONS.Layers;
                  const colorStyles = getRoomColorStyles(r.color);
                  return (
                    <div key={r.roomId} className="p-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`p-1.5 rounded-lg border ${colorStyles.badge}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 block truncate">{r.name}</span>
                          <span className="text-[11px] text-slate-500 block truncate">{r.description || 'No description'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {counts.byRoom?.[r.roomId] || 0} tasks
                        </span>
                        {r.isDefault ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                            System
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              if (window.confirm(`Deactivate room "${r.name}"?`)) {
                                await deleteRoom(r.roomId);
                                await loadData(false);
                              }
                            }}
                            className="text-rose-600 hover:text-rose-800 text-xs font-medium hover:underline"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Create New Room Form */}
            <form onSubmit={handleCreateRoom} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                <Plus className="w-4 h-4 text-blue-600" />
                Add New Room
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Room Name *</label>
                  <input
                    type="text"
                    required
                    value={newRoomForm.name}
                    onChange={(e) => setNewRoomForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Terrace Garden"
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Color Theme</label>
                  <select
                    value={newRoomForm.color}
                    onChange={(e) => setNewRoomForm(prev => ({ ...prev, color: e.target.value }))}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                  >
                    {Object.keys(ROOM_COLORS).map(c => (
                      <option key={c} value={c}>{c.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description</label>
                <input
                  type="text"
                  value={newRoomForm.description}
                  onChange={(e) => setNewRoomForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g. Rooftop garden, plants, drip irrigation"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Categories (comma-separated)</label>
                <input
                  type="text"
                  value={newRoomForm.categories}
                  onChange={(e) => setNewRoomForm(prev => ({ ...prev, categories: e.target.value }))}
                  placeholder="Gardening, Plant Care, Lighting"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Routing Keywords (comma-separated)</label>
                <input
                  type="text"
                  value={newRoomForm.routingKeywords}
                  onChange={(e) => setNewRoomForm(prev => ({ ...prev, routingKeywords: e.target.value }))}
                  placeholder="plants, गमला, terrace, watering, seeds"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition"
                >
                  Create Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
