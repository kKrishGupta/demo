/**
 * ActionFlow AI — Action Type System
 * Defines all micro-action types, execution lifecycle states,
 * confidence thresholds, and structured action schema.
 */

// ─── Action Types ───────────────────────────────────────────────────────────
export const ACTION_TYPES = {
  CREATE_TASK:            'CREATE_TASK',
  UPDATE_TASK:            'UPDATE_TASK',
  DELETE_TASK:            'DELETE_TASK',
  COMPLETE_TASK:          'COMPLETE_TASK',
  ASSIGN_TASK:            'ASSIGN_TASK',
  CREATE_REMINDER:        'CREATE_REMINDER',
  CREATE_CALENDAR_EVENT:  'CREATE_CALENDAR_EVENT',
  UPDATE_CALENDAR_EVENT:  'UPDATE_CALENDAR_EVENT',
  DELETE_CALENDAR_EVENT:  'DELETE_CALENDAR_EVENT',
  SEND_WHATSAPP:          'SEND_WHATSAPP',
  SEND_EMAIL:             'SEND_EMAIL',
  REQUEST_INFORMATION:    'REQUEST_INFORMATION',
  SHARE_DOCUMENT:         'SHARE_DOCUMENT',
  CREATE_FOLLOW_UP:       'CREATE_FOLLOW_UP',
  CREATE_RECURRING_TASK:  'CREATE_RECURRING_TASK',
  RETRIEVE_TASKS:         'RETRIEVE_TASKS',
  GENERATE_SUMMARY:       'GENERATE_SUMMARY',
  UNKNOWN_ACTION:         'UNKNOWN_ACTION'
};

// ─── Action Source Classification ───────────────────────────────────────────
export const ACTION_SOURCES = {
  EXPLICIT:   'EXPLICIT_ACTION',    // Direct instruction from user
  INFERRED:   'INFERRED_ACTION',    // Reasonably inferred from context
  SUGGESTED:  'SUGGESTED_ACTION'    // AI recommendation — requires user acceptance
};

// ─── Execution Lifecycle States ──────────────────────────────────────────────
export const EXECUTION_STATES = {
  DRAFT:                  'DRAFT',
  VALIDATING:             'VALIDATING',
  NEEDS_CLARIFICATION:    'NEEDS_CLARIFICATION',
  READY_FOR_APPROVAL:     'READY_FOR_APPROVAL',
  APPROVED:               'APPROVED',
  QUEUED:                 'QUEUED',
  RUNNING:                'RUNNING',
  COMPLETED:              'COMPLETED',
  FAILED:                 'FAILED',
  BLOCKED:                'BLOCKED',
  CANCELLED:              'CANCELLED',
  UNKNOWN_EXECUTION_STATE: 'UNKNOWN_EXECUTION_STATE'
};

// ─── Dependency Types ────────────────────────────────────────────────────────
export const DEPENDENCY_TYPES = {
  MUST_HAPPEN_BEFORE:         'MUST_HAPPEN_BEFORE',
  MUST_HAPPEN_AFTER:          'MUST_HAPPEN_AFTER',
  DEPENDS_ON_COMPLETION_OF:   'DEPENDS_ON_COMPLETION_OF',
  CAN_HAPPEN_IN_PARALLEL:     'CAN_HAPPEN_IN_PARALLEL',
  REQUIRES_APPROVAL_BEFORE:   'REQUIRES_APPROVAL_BEFORE',
  BLOCKED_BY:                 'BLOCKED_BY'
};

// ─── Confidence Thresholds ───────────────────────────────────────────────────
export const CONFIDENCE_THRESHOLDS = {
  HIGH:       0.85,   // Auto-fill, no highlight
  MEDIUM:     0.65,   // Soft highlight, user can override
  LOW:        0.45,   // Strong highlight, clarification recommended
  VERY_LOW:   0.25    // Block execution, mandatory clarification
};

// ─── Actions requiring external execution approval ───────────────────────────
export const REQUIRES_APPROVAL = new Set([
  ACTION_TYPES.SEND_WHATSAPP,
  ACTION_TYPES.SEND_EMAIL,
  ACTION_TYPES.DELETE_TASK,
  ACTION_TYPES.DELETE_CALENDAR_EVENT,
  ACTION_TYPES.UPDATE_CALENDAR_EVENT
]);

// ─── Action Schema Factory ───────────────────────────────────────────────────
/**
 * Creates a well-formed micro-action object with all required fields.
 * @param {Partial<MicroAction>} overrides
 * @returns {MicroAction}
 */
