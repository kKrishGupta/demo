import { useState, useEffect, useRef } from 'react';

/**
 * Shared Tailwind CSS styling classes for field control states.
 * Standardizes visual appearance across all input types (inputs, textareas, selects, pickers).
 */
export const FIELD_CONTROL_STYLES = {
  // Active transient highlight: subtle light-blue background, blue border, and soft blue ring with smooth return
  highlighted: 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-200 shadow-xs transition-colors duration-300',
  // Standard neutral state
  default: 'border-slate-300 bg-white focus:ring-blue-100 focus:border-blue-500 hover:border-slate-400 transition-colors duration-300',
  // Error state (takes precedence over highlight)
  error: 'border-rose-400 focus:ring-rose-200 bg-white transition-colors duration-300',
  // Ambiguous state (takes precedence over highlight)
  ambiguous: 'border-amber-400 focus:ring-amber-200 bg-amber-50/20 transition-colors duration-300'
};

/**
 * Container styling for composite controls (e.g. Priority button group, Recurrence toggle card).
 */
export const FIELD_CONTAINER_STYLES = {
  highlighted: 'bg-blue-50/70 border border-blue-400 ring-2 ring-blue-200 shadow-xs transition-all duration-300',
  defaultPriority: 'border border-transparent transition-all duration-300',
  defaultRecurrence: 'bg-slate-50 border-slate-200 transition-all duration-300'
};

/**
 * Returns the computed Tailwind classes for an input, textarea, select, or picker button.
 * Error and ambiguous states strictly take precedence over success highlight.
 *
 * @param {Object} params
 * @param {boolean} [params.isHighlighted=false] Whether the field is currently in transient highlight
 * @param {boolean} [params.error=false] Whether the field has a validation error
 * @param {boolean} [params.isAmbiguous=false] Whether the field has ambiguous candidate matches
 * @returns {string} Tailwind CSS class string
 */
export function getFieldControlClass({ isHighlighted = false, error = false, isAmbiguous = false } = {}) {
  if (error) {
    return FIELD_CONTROL_STYLES.error;
  }
  if (isAmbiguous) {
    return FIELD_CONTROL_STYLES.ambiguous;
  }
  if (isHighlighted) {
    return FIELD_CONTROL_STYLES.highlighted;
  }
  return FIELD_CONTROL_STYLES.default;
}

/**
 * Pure evaluation function that determines which fields are genuinely extracted or changed by voice.
 * 
 * @param {Object} latestExtraction Latest extraction result from voice engine
 * @param {Object} prevExtracted Map of previously extracted values
 * @param {Object} manuallyOverriddenFields Fields manually edited by user
 * @returns {{ newlyChanged: Object, nextExtracted: Object }}
 */
