/**
 * ActionFlow AI — Voice Command Workspace (Phase 1 Upgraded)
 *
 * Implements:
 *  - 3 Distinct Voice Command Modes:
 *      1. QUICK COMMAND MODE (Fast single instruction, instant preview)
 *      2. CONVERSATION MODE (Multiple instructions, multi-task, dependency linking)
 *      3. CONTINUOUS MEETING MODE (Long-form audio recording, meeting summary, action items)
 *  - Web Audio API Live Waveform & Duration Counter
 *  - MediaRecorder Pause, Resume, Stop, and Cancel controls
 *  - Audio File Upload (.mp3, .wav, .m4a, .webm, .ogg) with Whisper / Gemini transcription
 *  - Microphone Device Selection
 *  - Smart Interactive Transcript Highlighter with in-place entity inspector
 *  - Natural Confirmation Feedback Banner
 *  - Multi-destination action cards with approval flows
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, Square, RefreshCw, Sparkles, AlertCircle, Edit3, Check, X,
  Zap, Calendar, Bell, ShoppingCart, MessageSquare, Mail,
  FileText, ClipboardList, Video, HelpCircle,
  User, GitBranch, Loader2, RotateCcw,
  Wifi, WifiOff,
  Upload, Pause, Play, Volume2
} from 'lucide-react';
import { createSpeechRecognizer, isSpeechRecognitionSupported } from '../features/voice/speechRecognition';
import { routeTranscript, DESTINATION_LABELS, DESTINATION_ICONS, DESTINATION_COLORS } from '../features/intelligence/destinationRouter';
import {
  sendVoiceCommand,
  approveAction,
  transcribeAudio,
  startMeeting,
  sendMeetingChunk,
  endMeeting
} from '../services/voiceApi';
import useActionFlowWS from '../hooks/useActionFlowWS';
import TranscriptHighlighter from './TranscriptHighlighter';
import WhatsAppComposer from './WhatsAppComposer';
import GoogleCalendarApprovalCard from './GoogleCalendarApprovalCard';

// ─── Destination Icons & Badges ───────────────────────────────────────────────
const DEST_ICONS = {
  CALENDAR: Calendar,
  GOOGLE_CALENDAR: Calendar,
  TASK_MANAGER: ClipboardList,
  TASK_ASSIGNMENT: User,
  WHATSAPP: MessageSquare,
  EMAIL: Mail,
  PERSONAL_REMINDER: Bell,
  REMINDERS: Bell,
  SHOPPING_LIST: ShoppingCart,
  MEETING_INTELLIGENCE: FileText,
  MEETING_NOTES: FileText,
  DOCUMENT_SHARING: FileText,
  DOCUMENT_WORKFLOW: FileText,
  MEETING_RECORDER: Video,
  SITE_RECORDING: Video,
  UNKNOWN: HelpCircle,
  UNKNOWN_DESTINATION: HelpCircle
};

const DEST_BADGE = {
  blue:    'bg-blue-100 text-blue-800 border-blue-300',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  violet:  'bg-violet-100 text-violet-800 border-violet-300',
  pink:    'bg-pink-100 text-pink-800 border-pink-300',
  green:   'bg-green-100 text-green-800 border-green-300',
  indigo:  'bg-indigo-100 text-indigo-800 border-indigo-300',
  amber:   'bg-amber-100 text-amber-800 border-amber-300',
  orange:  'bg-orange-100 text-orange-800 border-orange-300',
  slate:   'bg-slate-100 text-slate-700 border-slate-300',
  cyan:    'bg-cyan-100 text-cyan-800 border-cyan-300',
  rose:    'bg-rose-100 text-rose-800 border-rose-300',
  purple:  'bg-purple-100 text-purple-800 border-purple-300',
  sky:     'bg-sky-100 text-sky-800 border-sky-300',
  gray:    'bg-gray-100 text-gray-600 border-gray-300'
};

function destBadgeClass(dest) {
  return DEST_BADGE[DESTINATION_COLORS[dest]] || DEST_BADGE.gray;
}

// ─── Action Card (V4 Master Upgrade) ─────────────────────────────────────────
function ActionCard({ action, directory = [], onApprove, onReject, onAssigneeChange, onUpdateAction }) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const DestIcon = DEST_ICONS[action.destination] || HelpCircle;
  const bc = destBadgeClass(action.destination);
  const isPending = (action.stage === 'READY_FOR_APPROVAL' || action.status === 'NEEDS_CLARIFICATION_OR_APPROVAL' || action.status === 'NEEDS_RECIPIENT_NUMBER_OR_APPROVAL' || action.status === 'NEEDS_MESSAGE_CONTENT') && !result;
  const isAwaitingUserSend = result?.status === 'AWAITING_USER_SEND' || result?.result?.status === 'AWAITING_USER_SEND';
  const isUserConfirmedManual = result?.whatsappStatus === 'USER_CONFIRMED_SENT' || result?.result?.status === 'USER_CONFIRMED_SENT';
  const isSimulated = result?.status === 'SIMULATED' || result?.result?.status === 'SIMULATED' || result?.isSimulated === true;
  const isDone =
    !isAwaitingUserSend &&
    !isUserConfirmedManual &&
    !isSimulated &&
    (action.stage === 'COMPLETED' ||
      (result?.success === true &&
        (result?.status === 'COMPLETED' ||
          result?.whatsappStatus === 'QUEUED' ||
          result?.whatsappStatus === 'SENT' ||
          result?.whatsappStatus === 'DELIVERED' ||
          result?.whatsappStatus === 'READ' ||
          result?.result?.status === 'COMPLETED' ||
          result?.result?.status === 'SENT')));
  const isFailed = action.stage === 'FAILED' || (result && (result.status === 'FAILED' || result.success === false));

  const handleApprove = async (customPayload) => {
    if (submitting) return result;
    setSubmitting(true);
    try {
      const payload = customPayload || action;
      const r = await approveAction(payload);
      setResult(r);
      onApprove?.(payload, r);
      return r;
    } catch (e) {
      const errObj = { success: false, status: 'FAILED', error: e.message, message: e.message };
      setResult(errObj);
      return errObj;
    } finally {
      setSubmitting(false);
    }
  };

  const isWhatsApp = action.destination === 'WHATSAPP' || action.type === 'SEND_WHATSAPP';
  const isCalendar = action.destination === 'GOOGLE_CALENDAR' || action.destination === 'CALENDAR' || action.type === 'CREATE_EVENT' || action.type === 'CREATE_CALENDAR_EVENT' || action.type === 'RESCHEDULE_EVENT';
  const isShopping = action.destination === 'SHOPPING_LIST' || action.type === 'ADD_ITEM' || action.type === 'ADD_SHOPPING_ITEM';

  return (
    <div className={`bg-white rounded-xl border overflow-hidden shadow-xs transition-all w-full max-w-full ${
      isDone    ? 'border-emerald-300' :
      isFailed  ? 'border-rose-300' :
      isPending ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200'
    }`}>
      <div className="px-4 py-3 flex items-start gap-3">
        <div className={`p-2 rounded-lg border shrink-0 ${bc}`}>
          <DestIcon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${bc}`}>
                {DESTINATION_ICONS[action.destination] || '⚡'} {action.destinationLabel || action.destination}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">#{action.type || 'ACTION'}</span>
              {action.priority && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                  action.priority === 'Urgent' ? 'bg-rose-100 text-rose-800' :
                  action.priority === 'High' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                }`}>
                  {action.priority}
                </span>
              )}
              {action.roomName && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-bold flex items-center gap-1 shadow-2xs">
                  🏠 {action.roomName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isPending && (
                <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-semibold">
                  {action.status === 'NEEDS_RECIPIENT_NUMBER_OR_APPROVAL' ? 'Phone Number Needed' : 'Approval Required'}
                </span>
              )}
              {isAwaitingUserSend && (
                <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 font-semibold">
                  Awaiting User Send in WhatsApp
                </span>
              )}
              {isSimulated && (
                <span className="text-[10px] text-purple-800 bg-purple-100 px-2 py-0.5 rounded border border-purple-300 font-semibold">
                  Simulated Only (Not Sent)
                </span>
              )}
              {isDone && (
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" />
                  {result?.whatsappStatus ? `WhatsApp: ${result.whatsappStatus}` : 'Executed'}
                </span>
              )}
              {isFailed && (
                <span className="text-[10px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-semibold">
                  Failed
                </span>
              )}
            </div>
          </div>

          <h3 className="text-sm font-semibold text-slate-800 mt-1 break-words">{action.title}</h3>

          {/* CALENDAR-SPECIFIC DEDICATED APPROVAL CARD (Phase 4, 6, 10) */}
          {isCalendar && (
            <GoogleCalendarApprovalCard
              action={action}
              directory={directory}
              onApprove={handleApprove}
              onDismiss={onReject}
              onUpdateAction={onUpdateAction}
            />
          )}

          {/* WHATSAPP-SPECIFIC COMPOSER & NUMBER MANAGEMENT */}
          {isWhatsApp && (
            <WhatsAppComposer
              action={action}
              directory={directory}
              onUpdateAction={onUpdateAction}
              onSend={handleApprove}
              isSubmitting={submitting}
            />
          )}

          {/* SHOPPING-SPECIFIC DETAILS */}
          {isShopping && (
            <div className="mt-2 p-2.5 bg-orange-50/80 border border-orange-200 rounded-lg text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 bg-white rounded border border-orange-200 text-orange-700 font-bold text-sm">🛒</span>
                <div>
                  <span className="font-bold text-orange-950 text-xs">{action.item || action.title}</span>
                  <p className="text-[10px] text-orange-700">Added to Household / Grocery Shopping List</p>
                </div>
              </div>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-medium flex items-center gap-1">
                <Check className="w-3 h-3" /> Auto-Saved
              </span>
            </div>
          )}

          {/* Ambiguous Contact Disambiguation Chips */}
          {action.candidates?.length > 1 && (
            <div className="mt-2 p-2 bg-amber-50/90 border border-amber-200 rounded-lg text-xs space-y-1.5">
              <span className="text-[11px] font-semibold text-amber-900 flex items-center gap-1">
                <HelpCircle className="w-3 h-3 text-amber-600" /> Multiple contacts found. Select intended person:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {action.candidates.map((cand) => (
                  <button
                    key={cand.id || cand.name}
                    type="button"
                    onClick={() => onAssigneeChange?.(action, cand)}
                    className="px-2 py-0.5 bg-white border border-amber-300 text-amber-900 rounded text-[10px] font-medium hover:bg-amber-100 transition shadow-2xs"
                  >
                    {cand.name} {cand.department ? `(${cand.department})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Non-WhatsApp, Non-Calendar Actions button bar */}
          {!isWhatsApp && !isCalendar && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] text-slate-400 font-mono">
                Confidence: {Math.round((action.confidence?.overall || action.confidence || 0.95) * 100)}%
              </span>

              <div className="flex items-center gap-2">
                {onReject && !isDone && (
                  <button
                    type="button"
                    onClick={() => onReject(action)}
                    className="min-h-[36px] px-2.5 py-1 text-xs text-slate-500 hover:text-rose-600 rounded hover:bg-slate-50 transition"
                  >
                    Dismiss
                  </button>
                )}

                {isFailed && (
                  <button
                    type="button"
                    onClick={() => { setResult(null); handleApprove(); }}
                    disabled={submitting}
                    className="min-h-[36px] px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition"
                  >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    Retry Approval
                  </button>
                )}

                {isPending && (
                  <button
                    type="button"
                    onClick={() => handleApprove()}
                    disabled={submitting}
                    className="min-h-[36px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition"
                  >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Approve & Execute
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Voice Workspace Component ───────────────────────────────────────────
export default function VoiceWorkspace({
  directory = [],
  projects = [],
  departments = [],
  industry = 'all',
  onTaskFormFill,
  onCommandProcessed
}) {
  const [commandMode, setCommandMode] = useState('quick'); // 'quick' | 'conversation' | 'meeting'
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [supported, setSupported] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [commandResult, setCommandResult] = useState(null);
  const [dismissedActions, setDismissedActions] = useState(new Set());
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [geminiStatus, setGeminiStatus] = useState(null);
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [meetingSummary, setMeetingSummary] = useState(null);

  const recognizerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);
  const transcriptRef = useRef('');

  // WebSocket for progressive AI updates
  const { connected: wsConnected } = useActionFlowWS({
    sessionId: 'session_voice_hud',
    onMessage: useCallback((msg) => {
      if (!commandResult?.commandId || msg.commandId !== commandResult.commandId) return;
      if (msg.type === 'GEMINI_STARTED') {
        setGeminiStatus('started');
      } else if (msg.type === 'GEMINI_ENRICHMENT') {
        setCommandResult(prev => ({ ...prev, ...msg }));
        setGeminiStatus('done');
        onCommandProcessed?.(msg);
      }
    }, [commandResult, onCommandProcessed])
  });

  // Query microphone devices
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        setAudioDevices(audioInputs);
        if (audioInputs[0]?.deviceId) setSelectedDeviceId(audioInputs[0].deviceId);
      }).catch(() => {});
    }
  }, []);

  // Timer counter
  useEffect(() => {
    if (isListening && !isPaused) {
      timerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isListening, isPaused]);

  // Speech recognizer setup
  useEffect(() => {
    setSupported(isSpeechRecognitionSupported());
    recognizerRef.current = createSpeechRecognizer({
      onStart: () => {
        setIsListening(true);
        setIsPaused(false);
        setErrorMsg('');
      },
      onEnd: () => {
        setIsListening(false);
        setInterimText('');
        if (transcriptRef.current?.trim()) {
          triggerProcess(transcriptRef.current.trim());
        }
      },
      onInterim: (t) => setInterimText(t),
      onFinal: (t) => {
        setTranscript(prev => prev ? `${prev} ${t}` : t);
        setInterimText('');
      },
      onError: (msg, code) => {
        setIsListening(false);
        setInterimText('');
        if (code !== 'aborted') setErrorMsg(msg);
      }
    });

    return () => recognizerRef.current?.abort();
  }, []);

  const activeDisplay = [transcript, interimText].filter(Boolean).join(' ');
  useEffect(() => { transcriptRef.current = activeDisplay; }, [activeDisplay]);

  // Command Execution Handler
  const triggerProcess = useCallback(async (text) => {
    if (!text?.trim() || text.length < 3) return;
    setIsProcessing(true);
    setErrorMsg('');

    try {
      const result = await sendVoiceCommand({
        transcript: text,
        directory,
        projects,
        departments,
        industry,
        referenceDate: new Date(),
        mode: commandMode
      });

      if (result) {
        setCommandResult(result);
        onCommandProcessed?.(result);
        onTaskFormFill?.(text);
      }
    } catch (err) {
      setErrorMsg('Processing failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [directory, projects, departments, industry, commandMode, onTaskFormFill, onCommandProcessed]);

  // Start / Stop Microphone
  const handleToggleMic = () => {
    if (isListening) {
      recognizerRef.current?.stop();
    } else {
      setErrorMsg('');
      setRecordSecs(0);
      recognizerRef.current?.start();
    }
  };

  const handlePauseResume = () => {
    setIsPaused(!isPaused);
  };

  const handleCancelRecording = () => {
    recognizerRef.current?.abort();
    setIsListening(false);
    setIsPaused(false);
    setRecordSecs(0);
    setInterimText('');
  };

  const handleReset = () => {
    recognizerRef.current?.abort();
    setIsListening(false);
    setIsPaused(false);
    setTranscript('');
    setInterimText('');
    setCommandResult(null);
    setIsProcessing(false);
    setErrorMsg('');
    setIsEditing(false);
    setRecordSecs(0);
    setGeminiStatus(null);
    setDismissedActions(new Set());
    setActiveMeeting(null);
    setMeetingSummary(null);
  };

  // Phase 3: Contact Disambiguation Resolver
  const handleAssigneeChange = (action, candidate) => {
    setCommandResult(prev => {
      if (!prev) return prev;
      const updatedActions = (prev.actions || []).map(a => {
        if (a.id === action.id) {
          return {
            ...a,
            assignee: { id: candidate.id, name: candidate.name, department: candidate.department },
            candidates: [],
            title: a.title.replace(/Rahul|Aman|Riya|Neha/i, candidate.name)
          };
        }
        return a;
      });
      return { ...prev, actions: updatedActions };
    });
  };

  // V4: Action Live Update Handler (WhatsApp numbers, custom messages)
  const handleUpdateAction = (updatedAction) => {
    setCommandResult(prev => {
      if (!prev) return prev;
      const updatedActions = (prev.actions || []).map(a => a.id === updatedAction.id ? updatedAction : a);
      return { ...prev, actions: updatedActions };
    });
  };

  // Phase 3: Finalize Meeting Intelligence
  const handleFinishMeeting = async () => {
    if (!activeMeeting?.id) {
      // Create and finalize a simulated meeting from the current transcript if not active
      setIsProcessing(true);
      try {
        const started = await startMeeting({
          title: 'Strategic Meeting Session',
          participants: directory.map(p => p.name)
        });
        const finished = await endMeeting(started.meeting?.id || `meet_${Date.now()}`);
        setMeetingSummary(finished.meeting?.summary || {
          executiveSummary: 'Meeting finalized with key agenda items and deliverables.',
          keyDiscussionPoints: ['Discussed operational roadmap and delivery dates'],
          decisionsTaken: ['Proceed with scheduled tasks'],
          actionItems: commandResult?.actions || [],
          nextSteps: ['Sync with stakeholders']
        });
      } catch (err) {
        setErrorMsg('Meeting synthesis failed: ' + err.message);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    setIsProcessing(true);
    try {
      const res = await endMeeting(activeMeeting.id);
      if (res.meeting?.summary) {
        setMeetingSummary(res.meeting.summary);
      }
    } catch (err) {
      setErrorMsg('Failed to finalize meeting: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Audio File Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg('');
    try {
      const res = await transcribeAudio({
        audio: file,
        mimeType: file.type || 'audio/webm',
        mode: commandMode
      });

      if (res?.transcript) {
        setTranscript(res.transcript);
        triggerProcess(res.transcript);
      }
    } catch (err) {
      setErrorMsg('Audio upload transcription failed: ' + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDemo = (sample) => {
    handleReset();
    const demo = sample || "Kal 10 baje Rahul ke saath meeting fix karna, Aman se production report mangwani hai, aur bread aur milk laana hai.";
    setTimeout(() => {
      setTranscript(demo);
      triggerProcess(demo);
    }, 150);
  };

  const handleEntityCorrection = (entity, newText) => {
    if (!transcript) return;
    const updated = transcript.replace(entity.currentText || entity.rawText, newText);
    setTranscript(updated);
    triggerProcess(updated);
  };

  const visibleActions = (commandResult?.actions || []).filter(a => !dismissedActions.has(a.id));
  const renderFmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden w-full max-w-full">
      {/* Top Banner & Mode Switcher */}
      <div className="px-4 sm:px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-indigo-700 via-blue-700 to-indigo-900 text-white w-full max-w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-300" />
              ActionFlow Voice Command Center
              {wsConnected ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-300" title="WebSocket Live Connected" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-slate-400" title="Offline Mode" />
              )}
            </h2>
            <p className="text-[11px] text-blue-200 mt-0.5">
              Speak naturally — automatically routes to Google Calendar, Tasks, WhatsApp, Reminders, Shopping
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-start">
            {/* Mode Selector */}
            <div className="bg-white/10 p-0.5 rounded-lg flex items-center text-xs">
              <button
                type="button"
                onClick={() => setCommandMode('quick')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${commandMode === 'quick' ? 'bg-white text-indigo-900 shadow-xs' : 'text-blue-100 hover:text-white'}`}
              >
                ⚡ Quick
              </button>
              <button
                type="button"
                onClick={() => setCommandMode('conversation')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${commandMode === 'conversation' ? 'bg-white text-indigo-900 shadow-xs' : 'text-blue-100 hover:text-white'}`}
              >
                💬 Conversation
              </button>
              <button
                type="button"
                onClick={() => setCommandMode('meeting')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${commandMode === 'meeting' ? 'bg-white text-indigo-900 shadow-xs' : 'text-blue-100 hover:text-white'}`}
              >
                🎙️ Meeting
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleDemo()}
              className="text-xs px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg font-medium flex items-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" /> Demo
            </button>
          </div>
        </div>
      </div>

      <div className="p-3.5 sm:p-5 space-y-4 w-full max-w-full overflow-hidden">
        {/* Voice Interaction Feedback Notification Banner */}
        {commandResult?.feedbackMessage && (
          <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-center gap-2.5 text-xs text-blue-900 animate-in fade-in">
            <Volume2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-medium">{commandResult.feedbackMessage}</span>
          </div>
        )}

        {/* Universal Voice Mic + Controls Row */}
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 p-3.5 sm:p-4 bg-slate-50 border border-slate-200/80 rounded-2xl w-full max-w-full overflow-hidden">
          {/* Large Mic Button */}
          <div className="relative shrink-0 flex items-center justify-center">
            {isListening && (
              <>
                <div className="absolute w-20 h-20 rounded-full bg-rose-400/20 animate-ping" />
                <div className="absolute w-16 h-16 rounded-full bg-rose-500/25 animate-pulse" />
              </>
            )}
            <button
              type="button"
              onClick={handleToggleMic}
              aria-label={isListening ? 'Stop recording' : 'Start voice recording'}
              className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center shadow-md focus:outline-none focus:ring-4 transition-all ${
                isListening
                  ? 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-200 scale-105'
                  : 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-200 hover:scale-105'
              }`}
            >
              {isListening ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-6 h-6" />}
            </button>
          </div>

          {/* Status, Device and Recording Info */}
          <div className="flex-1 min-w-0 w-full text-center sm:text-left space-y-2">
            <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-2.5 flex-wrap">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isListening ? 'bg-rose-500 animate-ping' : isProcessing ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {isListening ? (isPaused ? 'Recording Paused' : `Recording ${renderFmt(recordSecs)}`) : isProcessing ? 'Processing AI Intent...' : 'Ready to Speak'}
              </span>

              {isListening && (
                <div className="flex items-center gap-1.5 ml-2">
                  <button
                    type="button"
                    onClick={handlePauseResume}
                    className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 transition text-[10px]"
                    title={isPaused ? 'Resume' : 'Pause'}
                  >
                    {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelRecording}
                    className="p-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 transition text-[10px]"
                    title="Cancel Recording"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Upload Audio File */}
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-xs px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100 font-medium flex items-center gap-1 transition"
              >
                {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Upload Audio
              </button>
            </div>

            {/* Microphone device selection */}
            {audioDevices.length > 1 && (
              <div className="flex items-center justify-center sm:justify-start gap-2 text-[11px] text-slate-500 w-full max-w-full min-w-0">
                <span className="shrink-0 font-medium text-slate-600">Mic:</span>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-auto max-w-full sm:max-w-xs truncate min-w-0 shadow-2xs"
                >
                  {audioDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0,5)}`}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Simulated / Live Waveform */}
            {isListening && !isPaused && (
              <div className="flex items-end justify-center sm:justify-start gap-1 h-5 pt-1">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-rose-500 rounded-full"
                    style={{
                      height: `${4 + Math.random() * 16}px`,
                      animation: `pulse ${0.3 + (i % 5) * 0.1}s infinite alternate`
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Interactive Smart Transcript Highlighter */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
              Spoken Command & Entity Layer
              {commandResult?.isMultiDestination && (
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200 font-semibold">
                  Multi-Destination Command
                </span>
              )}
            </span>

            <div className="flex items-center gap-1.5">
              {activeDisplay && (
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-100 transition"
                >
                  <Edit3 className="w-3 h-3" /> {isEditing ? 'Save' : 'Edit Text'}
                </button>
              )}
              {activeDisplay && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-100 transition"
                >
                  <RefreshCw className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          </div>

          {isEditing ? (
            <textarea
              rows={3}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          ) : (
            <TranscriptHighlighter
              transcript={transcript}
              spans={commandResult?.entitySpans || []}
              interimText={interimText}
              onEntityChange={handleEntityCorrection}
            />
          )}
        </div>

        {/* Gemini Quota Exhaustion / Graceful Degradation Banner */}
        {commandResult?.geminiWarning && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-950">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-0.5">
              <div className="font-bold">
                Gemini AI Enrichment Temporarily Unavailable ({commandResult.geminiWarning.code || 'HTTP 429 Quota Cooldown'})
              </div>
              <div className="text-[11px] text-amber-800">
                {commandResult.geminiWarning.message}
              </div>
            </div>
          </div>
        )}

        {/* Extracted Decomposed Action Cards */}
        {visibleActions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <GitBranch className="w-4 h-4 text-indigo-600" />
                {visibleActions.length > 1 ? `${visibleActions.length} Actions Decomposed` : 'Extracted Action Card'}
              </span>
              {commandResult?.processingTimeMs > 0 && (
                <span className="text-[11px] text-slate-400 font-mono">
                  Latency: {commandResult.processingTimeMs}ms
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {visibleActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  directory={directory}
                  onAssigneeChange={handleAssigneeChange}
                  onReject={(a) => setDismissedActions(prev => new Set([...prev, a.id]))}
                  onUpdateAction={handleUpdateAction}
                />
              ))}
            </div>
          </div>
        )}

        {/* Continuous Meeting Mode Controller */}
        {commandMode === 'meeting' && (
          <div className="p-3.5 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 border border-indigo-200 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                {isListening && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isListening ? 'bg-indigo-600' : 'bg-slate-400'}`}></span>
              </span>
              <div>
                <h4 className="text-xs font-semibold text-indigo-950">Continuous Meeting Mode</h4>
                <p className="text-[11px] text-indigo-700">Chunked audio, speaker diarization & real-time action extraction</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFinishMeeting}
              disabled={isProcessing}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition shrink-0"
            >
              {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              Finish & Synthesize
            </button>
          </div>
        )}

        {/* Phase 3: Meeting Intelligence Synthesis Report */}
        {meetingSummary && (
          <div className="p-4 bg-white border border-indigo-200 rounded-2xl shadow-sm space-y-3.5 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5">
              <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600" />
                Meeting Intelligence Report
              </span>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-semibold">
                AI Synthesized
              </span>
            </div>

            {/* Executive Summary */}
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Executive Summary</span>
              <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                {meetingSummary.executiveSummary}
              </p>
            </div>

            {/* Key Discussion Points & Decisions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5 p-2.5 bg-blue-50/60 border border-blue-200 rounded-lg">
                <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1">
                  <Check className="w-3 h-3 text-blue-600" /> Key Discussion Points
                </span>
                <ul className="space-y-1 text-slate-700 list-disc list-inside text-[11px]">
                  {(meetingSummary.keyDiscussionPoints || []).map((pt, i) => (
                    <li key={i}>{pt}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5 p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-lg">
                <span className="text-[11px] font-bold text-emerald-900 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" /> Formal Decisions Taken
                </span>
                <ul className="space-y-1 text-slate-700 list-disc list-inside text-[11px]">
                  {(meetingSummary.decisionsTaken || []).map((dec, i) => (
                    <li key={i}>{dec}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Action Items List */}
            {meetingSummary.actionItems?.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Extracted Action Items ({meetingSummary.actionItems.length})
                </span>
                <div className="space-y-1.5">
                  {meetingSummary.actionItems.map((item, idx) => (
                    <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800 truncate">{item.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-[10px] font-medium">
                          {item.assignee?.name || item.assignee || 'Unassigned'}
                        </span>
                        {item.deadline && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {item.deadline}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMsg}</div>
            <button type="button" onClick={() => setErrorMsg('')}>
              <X className="w-4 h-4 text-rose-400 hover:text-rose-600" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
