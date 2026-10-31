import { useMemo, useState } from 'react';
import { Layers, Check, X } from 'lucide-react';

/**
 * Smart Entity Highlighter & Interactive Inspector (Phase 1)
 *
 * Implements:
 * - Color-coded visual language:
 *   Purple: People / Contacts
 *   Blue: Dates / Calendar
 *   Green: Times / Completed Actions
 *   Amber: Tasks / Assignments
 *   Pink: Communication / WhatsApp
 *   Teal: Locations / Projects
 * - Clickable entity pills with details popover
 * - In-place editing / correction of extracted entities
 * - Dotted underline for uncertain extractions
 * - Legend toggle
 */
export default function TranscriptHighlighter({
  transcript = '',
  spans = [],
  interimText = '',
  onEntityChange
}) {
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showLegend, setShowLegend] = useState(false);

  // Split transcript into alternating plain text and highlighted span segments
  const segments = useMemo(() => {
    if (!transcript) return [];
    if (!spans || spans.length === 0) {
      return [{ type: 'text', text: transcript }];
    }

    // Sort spans by startIndex ascending and filter invalid spans
    const sortedSpans = [...spans]
      .filter((s) => s.startIndex >= 0 && s.endIndex <= transcript.length && s.startIndex < s.endIndex)
      .sort((a, b) => a.startIndex - b.startIndex);

    // Resolve overlaps
    const nonOverlapping = [];
    let lastEnd = 0;
    for (const span of sortedSpans) {
      if (span.startIndex >= lastEnd) {
        nonOverlapping.push(span);
        lastEnd = span.endIndex;
      }
    }

    const result = [];
    let currentIndex = 0;

    for (let i = 0; i < nonOverlapping.length; i++) {
      const span = nonOverlapping[i];

      // Add preceding plain text
      if (span.startIndex > currentIndex) {
        result.push({
          type: 'text',
          text: transcript.substring(currentIndex, span.startIndex)
        });
      }

      // Add highlighted segment
      result.push({
        type: 'highlight',
        span,
        text: transcript.substring(span.startIndex, span.endIndex)
      });

      currentIndex = span.endIndex;
    }

    // Add trailing text
    if (currentIndex < transcript.length) {
      result.push({
        type: 'text',
        text: transcript.substring(currentIndex)
      });
    }

    return result;
  }, [transcript, spans]);

  const handleEntityClick = (span, text) => {
    setSelectedEntity({ ...span, currentText: text });
    setEditValue(text);
  };

  const handleSaveEdit = () => {
    if (selectedEntity && editValue.trim()) {
      onEntityChange?.(selectedEntity, editValue.trim());
      setSelectedEntity(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Transcript Text Body with Interactive Styled Spans */}
      <div className="text-xs leading-relaxed text-slate-800 break-words font-normal select-text p-2.5 bg-slate-50/70 border border-slate-200/80 rounded-lg">
        {segments.map((seg, idx) => {
          if (seg.type === 'text') {
            return <span key={idx}>{seg.text}</span>;
          }

          const { span, text } = seg;
          const bg = span.bgClass || (
            span.color === 'purple' ? 'bg-purple-100 text-purple-900 border-purple-300' :
            span.color === 'blue'   ? 'bg-blue-100 text-blue-900 border-blue-300' :
            span.color === 'green'  ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
            span.color === 'amber'  ? 'bg-amber-100 text-amber-900 border-amber-300' :
            span.color === 'pink'   ? 'bg-pink-100 text-pink-900 border-pink-300' :
            span.color === 'orange' ? 'bg-orange-100 text-orange-950 border-orange-300' :
            span.color === 'teal'   ? 'bg-teal-100 text-teal-900 border-teal-300' :
            'bg-blue-100 text-blue-900 border-blue-300'
          );
          const isUncertain = span.confidence !== undefined && span.confidence < 0.75;
          const isUnresolved = span.status === 'unresolved' || span.status === 'ambiguous';

          return (
            <span
              key={idx}
              onClick={() => handleEntityClick(span, text)}
              onMouseEnter={() => setActiveTooltip(span)}
              onMouseLeave={() => setActiveTooltip(null)}
              className={`relative inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-md border text-[11px] font-medium transition cursor-pointer hover:shadow-xs ${bg} ${
                isUncertain || isUnresolved ? 'border-dashed underline decoration-dotted decoration-amber-600' : ''
              }`}
              title={`Click to inspect or edit ${span.label}: "${text}"`}
            >
              <span>{text}</span>
              <span className="px-1 py-0.2 bg-white/80 rounded text-[9px] font-bold uppercase opacity-85">
                {span.badgeLabel || (span.label ? span.label.split('/')[0].trim() : 'ENTITY')}
              </span>
            </span>
          );
        })}

        {/* Interim spoken text chunk while microphone is active */}
        {interimText && (
          <span className="text-slate-400 italic animate-pulse"> {interimText}</span>
        )}
      </div>

      {/* Selected Entity Inspector / Quick-Edit Popover */}
      {selectedEntity && (
        <div className="p-3 bg-white border border-blue-200 rounded-lg shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${selectedEntity.badgeClass || 'bg-blue-600 text-white'}`}>
              {selectedEntity.label}
            </span>
            <span className="text-slate-500 text-[11px]">Confidence: {Math.round((selectedEntity.confidence || 0.95) * 100)}%</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-44"
              placeholder="Correct entity text..."
            />
            <button
              type="button"
              onClick={handleSaveEdit}
              className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition"
              title="Save correction"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedEntity(null)}
              className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300 transition"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hover Info Tooltip Bar */}
      {activeTooltip && !selectedEntity && (
        <div className="p-2 bg-slate-900 text-white rounded-lg text-[11px] flex items-center justify-between gap-3 shadow-md animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${activeTooltip.badgeClass || 'bg-blue-600'}`}>
              {activeTooltip.label}
            </span>
            <span className="font-mono text-slate-300 truncate max-w-[280px]">
              &ldquo;{activeTooltip.sourceText || activeTooltip.rawText}&rdquo;
            </span>
          </div>
          <span className="text-[10px] text-slate-300 font-mono shrink-0">
            Click to edit entity
          </span>
        </div>
      )}

      {/* Legend Toggle & Accessible Pills */}
      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-[10px]">
        <button
          type="button"
          onClick={() => setShowLegend(!showLegend)}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 transition"
        >
          <Layers className="w-3 h-3 text-slate-400" />
          <span>{showLegend ? 'Hide Color Legend' : 'Show Color Legend'}</span>
        </button>

        {spans.length > 0 && (
          <span className="text-slate-500">
            <span className="font-semibold text-slate-700">{spans.length}</span> entities detected
          </span>
        )}
      </div>

      {showLegend && (
        <div className="p-2.5 bg-white border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] animate-in fade-in">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-purple-100 border border-purple-300 shrink-0" />
            <span className="text-slate-700">Purple: People & Contacts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300 shrink-0" />
            <span className="text-slate-700">Blue: Dates & Calendar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 shrink-0" />
            <span className="text-slate-700">Green: Times & Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 shrink-0" />
            <span className="text-slate-700">Amber: Tasks & Assignments</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-pink-100 border border-pink-300 shrink-0" />
            <span className="text-slate-700">Pink: Communication / WhatsApp</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-teal-100 border border-teal-300 shrink-0" />
            <span className="text-slate-700">Teal: Locations & Projects</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300 shrink-0" />
            <span className="text-slate-700">Orange: Shopping Items</span>
          </div>
        </div>
      )}
    </div>
  );
}
