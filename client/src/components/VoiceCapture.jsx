import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Mic,
  MicOff,
  Square,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Edit3,
  Check,
  X,
  User,
  Folder,
  Calendar,
  Clock,
  Repeat,
  Zap,
  AlertTriangle,
  MapPin
} from 'lucide-react';
import { createSpeechRecognizer, isSpeechRecognitionSupported } from '../features/voice/speechRecognition';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft';
import { formatFriendlyDateTime } from '../utils/dateTime';
import TranscriptHighlighter from './TranscriptHighlighter';

const DEMO_COMMAND = "Assign the kitchen material selection to Rahul for the Green Villa project. Start tomorrow at 10 AM, finish by Friday at 5 PM. Priya should review it. Repeat this every week.";

/**
 * Reusable Voice Capture, Real-Time HUD & Transcription Component
 */
export default function VoiceCapture({
  onExtractDraft,
  onClear,
  isProcessing = false,
  directory = [],
  projects = [],
  departments = [],
  industry = 'all'
}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [supported, setSupported] = useState(true);
  const [isLiveSync, setIsLiveSync] = useState(true);

  const recognizerRef = useRef(null);
  const transcriptRef = useRef('');

  const activeDisplay = [transcript, interimText].filter(Boolean).join(' ');

  useEffect(() => {
    transcriptRef.current = activeDisplay;
  }, [activeDisplay]);

  useEffect(() => {
    setSupported(isSpeechRecognitionSupported());
  }, []);

  // Real-time deterministic draft parsing as user speaks or edits
  const liveDraft = useMemo(() => {
    if (!activeDisplay.trim()) return null;
    try {
      return extractTaskDraft({
        transcript: activeDisplay,
        directory,
        projects,
        departments,
        industry,
        referenceDate: new Date()
      });
    } catch {
      return null;
    }
  }, [activeDisplay, directory, projects, departments, industry]);

  // Real-time live auto-fill sync to task form (debounced)
  useEffect(() => {
    if (!isLiveSync || !activeDisplay.trim()) return;

    const timeout = setTimeout(() => {
      onExtractDraft(activeDisplay);
    }, 200);

    return () => clearTimeout(timeout);
  }, [activeDisplay, isLiveSync]);

  // Initialize Speech Recognizer
  useEffect(() => {
    recognizerRef.current = createSpeechRecognizer({
      onStart: () => {
        setIsListening(true);
        setErrorMessage('');
      },
      onEnd: () => {
        setIsListening(false);
        setInterimText('');
        if (transcriptRef.current?.trim()) {
          onExtractDraft(transcriptRef.current.trim(), false, null, true);
        }
      },
      onInterim: (text) => {
        setInterimText(text);
      },
      onFinal: (text) => {
        setTranscript((prev) => (prev ? `${prev} ${text}` : text));
        setInterimText('');
      },
      onError: (msg, code) => {
        setIsListening(false);
        setInterimText('');
        if (code === 'aborted') return;

        // If speech was already successfully transcribed and Chrome closed the stream with 'network',
        // do not treat it as a blocking failure since user's speech is safely preserved.
        if (code === 'network' && transcriptRef.current.trim().length > 0) {
          return;
        }

        setErrorMessage(msg);
      }
    });

    return () => {
      recognizerRef.current?.abort();
    };
  }, []);

  const handleToggleListening = () => {
    if (isListening) {
      recognizerRef.current?.stop();
    } else {
      setErrorMessage('');
      recognizerRef.current?.start();
    }
  };

  const handleReset = () => {
    recognizerRef.current?.stop();
    setIsListening(false);
    setTranscript('');
    setInterimText('');
    setErrorMessage('');
    setIsEditing(false);
    onClear?.();
  };

  const handleToggleLiveSync = () => {
    const nextVal = !isLiveSync;
    setIsLiveSync(nextVal);
    if (nextVal && activeDisplay.trim()) {
      onExtractDraft(activeDisplay.trim());
    }
  };

  const handleLoadDemo = () => {
    recognizerRef.current?.stop();
    setIsListening(false);
    setTranscript(DEMO_COMMAND);
    setInterimText('');
    setErrorMessage('');
    setIsEditing(false);
    onExtractDraft(DEMO_COMMAND, false, null, true);
  };

  const handleProcessTranscript = () => {
    const fullText = activeDisplay.trim();
    if (!fullText) {
      setErrorMessage('Please speak or type a task command before extracting fields.');
      return;
    }
    setErrorMessage('');
    recognizerRef.current?.stop();
    onExtractDraft(fullText, false, null, true);
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-sm">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Voice-to-Task Capture</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Click the microphone and speak naturally, or load the benchmark example.
          </p>
        </div>

        {/* Load Demo & Live Sync Toggle */}
        <div className="flex items-center gap-2">
          {/* Live Sync Toggle */}
          <button
            type="button"
            onClick={handleToggleLiveSync}
            title={isLiveSync ? 'Live Sync is ON: Changes automatically stream to form fields' : 'Click to turn ON Live Sync: Automatically stream to form fields as you speak'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
              isLiveSync
                ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-xs ring-2 ring-amber-200/50'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${isLiveSync ? 'text-amber-700 fill-amber-600 animate-pulse' : 'text-slate-400'}`} />
            <span>{isLiveSync ? 'Live Sync: ON' : 'Live Sync: OFF'}</span>
          </button>

          {/* Load Demo Command Pill */}
          <button
            type="button"
            onClick={handleLoadDemo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition shadow-2xs hover:border-slate-300"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Load Demo</span>
          </button>
        </div>
      </div>

      {/* Main Microphone Interaction Row */}
      <div className="mt-5 flex flex-col md:flex-row items-center gap-5">
        {/* Animated Mic Button */}
        <div className="relative shrink-0 flex items-center justify-center">
          {isListening && (
            <>
              <div className="absolute w-20 h-20 rounded-full bg-red-400/20 animate-ping" />
              <div className="absolute w-16 h-16 rounded-full bg-red-500/30 animate-pulse" />
            </>
          )}
          <button
            type="button"
            onClick={handleToggleListening}
            aria-label={isListening ? 'Stop listening' : 'Start microphone recording'}
            className={`relative z-10 w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-md focus:outline-hidden focus:ring-4 ${
              isListening
                ? 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-200 scale-105'
                : 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-200 hover:scale-102'
            }`}
          >
            {isListening ? (
              <Square className="w-5 h-5 fill-current" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Listening Status & Visual Waveform */}
        <div className="flex-1 min-w-0 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isListening ? 'bg-rose-500 animate-ping' : 'bg-slate-300'
              }`}
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              {isListening ? 'Listening & Transcribing...' : 'Ready for voice input'}
            </span>
          </div>

          <div className="text-xs text-slate-500 mt-1">
            {isListening
              ? 'Speak details like assignee, reviewer, project, dates, priority, or recurrence.'
              : 'Tap the mic to start. Your speech stays local in your browser session.'}
          </div>

          {/* Visual Voice Waveform Animation while listening */}
          {isListening && (
            <div className="flex items-center justify-center md:justify-start gap-1 mt-2.5 h-4">
              <span className="w-1 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.3s] h-3"></span>
              <span className="w-1 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.15s] h-4"></span>
              <span className="w-1 bg-rose-500 rounded-full animate-bounce [animation-delay:0s] h-2"></span>
              <span className="w-1 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.2s] h-4"></span>
              <span className="w-1 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.1s] h-3"></span>
            </div>
          )}
        </div>
      </div>

      {/* Transcript Display & Live Editor */}
      <div className="mt-5 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wider">
            <span>Speech Transcript</span>
            {interimText && (
              <span className="text-[10px] lowercase font-normal text-blue-600 bg-blue-50 px-1 rounded animate-pulse">
                (live)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-200/60 transition"
            >
              {isEditing ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Edit3 className="w-3.5 h-3.5" />}
              <span>{isEditing ? 'Done Editing' : 'Edit Transcript'}</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              title="Reset transcript"
              className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-200/60 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {isEditing ? (
          <textarea
            rows={3}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Type or edit your voice command here..."
            className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded p-2.5 focus:outline-hidden focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
          />
        ) : (
          <div className="min-h-[56px] text-xs leading-relaxed text-slate-800 break-words select-text">
            {activeDisplay ? (
              <span>
                <span>{transcript}</span>
                {interimText && (
                  <span className="text-slate-500 italic ml-1">{interimText}</span>
                )}
              </span>
            ) : (
              <span className="text-slate-400 italic">
                No speech captured yet. Click the microphone or type/paste your instruction above.
              </span>
            )}
          </div>
        )}
      </div>

      {/* REAL-TIME DETECTION HUD: "Master Stroke at Real Time" */}
      {liveDraft && (
        <div className="mt-3.5 p-3.5 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 border border-blue-200/70 rounded-xl shadow-2xs animate-in fade-in">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-blue-100">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-900 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Real-Time Detection Feed</span>
            </div>
            <span className="text-[10px] text-blue-600 font-medium">
              Deterministic In-Browser Extraction
            </span>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {/* Title Chip */}
            {liveDraft.fields.title && (
              <div className="px-2.5 py-1 bg-white border border-blue-200 text-slate-800 rounded-lg shadow-2xs flex items-center gap-1.5">
                <span className="font-semibold text-blue-700">Task:</span>
                <span className="truncate max-w-[200px]">{liveDraft.fields.title}</span>
              </div>
            )}

            {/* Assignee Chip */}
            {liveDraft.meta.assignee.value ? (
              <div className="px-2.5 py-1 bg-white border border-emerald-300 text-emerald-900 rounded-lg shadow-2xs flex items-center gap-1.5 font-medium">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Doer:</span>
                <span className="font-semibold">{liveDraft.meta.assignee.value.name}</span>
              </div>
            ) : liveDraft.meta.assignee.status === 'ambiguous' ? (
              <div className="px-2.5 py-1 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg shadow-2xs flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Doer Ambiguous ({liveDraft.meta.assignee.candidates.length} options)</span>
              </div>
            ) : null}

            {/* Reviewer Chip */}
            {liveDraft.meta.reviewer.value && (
              <div className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg shadow-2xs flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Reviewer:</span>
                <span className="font-medium text-slate-900">{liveDraft.meta.reviewer.value.name}</span>
              </div>
            )}

            {/* Project Chip */}
            {liveDraft.meta.project.value && (
              <div className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg shadow-2xs flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded">
                  {liveDraft.meta.project.value.code}
                </span>
                <span className="font-medium text-slate-900">{liveDraft.meta.project.value.name}</span>
              </div>
            )}

            {/* Location Chip */}
            {liveDraft.fields.location && (
              <div className="px-2.5 py-1 bg-white border border-teal-300 text-teal-900 rounded-lg shadow-2xs flex items-center gap-1.5 font-medium">
                <MapPin className="w-3.5 h-3.5 text-teal-600" />
                <span>Location:</span>
                <span className="font-semibold">{liveDraft.fields.location}</span>
              </div>
            )}

            {/* Start Date Chip */}
            {liveDraft.meta.startDate.value && (
              <div className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg shadow-2xs flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Start:</span>
                <span className="font-medium text-slate-900">
                  {formatFriendlyDateTime(liveDraft.meta.startDate.value)}
                </span>
              </div>
            )}

            {/* Due Date Chip */}
            {liveDraft.meta.dueDate.value && (
              <div className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg shadow-2xs flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>Due:</span>
                <span className="font-semibold text-slate-900">
                  {formatFriendlyDateTime(liveDraft.meta.dueDate.value)}
                </span>
              </div>
            )}

            {/* Priority Chip */}
            {liveDraft.fields.priority && (
              <div className="px-2 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg shadow-2xs flex items-center gap-1 font-semibold text-[11px]">
                <span>Priority:</span>
                <span className={liveDraft.fields.priority === 'High' || liveDraft.fields.priority === 'Urgent' ? 'text-amber-700 font-bold' : 'text-blue-700'}>
                  {liveDraft.fields.priority}
                </span>
              </div>
            )}

            {/* Recurrence Chip */}
            {liveDraft.fields.isRecurring && (
              <div className="px-2 py-1 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg shadow-2xs flex items-center gap-1 font-semibold text-[11px]">
                <Repeat className="w-3 h-3 text-purple-600" />
                <span>Repeat {liveDraft.fields.recurrenceFrequency || 'Scheduled'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error or Browser Warning Banner */}
      {errorMessage && (
        <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start justify-between gap-2 animate-in fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold">Speech Capture Notice</div>
              <div className="mt-0.5 text-rose-700">{errorMessage}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            aria-label="Dismiss notice"
            className="text-rose-400 hover:text-rose-700 p-0.5 rounded transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!supported && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Web Speech API Not Available</div>
            <div className="mt-0.5 text-amber-700">
              Your browser doesn't natively expose the Web Speech API. You can still type, paste, or load demonstration commands seamlessly into the editor above.
            </div>
          </div>
        </div>
      )}

      {/* Action Bar: Extract Fields & Sync Status */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
        {isLiveSync ? (
          <div className="flex items-center gap-1.5 text-xs text-amber-800 font-medium bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
            <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-600 animate-pulse" />
            <span>Live Sync ON: Form fields update continuously as you speak.</span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-500">
            Manual Mode (Live Sync OFF): Review transcript above, then click <strong>Extract to Task Form</strong>.
          </span>
        )}

        <button
          type="button"
          disabled={!activeDisplay.trim() || isProcessing}
          onClick={handleProcessTranscript}
          className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition ${
            !activeDisplay.trim() || isProcessing
              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              : isLiveSync
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 hover:shadow-md'
          }`}
        >
          {isLiveSync ? <Check className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4" />}
          <span>{isLiveSync ? 'Synced to Form (Click to Re-apply)' : 'Extract to Task Form'}</span>
        </button>
      </div>
    </div>
  );
}
