/**
 * Source Span Extraction & Boundary Mapping
 * Maps extracted entities and unresolved phrases to exact [startIndex, endIndex] character offsets
 * in the raw transcript for rich visual highlighting and feedback.
 */

export const HIGHLIGHT_CATEGORIES = {
  TITLE_ACTION: {
    key: 'title_action',
    label: 'Action / Title',
    bgClass: 'bg-amber-100 text-amber-900 border-amber-300', // Amber: Tasks and assignments
    badgeClass: 'bg-amber-600 text-white'
  },
  ASSIGNEE: {
    key: 'assignee',
    label: 'Doer / Assignee',
    bgClass: 'bg-purple-100 text-purple-900 border-purple-300', // Purple: People and contacts
    badgeClass: 'bg-purple-600 text-white'
  },
  REVIEWER: {
    key: 'reviewer',
    label: 'Reviewer',
    bgClass: 'bg-purple-100 text-purple-900 border-purple-300', // Purple: People and contacts
    badgeClass: 'bg-purple-600 text-white'
  },
  PROJECT: {
    key: 'project',
    label: 'Project',
    bgClass: 'bg-teal-100 text-teal-900 border-teal-300', // Teal: Locations and projects
    badgeClass: 'bg-teal-600 text-white'
  },
  LOCATION: {
    key: 'location',
    label: 'Location',
    bgClass: 'bg-teal-100 text-teal-900 border-teal-300', // Teal: Locations and projects
    badgeClass: 'bg-teal-600 text-white'
  },
  START_DATE: {
    key: 'start_date',
    label: 'Start Date/Time',
    bgClass: 'bg-blue-100 text-blue-900 border-blue-300', // Blue: Dates and calendar events
    badgeClass: 'bg-blue-600 text-white'
  },
  DUE_DATE: {
    key: 'due_date',
    label: 'Due Date/Time',
    bgClass: 'bg-blue-100 text-blue-900 border-blue-300', // Blue: Dates and calendar events
    badgeClass: 'bg-blue-600 text-white'
  },
  RECURRENCE: {
    key: 'recurrence',
    label: 'Recurrence',
    bgClass: 'bg-emerald-100 text-emerald-900 border-emerald-300', // Green: Times & intervals
    badgeClass: 'bg-emerald-600 text-white'
  },
  PRIORITY: {
    key: 'priority',
    label: 'Priority',
    bgClass: 'bg-amber-100 text-amber-900 border-amber-300', // Amber: Tasks and assignments
    badgeClass: 'bg-amber-600 text-white'
  },
  COMMUNICATION: {
    key: 'communication',
    label: 'Communication / WhatsApp',
    bgClass: 'bg-pink-100 text-pink-900 border-pink-300', // Pink: Communication & WhatsApp
    badgeClass: 'bg-pink-600 text-white'
  },
  UNRESOLVED: {
    key: 'unresolved',
    label: 'Unresolved / Clarify',
    bgClass: 'bg-amber-50 text-amber-900 border-amber-400 border-dashed',
    badgeClass: 'bg-amber-600 text-white'
  },
  INVALID: {
    key: 'invalid',
    label: 'Invalid / Conflict',
    bgClass: 'bg-rose-50 text-rose-900 border-rose-400 border-dashed',
    badgeClass: 'bg-rose-600 text-white'
  }
};

/**
 * Finds exact character index range of a search phrase within raw text
 * @param {string} fullText 
 * @param {string} searchPhrase 
 * @param {Array<[number, number]>} occupiedRanges Already occupied [start, end] ranges
 * @returns {{ startIndex: number, endIndex: number } | null}
 */
export function findSpanRange(fullText, searchPhrase, occupiedRanges = []) {
  if (!fullText || !searchPhrase || typeof fullText !== 'string' || typeof searchPhrase !== 'string') {
    return null;
  }

  const cleanPhrase = searchPhrase.trim();
  if (cleanPhrase.length === 0) return null;

  const lowerFull = fullText.toLowerCase();
  const lowerSearch = cleanPhrase.toLowerCase();

  let searchFrom = 0;
  while (searchFrom < lowerFull.length) {
    const idx = lowerFull.indexOf(lowerSearch, searchFrom);
    if (idx === -1) break;

    const endIdx = idx + cleanPhrase.length;

    // Check if overlaps with any already claimed range
    const overlaps = occupiedRanges.some(([s, e]) => Math.max(s, idx) < Math.min(e, endIdx));
    if (!overlaps) {
      return { startIndex: idx, endIndex: endIdx };
    }

    searchFrom = idx + 1;
  }

  return null;
}

/**
 * Computes non-overlapping source spans from extracted fields and raw transcript
 * @param {string} transcript 
 * @param {Object} draft Extracted task draft
 * @returns {Array<Object>} Sorted list of span objects
 */
