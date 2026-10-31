import { CheckCircle2, AlertTriangle, AlertCircle, HelpCircle, Edit2, Sparkles } from 'lucide-react';

/**
 * Visual Field Status Indicator
 * Distinguishes Extracted, Matched, Suggested, Ambiguous, Invalid, Missing, and Manually Edited states.
 */
export default function FieldStatus({ status, message = '', isManuallyEdited = false }) {
  if (isManuallyEdited) {
    return (
      <span
        title="This field was manually edited and will not be overwritten by transcript updates."
        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full"
      >
        <Edit2 className="w-3 h-3 text-slate-600" />
        <span>Manually Edited</span>
      </span>
    );
  }

  if (!status || status === 'none') return null;

  switch (status) {
    case 'valid':
    case 'matched':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>Extracted</span>
        </span>
      );
    case 'suggested':
      return (
        <span
          title={message || 'Suggested by extraction engine'}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full"
        >
          <Sparkles className="w-3 h-3 text-blue-600" />
          <span>Suggested</span>
        </span>
      );
    case 'ambiguous':
      return (
        <span
          title={message}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full"
        >
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          <span>Ambiguous</span>
        </span>
      );
    case 'invalid':
      return (
        <span
          title={message}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full"
        >
          <AlertCircle className="w-3 h-3 text-rose-600" />
          <span>Invalid</span>
        </span>
      );
    case 'missing':
      return (
        <span
          title={message || 'Value is missing'}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"
        >
          <HelpCircle className="w-3 h-3 text-amber-600" />
          <span>Missing</span>
        </span>
      );
    case 'needs_confirmation':
      return (
        <span
          title={message}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full"
        >
          <HelpCircle className="w-3 h-3 text-sky-600" />
          <span>Verify</span>
        </span>
      );
    default:
      return null;
  }
}
