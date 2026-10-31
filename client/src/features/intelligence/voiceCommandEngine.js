/**
 * ActionFlow AI — Voice Command Intelligence Engine
 *
 * Orchestrates the full voice-to-action pipeline:
 *   Speech → Transcript → Intent → Destination → Actions → Approval
 *
 * This is the Phase 1 core engine — deterministic first, Gemini for complex cases.
 * Preserves existing extraction pipeline and adds smart routing on top.
 */

import { extractTaskDraft } from '../extraction/extractTaskDraft.js';
import { routeTranscript, routeActions, DESTINATIONS } from './destinationRouter.js';
import { detectActionType, ACTION_TYPES } from './actionTypes.js';
import { clientSemanticDecomposer } from './semanticDecomposer.js';

// ─── Processing Status Lifecycle ─────────────────────────────────────────────
export const VOICE_STAGES = {
  CAPTURED:           'CAPTURED',
  NORMALIZING:        'NORMALIZING',
  ANALYZING:          'ANALYZING',
  EXTRACTED:          'EXTRACTED',
  VALIDATING:         'VALIDATING',
  NEEDS_CLARIFICATION: 'NEEDS_CLARIFICATION',
  READY_FOR_APPROVAL: 'READY_FOR_APPROVAL',
  APPROVED:           'APPROVED',
  QUEUED:             'QUEUED',
  EXECUTING:          'EXECUTING',
  COMPLETED:          'COMPLETED',
  FAILED:             'FAILED',
  BLOCKED:            'BLOCKED',
  CANCELLED:          'CANCELLED',
  UNKNOWN_EXECUTION_STATE: 'UNKNOWN_EXECUTION_STATE'
};

export const STAGE_LABELS = {
  CAPTURED:            'Command captured',
  NORMALIZING:         'Normalizing transcript...',
  ANALYZING:           'Analyzing intent...',
  EXTRACTED:           'Extraction complete',
  VALIDATING:          'Validating action...',
  NEEDS_CLARIFICATION: 'Clarification needed',
  READY_FOR_APPROVAL:  'Ready — awaiting your approval',
  APPROVED:            'Approved ✓',
  QUEUED:              'Queued for execution',
  EXECUTING:           'Executing...',
  COMPLETED:           'Completed ✓',
  FAILED:              'Failed ✗',
  BLOCKED:             'Blocked — dependency unresolved',
  CANCELLED:           'Cancelled',
  UNKNOWN_EXECUTION_STATE: 'Unknown state — check manually'
};

// ─── Voice Command History Store ─────────────────────────────────────────────
const _commandHistory = [];
const MAX_HISTORY = 50;

export function addToHistory(command) {
  _commandHistory.unshift({ ...command, historyId: `hist_${Date.now()}` });
  if (_commandHistory.length > MAX_HISTORY) _commandHistory.pop();
}

export function getCommandHistory() {
  return [..._commandHistory];
}

export function clearHistory() {
  _commandHistory.length = 0;
}

// ─── Multi-Action Decomposition ───────────────────────────────────────────────
/**
 * Splits a compound voice command into sub-action sentences.
 * Example: "Kal 10 baje Rahul ke saath meeting fix karna, Aman se report mangwani hai aur presentation ready karni hai"
 * @param {string} transcript
 * @returns {string[]}
 */
export function splitMultiActionTranscript(transcript) {
  if (!transcript || typeof transcript !== 'string') return [];

  let working = transcript.trim();

  // Protect shopping noun lists (e.g. "bread aur milk") from being clause-split
  working = working.replace(
    /\b(bread|milk|eggs?|butter|dal|atta|sugar|doodh)\s+(?:aur|and|&)\s+(bread|milk|eggs?|butter|dal|atta|sugar|doodh)\b/gi,
    (m, g1, g2) => g1 + '__JOIN__' + g2
  );

  // Split on conjunctions and punctuation that delineate distinct action clauses
  const normalized = working
    .replace(/(?:,\s*(?:aur|and|then|uske\s+baad|fir|phir)?\s*|\s+(?:aur|and|then|uske\s+baad|fir|phir|after\s+that)\s+|[.;\n]+)/gi, ' | ');

  const clauses = normalized
    .split('|')
    .map(c => c.replace(/__JOIN__/g, ' aur ').trim().replace(/^[,;.\s]+|[,;.\s]+$/g, ''))
    .filter(c => c.length >= 4);

  return clauses.length > 0 ? clauses : [transcript.trim()];
}

