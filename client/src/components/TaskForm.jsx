import { AlertTriangle, Sparkles, CheckCircle2, RotateCcw, Edit3, HelpCircle, MapPin, ShieldAlert, Globe2, Layers } from 'lucide-react';
import PersonPicker from './PersonPicker';
import ProjectPicker from './ProjectPicker';
import DateTimeField from './DateTimeField';
import FieldStatus from './FieldStatus';
import { formatFriendlyDateTime } from '../utils/dateTime';
import { INDUSTRY_METADATA } from '../features/extraction/industry/index.js';
import { useFieldHighlights, getFieldControlClass, FIELD_CONTAINER_STYLES } from '../features/extraction/useFieldHighlights';

/**
 * Task Creation Form with Manual and Voice autofill capabilities
 */
export default function TaskForm({
  formData,
  onChange,
  onReset,
  onReview,
  onReextractAll,
  manuallyOverriddenFields = {},
  latestExtraction = null,
  errors = {},
  extractionMeta = null,
  people = [],
  projects = [],
  departments = [],
  selectedIndustry = 'all',
  onSelectIndustry,
  currentTaskIndex = 0,
  onSelectTaskIndex
}) {
  const priorities = ['Low', 'Normal', 'High', 'Urgent'];
  const frequencies = ['Daily', 'Weekly', 'Monthly'];

  const highlightedFields = useFieldHighlights(latestExtraction, manuallyOverriddenFields);

  const getPriorityStyle = (p, isSelected) => {
    if (!isSelected) {
      return 'bg-white text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-slate-50';
    }
    switch (p) {
      case 'Urgent':
        return 'bg-rose-600 text-white border-rose-600 shadow-xs font-semibold';
      case 'High':
        return 'bg-amber-600 text-white border-amber-600 shadow-xs font-semibold';
      case 'Low':
        return 'bg-slate-700 text-white border-slate-700 shadow-xs font-semibold';
      default:
        return 'bg-blue-600 text-white border-blue-600 shadow-xs font-semibold';
    }
  };

  const hasAmbiguities = extractionMeta?.ambiguities?.length > 0;
  const hasManualOverrides = Object.keys(manuallyOverriddenFields).length > 0;
  const isSafetyCritical = extractionMeta?.safetyClassification?.isSafetyCritical;
  const languageLabel = extractionMeta?.language?.label || (extractionMeta?.language?.code ? extractionMeta.language.code.toUpperCase() : null);

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl shadow-sm overflow-hidden">
      {/* Form Card Header with Industry Pack Selector */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-slate-50/50">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Task Information</h2>
            {languageLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full">
                <Globe2 className="w-3 h-3 text-indigo-500" />
                <span>{languageLabel}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Fill the fields manually or use voice input to auto-extract values.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Industry Pack Selector Dropdown */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
            <label htmlFor="industry-pack-select" className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Industry:
            </label>
            <select
              id="industry-pack-select"
              value={selectedIndustry}
              onChange={(e) => onSelectIndustry?.(e.target.value)}
              className="text-xs bg-transparent text-slate-800 font-medium focus:outline-hidden cursor-pointer"
            >
              {INDUSTRY_METADATA.map((ind) => (
                <option key={ind.key} value={ind.key}>
                  {ind.label}
                </option>
              ))}
            </select>
          </div>

          {extractionMeta && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Voice Autofilled</span>
            </span>
          )}
          {hasManualOverrides && onReextractAll && (
            <button
              type="button"
              onClick={onReextractAll}
              title="Discard manual overrides and re-extract all fields from the transcript"
              className="text-xs text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md hover:bg-blue-100 flex items-center gap-1 transition font-medium"
            >
              <Sparkles className="w-3 h-3 text-blue-600" />
              <span>Re-extract All</span>
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 flex items-center gap-1 transition"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Multi-Task Utterance Stepper / Switcher */}
      {latestExtraction?.isMultiTask && latestExtraction.tasks?.length > 1 && (
        <div className="mx-6 mt-4 p-3 bg-indigo-50/90 border border-indigo-200 rounded-xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-indigo-950 font-medium">
            <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              <strong>Multi-Task Utterance Detected:</strong> {latestExtraction.tasks.length} tasks extracted. Select to view or edit:
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {latestExtraction.tasks.map((taskItem, tIdx) => (
              <button
                key={tIdx}
                type="button"
                onClick={() => onSelectTaskIndex?.(tIdx)}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                  currentTaskIndex === tIdx
                    ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                    : 'bg-white text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                }`}
              >
                Task {tIdx + 1}: {taskItem.fields?.title ? (taskItem.fields.title.length > 20 ? taskItem.fields.title.slice(0, 18) + '...' : taskItem.fields.title) : `Draft ${tIdx + 1}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* High-Consequence Industrial Safety Alert Banner */}
      {isSafetyCritical && (
        <div className="mx-6 mt-4 p-4 bg-rose-50 border-2 border-rose-400 rounded-xl text-xs text-rose-950 flex items-start gap-3 animate-in fade-in shadow-xs">
          <div className="p-1.5 rounded-lg bg-rose-200 text-rose-700 shrink-0 mt-0.5">
            <ShieldAlert className="w-5 h-5 text-rose-700" />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-rose-900 tracking-tight text-sm">
                HIGH-CONSEQUENCE INDUSTRIAL SAFETY WARNING
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-200 text-rose-900 font-bold uppercase tracking-wider">
                Human Sign-Off Required
              </span>
            </div>
            <p className="text-rose-900 font-medium leading-relaxed">
              {extractionMeta.safetyClassification.warning}
            </p>
            <p className="text-[11px] text-rose-700">
              Notice: Spoken task parsing does not authorize safety-critical machinery, electrical overrides, chemical handling, or clinical medication orders. Human supervisory review and certified permit are mandatory before task dispatch.
            </p>
          </div>
        </div>
      )}

      {/* Manual Overrides Active Alert Banner */}
      {hasManualOverrides && (
        <div className="mx-6 mt-4 p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-blue-900">
            <Edit3 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>{Object.keys(manuallyOverriddenFields).length} field(s)</strong> have manual edits and are preserved from automatic transcript replacement.
            </span>
          </div>
          {onReextractAll && (
            <button
              type="button"
              onClick={onReextractAll}
              className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-300 rounded-lg shadow-2xs transition shrink-0"
            >
              Re-extract all fields
            </button>
          )}
        </div>
      )}

      {/* Clarifications Needed Banner */}
      {extractionMeta?.clarifications?.length > 0 && (
        <div className="mx-6 mt-4 p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 space-y-1.5 animate-in fade-in">
          <div className="font-semibold text-amber-900 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Clarifications Required ({extractionMeta.clarifications.length})</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-amber-800">
            {extractionMeta.clarifications.map((c, idx) => (
              <li key={idx}>
                <span className="font-medium text-amber-900 capitalize">{c.field}:</span> {c.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Global Ambiguity / Warning Banner */}
      {hasAmbiguities && (
        <div className="mx-6 mt-4 p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2.5 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-amber-900">Action Required: Ambiguity Detected</div>
            <ul className="mt-1 list-disc list-inside space-y-0.5 text-amber-800">
              {extractionMeta.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Form Fields Body */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onReview();
        }}
        className="p-6 space-y-5"
      >
        {/* 1. Task Title */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <label htmlFor="task-title" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Task Title <span className="text-rose-500">*</span>
              </label>
              {highlightedFields.title && !errors.title && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-100/80 border border-blue-200 px-1.5 py-0.5 rounded animate-in fade-in">
                  Updated from voice
                </span>
              )}
            </div>
            <FieldStatus
              status={extractionMeta?.titleStatus}
              isManuallyEdited={Boolean(manuallyOverriddenFields.title)}
            />
          </div>
          <input
            id="task-title"
            type="text"
            value={formData.title}
            onChange={(e) => onChange('title', e.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? 'task-title-error' : undefined}
            placeholder="e.g., Kitchen material selection and vendor alignment"
            className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-hidden focus:ring-2 ${getFieldControlClass({
              isHighlighted: Boolean(highlightedFields.title),
              error: Boolean(errors.title)
            })}`}
          />
          {errors.title && <p id="task-title-error" className="mt-1 text-xs text-rose-600 font-medium">{errors.title}</p>}
          {manuallyOverriddenFields.title && latestExtraction?.fields?.title && latestExtraction.fields.title !== formData.title && (
            <p className="mt-1 text-[11px] text-amber-700 flex items-center gap-1">
              <span>Transcript suggested:</span>
              <span className="font-semibold">"{latestExtraction.fields.title}"</span>
            </p>
          )}
        </div>

        {/* 2. Task Description */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <label htmlFor="task-desc" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Task Description
              </label>
              {highlightedFields.description && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-100/80 border border-blue-200 px-1.5 py-0.5 rounded animate-in fade-in">
                  Updated from voice
                </span>
              )}
            </div>
            <FieldStatus
              status={extractionMeta?.descriptionStatus}
              isManuallyEdited={Boolean(manuallyOverriddenFields.description)}
            />
          </div>
          <textarea
            id="task-desc"
            rows={2}
            value={formData.description}
            onChange={(e) => onChange('description', e.target.value)}
            placeholder="Provide context, notes, or specifics..."
            className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-hidden focus:ring-2 ${getFieldControlClass({
              isHighlighted: Boolean(highlightedFields.description)
            })}`}
          />
        </div>

        {/* 3 & 4. Doer (Assignee) and Reviewer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <PersonPicker
            id="assignee-picker"
            label="Doer / Assigned Person"
            required={true}
            people={people}
            selectedId={formData.assigneeId}
            onChange={(id) => onChange('assigneeId', id)}
            ambiguousCandidates={extractionMeta?.assignee?.candidates || []}
            ambiguityMessage={extractionMeta?.assignee?.message}
            error={errors.assigneeId}
            isHighlighted={Boolean(highlightedFields.assigneeId)}
            placeholder="Assign to team member..."
          />

          <PersonPicker
            id="reviewer-picker"
            label="Reviewer"
            required={false}
            people={people}
            selectedId={formData.reviewerId}
            onChange={(id) => onChange('reviewerId', id)}
            ambiguousCandidates={extractionMeta?.reviewer?.candidates || []}
            ambiguityMessage={extractionMeta?.reviewer?.message}
            isHighlighted={Boolean(highlightedFields.reviewerId)}
            placeholder="Select optional reviewer..."
          />
        </div>

        {/* 5, 6 & Location. Project, Department, and Location */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ProjectPicker
            id="project-picker"
            label="Project"
            required={false}
            projects={projects}
            selectedId={formData.projectId}
            onChange={(id) => onChange('projectId', id)}
            isHighlighted={Boolean(highlightedFields.projectId)}
            placeholder="Link to project..."
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <label htmlFor="dept-select" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Department
                </label>
                {highlightedFields.department && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-100/80 border border-blue-200 px-1.5 py-0.5 rounded animate-in fade-in">
                    Updated from voice
                  </span>
                )}
              </div>
              <FieldStatus
                status={formData.department ? 'valid' : 'none'}
                isManuallyEdited={Boolean(manuallyOverriddenFields.department)}
              />
            </div>
            <select
              id="dept-select"
              value={formData.department}
              onChange={(e) => onChange('department', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-900 shadow-2xs focus:outline-hidden focus:ring-2 ${getFieldControlClass({
                isHighlighted: Boolean(highlightedFields.department)
              })}`}
            >
              <option value="">Select department (optional)...</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <label htmlFor="task-location" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Location
                </label>
                {highlightedFields.location && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-100/80 border border-blue-200 px-1.5 py-0.5 rounded animate-in fade-in">
                    Updated from voice
                  </span>
                )}
              </div>
              <FieldStatus
                status={formData.location ? 'valid' : 'none'}
                isManuallyEdited={Boolean(manuallyOverriddenFields.location)}
              />
            </div>
            <input
              id="task-location"
              type="text"
              value={formData.location || ''}
              onChange={(e) => onChange('location', e.target.value)}
              placeholder="e.g. Kitchen, Site Office..."
              className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-hidden focus:ring-2 ${getFieldControlClass({
                isHighlighted: Boolean(highlightedFields.location)
              })}`}
            />
          </div>
        </div>

        {/* 7 & 8. Start Date and Due Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <DateTimeField
            id="start-datetime"
            label="Start Date & Time"
            required={false}
            value={formData.startDate}
            onChange={(val) => onChange('startDate', val)}
            isTimeInferred={extractionMeta?.startDate?.isTimeInferred}
            isManuallyEdited={Boolean(manuallyOverriddenFields.startDate)}
            isHighlighted={Boolean(highlightedFields.startDate)}
            helperText="When work should commence."
          />

          <DateTimeField
            id="due-datetime"
            label="Due Date & Time"
            required={true}
            value={formData.dueDate}
            onChange={(val) => onChange('dueDate', val)}
            error={errors.dueDate}
            isTimeInferred={extractionMeta?.dueDate?.isTimeInferred}
            isManuallyEdited={Boolean(manuallyOverriddenFields.dueDate)}
            isHighlighted={Boolean(highlightedFields.dueDate)}
            helperText="Task deadline."
          />
        </div>

        {/* 9. Priority Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Priority Level
              </label>
              {highlightedFields.priority && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-100/80 border border-blue-200 px-1.5 py-0.5 rounded animate-in fade-in">
                  Updated from voice
                </span>
              )}
            </div>
            <FieldStatus
              status={formData.priority ? 'valid' : 'none'}
              isManuallyEdited={Boolean(manuallyOverriddenFields.priority)}
            />
          </div>
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-xl ${
            highlightedFields.priority
              ? FIELD_CONTAINER_STYLES.highlighted
              : FIELD_CONTAINER_STYLES.defaultPriority
          }`}>
            {priorities.map((p) => {
              const isSelected = formData.priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onChange('priority', p)}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition ${getPriorityStyle(
                    p,
                    isSelected
                  )}`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        {/* 10 & 11. Recurrence Controls */}
        <div className={`p-4 border rounded-xl space-y-3 ${
          highlightedFields.recurrence
            ? FIELD_CONTAINER_STYLES.highlighted
            : FIELD_CONTAINER_STYLES.defaultRecurrence
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-900">Recurring Task</span>
                {highlightedFields.recurrence && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-100/80 border border-blue-200 px-1.5 py-0.5 rounded animate-in fade-in">
                    Updated from voice
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">Enable if this task should repeat on a regular schedule.</p>
            </div>

            {/* Toggle switch */}
            <button
              type="button"
              role="switch"
              aria-checked={formData.isRecurring}
              onClick={() => {
                const nextVal = !formData.isRecurring;
                onChange('isRecurring', nextVal);
                if (nextVal && !formData.recurrenceFrequency) {
                  onChange('recurrenceFrequency', 'Weekly');
                }
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
                formData.isRecurring ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  formData.isRecurring ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Recurrence Frequency (conditional) */}
          {formData.isRecurring && (
            <div className="pt-2 border-t border-slate-200/60 animate-in fade-in space-y-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Repeat Frequency <span className="text-rose-500">*</span>
              </label>
              <div className="flex gap-2">
                {frequencies.map((freq) => {
                  const isSelected = formData.recurrenceFrequency === freq;
                  return (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => onChange('recurrenceFrequency', freq)}
                      className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-lg border transition ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {freq}
                    </button>
                  );
                })}
              </div>
              {errors.recurrenceFrequency && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{errors.recurrenceFrequency}</p>
              )}
              {formData.recurrenceEndDate && (
                <div className="text-[11px] text-purple-800 bg-purple-50/70 p-2 rounded border border-purple-200 flex items-center gap-1 font-medium">
                  <span>Repeat until:</span>
                  <span className="font-semibold">{formatFriendlyDateTime(formData.recurrenceEndDate)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Submit / Review Action Area */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-3">
          <button
            type="submit"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-md transition shadow-blue-500/20"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Review & Submit Task</span>
          </button>
        </div>
      </form>
    </div>
  );
}