export function computeSourceSpans(transcript, draft) {
  if (!transcript || !draft) return [];

  const raw = transcript;
  const rawSpans = [];
  const occupied = [];

  const addSpan = (field, category, searchPhrase, status = 'matched', confidence = 0.9, customLabel = null) => {
    if (!searchPhrase || typeof searchPhrase !== 'string') return;
    const range = findSpanRange(raw, searchPhrase, occupied);
    if (range) {
      occupied.push([range.startIndex, range.endIndex]);
      rawSpans.push({
        field,
        category: category.key,
        label: customLabel || category.label,
        sourceText: raw.substring(range.startIndex, range.endIndex),
        startIndex: range.startIndex,
        endIndex: range.endIndex,
        status,
        confidence,
        bgClass: category.bgClass,
        badgeClass: category.badgeClass
      });
    }
  };

  const meta = draft.meta || {};
  const fields = draft.fields || {};

  // 1. Assignee Span (handles Latin and Devanagari alias in raw)
  if (meta.assignee?.rawText) {
    const isAmbiguous = meta.assignee.status === 'ambiguous';
    const isUnknown = meta.assignee.status === 'unknown';
    const cat = isAmbiguous || isUnknown ? HIGHLIGHT_CATEGORIES.UNRESOLVED : HIGHLIGHT_CATEGORIES.ASSIGNEE;

    let textToFind = meta.assignee.rawText;
    if (!raw.toLowerCase().includes(textToFind.toLowerCase()) && meta.assignee.value?.aliases) {
      const aliasInRaw = meta.assignee.value.aliases.find((a) => raw.toLowerCase().includes(a.toLowerCase()));
      if (aliasInRaw) textToFind = aliasInRaw;
    }

    addSpan(
      'assignee',
      cat,
      textToFind,
      isAmbiguous ? 'ambiguous' : isUnknown ? 'unresolved' : 'matched',
      meta.assignee.confidence || 0.9,
      isAmbiguous ? 'Doer (Ambiguous)' : isUnknown ? 'Doer (Unknown)' : 'Doer / Assignee'
    );
  }

  // 2. Reviewer Span
  if (meta.reviewer?.rawText) {
    const isAmbiguous = meta.reviewer.status === 'ambiguous';
    const cat = isAmbiguous ? HIGHLIGHT_CATEGORIES.UNRESOLVED : HIGHLIGHT_CATEGORIES.REVIEWER;
    addSpan(
      'reviewer',
      cat,
      meta.reviewer.rawText,
      isAmbiguous ? 'ambiguous' : 'matched',
      meta.reviewer.confidence || 0.9,
      isAmbiguous ? 'Reviewer (Ambiguous)' : 'Reviewer'
    );
  }

  // 3. Project Span
  if (meta.project?.rawText) {
    const isAmbiguous = meta.project.status === 'ambiguous';
    const cat = isAmbiguous ? HIGHLIGHT_CATEGORIES.UNRESOLVED : HIGHLIGHT_CATEGORIES.PROJECT;
    addSpan(
      'project',
      cat,
      meta.project.rawText,
      isAmbiguous ? 'ambiguous' : 'matched',
      meta.project.confidence || 0.9,
      isAmbiguous ? 'Project (Ambiguous)' : 'Project'
    );
  }

  // 4. Location Span
  if (meta.location?.rawText) {
    addSpan(
      'location',
      HIGHLIGHT_CATEGORIES.LOCATION,
      meta.location.rawText,
      'matched',
      meta.location.confidence || 0.9,
      'Location'
    );
  }

  // 5. Unresolved Date Phrases (e.g. "after the month with only days 28")
  if (meta.unresolvedDatePhrase) {
    addSpan(
      'unresolvedDate',
      HIGHLIGHT_CATEGORIES.UNRESOLVED,
      meta.unresolvedDatePhrase,
      'unresolved',
      0.3,
      'Unresolved Date / Deadline'
    );
  }

  // 6. Dates (Start and Due)
  if (meta.startDate?.rawText) {
    addSpan(
      'startDate',
      HIGHLIGHT_CATEGORIES.START_DATE,
      meta.startDate.rawText,
      meta.startDate.status || 'matched',
      0.9,
      'Start Date'
    );
  }

  if (meta.dueDate?.rawText) {
    const isInvalid = meta.dueDate.status === 'invalid';
    const cat = isInvalid ? HIGHLIGHT_CATEGORIES.INVALID : HIGHLIGHT_CATEGORIES.DUE_DATE;
    addSpan(
      'dueDate',
      cat,
      meta.dueDate.rawText,
      meta.dueDate.status || 'matched',
      0.9,
      isInvalid ? 'Due Date (Conflict)' : 'Due Date'
    );
  }

  // 7. Recurrence Span
  if (meta.recurrence?.rawText) {
    const isUnresolved = meta.recurrence.status === 'missing_frequency' || meta.recurrence.status === 'unresolved';
    const cat = HIGHLIGHT_CATEGORIES.RECURRENCE;

    let recPhrase = meta.recurrence.rawText;
    if (!raw.toLowerCase().includes(recPhrase.toLowerCase())) {
      // Check for Hindi equivalent in raw
      const devRec = ['रोज़', 'रोज', 'हर दिन', 'प्रतिदिन'].find((d) => raw.includes(d));
      if (devRec) recPhrase = devRec;
    }

    addSpan(
      'recurrence',
      cat,
      recPhrase,
      isUnresolved ? 'unresolved' : 'matched',
      meta.recurrence.confidence || 0.9,
      isUnresolved ? 'Recurrence (Unclear Frequency)' : 'Recurrence'
    );
  }

  // 8. Priority Span
  if (meta.priorityRawText) {
    addSpan(
      'priority',
      HIGHLIGHT_CATEGORIES.PRIORITY,
      meta.priorityRawText,
      'matched',
      0.9,
      'Priority'
    );
  }

  // 9. Task Action / Title Span
  let actionPhrase = meta.action?.matchedKeyword || meta.actionKeyword || fields.title;
  if (actionPhrase && !raw.toLowerCase().includes(actionPhrase.toLowerCase()) && meta.action?.keywords) {
    const rawActionKw = meta.action.keywords.find((k) => raw.toLowerCase().includes(k.toLowerCase()));
    if (rawActionKw) actionPhrase = rawActionKw;
  }

  if (actionPhrase) {
    addSpan(
      'title',
      HIGHLIGHT_CATEGORIES.TITLE_ACTION,
      actionPhrase,
      'matched',
      0.95,
      'Action / Title'
    );
  }

  // Sort by startIndex ascending
  return rawSpans.sort((a, b) => a.startIndex - b.startIndex);
}