/**
 * Splits complex multi-destination transcripts into individual routed actions.
 * Each action gets its own ID, destination, stage, and source text.
 *
 * @param {string} transcript
 * @param {Object} extractionResult — result from extractTaskDraft
 * @param {Array} directory
 * @param {Array} projects
 * @returns {Array<RoutedAction>}
 */
export function decomposeToActions(transcript, extractionResult, directory = [], projects = []) {
  const actions = [];
  const baseId = `cmd_${Date.now()}`;

  // Case 0: Semantic Action Decomposition Engine (Master Rebuild V3)
  // Handles compound multi-destination instructions (Calendar + WhatsApp + Shopping items)
  const semanticDecomposed = clientSemanticDecomposer.decompose(transcript, { directory, projects });
  if (semanticDecomposed && semanticDecomposed.length > 1) {
    return routeActions(semanticDecomposed);
  }

  // Case 1: Multi-task segmentation occurred in extractionResult
  if (extractionResult.isMultiTask && extractionResult.tasks?.length > 1) {
    extractionResult.tasks.forEach((taskDraft, idx) => {
      const actionType = detectActionType(taskDraft);
      const action = buildRoutedAction(taskDraft, actionType, `${baseId}_${idx}`, transcript, directory, projects);
      actions.push(action);
    });
    return routeActions(actions);
  }

  // Case 2: Multi-clause compound utterance
  const clauses = splitMultiActionTranscript(transcript);
  if (clauses.length > 1) {
    clauses.forEach((clause, idx) => {
      const clauseDraft = extractTaskDraft({
        transcript: clause,
        directory,
        projects
      });
      const actionType = detectActionType(clauseDraft);
      const action = buildRoutedAction(clauseDraft, actionType, `${baseId}_${idx}`, clause, directory, projects);
      if (action.title) {
        action.title = action.title.replace(/^[,;.\s]+|[,;.\s]+$/g, '');
      }
      actions.push(action);
    });
    return routeActions(actions);
  }

  // Case 3: Single action
  const actionType = detectActionType(extractionResult);
  const action = buildRoutedAction(extractionResult, actionType, `${baseId}_0`, transcript, directory, projects);
  if (action.title) {
    action.title = action.title.replace(/^[,;.\s]+|[,;.\s]+$/g, '');
  }
  actions.push(action);

  // Detect additional implicit actions (e.g. WhatsApp in an otherwise task-oriented command)
  const additionalActions = extractAdditionalActions(transcript, extractionResult, baseId, directory);
  actions.push(...additionalActions);

  // Route all actions
  return routeActions(actions);
}

function buildRoutedAction(draft, actionType, id, fullTranscript, directory, projects) {
  const fields = draft.fields || {};
  const meta = draft.meta || {};

  // Resolve assignee from directory
  const assigneeRecord = meta.assignee?.value || null;
  const reviewerRecord = meta.reviewer?.value || null;
  const projectRecord = meta.project?.value || null;

  // Determine if action requires approval before execution
  const requiresApproval = [
    ACTION_TYPES.SEND_WHATSAPP,
    ACTION_TYPES.SEND_EMAIL,
    ACTION_TYPES.CREATE_CALENDAR_EVENT,
    ACTION_TYPES.UPDATE_CALENDAR_EVENT,
    ACTION_TYPES.DELETE_CALENDAR_EVENT,
    ACTION_TYPES.DELETE_TASK
  ].includes(actionType);

  // Compute initial stage
  const hasClarifications = (meta.clarifications || []).length > 0;
  const initialStage = hasClarifications
    ? VOICE_STAGES.NEEDS_CLARIFICATION
    : requiresApproval
      ? VOICE_STAGES.READY_FOR_APPROVAL
      : VOICE_STAGES.EXTRACTED;

  return {
    id,
    type: actionType,
    title: fields.title || '',
    description: fields.description || '',
    priority: fields.priority || '',
    assignee: assigneeRecord ? {
      id: assigneeRecord.id,
      name: assigneeRecord.name,
      email: assigneeRecord.email,
      phone: assigneeRecord.phone,
      department: assigneeRecord.department
    } : null,
    reviewer: reviewerRecord ? {
      id: reviewerRecord.id,
      name: reviewerRecord.name,
      email: reviewerRecord.email
    } : null,
    project: projectRecord ? {
      id: projectRecord.id,
      name: projectRecord.name,
      code: projectRecord.code
    } : null,
    department: fields.department || '',
    location: fields.location || '',
    startDate: fields.startDate || null,
    deadline: fields.dueDate || null,
    isRecurring: fields.isRecurring || false,
    recurrenceFrequency: fields.recurrenceFrequency || '',
    recurrenceDays: fields.recurrenceDays || [],
    dependencies: fields.dependencies || [],
    // WhatsApp specific
    whatsappMessage: actionType === ACTION_TYPES.SEND_WHATSAPP
      ? buildWhatsAppPreview(fullTranscript, assigneeRecord)
      : null,
    // Confidence
    confidence: {
      intent:   meta.fieldConfidences?.title ?? 0.85,
      title:    meta.fieldConfidences?.title ?? 0.85,
      assignee: meta.assignee?.confidence ?? 0,
      deadline: meta.dueDate?.value ? 0.9 : 0,
      overall:  meta.overallConfidence ?? 0.75
    },
    // Meta
    stage: initialStage,
    requiresApproval,
    clarificationsNeeded: meta.clarifications || [],
    warnings: meta.warnings || [],
    sourceText: fullTranscript,
    extractionPath: 'RULE',
    language: draft.languageClassification?.code || 'en',
    // Destination (set by routeActions)
    destination: null,
    destinationLabel: null,
    destinationIcon: null,
    destinationColor: null
  };
}

