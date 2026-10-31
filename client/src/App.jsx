import { useState, useEffect, useRef, useCallback } from 'react';
import { Layers, Clock, History, CheckCircle2, Trash2, User, Folder, Wifi, WifiOff, Zap } from 'lucide-react';
import VoiceWorkspace from './components/VoiceWorkspace';
import VoiceCapture from './components/VoiceCapture';
import TaskForm from './components/TaskForm';
import TaskReview from './components/TaskReview';
import ActionPlan from './components/ActionPlan';
import UniversalBenchmarkLab from './components/UniversalBenchmarkLab';
import IntelligenceTestingLab from './components/IntelligenceTestingLab';
import CalendarIntegrationPanel from './components/CalendarIntegrationPanel';
import MyTasksCalendarPanel from './components/MyTasksCalendarPanel';
import { SAMPLE_PEOPLE } from './data/samplePeople';
import { SAMPLE_PROJECTS } from './data/sampleProjects';
import { SAMPLE_DEPARTMENTS } from './data/sampleDepartments';
import { extractTaskDraft } from './features/extraction/extractTaskDraft';
import { taskService, validateTaskPayload } from './services/taskService';
import { defaultTaskSubmissionAdapter } from './adapters/taskSubmissionAdapter';
import { getLocalTimeZone, formatFriendlyDateTime } from './utils/dateTime';
import { apiAnalyze, apiExecute, refreshServerStatus, getServerStatus } from './services/intelligenceApi';

const INITIAL_TASK_STATE = {
  title: '',
  description: '',
  assigneeId: '',
  reviewerId: '',
  projectId: '',
  department: '',
  location: '',
  priority: '',
  startDate: '',
  dueDate: '',
  isRecurring: false,
  recurrenceFrequency: '',
  recurrenceInterval: 1,
  recurrenceDays: [],
  recurrenceEndDate: '',
  dependencies: [],
  _creationMethod: 'manual'
};

