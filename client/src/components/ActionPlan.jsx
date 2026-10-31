/**
 * ActionFlow AI — Action Plan Component
 * Displays the multi-action execution plan, dependencies, confidence levels,
 * and smart suggestions from the hybrid intelligence pipeline.
 */

import { useMemo } from 'react';
import {
  Layers, AlertTriangle, CheckCircle2, Clock, User, ArrowRight,
  Zap, GitBranch, ShieldAlert, Lightbulb, AlertCircle, ChevronRight
} from 'lucide-react';

const PRIORITY_COLORS = {
  Urgent: 'bg-rose-100 text-rose-800 border-rose-300',
  High:   'bg-amber-100 text-amber-800 border-amber-300',
  Normal: 'bg-blue-100 text-blue-700 border-blue-300',
  Low:    'bg-slate-100 text-slate-700 border-slate-300',
  '':     'bg-slate-50 text-slate-600 border-slate-200'
};

const STATE_COLORS = {
  DRAFT:                 'bg-slate-100 text-slate-600',
  VALIDATING:            'bg-blue-100 text-blue-700',
  NEEDS_CLARIFICATION:   'bg-amber-100 text-amber-800',
  READY_FOR_APPROVAL:    'bg-emerald-100 text-emerald-800',
  APPROVED:              'bg-green-100 text-green-800',
  BLOCKED:               'bg-rose-100 text-rose-800',
  COMPLETED:             'bg-emerald-100 text-emerald-700'
};