/**
 * Detects additional implicit actions in a transcript beyond the primary extraction.
 * E.g., "Aman ko WhatsApp kar do ki report bhej de aur calendar mein meeting fix karo"
 * → extracts WhatsApp action separately from the Calendar action
 */
function extractAdditionalActions(transcript, primaryDraft, baseId, directory) {
  const additional = [];
  const lower = transcript.toLowerCase();

  // Detect explicit WhatsApp mention when primary is not WhatsApp
  if (primaryDraft.fields?.title && !/whatsapp/i.test(primaryDraft.rawTranscript || '')) {
    const wpMatch = transcript.match(
      /([A-Za-z\u0900-\u097F]+)\s+ko\s+(?:whatsapp|message|msg)\s+(?:kar\s+do|karo|bhej\s+do|bhejo)[^.]*?(?:ki|ke|that|saying|ko\s+bolo|bol\s+do)\s+([^.;!?]+)/i
    );
    if (wpMatch) {
      const recipientName = wpMatch[1];
      const messageIntent = wpMatch[2];
      const recipientRecord = directory.find(p =>
        p.name.toLowerCase().startsWith(recipientName.toLowerCase()) ||
        (p.aliases || []).some(a => a.toLowerCase().startsWith(recipientName.toLowerCase()))
      );
      additional.push({
        id: `${baseId}_wa`,
        type: ACTION_TYPES.SEND_WHATSAPP,
        title: `Send WhatsApp to ${recipientRecord?.name || recipientName}`,
        description: messageIntent.trim(),
        priority: '',
        assignee: recipientRecord ? { id: recipientRecord.id, name: recipientRecord.name } : null,
        whatsappMessage: messageIntent.trim(),
        stage: VOICE_STAGES.READY_FOR_APPROVAL,
        requiresApproval: true,
        clarificationsNeeded: [],
        warnings: [],
        sourceText: wpMatch[0],
        extractionPath: 'RULE',
        destination: DESTINATIONS.WHATSAPP,
        confidence: { intent: 0.92, title: 0.88, assignee: recipientRecord ? 0.95 : 0.5, overall: 0.85 }
      });
    }
  }

  // Detect shopping list items
  const shoppingMatch = transcript.match(
    /\b(?:bread|milk|doodh|sabzi|atta|chawal|dal|eggs?|sugar|namak|oil|tel|fruits?|vegetables?|ghee|paneer|curd|dahi)\b/gi
  );
  if (shoppingMatch && primaryDraft.type !== ACTION_TYPES.SHOPPING_LIST) {
    const items = [...new Set(shoppingMatch.map(i => i.toLowerCase()))];
    if (items.length > 0) {
      additional.push({
        id: `${baseId}_shop`,
        type: 'ADD_SHOPPING_ITEM',
        title: `Add to shopping list: ${items.join(', ')}`,
        description: `Items: ${items.join(', ')}`,
        items,
        stage: VOICE_STAGES.EXTRACTED,
        requiresApproval: false,
        clarificationsNeeded: [],
        warnings: [],
        sourceText: transcript,
        extractionPath: 'RULE',
        destination: DESTINATIONS.SHOPPING_LIST,
        confidence: { intent: 0.9, overall: 0.88 }
      });
    }
  }

  return additional;
}