export function createMicroAction(overrides = {}) {
  const id = overrides.id || `action_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    type: ACTION_TYPES.CREATE_TASK,
    source: ACTION_SOURCES.EXPLICIT,
    title: '',
    description: '',
    priority: '',
    assignee: null,         // { id, name, email, department }
    reviewer: null,
    recipient: null,        // For WhatsApp/Email actions
    project: null,
    department: '',
    location: '',
    startDate: null,
    deadline: null,
    isRecurring: false,
    recurrenceFrequency: '',
    recurrenceInterval: 1,
    recurrenceDays: [],
    recurrenceEndDate: null,
    dependencies: [],       // [{ actionId, type: DEPENDENCY_TYPES }]
    sourceText: '',         // Original transcript segment
    extractionPath: 'RULE', // 'RULE' | 'GEMINI' | 'HYBRID'
    confidence: {
      intent: 0,
      title: 0,
      assignee: 0,
      deadline: 0,
      priority: 0,
      recurrence: 0,
      overall: 0
    },
    provenance: {           // Trace every extracted value to its source
      intent:       { method: '', rawText: '', confidence: 0 },
      title:        { method: '', rawText: '', confidence: 0 },
      assignee:     { method: '', rawText: '', confidence: 0 },
      deadline:     { method: '', rawText: '', confidence: 0 },
      priority:     { method: '', rawText: '', confidence: 0 },
      recurrence:   { method: '', rawText: '', confidence: 0 }
    },
    validationStatus: 'PENDING', // 'PENDING' | 'VALID' | 'INVALID' | 'AMBIGUOUS'
    executionState: EXECUTION_STATES.DRAFT,
    requiresApproval: false,
    ambiguities: [],
    clarificationsNeeded: [],
    suggestions: [],
    warnings: [],
    ...overrides
  };
}

/**
 * Maps extracted task draft fields to a MicroAction
 * @param {Object} draft - Result of extractTaskDraft
 * @param {string} [actionType]
 * @returns {MicroAction}
 */
export function draftToMicroAction(draft, actionType = ACTION_TYPES.CREATE_TASK) {
  const { fields, meta } = draft;

  const confidenceMap = {
    intent:     meta.fieldConfidences?.intent     ?? (meta.titleStatus === 'valid' ? 0.9 : 0.5),
    title:      meta.fieldConfidences?.title       ?? (meta.titleStatus === 'valid' ? 0.9 : 0.0),
    assignee:   meta.fieldConfidences?.assignee    ?? meta.assignee?.confidence ?? 0,
    deadline:   meta.fieldConfidences?.dueDate     ?? (fields.dueDate ? 0.9 : 0),
    priority:   meta.fieldConfidences?.priority    ?? (fields.priority ? 0.85 : 0),
    recurrence: meta.fieldConfidences?.recurrence  ?? meta.recurrence?.confidence ?? 0
  };

  const overallValues = Object.values(confidenceMap).filter(v => v > 0);
  confidenceMap.overall = overallValues.length
    ? Number((overallValues.reduce((a, b) => a + b, 0) / overallValues.length).toFixed(2))
    : 0.5;

  // Determine if action requires external approval
  const requiresApproval = REQUIRES_APPROVAL.has(actionType);

  // Determine execution state
  let executionState = EXECUTION_STATES.DRAFT;
  if (meta.clarifications?.length > 0) {
    executionState = EXECUTION_STATES.NEEDS_CLARIFICATION;
  } else if (meta.safetyClassification?.isSafetyCritical) {
    executionState = EXECUTION_STATES.NEEDS_CLARIFICATION;
  } else if (requiresApproval) {
    executionState = EXECUTION_STATES.READY_FOR_APPROVAL;
  }

  return createMicroAction({
    type: actionType,
    source: ACTION_SOURCES.EXPLICIT,
    title: fields.title || '',
    description: fields.description || '',
    priority: fields.priority || '',
    assignee: meta.assignee?.value ? {
      id: meta.assignee.value.id,
      name: meta.assignee.value.name,
      email: meta.assignee.value.email,
      department: meta.assignee.value.department
    } : null,
    reviewer: meta.reviewer?.value ? {
      id: meta.reviewer.value.id,
      name: meta.reviewer.value.name,
      email: meta.reviewer.value.email
    } : null,
    project: meta.project?.value ? {
      id: meta.project.value.id,
      name: meta.project.value.name,
      code: meta.project.value.code
    } : null,
    department: fields.department || '',
    location: fields.location || '',
    startDate: fields.startDate || null,
    deadline: fields.dueDate || null,
    isRecurring: fields.isRecurring || false,
    recurrenceFrequency: fields.recurrenceFrequency || '',
    recurrenceInterval: fields.recurrenceInterval || 1,
    recurrenceDays: fields.recurrenceDays || [],
    recurrenceEndDate: fields.recurrenceEndDate || null,
    dependencies: (fields.dependencies || []).map(dep => ({
      actionId: null,
      description: dep,
      type: DEPENDENCY_TYPES.DEPENDS_ON_COMPLETION_OF,
      source: 'EXTRACTED'
    })),
    sourceText: draft.rawTranscript || '',
    extractionPath: 'RULE',
    confidence: confidenceMap,
    provenance: {
      intent:     { method: 'intent_dict', rawText: draft.normalizedTranscript || '', confidence: confidenceMap.intent },
      title:      { method: meta.action ? 'action_dict' : 'title_extraction', rawText: meta.action?.matchedKeyword || fields.title, confidence: confidenceMap.title },
      assignee:   { method: meta.assignee?.status || 'none', rawText: meta.assignee?.rawText || '', confidence: confidenceMap.assignee },
      deadline:   { method: meta.dueDate?.status || 'none', rawText: meta.dueDate?.rawText || '', confidence: confidenceMap.deadline },
      priority:   { method: 'priority_dict', rawText: meta.priorityRawText || '', confidence: confidenceMap.priority },
      recurrence: { method: meta.recurrence?.status || 'none', rawText: meta.recurrence?.rawText || '', confidence: confidenceMap.recurrence }
    },
    validationStatus: meta.clarifications?.length > 0 ? 'AMBIGUOUS' : fields.title ? 'VALID' : 'INVALID',
    executionState,
    requiresApproval,
    ambiguities: meta.ambiguities || [],
    clarificationsNeeded: meta.clarifications || [],
    suggestions: [],
    warnings: meta.warnings || []
  });
}

/**
 * Detects the most appropriate action type from the draft intent
 * @param {Object} draft
 * @returns {string}
 */
export function detectActionType(draft) {
  const intent = draft.intent || '';
  const transcript = (draft.rawTranscript || '').toLowerCase();

  // WhatsApp detection
  if (/whatsapp|whats\s*app|wa\s+kar|message\s+kar/i.test(transcript)) {
    return ACTION_TYPES.SEND_WHATSAPP;
  }
  // Email detection
  if (/\bemail\b|mail\s+kar|bhej\s+do.*mail/i.test(transcript)) {
    return ACTION_TYPES.SEND_EMAIL;
  }
  // Calendar events
  if (/\bmeeting\b|\bcalendar\b|\bschedule\b.*\bmeeting\b|\bevent\b/i.test(transcript)) {
    if (/\bcancel\b|\bdelete\b|\bremove\b/i.test(transcript)) {
      return ACTION_TYPES.DELETE_CALENDAR_EVENT;
    }
    if (/\bshift\b|\breschedule\b|\bchange\b.*\bmeeting\b/i.test(transcript)) {
      return ACTION_TYPES.UPDATE_CALENDAR_EVENT;
    }
    return ACTION_TYPES.CREATE_CALENDAR_EVENT;
  }
  // Reminders
  if (/\bremind\b|\breminder\b|\byaad\s+dila\b/i.test(transcript)) {
    return ACTION_TYPES.CREATE_REMINDER;
  }
  // Task management intents
  if (/\bcomplete\s+mark\b|\bmark.*complete\b|\bmark.*done\b/i.test(transcript)) {
    return ACTION_TYPES.COMPLETE_TASK;
  }
  if (/\bdelete\b|\bremove\b.*task/i.test(transcript)) {
    return ACTION_TYPES.DELETE_TASK;
  }
  if (/\bupdate\b|\bchange\b|\bmodify\b|\bedit\b/i.test(transcript) && /\btask\b/i.test(transcript)) {
    return ACTION_TYPES.UPDATE_TASK;
  }
  if (/\bshow\b.*(?:task|pending|list)|\bdikhao\b|\bretrieve\b/i.test(transcript)) {
    return ACTION_TYPES.RETRIEVE_TASKS;
  }
  if (/\bsummary\b|\bsummarise\b|\bsummarize\b/i.test(transcript)) {
    return ACTION_TYPES.GENERATE_SUMMARY;
  }
  if (/\bfollow.?up\b|\bfollowup\b/i.test(transcript)) {
    return ACTION_TYPES.CREATE_FOLLOW_UP;
  }
  // Request information
  if (/\bask.*send\b|\brequest.*report\b|\bmangwani\b/i.test(transcript)) {
    return ACTION_TYPES.REQUEST_INFORMATION;
  }
  // Recurring task
  if (draft.fields?.isRecurring && draft.meta?.recurrence?.status === 'valid') {
    return ACTION_TYPES.CREATE_RECURRING_TASK;
  }

  return ACTION_TYPES.CREATE_TASK;
}