function ConfidenceBadge({ value }) {
  if (!value && value !== 0) return null;
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 85 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : pct >= 65 ? 'text-amber-700 bg-amber-50 border-amber-200'
              : 'text-rose-700 bg-rose-50 border-rose-200';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border ${color}`}>
      {pct}%
    </span>
  );
}

function ActionCard({ action, index, orderedPosition }) {
  const priorityClass = PRIORITY_COLORS[action.priority] || PRIORITY_COLORS[''];
  const stateClass = STATE_COLORS[action.executionState] || STATE_COLORS.DRAFT;
  const overallConf = action.confidence?.overall;
  const hasClarifications = (action.clarificationsNeeded || []).length > 0;
  const isBlocked = action.executionState === 'BLOCKED';

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-xs space-y-2.5 ${
      isBlocked ? 'border-rose-200 opacity-75' : hasClarifications ? 'border-amber-200' : 'border-slate-200'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 shrink-0 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
            {orderedPosition !== undefined ? orderedPosition + 1 : index + 1}
          </span>
          <span className="font-semibold text-slate-900 text-sm truncate">{action.title || 'Untitled Action'}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {action.priority && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${priorityClass}`}>
              {action.priority}
            </span>
          )}
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${stateClass}`}>
            {(action.executionState || 'DRAFT').replace(/_/g, ' ')}
          </span>
          {overallConf !== undefined && <ConfidenceBadge value={overallConf} />}
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        {action.assignee && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3 text-blue-500" />
            <span>{action.assignee.name}</span>
          </span>
        )}
        {action.deadline && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="font-medium">{new Date(action.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </span>
        )}
        {action.type && action.type !== 'CREATE_TASK' && (
          <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
            {action.type.replace(/_/g, ' ')}
          </span>
        )}
        {action.isRecurring && action.recurrenceFrequency && (
          <span className="flex items-center gap-1 text-purple-700">
            <Zap className="w-3 h-3" />
            <span>{action.recurrenceFrequency}</span>
          </span>
        )}
      </div>

      {/* Dependencies */}
      {(action.dependencies || []).filter(d => d.actionId || d.description).length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <GitBranch className="w-3 h-3 text-indigo-400" />
          <span>Depends on: {action.dependencies.map(d => d.description || d.actionId).filter(Boolean).join(', ')}</span>
        </div>
      )}

      {/* Clarifications */}
      {hasClarifications && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
          {(action.clarificationsNeeded || []).map((c, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-800">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5 text-amber-600" />
              <span><strong className="capitalize">{c.field}:</strong> {c.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Requires approval badge */}
      {action.requiresApproval && (
        <div className="flex items-center gap-1 text-[11px] text-rose-700 font-medium">
          <ShieldAlert className="w-3 h-3" />
          <span>Requires explicit approval before execution</span>
        </div>
      )}

      {/* Source text */}
      {action.sourceText && (
        <div className="text-[10px] text-slate-400 italic border-t border-slate-100 pt-1.5 truncate">
          Source: "{action.sourceText.slice(0, 100)}{action.sourceText.length > 100 ? '...' : ''}"
        </div>
      )}
    </div>
  );
}

/**
 * ActionPlan component — renders the full action plan from intelligence analysis
 * @param {Object} props
 * @param {Object} props.analysisResult - Result from apiAnalyze()
 * @param {boolean} props.isLoading
 */
export default function ActionPlan({ analysisResult, isLoading = false }) {
  const { actions = [], executionPlan = {}, clarifications = [], suggestions = [], warnings = [], metadata = {} } = analysisResult || {};

  const orderedActions = useMemo(() => {
    if (!executionPlan?.orderedActionIds?.length) return actions;
    const order = executionPlan.orderedActionIds;
    return [...actions].sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [actions, executionPlan]);

  const parallelGroups = executionPlan?.parallelGroups || [];

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/3 mb-3" />
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-16 bg-slate-100 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!analysisResult || !actions.length) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/60 to-slate-50 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600" />
          <h3 className="font-semibold text-sm text-slate-900">Action Intelligence Plan</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold">
            {actions.length} action{actions.length !== 1 ? 's' : ''}
          </span>
          {metadata.extractionPath && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-mono">
              PATH {metadata.extractionPath}
            </span>
          )}
        </div>
        {metadata.processingTimeMs !== undefined && (
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Clock className="w-3 h-3" />
            <span>{metadata.processingTimeMs}ms</span>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Global warnings */}
        {warnings.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
            <div className="font-semibold text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Warnings ({warnings.length})</span>
            </div>
            {warnings.map((w, i) => (
              <div key={i} className="text-amber-700 pl-5">• {w}</div>
            ))}
          </div>
        )}

        {/* Execution plan summary */}
        {parallelGroups.length > 1 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
            <div className="font-semibold text-blue-800 flex items-center gap-1.5 mb-1.5">
              <GitBranch className="w-3.5 h-3.5" />
              <span>Execution Plan ({parallelGroups.length} stages)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {parallelGroups.map((group, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="font-semibold text-blue-700">Stage {idx + 1}:</span>
                  <span className="text-blue-600">{group.length} action{group.length > 1 ? 's in parallel' : ''}</span>
                  {idx < parallelGroups.length - 1 && <ArrowRight className="w-3 h-3 text-blue-400" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cycle warning */}
        {executionPlan.hasCycle && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Circular dependency detected</span>
            </div>
            {executionPlan.cycleWarning && <p className="mt-1">{executionPlan.cycleWarning}</p>}
          </div>
        )}

        {/* Deadline conflicts */}
        {(executionPlan.deadlineConflicts || []).length > 0 && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-1">
            <div className="font-semibold text-rose-800 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Deadline Conflicts</span>
            </div>
            {executionPlan.deadlineConflicts.map((c, i) => (
              <div key={i} className="text-rose-700 pl-5">• {c.message}</div>
            ))}
          </div>
        )}

        {/* Action cards */}
        <div className="space-y-3">
          {orderedActions.map((action, idx) => {
            const orderedPos = executionPlan?.orderedActionIds?.indexOf(action.id);
            return (
              <ActionCard
                key={action.id}
                action={action}
                index={idx}
                orderedPosition={orderedPos >= 0 ? orderedPos : idx}
              />
            );
          })}
        </div>

        {/* Smart suggestions */}
        {suggestions.length > 0 && (
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              <span>Smart Recommendations</span>
              <span className="text-[10px] text-slate-400">(require acceptance)</span>
            </div>
            {suggestions.slice(0, 4).map((s, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                <ChevronRight className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-amber-900">{s.title}</span>
                  {s.rationale && <span className="text-amber-700 ml-1.5">— {s.rationale}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Clarifications needed */}
        {clarifications.length > 0 && (
          <div className="border-t border-slate-100 pt-4 space-y-1.5">
            <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>Clarifications Required ({clarifications.length})</span>
            </div>
            {clarifications.map((c, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <span className="font-medium capitalize shrink-0">{c.field}:</span>
                <span>{c.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Success state */}
        {actions.every(a => a.executionState === 'READY_FOR_APPROVAL' || a.executionState === 'COMPLETED') && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>All actions validated and ready for approval.</span>
          </div>
        )}
      </div>
    </div>
  );
}