function buildWhatsAppPreview(transcript, recipient) {
  // Extract message intent from transcript
  const msgMatch = transcript.match(
    /(?:ki|ke|that|saying|bol\s+do|bolo|batao|inform)\s+([^.;!?]+)/i
  );
  if (msgMatch?.[1]) {
    return msgMatch[1].trim();
  }
  return `Message from ActionFlow: ${transcript.slice(0, 100)}`;
}

// ─── Main Voice Processing Pipeline ──────────────────────────────────────────
/**
 * Processes a voice transcript through the complete Phase 1 pipeline.
 * Returns a VoiceCommandResult with routed actions, entities, and stage.
 *
 * @param {Object} params
 * @param {string} params.transcript
 * @param {Array}  params.directory
 * @param {Array}  params.projects
 * @param {Array}  params.departments
 * @param {string} [params.industry]
 * @param {Date}   [params.referenceDate]
 * @param {Function} [params.onStageChange] - callback(stage, message)
 * @returns {VoiceCommandResult}
 */
export function processVoiceCommand({
  transcript,
  directory = [],
  projects = [],
  departments = [],
  industry = 'all',
  referenceDate = new Date(),
  onStageChange
}) {
  const startTime = Date.now();
  const commandId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

  onStageChange?.(VOICE_STAGES.CAPTURED, 'Voice command received');

  if (!transcript?.trim()) {
    return {
      commandId,
      stage: VOICE_STAGES.NEEDS_CLARIFICATION,
      transcript: '',
      routing: { primary: DESTINATIONS.UNKNOWN_DESTINATION, all: [], confidence: 0 },
      actions: [],
      entities: [],
      intent: 'unknown',
      processingTimeMs: 0
    };
  }

  onStageChange?.(VOICE_STAGES.NORMALIZING, 'Normalizing transcript...');

  // Step 1: Route the transcript to determine destination(s)
  const routing = routeTranscript(transcript);

  onStageChange?.(VOICE_STAGES.ANALYZING, `Analyzing intent → ${routing.primary}...`);

  // Step 2: Run rule-based extraction
  const extractionResult = extractTaskDraft({
    transcript,
    directory,
    projects,
    departments,
    industry,
    referenceDate
  });

  // Step 3: Decompose to routed actions
  const actions = decomposeToActions(transcript, extractionResult, directory, projects);

  onStageChange?.(VOICE_STAGES.EXTRACTED, `Extracted ${actions.length} action(s)`);

  // Step 4: Extract entity spans for highlighting
  const entities = extractEntitySpans(transcript, extractionResult);

  // Step 5: Determine overall stage
  const stage = determineOverallStage(actions, extractionResult);

  const result = {
    commandId,
    stage,
    stageLabel: STAGE_LABELS[stage],
    transcript,
    normalizedTranscript: extractionResult.normalizedTranscript || transcript,
    language: extractionResult.languageClassification?.code || 'en',
    routing,
    intent: extractionResult.intent || 'task_create',
    actions,
    entities,
    clarifications: extractionResult.meta?.clarifications || [],
    warnings: extractionResult.meta?.warnings || [],
    processingTimeMs: Date.now() - startTime,
    extractionPath: 'RULE'
  };

  // Add to history
  addToHistory({
    commandId,
    transcript: transcript.slice(0, 100),
    routing: routing.primary,
    actionCount: actions.length,
    stage,
    timestamp: new Date().toISOString()
  });

  return result;
}

function determineOverallStage(actions, extractionResult) {
  if (!actions.length) return VOICE_STAGES.NEEDS_CLARIFICATION;
  if (extractionResult.meta?.safetyClassification?.isSafetyCritical) return VOICE_STAGES.NEEDS_CLARIFICATION;
  if (actions.some(a => a.stage === VOICE_STAGES.NEEDS_CLARIFICATION)) return VOICE_STAGES.NEEDS_CLARIFICATION;
  if (actions.some(a => a.stage === VOICE_STAGES.READY_FOR_APPROVAL)) return VOICE_STAGES.READY_FOR_APPROVAL;
  return VOICE_STAGES.EXTRACTED;
}

// ─── Entity Span Extractor (V4 Upgraded) ──────────────────────────────────────
/**
 * Extracts entity spans from transcript for coloured highlighting.
 * Returns an array of {startIndex, endIndex, text, type, label, badgeLabel, color, confidence}
 */
