/**
 * Multi-Task Utterance Segmentation
 * 
 * Accurately detects and segments multi-task speech utterances into independent task drafts.
 * Example:
 * "Reena should bring milk every morning. Rahul should check the generator every Friday. Priya should submit the report before month end."
 * -> 3 separate discrete task draft segments.
 */

/**
 * Checks whether a sentence is a subordinate detail clause for a preceding task
 * (e.g. start/finish dates, review instruction with pronoun 'it', repetition clause).
 * @param {string} segment 
 * @returns {boolean}
 */
function isSubordinateClause(segment) {
  const s = segment.toLowerCase().trim();

  // 1. Starts with start/finish/due/deadline/repeat/etc.
  if (/^(?:start|starting|finish|finishing|due|by|deadline|repeat|repeating|also\s+repeat|make\s+it\s+repeat|it\s+should)\b/i.test(s)) {
    return true;
  }

  // 2. Only specifies reviewer with pronoun referring to the task e.g. "Priya should review it", "Rahul to review this"
  // But NOT if there is a workflow coordinator like "then" or a due date like "by Friday" or "Friday"
  if (/(?:should\s+review\s+(?:it|this)|to\s+review\s+(?:it|this)|reviewed\s+by|review\s+(?:it|this))\b/i.test(s)) {
    if (/\b(?:then|friday|monday|tuesday|wednesday|thursday|saturday|sunday|next|tomorrow|by)\b/i.test(s)) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Checks whether a text segment contains an independent task core (distinct action and object)
 * @param {string} segment 
 * @returns {boolean}
 */
function hasIndependentTaskCore(segment) {
  if (!segment || segment.trim().length < 5) return false;
  const s = segment.toLowerCase().trim();

  if (isSubordinateClause(s)) return false;

  // Must have a meaningful task action or object
  const hasAction =
    /(?:bring|clean|cleans|inspect|inspects|check|checks|verify|verifies|audit|audits|submit|submits|prepare|prepares|service|services|update|updates|order|orders|calibrate|calibrates|setup|unload|scout|receive|restock|reconcile|reconciles|release|log|logs|approve|approves|inform|informs|irrigate|irrigates|arrange|arranges|delivery|deliver|delivers|report|reports|review|reviews|count|counts|laana|lana|safai|karega|karegi|kaam\s+do|doodh|milk|generator|report|cash|cylinder|unit|units|pump)\b/i.test(s);

  return hasAction;
}

/**
 * Splits a compound or multi-sentence utterance into individual task segments
 * @param {string} transcript 
 * @returns {{ isMultiTask: boolean, segments: string[] }}
 */
export function segmentMultiTaskUtterance(transcript) {
  if (!transcript || typeof transcript !== 'string') {
    return { isMultiTask: false, segments: [] };
  }

  const raw = transcript.trim();
  if (!raw) {
    return { isMultiTask: false, segments: [] };
  }

  // 1. Split on sentence boundaries: period, semicolon, or newline
  const rawSplits = raw
    .split(/(?<=[.!;\n])\s+(?=[A-Z\u0900-\u097F0-9])|;\s+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // If any sentence is a subordinate detail clause (e.g. "Start tomorrow...", "Priya should review it", "Repeat this every week"),
  // then the whole utterance is a single multi-sentence task specification!
  const hasSubordinateClauses = rawSplits.some(isSubordinateClause);
  if (hasSubordinateClauses) {
    return {
      isMultiTask: false,
      segments: [raw]
    };
  }

  // Otherwise, check if there are 2 or more independent tasks
  if (rawSplits.length > 1) {
    const taskSegments = rawSplits.filter(hasIndependentTaskCore);
    if (taskSegments.length > 1 && taskSegments.length === rawSplits.length) {
      return {
        isMultiTask: true,
        segments: taskSegments
      };
    }
  }

  // 2. Multi-clause coordination splitting:
  // e.g. "Priya will prepare... Rahul will review... then the manager will approve"
  // "Neha checks vegetables, Amit counts dairy stock, and Rohan cleans the dining area"
  // "Rahul should inspect the server and Priya should update the incident report"
  // "Ask Mohan to clean the kitchen and check the gas cylinder"
  const multiClauseRegex = /(?:,\s*then\s+|,\s*and\s+|\s+and\s+then\s+|;\s*|,\s*(?=[A-Z][a-z]+\s+(?:will|should|checks|counts|cleans|prepares|reviews|inspects))|\s+and\s+(?=[A-Za-z]+\s+(?:should|will|must|checks|counts|cleans|prepares|reviews|inspects|update))|\s+and\s+(?=(?:ask|tell|have|get)\s+[A-Za-z]+)|\s+and\s+(?=(?:check|inspect|log|logs|clean|prepare|verify|submit|deliver)\s+(?:the\s+)?[a-z0-9]+))/gi;

  const conjSplits = raw.split(multiClauseRegex).map((s) => s.trim()).filter((s) => s.length > 0);

  if (conjSplits.length > 1 && !conjSplits.some(isSubordinateClause)) {
    const taskSegments = conjSplits.filter(hasIndependentTaskCore);
    if (taskSegments.length > 1) {
      return {
        isMultiTask: true,
        segments: taskSegments
      };
    }
  }

  return {
    isMultiTask: false,
    segments: [raw]
  };
}