export function detectNewlyExtractedFields(latestExtraction, prevExtracted = {}, manuallyOverriddenFields = {}) {
  if (!latestExtraction || !latestExtraction.fields) {
    return { newlyChanged: {}, nextExtracted: {} };
  }

  const fields = latestExtraction.fields;
  const meta = latestExtraction.meta || {};
  const forceHighlightAll = Boolean(latestExtraction._forceHighlightAll);

  const fieldChecks = [
    {
      key: 'title',
      isExtracted: Boolean(fields.title?.trim()) && meta.titleStatus === 'valid',
      value: fields.title?.trim() || ''
    },
    {
      key: 'description',
      isExtracted: Boolean(fields.description?.trim()) && meta.descriptionStatus === 'valid',
      value: fields.description?.trim() || ''
    },
    {
      key: 'assigneeId',
      isExtracted: Boolean(fields.assigneeId) && meta.assignee?.status !== 'ambiguous' && meta.assignee?.status !== 'invalid',
      value: fields.assigneeId || ''
    },
    {
      key: 'reviewerId',
      isExtracted: Boolean(fields.reviewerId) && meta.reviewer?.status !== 'ambiguous' && meta.reviewer?.status !== 'invalid',
      value: fields.reviewerId || ''
    },
    {
      key: 'projectId',
      isExtracted: Boolean(fields.projectId) && meta.project?.status !== 'ambiguous' && meta.project?.status !== 'invalid',
      value: fields.projectId || ''
    },
    {
      key: 'department',
      isExtracted: Boolean(fields.department) && (meta.departmentSpoken === true || (Boolean(latestExtraction.rawTranscript) && latestExtraction.rawTranscript.toLowerCase().includes(fields.department.toLowerCase()))),
      value: fields.department || ''
    },
    {
      key: 'location',
      isExtracted: Boolean(fields.location),
      value: fields.location || ''
    },
    {
      key: 'startDate',
      isExtracted: Boolean(fields.startDate) && Boolean(meta.startDate?.value) && meta.startDate?.status !== 'invalid',
      value: fields.startDate || ''
    },
    {
      key: 'dueDate',
      isExtracted: Boolean(fields.dueDate) && Boolean(meta.dueDate?.value) && meta.dueDate?.status !== 'invalid',
      value: fields.dueDate || ''
    },
    {
      key: 'priority',
      isExtracted: Boolean(fields.priority),
      value: fields.priority || ''
    },
    {
      key: 'recurrence',
      isExtracted: Boolean(fields.isRecurring) && meta.recurrence?.isRecurring === true,
      value: `${fields.isRecurring}-${fields.recurrenceFrequency || ''}-${fields.recurrenceInterval || 1}`
    }
  ];

  const newlyChanged = {};
  const nextExtracted = { ...prevExtracted };

  fieldChecks.forEach(({ key, isExtracted, value }) => {
    // 1. If user manually edited this field, ignore voice updates for highlighting
    if (manuallyOverriddenFields[key]) {
      return;
    }
    if (key === 'recurrence' && (manuallyOverriddenFields.isRecurring || manuallyOverriddenFields.recurrenceFrequency)) {
      return;
    }

    // 2. Only consider if the field was genuinely extracted from speech
    if (!isExtracted || !value) {
      nextExtracted[key] = '';
      return;
    }

    // 3. Compare with previous extracted value or force highlight
    const prevVal = prevExtracted[key];
    if (forceHighlightAll || value !== prevVal) {
      newlyChanged[key] = true;
    }
    nextExtracted[key] = value;
  });

  return { newlyChanged, nextExtracted };
}

/**
 * Custom React Hook: useFieldHighlights
 * Tracks newly extracted or updated fields from speech detection and provides
 * transient (1.8s) highlight states for the corresponding visible form controls.
 *
 * @param {Object} latestExtraction Latest extraction result from voice engine
 * @param {Object} manuallyOverriddenFields Fields manually edited by user
 * @returns {Object} Map of field keys currently highlighted: { [field]: boolean }
 */
export function useFieldHighlights(latestExtraction, manuallyOverriddenFields = {}) {
  const [highlightedFields, setHighlightedFields] = useState({});
  const prevExtractedRef = useRef({});
  const timersRef = useRef({});

  useEffect(() => {
    // If extraction was reset or is empty, clear highlights
    if (!latestExtraction || !latestExtraction.fields) {
      Object.values(timersRef.current).forEach((timer) => clearTimeout(timer));
      timersRef.current = {};
      setHighlightedFields({});
      prevExtractedRef.current = {};
      return;
    }

    const { newlyChanged, nextExtracted } = detectNewlyExtractedFields(
      latestExtraction,
      prevExtractedRef.current,
      manuallyOverriddenFields
    );

    prevExtractedRef.current = nextExtracted;

    const changedKeys = Object.keys(newlyChanged);
    if (changedKeys.length > 0) {
      setHighlightedFields((prev) => {
        const next = { ...prev };
        changedKeys.forEach((key) => {
          next[key] = true;

          // Clear any existing timer for this field
          if (timersRef.current[key]) {
            clearTimeout(timersRef.current[key]);
          }

          // Automatically un-highlight after 1800ms (~1.8 seconds)
          timersRef.current[key] = setTimeout(() => {
            setHighlightedFields((curr) => {
              if (!curr[key]) return curr;
              const copy = { ...curr };
              delete copy[key];
              return copy;
            });
            delete timersRef.current[key];
          }, 1800);
        });
        return next;
      });
    }
  }, [latestExtraction, manuallyOverriddenFields]);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return highlightedFields;
}
