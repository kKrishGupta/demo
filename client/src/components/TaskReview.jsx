import { useState } from 'react';
import { CheckCircle2, Calendar, User, Folder, AlertTriangle, ShieldCheck, ArrowLeft, Send, Copy, Check, MapPin } from 'lucide-react';
import { formatFriendlyDateTime } from '../utils/dateTime';

/**
 * Task Review and Submission Modal / Overlay
 */
export default function TaskReview({
  isOpen,
  onClose,
  taskData,
  people = [],
  projects = [],
  onConfirmSubmit,
  isSubmitting = false,
  submissionResult = null,
  onResetAll
}) {
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const assignee = people.find((p) => p.id === taskData.assigneeId);
  const reviewer = people.find((p) => p.id === taskData.reviewerId);
  const project = projects.find((p) => p.id === taskData.projectId);

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'Urgent':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'High':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Low':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(submissionResult?.task || taskData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {submissionResult ? 'Task Submitted Successfully' : 'Review Task Delegation'}
              </h3>
              <p className="text-xs text-slate-500">
                {submissionResult
                  ? 'Task payload confirmed and registered in session store.'
                  : 'Please review all extracted fields before committing this task.'}
              </p>
            </div>
          </div>
          {!submissionResult && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {submissionResult ? (
            /* Post-Submission Success View */
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-emerald-900">
                    Confirmed: {submissionResult.taskId}
                  </h4>
                  <p className="text-xs text-emerald-700 mt-1">
                    The task was processed through the validation pipeline and normalized into the enterprise task schema.
                  </p>
                  <div className="mt-2 text-[11px] text-emerald-600 font-mono">
                    Timestamp: {submissionResult.timestamp} • Origin: {submissionResult.task.submittedVia || 'voice-assisted'}
                  </div>
                </div>
              </div>

              {/* Payload card */}
              <div className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto relative shadow-inner">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-slate-400">
                  <span>Structured API Payload (Normalized)</span>
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                </div>
                <pre className="max-h-60 overflow-y-auto leading-relaxed">
                  {JSON.stringify(submissionResult.task, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            /* Pre-Submission Review View */
            <div className="space-y-4">
              {/* Task Title Banner */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Task Title</span>
                <h4 className="text-base font-bold text-slate-900 mt-0.5">{taskData.title}</h4>
                {taskData.description && (
                  <p className="text-xs text-slate-600 mt-2 italic bg-white p-2 rounded border border-slate-100">
                    {taskData.description}
                  </p>
                )}
              </div>

              {/* Entity Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Assignee Card */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    <span>Doer / Assigned Person</span>
                  </div>
                  {assignee ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
                        {assignee.avatar}
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-slate-900">{assignee.name}</div>
                        <div className="text-[11px] text-slate-500">{assignee.role} • {assignee.department}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-rose-600 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> None selected (Required)
                    </div>
                  )}
                </div>

                {/* Reviewer Card */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Reviewer (Optional)</span>
                  </div>
                  {reviewer ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">
                        {reviewer.avatar}
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-slate-900">{reviewer.name}</div>
                        <div className="text-[11px] text-slate-500">{reviewer.role} • {reviewer.department}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-slate-400 italic">No reviewer assigned</div>
                  )}
                </div>

                {/* Project Card */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 flex items-center gap-1">
                    <Folder className="w-3.5 h-3.5 text-blue-600" />
                    <span>Project & Department</span>
                  </div>
                  <div className="mt-1.5 text-xs text-slate-800">
                    {project ? (
                      <div>
                        <span className="font-semibold">{project.name}</span>
                        <span className="ml-1 text-[11px] font-mono text-slate-500">({project.code})</span>
                        {taskData.department && (
                          <span className="block text-[11px] text-slate-500 mt-0.5">Dept: {taskData.department}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">No specific project</span>
                    )}
                    {taskData.location && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-teal-700 font-medium">
                        <MapPin className="w-3 h-3 text-teal-600 shrink-0" />
                        <span>Location: {taskData.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Priority & Recurrence Card */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                    Priority & Schedule
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${getPriorityBadge(taskData.priority)}`}>
                      {taskData.priority} Priority
                    </span>
                    {taskData.isRecurring ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                        Recurring: {taskData.recurrenceFrequency}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">One-time task</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Timeline Schedule */}
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 flex items-center gap-1 mb-2">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Timeline Schedule</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-slate-500 block text-[11px]">Start Date & Time</span>
                    <span className="font-semibold text-slate-800">
                      {taskData.startDate ? formatFriendlyDateTime(taskData.startDate) : 'Not specified'}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-slate-500 block text-[11px]">Due Date & Time (Deadline)</span>
                    <span className="font-semibold text-slate-800">
                      {taskData.dueDate ? formatFriendlyDateTime(taskData.dueDate) : 'Not specified'}
                    </span>
                  </div>
                </div>
              </div>

              {/* JSON preview toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowJson(!showJson)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                >
                  {showJson ? 'Hide Raw Payload' : 'Inspect Raw JSON Payload'}
                </button>
                {showJson && (
                  <pre className="mt-2 p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto">
                    {JSON.stringify(taskData, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          {submissionResult ? (
            <div className="w-full flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onResetAll}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
              >
                Create Another Task
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Edit</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={onConfirmSubmit}
                className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold text-white shadow-sm transition ${
                  isSubmitting
                    ? 'bg-blue-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20 hover:shadow-md'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Submitting...' : 'Confirm & Submit Task'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