export function extractEntitySpans(transcript, extractionResult) {
  const spans = [];
  const text = transcript || '';
  const lower = text.toLowerCase();

  const addSpan = (start, end, label, badgeLabel, category, color, confidence = 0.95) => {
    if (start >= 0 && end > start) {
      spans.push({
        startIndex: start,
        endIndex: end,
        start,
        end,
        rawText: text.substring(start, end),
        text: text.substring(start, end),
        label,
        badgeLabel,
        category,
        color,
        confidence
      });
    }
  };

  // 1. DATES (Kal, Tomorrow, Today, etc.)
  const dateRegex = /\b(?:today|tomorrow|yesterday|kal|aaj|parso|this\s+friday|next\s+monday|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/gi;
  let match;
  while ((match = dateRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'DATE', 'DATE', 'DATE', 'blue', 0.95);
  }

  // 2. CALENDAR EVENTS (Meeting, standup, appointment)
  const meetingRegex = /\b(?:meeting|appointment|standup|calendar\s+invite)\b/gi;
  while ((match = meetingRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'CALENDAR_EVENT', 'CALENDAR_EVENT', 'CALENDAR_EVENT', 'blue', 0.96);
  }

  // 3. TIMES (10 baje, 4 PM, etc.)
  const timeRegex = /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|baje)|morning|evening|subah|shaam|raat)\b/gi;
  while ((match = timeRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'TIME', 'TIME', 'TIME', 'green', 0.94);
  }

  // 4. PEOPLE with context roles (Calendar Attendee vs WhatsApp Recipient vs Assignee)
  const people = ['rahul', 'aman', 'priya', 'ashok', 'jayant', 'krish', 'riya', 'reena', 'neha', 'pooja'];
  for (const p of people) {
    let idx = lower.indexOf(p);
    while (idx !== -1) {
      const end = idx + p.length;
      const surrounding = lower.slice(Math.max(0, idx - 25), Math.min(lower.length, end + 30));

      let label = 'PERSON';
      let badgeLabel = 'PERSON';
      if (/ke\s+saath\s+meeting|meeting\s+with|calendar/i.test(surrounding)) {
        label = 'PERSON / CALENDAR_ATTENDEE';
        badgeLabel = 'CALENDAR_ATTENDEE';
      } else if (/ko\s+(?:whatsapp|message|msg)|whatsapp.*par|se.*(?:bhej|bhejna|bhejni)/i.test(surrounding)) {
        label = 'PERSON / WHATSAPP_RECIPIENT';
        badgeLabel = 'WHATSAPP_RECIPIENT';
      } else if (/assign|zimmedari|karega|karegi|se.*mangwani|mangwana|se.*report/i.test(surrounding)) {
        label = 'PERSON / ASSIGNEE';
        badgeLabel = 'TASK_ASSIGNEE';
      }

      addSpan(idx, end, label, badgeLabel, 'PEOPLE', 'purple', 0.98);
      idx = lower.indexOf(p, end);
    }
  }

  // 5. WORK ITEMS / MESSAGE OBJECTS (Production report, presentation, etc.)
  const workRegex = /\b(?:production\s+report|presentation|quarterly\s+numbers|sales\s+report|inventory\s+count|website\s+testing|generator\s+check)\b/gi;
  while ((match = workRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'WORK_ITEM', 'WORK_ITEM', 'WORK_ITEM', 'amber', 0.92);
  }

  // 6. SHOPPING ITEMS (Bread, Milk, Doodh, etc.)
  const shoppingRegex = /\b(?:bread|milk|doodh|dudh|eggs?|butter|dal|atta|sugar|sabzi|fruits?)\b/gi;
  while ((match = shoppingRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'SHOPPING_ITEM', 'SHOPPING_ITEM', 'SHOPPING_ITEM', 'orange', 0.97);
  }

  // 7. LOCATIONS & SITES
  const locRegex = /\b(?:market|office|kitchen|ghar|site|coal\s+mine|green\s+villa|orchid\s+tower)\b/gi;
  while ((match = locRegex.exec(text)) !== null) {
    addSpan(match.index, match.index + match[0].length, 'LOCATION', 'LOCATION', 'LOCATION_PROJECT', 'teal', 0.91);
  }

  // Sort and remove duplicates/overlaps
  spans.sort((a, b) => a.startIndex - b.startIndex);
  const cleanSpans = [];
  let lastEnd = 0;
  for (const s of spans) {
    if (s.startIndex >= lastEnd) {
      cleanSpans.push(s);
      lastEnd = s.endIndex;
    }
  }

  return cleanSpans;
}