export default function App() {
  const [formData, setFormData] = useState(INITIAL_TASK_STATE);
  const [rawTranscript, setRawTranscript] = useState('');
  const [latestExtraction, setLatestExtraction] = useState(null);
  const [manuallyOverriddenFields, setManuallyOverriddenFields] = useState({});
  const [extractionMeta, setExtractionMeta] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const hasAttemptedSubmitRef = useRef(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState('');
  const [submittedTasks, setSubmittedTasks] = useState(() => {
    try {
      const stored = localStorage.getItem('delegated_tasks_history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [voiceCaptureKey, setVoiceCaptureKey] = useState(0);
  const [selectedIndustry, setSelectedIndustry] = useState('all');
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const transcriptVersionRef = useRef(0);

  // ── Intelligence API state ──────────────────────────────────────────────────
  const [intelligenceResult, setIntelligenceResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  // Toggle between new Voice Workspace and legacy Task Form
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined' && (window.location.search.includes('calendar_connected=true') || window.location.search.includes('calendar_error='))) {
      return 'calendar';
    }
    return 'workspace';
  }); // 'workspace' | 'form' | 'calendar' | 'testing' | 'benchmark'

  // Probe server availability on mount
  useEffect(() => {
    refreshServerStatus().then(setServerConnected);
    const interval = setInterval(() => {
      const status = getServerStatus();
      if (status !== serverConnected) setServerConnected(status);
    }, 10000);
    return () => clearInterval(interval);
  }, [serverConnected]);

  // Reset all form state, transcript, and extraction draft
  // const handleResetForm = () => {
  //   setFormData(INITIAL_TASK_STATE);
  //   setRawTranscript('');
  //   setLatestExtraction(null);
  //   setExtractionMeta(null);
  //   setManuallyOverriddenFields({});
  //   setFormErrors({});
  //   setCurrentTaskIndex(0);
  //   setVoiceCaptureKey((prev) => prev + 1);
  // };

  // Sync submittedTasks to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('delegated_tasks_history', JSON.stringify(submittedTasks));
    } catch {
      // ignore
    }
  }, [submittedTasks]);

  // Ticking real-time clock for real-time reference
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const localTimezone = getLocalTimeZone();

  // Field change handler - records manual override to preserve user input
  const handleFieldChange = (field, value) => {
    setManuallyOverriddenFields((prev) => ({
      ...prev,
      [field]: true
    }));

    setFormData((prev) => {
      const next = {
        ...prev,
        [field]: value
      };

      // Revalidate affected field if validation has been triggered or errors exist
      if (hasAttemptedSubmitRef.current || Object.keys(formErrors).length > 0) {
        const valResult = validateTaskPayload(next);
        setFormErrors((prevErrors) => {
          const updatedErrors = { ...prevErrors };
          if (valResult.errors[field]) {
            updatedErrors[field] = valResult.errors[field];
          } else {
            delete updatedErrors[field];
          }
          if (field === 'startDate' || field === 'dueDate') {
            if (valResult.errors.dueDate) {
              updatedErrors.dueDate = valResult.errors.dueDate;
            } else {
              delete updatedErrors.dueDate;
            }
          }
          if (field === 'isRecurring' || field === 'recurrenceFrequency') {
            if (valResult.errors.recurrenceFrequency) {
              updatedErrors.recurrenceFrequency = valResult.errors.recurrenceFrequency;
            } else {
              delete updatedErrors.recurrenceFrequency;
            }
          }
          return updatedErrors;
        });
      }

      return next;
    });
  };

  // Process speech transcript through the rule-based extraction module
  const handleExtractDraft = (transcriptText, forceReextractAll = false, indOverride = null, forceHighlight = false) => {
    if (!transcriptText || !transcriptText.trim()) return;

    const currentVersion = ++transcriptVersionRef.current;
    const indToUse = indOverride || selectedIndustry;
    setRawTranscript(transcriptText);

    const draft = extractTaskDraft({
      transcript: transcriptText,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: indToUse,
      referenceDate: new Date()
    });

    // Guard against race conditions: ignore obsolete results if a newer transcript has already arrived
    if (currentVersion !== transcriptVersionRef.current) {
      return;
    }

    if (forceReextractAll || forceHighlight) {
      draft._forceHighlightAll = true;
    }

    setLatestExtraction(draft);
    setExtractionMeta(draft.meta);
    setCurrentTaskIndex(0);

    // Compute updated fields combining voice extraction and manual overrides
    const updated = {
      ...INITIAL_TASK_STATE,
      ...draft.fields,
      _creationMethod: 'voice-assisted'
    };

    if (forceReextractAll) {
      setManuallyOverriddenFields({});
    } else {
      Object.keys(manuallyOverriddenFields).forEach((key) => {
        if (manuallyOverriddenFields[key] && formData[key] !== undefined) {
          updated[key] = formData[key];
        }
      });
    }

    setFormData(updated);

    // If validation has been triggered, re-evaluate authoritative validation
    if (hasAttemptedSubmitRef.current || Object.keys(formErrors).length > 0) {
      const valResult = validateTaskPayload(updated);
      setFormErrors((prevErrors) => {
        const nextErrors = { ...prevErrors };
        // If a required field is now fulfilled, clear its error
        ['title', 'assigneeId', 'dueDate', 'recurrenceFrequency'].forEach((k) => {
          if (valResult.errors[k]) {
            if (hasAttemptedSubmitRef.current) {
              nextErrors[k] = valResult.errors[k];
            }
          } else {
            delete nextErrors[k];
          }
        });
        return nextErrors;
      });
    }

    // Fire async server analysis (Gemini-powered for complex inputs)
    runServerAnalysis(transcriptText);
  };

  // Async server analysis — runs after local extraction, enriches with Gemini intelligence
  // Debounced so it doesn't fire on every keystroke, only after user pauses
  const serverAnalysisTimer = useRef(null);
  const runServerAnalysis = useCallback((transcriptText) => {
    if (serverAnalysisTimer.current) clearTimeout(serverAnalysisTimer.current);

    serverAnalysisTimer.current = setTimeout(async () => {
      if (!transcriptText?.trim() || transcriptText.trim().length < 5) {
        setIntelligenceResult(null);
        return;
      }

      setIsAnalyzing(true);
      try {
        const result = await apiAnalyze({
          transcript: transcriptText,
          directory: SAMPLE_PEOPLE,
          projects: SAMPLE_PROJECTS,
          departments: SAMPLE_DEPARTMENTS,
          industry: selectedIndustry,
          referenceDate: new Date()
        });

        // Only update if this is still the latest transcript
        if (transcriptText === rawTranscript || transcriptText === (latestExtraction?.rawTranscript || '')) {
          setIntelligenceResult(result);
        }
      } catch (err) {
        console.warn('[App] Server analysis failed:', err.message);
      } finally {
        setIsAnalyzing(false);
      }
    }, 800); // 800ms debounce
  }, [selectedIndustry, rawTranscript, latestExtraction]);

  // Industry pack switch handler - reapplies extraction under active industry profile
  const handleSelectIndustry = (industryKey) => {
    setSelectedIndustry(industryKey);
    const transcriptToUse = rawTranscript || latestExtraction?.rawTranscript;
    if (transcriptToUse) {
      handleExtractDraft(transcriptToUse, false, industryKey, true);
    }
  };

  // Multi-task switcher: user switches between distinct tasks in a multi-task utterance
  const handleSelectTaskIndex = (idx) => {
    if (!latestExtraction?.tasks?.[idx]) return;
    setCurrentTaskIndex(idx);
    const selectedTask = { ...latestExtraction.tasks[idx], _forceHighlightAll: true };
    setFormData((prev) => ({
      ...INITIAL_TASK_STATE,
      ...selectedTask.fields,
      _creationMethod: 'voice-assisted'
    }));
    setLatestExtraction(selectedTask);
    setExtractionMeta(selectedTask.meta);
    setManuallyOverriddenFields({});
    if (hasAttemptedSubmitRef.current) {
      const valResult = validateTaskPayload(selectedTask.fields);
      setFormErrors(valResult.errors);
    }
  };

  // User explicitly requests to re-extract all fields, clearing manual overrides
  const handleReextractAll = () => {
    setManuallyOverriddenFields({});
    const transcriptToUse = rawTranscript || latestExtraction?.rawTranscript;
    if (transcriptToUse) {
      handleExtractDraft(transcriptToUse, true);
    }
  };

  // Open review modal if validation passes
  const handleOpenReview = () => {
    hasAttemptedSubmitRef.current = true;
    setHasAttemptedSubmit(true);
    const valResult = validateTaskPayload(formData);
    if (!valResult.isValid) {
      setFormErrors(valResult.errors);
      // Scroll to top of form
      window.scrollTo({ top: 300, behavior: 'smooth' });
      return;
    }

    setFormErrors({});
    setIsReviewOpen(true);
  };

  // Final submission action with idempotency and duplicate lock
  const handleConfirmSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Try server execution gateway first (enables approval checks, audit log, WhatsApp/Calendar)
      if (serverConnected) {
        try {
          const serverResult = await apiExecute({
            id: `task_${Date.now()}`,
            type: 'CREATE_TASK',
            title: formData.title,
            description: formData.description,
            priority: formData.priority,
            assignee: SAMPLE_PEOPLE.find(p => p.id === formData.assigneeId) || null,
            deadline: formData.dueDate || null,
            isRecurring: formData.isRecurring,
            recurrenceFrequency: formData.recurrenceFrequency
          }, { isApproved: true });

          // If server requires approval (external action), show the preview
          if (serverResult.status === 'READY_FOR_APPROVAL') {
            const confirm = window.confirm(
              `${serverResult.message}\n\nPreview:\n${serverResult.previewData?.messagePreview || serverResult.previewData?.title || ''}\n\nProceed?`
            );
            if (!confirm) {
              setIsSubmitting(false);
              return;
            }
            // Re-submit with approval
            const approved = await apiExecute({
              id: `task_${Date.now()}`,
              type: 'CREATE_TASK',
              title: formData.title,
              description: formData.description,
              priority: formData.priority,
              assignee: SAMPLE_PEOPLE.find(p => p.id === formData.assigneeId) || null,
              deadline: formData.dueDate || null
            }, { isApproved: true });
          }
        } catch (serverErr) {
          console.warn('[App] Server execution failed, using local:', serverErr.message);
        }
      }

      // Local submission (always runs — this is the source of truth for the UI)
      const res = await defaultTaskSubmissionAdapter.submitTask(formData);
      setSubmissionResult(res);
      setSubmittedTasks((prev) => [res.task, ...prev]);
      setIsHistoryOpen(true);
      setScreenReaderAnnouncement(`Task "${res.task.title}" successfully dispatched with ID ${res.taskId}`);
    } catch (err) {
      alert(`Submission error: ${err.message}`);
      setScreenReaderAnnouncement(`Submission error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete individual task from session history
  const handleDeleteTask = (taskId, taskTitle) => {
    if (window.confirm(`Delete task "${taskTitle}" from session history?`)) {
      setSubmittedTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
  };

  // Clear all tasks from session history
  const handleClearAllTasks = () => {
    if (window.confirm('Are you sure you want to delete all submitted tasks from history?')) {
      setSubmittedTasks([]);
    }
  };

  // Reset form to start a new task (prompts confirmation if unsaved changes exist)
  const handleResetForm = (force = false) => {
    const hasUnsavedData = Boolean(
      formData.title.trim() ||
      formData.description.trim() ||
      formData.assigneeId ||
      formData.reviewerId ||
      formData.projectId ||
      formData.startDate ||
      formData.dueDate
    );

    if (!force && hasUnsavedData && !submissionResult) {
      const confirmDiscard = window.confirm('Are you sure you want to discard your unsaved task data?');
      if (!confirmDiscard) return;
    }

    defaultTaskSubmissionAdapter.resetDuplicateLock();
    setFormData(INITIAL_TASK_STATE);
    setRawTranscript('');
    setLatestExtraction(null);
    setCurrentTaskIndex(0);
    setManuallyOverriddenFields({});
    setExtractionMeta(null);
    setFormErrors({});
    setHasAttemptedSubmit(false);
    hasAttemptedSubmitRef.current = false;
    setSubmissionResult(null);
    setIsReviewOpen(false);
    setVoiceCaptureKey((prev) => prev + 1);
    setIntelligenceResult(null);
    setIsAnalyzing(false);
    if (serverAnalysisTimer.current) clearTimeout(serverAnalysisTimer.current);
    setScreenReaderAnnouncement('Task form and transcript reset.');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Screen Reader Live Status Announcer (WCAG AA) */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
        id="voice-accessibility-announcer"
      >
        {screenReaderAnnouncement}
      </div>

      {/* Enterprise Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-sm text-slate-900 tracking-tight">
                TaskDelegation
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs text-slate-400 font-medium">
                / Universal Multi-Industry Engine
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-Time Live Clock Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-100/90 rounded-full text-xs text-slate-700 font-medium border border-slate-200/60 shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
              <span className="font-mono text-slate-900 font-semibold">
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="text-slate-400">•</span>
              <span>{currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-500 font-mono text-[11px]">{localTimezone}</span>
            </div>

            {/* Server Connection Status */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                serverConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
              title={serverConnected ? 'Connected to ActionFlow AI Server (Gemini enabled)' : 'Running in local mode (rule engine only)'}
            >
              {serverConnected ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="hidden sm:inline">{serverConnected ? 'AI Server' : 'Local Mode'}</span>
            </div>

            {/* Session History Pill */}
            {submittedTasks.length > 0 && (
              <button
                type="button"
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-full text-xs font-semibold transition"
              >
                <History className="w-3.5 h-3.5" />
                <span>{submittedTasks.length} Submitted</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 flex-1 space-y-6">
        {/* Intro Banner */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-5 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-white text-xs font-medium backdrop-blur-xs mb-2">
              <Zap className="w-3.5 h-3.5 text-yellow-300" />
              <span>Voice-First Intelligent AutoAction Engine</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">ActionFlow AI</h1>
            <p className="text-xs sm:text-sm text-blue-100 mt-1 max-w-xl">
              Speak naturally in Hindi, Hinglish, or English. ActionFlow understands your intent and routes to Calendar, Tasks, WhatsApp, Reminders, or Shopping automatically.
            </p>
          </div>
          {/* View Mode Toggle */}
          <div className="flex items-center bg-white/10 rounded-xl p-1 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('workspace')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'workspace'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🎙️ Voice
            </button>
            <button
              type="button"
              onClick={() => setViewMode('form')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'form'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              📋 Form
            </button>
            <button
              type="button"
              onClick={() => setViewMode('benchmark')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'benchmark'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🔬 Benchmark Lab
            </button>
            <button
              type="button"
              onClick={() => setViewMode('testing')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'testing'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              🧪 Testing Lab
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tasks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'tasks'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              ✅ My Tasks &amp; Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'calendar'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              📅 Calendar Hub
            </button>
          </div>
        </div>

        {/* Section 1: My Tasks & Calendar OR Calendar Hub OR Testing Lab OR Benchmark Lab OR Voice Command Workspace OR Legacy Task Form */}
        {viewMode === 'tasks' ? (
          <section aria-label="My Tasks & Calendar">
            <MyTasksCalendarPanel />
          </section>
        ) : viewMode === 'calendar' ? (
          <section aria-label="Google Calendar Hub">
            <CalendarIntegrationPanel />
          </section>
        ) : viewMode === 'testing' ? (
          <section aria-label="ActionFlow Intelligence Testing Lab">
            <IntelligenceTestingLab />
          </section>
        ) : viewMode === 'benchmark' ? (
          <section aria-label="Universal Benchmark Lab">
            <UniversalBenchmarkLab />
          </section>
        ) : viewMode === 'workspace' ? (
          <section aria-label="Voice Command Workspace">
            <VoiceWorkspace
              directory={SAMPLE_PEOPLE}
              projects={SAMPLE_PROJECTS}
              departments={SAMPLE_DEPARTMENTS}
              industry={selectedIndustry}
              onTaskFormFill={handleExtractDraft}
              onCommandProcessed={(result) => {
                // Sync server analysis result to ActionPlan display
                if (result?.actions?.length > 0) {
                  setIntelligenceResult({
                    requestId: result.commandId,
                    status: result.stage,
                    language: result.language,
                    intent: result.intent,
                    extractionPath: result.extractionPath,
                    actions: result.actions,
                    clarifications: result.clarifications || [],
                    suggestions: [],
                    executionPlan: {
                      orderedActionIds: result.actions.map(a => a.id),
                      parallelGroups: [result.actions.map(a => a.id)],
                      hasCycle: false
                    },
                    warnings: [
                      ...(result.warnings || []),
                      ...(result.geminiWarning?.message ? [result.geminiWarning.message] : [])
                    ],
                    metadata: {
                      processingTimeMs: result.processingTimeMs,
                      extractionPath: result.extractionPath,
                      taskCount: result.actions.length
                    }
                  });
                } else if (!result?.commandId) {
                  // Only invoke fallback /intelligence/analyze if voice command did not already process on server
                  runServerAnalysis(result.transcript);
                }
              }}
            />
          </section>
        ) : (
          <section aria-label="Voice Capture">
            <VoiceCapture
              key={voiceCaptureKey}
              onExtractDraft={handleExtractDraft}
              onClear={handleResetForm}
              directory={SAMPLE_PEOPLE}
              projects={SAMPLE_PROJECTS}
              departments={SAMPLE_DEPARTMENTS}
              industry={selectedIndustry}
            />
          </section>
        )}

        {/* Section 2: Task Form (form mode only) */}
        {viewMode === 'form' && (
          <section aria-label="Task Form">
            <TaskForm
              formData={formData}
              onChange={handleFieldChange}
              onReset={handleResetForm}
              onReview={handleOpenReview}
              onReextractAll={handleReextractAll}
              manuallyOverriddenFields={manuallyOverriddenFields}
              latestExtraction={latestExtraction}
              errors={formErrors}
              extractionMeta={extractionMeta}
              people={SAMPLE_PEOPLE}
              projects={SAMPLE_PROJECTS}
              departments={SAMPLE_DEPARTMENTS}
              selectedIndustry={selectedIndustry}
              onSelectIndustry={handleSelectIndustry}
              currentTaskIndex={currentTaskIndex}
              onSelectTaskIndex={handleSelectTaskIndex}
            />
          </section>
        )}

        {/* Section 3: Intelligence Action Plan — always visible when populated */}
        {(intelligenceResult || isAnalyzing) && (
          <section aria-label="Action Intelligence Plan">
            <ActionPlan
              analysisResult={intelligenceResult}
              isLoading={isAnalyzing}
            />
          </section>
        )}

        {/* Submitted Tasks Drawer (if any) */}
        {isHistoryOpen && submittedTasks.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Tasks Submitted in this Session ({submittedTasks.length})</span>
              </h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClearAllTasks}
                  className="text-xs text-rose-600 hover:text-rose-800 font-medium hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2 py-0.5 rounded hover:bg-slate-100 transition"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="mt-3 divide-y divide-slate-100">
              {submittedTasks.map((t) => {
                const assignee = SAMPLE_PEOPLE.find((p) => p.id === t.assigneeId);
                const project = SAMPLE_PROJECTS.find((p) => p.id === t.projectId);
                return (
                  <div key={t.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 text-sm">{t.title}</span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {t.id}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium text-[11px] border border-emerald-200">
                          Confirmed
                        </span>
                        {t.priority && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            t.priority === 'Urgent' || t.priority === 'High' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {t.priority}
                          </span>
                        )}
                        {t.isRecurring && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            Repeat {t.recurrenceFrequency || 'Weekly'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                        {assignee && (
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <User className="w-3 h-3 text-blue-600" />
                            <span>{assignee.name}</span>
                          </span>
                        )}
                        {project && (
                          <span className="flex items-center gap-1 text-slate-600">
                            <Folder className="w-3 h-3 text-slate-400" />
                            <span>{project.name}</span>
                          </span>
                        )}
                        <span>Due: {formatFriendlyDateTime(t.dueDate)}</span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(t.id, t.title)}
                        title="Delete task from history"
                        aria-label={`Delete task ${t.title}`}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Review & Confirmation Modal */}
      <TaskReview
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        taskData={formData}
        people={SAMPLE_PEOPLE}
        projects={SAMPLE_PROJECTS}
        onConfirmSubmit={handleConfirmSubmit}
        isSubmitting={isSubmitting}
        submissionResult={submissionResult}
        onResetAll={() => handleResetForm(true)}
      />

      {/* Enterprise Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>ActionFlow AI • Hybrid Intelligence Engine • Voice-to-Task Automation</div>
          <div>{serverConnected ? '🟢 Connected to AI Server (Gemini 3.8 Flash)' : '⚪ Local Mode (Rule Engine)'}</div>
        </div>
      </footer>
    </div>
  );
}
