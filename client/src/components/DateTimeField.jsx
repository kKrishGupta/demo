import { Calendar, Clock, AlertCircle, Edit2 } from 'lucide-react';
import { formatFriendlyDateTime } from '../utils/dateTime';
import { getFieldControlClass } from '../features/extraction/useFieldHighlights';

/**
 * Modern DateTime Field with friendly preview and helper text
 */
export default function DateTimeField({
  id,
  label,
  value = '',
  onChange,
  required = false,
  error = '',
  helperText = '',
  isTimeInferred = false,
  isManuallyEdited = false,
  isHighlighted = false
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          {isHighlighted && !error && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-100/80 border border-blue-200 px-1.5 py-0.5 rounded animate-in fade-in">
              Updated from voice
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isManuallyEdited && (
            <span
              title="This field was manually edited"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full"
            >
              <Edit2 className="w-3 h-3 text-slate-600" />
              <span>Manually Edited</span>
            </span>
          )}
          {isTimeInferred && (
            <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Default Time Applied
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <input
          id={id}
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 shadow-2xs focus:outline-hidden focus:ring-2 ${getFieldControlClass({
            isHighlighted,
            error: Boolean(error)
          })}`}
        />
      </div>

      {/* Friendly Date Preview */}
      {value && !error && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
          <Calendar className="w-3 h-3 text-slate-400" />
          <span>{formatFriendlyDateTime(value)}</span>
        </div>
      )}

      {/* Helper text or validation error */}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-600 font-medium flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p id={`${id}-helper`} className="mt-1 text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
}
