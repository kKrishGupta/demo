/**
 * ActionFlow AI — Smart Action Router & Intent Engine (Phase 1)
 *
 * Centralized routing registry and multi-action decomposition service.
 * Supports 13 canonical destination types with full multilingual (Hindi, Hinglish, English) intelligence.
 */

export const DESTINATIONS = {
  CALENDAR:               'CALENDAR',
  TASK_MANAGER:           'TASK_MANAGER',
  TASK_ASSIGNMENT:        'TASK_ASSIGNMENT',
  WHATSAPP:               'WHATSAPP',
  EMAIL:                  'EMAIL',
  PERSONAL_REMINDER:      'PERSONAL_REMINDER',
  SHOPPING_LIST:          'SHOPPING_LIST',
  MEETING_RECORDER:       'MEETING_RECORDER',
  MEETING_INTELLIGENCE:   'MEETING_INTELLIGENCE',
  DOCUMENT_SHARING:       'DOCUMENT_SHARING',
  FOLLOW_UP:              'FOLLOW_UP',
  INFORMATION_RETRIEVAL:  'INFORMATION_RETRIEVAL',
  UNKNOWN:                'UNKNOWN'
};

// Aliases for backward compatibility with existing components
export const DESTINATION_ALIASES = {
  'GOOGLE_CALENDAR':    DESTINATIONS.CALENDAR,
  'REMINDERS':          DESTINATIONS.PERSONAL_REMINDER,
  'SITE_RECORDING':     DESTINATIONS.MEETING_RECORDER,
  'MEETING_NOTES':      DESTINATIONS.MEETING_INTELLIGENCE,
  'DOCUMENT_WORKFLOW':  DESTINATIONS.DOCUMENT_SHARING,
  'UNKNOWN_DESTINATION':DESTINATIONS.UNKNOWN
};

export function normalizeDestination(dest) {
  if (!dest) return DESTINATIONS.UNKNOWN;
  const upper = String(dest).toUpperCase();
  return DESTINATION_ALIASES[upper] || DESTINATIONS[upper] || DESTINATIONS.UNKNOWN;
}

export const DESTINATION_LABELS = {
  CALENDAR:              'Google Calendar',
  TASK_MANAGER:          'Task Manager',
  TASK_ASSIGNMENT:       'Task Assignment',
  WHATSAPP:              'WhatsApp',
  EMAIL:                 'Email',
  PERSONAL_REMINDER:     'Personal Reminder',
  SHOPPING_LIST:         'Shopping List',
  MEETING_RECORDER:      'Meeting Recorder',
  MEETING_INTELLIGENCE:  'Meeting Notes',
  DOCUMENT_SHARING:      'Document Sharing',
  FOLLOW_UP:             'Follow-up',
  INFORMATION_RETRIEVAL: 'Information Retrieval',
  UNKNOWN:               'General'
};

export const DESTINATION_ICONS = {
  CALENDAR:              '📅',
  TASK_MANAGER:          '✅',
  TASK_ASSIGNMENT:       '👤',
  WHATSAPP:              '💬',
  EMAIL:                 '📧',
  PERSONAL_REMINDER:     '🔔',
  SHOPPING_LIST:         '🛒',
  MEETING_RECORDER:      '🎙️',
  MEETING_INTELLIGENCE:  '📝',
  DOCUMENT_SHARING:      '📄',
  FOLLOW_UP:             '⏳',
  INFORMATION_RETRIEVAL: '🔍',
  UNKNOWN:               '⚡'
};

export const DESTINATION_COLORS = {
  CALENDAR:              'blue',
  TASK_MANAGER:          'emerald',
  TASK_ASSIGNMENT:       'violet',
  WHATSAPP:              'pink',
  EMAIL:                 'indigo',
  PERSONAL_REMINDER:     'amber',
  SHOPPING_LIST:         'orange',
  MEETING_RECORDER:      'rose',
  MEETING_INTELLIGENCE:  'slate',
  DOCUMENT_SHARING:      'cyan',
  FOLLOW_UP:             'purple',
  INFORMATION_RETRIEVAL: 'sky',
  UNKNOWN:               'gray'
};

// ─── Destination Patterns ─────────────────────────────────────────────────────
const ROUTING_RULES = [
  // 1. MEETING_RECORDER (Site/Meeting Recording)
  {
    destination: DESTINATIONS.MEETING_RECORDER,
    weight: 98,
    patterns: [
      /\b(?:recording|record\s+start|start\s+recording|site\s+recording|meeting\s+record|baithak\s+record|audio\s+record)\b/i,
      /\bcoal\s+mine\s+site\s+par\s+recording\b/i
    ]
  },

  // 2. WHATSAPP
  {
    destination: DESTINATIONS.WHATSAPP,
    weight: 95,
    patterns: [
      /\b(?:whatsapp|whats\s*app|wa\s+kar|wa\s+bhej|message\s+kar\s+do|msg\s+kar|chat\s+kar)\b/i,
      /\bko\s+(?:whatsapp|message|msg)\b/i,
      /\bsend\s+(?:whatsapp|message)\s+to\b/i,
      /\b(?:bolna|bol\s+do|bata\s+dena)\s+ki\s+.+\b(?:whatsapp|message)\b/i
    ]
  },

  // 3. EMAIL
  {
    destination: DESTINATIONS.EMAIL,
    weight: 95,
    patterns: [
      /\b(?:email|mail|ek\s+email|email\s+bhej|mail\s+kar|mail\s+karo)\b/i,
      /\bko\s+(?:email|mail)\b/i,
      /\bsend\s+email\s+to\b/i
    ]
  },

  // 4. CALENDAR
  {
    destination: DESTINATIONS.CALENDAR,
    weight: 92,
    patterns: [
      /\b(?:meeting\s+(?:fix|schedule|set|lagao|rakho|kar\s+do)|schedule\s+(?:a\s+)?meeting|calendar\s+mein|calendar\s+par)\b/i,
      /\b(?:appointment|event\s+(?:create|add|banao)|invite\s+to\s+meeting)\b/i,
      /\b(?:tomorrow|kal|aaj|parso)\b.*\b(?:meeting|appointment|call)\b/i,
      /\b(?:meeting|call|event|appointment)\b.*\b(?:tomorrow|kal|aaj|\d+\s*(?:am|pm|baje))\b/i,
      /\b(?:reschedule|postpone|cancel|shift)\b.*\bmeeting\b/i,
      /\bmeeting\b.*\b(?:reschedule|postpone|cancel|shift)\b/i,
      /\b(?:standup|stand-up|sync\s+call|team\s+call|team\s+meeting)\b/i,
      /\b(?:aaj\s+meri\s+next\s+meeting|free\s+hoon\s+kya|check\s+availability|calendar\s+check)\b/i
    ]
  },

  // 5. PERSONAL_REMINDER
  {
    destination: DESTINATIONS.PERSONAL_REMINDER,
    weight: 91,
    patterns: [
      /\b(?:remind|reminder|yaad\s+dila|yaad\s+dilana|mujhe\s+yaad|notification)\b/i,
      /\b(?:shaam\s+ko\s+(?:mujhe\s+)?yaad|kal\s+(?:mujhe\s+)?yaad|yaad\s+dilao)\b/i,
      /\b(?:mujhe\s+(?:kal|aaj|shaam|subah|raat|\d+\s*baje)\s+(?:yaad|batana|remind))\b/i,
      /\b\d+\s*baje\s+medicine\s+yaad\s+dila\b/i,
      /\b(?:ko\s+call\s+karna\s+hai|ko\s+phone\s+karna\s+hai)\b/i // Papa ko call karna hai
    ]
  },

  // 6. SHOPPING_LIST
  {
    destination: DESTINATIONS.SHOPPING_LIST,
    weight: 90,
    patterns: [
      /\b(?:shopping\s+(?:list|mein|par)|grocery|groceries)\b/i,
      /\b(?:bread|milk|doodh|sabzi|atta|chawal|dal|vegetables?|fruits?|eggs?|sugar|namak|oil|tel|butter)\b.*\b(?:laana|le\s+aana|khareedna|chahiye|add)\b/i,
      /\b(?:laana\s+hai|le\s+aana)\b.*\b(?:bread|milk|doodh|sabzi|eggs?)\b/i,
      /\b(?:kitchen|ghar)\s+(?:mein|ke\s+liye).*\b(?:laana|chahiye|lena|bread|milk)\b/i,
      /\b(?:add\s+(?:bread|milk|eggs|butter)\b)/i
    ]
  },

  // 7. MEETING_INTELLIGENCE (Notes, Minutes, Summaries)
  {
    destination: DESTINATIONS.MEETING_INTELLIGENCE,
    weight: 87,
    patterns: [
      /\b(?:meeting\s+(?:notes?|minutes?|summary|points?)|notes?\s+(?:lena|banana|banao|save))\b/i,
      /\b(?:action\s+items?|follow.?up\s+(?:items?|points?)|meeting\s+ka\s+summary)\b/i
    ]
  },

  // 8. DOCUMENT_SHARING
  {
    destination: DESTINATIONS.DOCUMENT_SHARING,
    weight: 85,
    patterns: [
      /\b(?:document|doc|pdf|file|presentation)\s+(?:share|bhej|upload|sign|send)\b/i,
      /\b(?:share\s+the\s+presentation|share\s+the\s+report)\b/i
    ]
  },

  // 9. INFORMATION_RETRIEVAL
  {
    destination: DESTINATIONS.INFORMATION_RETRIEVAL,
    weight: 84,
    patterns: [
      /\b(?:show|list|dikhao|display|saare|all)\b.*\b(?:pending\s+tasks?|tasks?|all\s+tasks?|meetings?)\b/i,
      /\b(?:kab\s+hai|kahan\s+hai|status\s+kya\s+hai|when\s+is\s+my\s+next)\b/i
    ]
  },

  // 10. FOLLOW_UP
  {
    destination: DESTINATIONS.FOLLOW_UP,
    weight: 82,
    patterns: [
      /\b(?:follow\s*up|follow-up\s+lena|update\s+lena|status\s+puchhna)\b/i
    ]
  },

  // 11. TASK_ASSIGNMENT (Explicit delegation of responsibility to a person or team)
  {
    destination: DESTINATIONS.TASK_ASSIGNMENT,
    weight: 80,
    patterns: [
      /\b(?:assign\s+(?:[a-zA-Z]+\s+)?(?:to|kar)|assign\s+karo|assign\s+kar\s+do|delegate)\b/i,
      /\b(?:ko\s+(?:assign|de\s+do|saup\s+do|zimma\s+do|karne\s+bol|responsibility))\b/i,
      /\b(?:transfer\s+task|reassign|re-assign)\b/i,
      /\bhar\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.+\bko\b/i,
      /\b(?:not\s+\w+[,\s]+assign|instead[,\s]+assign|no[,\s]+not\s+\w+[,\s]+assign)\b/i,
      /\b[A-Za-z\u0900-\u097F]+\s+ko\s+ye\s+task\s+assign\b/i
    ]
  },

  // 12. TASK_MANAGER (A general unit of work to be completed)
  {
    destination: DESTINATIONS.TASK_MANAGER,
    weight: 75,
    patterns: [
      /\b(?:task\s+(?:create|bana|banao|add|update|complete|done|finish))\b/i,
      /\b(?:complete\s+mark\s+kar|mark\s+as\s+complete|mark\b.*\bcomplete|kaam\s+karna\s+hai)\b/i,
      /\b(?:report\s+complete\s+karna|presentation\s+complete|friday\s+tak\s+complete)\b/i,
      /\b(?:priority\s+high\s+kar|deadline\s+set)\b/i,
      /\b(?:todo|to.do|action\s+item)\b/i
    ]
  }
];

// ─── Task vs Assignment Classifier ───────────────────────────────────────────
/**
 * Distinguishes whether an intent is a general TASK or a specific ASSIGNMENT
 * @param {string} text
 * @returns {'TASK_ASSIGNMENT'|'TASK_MANAGER'}
 */
export function classifyTaskVsAssignment(text) {
  const lower = text.toLowerCase();

  // Explicit assignment markers
  const isAssignment =
    /\b(?:assign|delegate|reassign|saup\s+do|zimma|responsibility)\b/i.test(lower) ||
    /\b(?:[A-Za-z\u0900-\u097F]+)\s+ko\s+(?:ye\s+task|kaam|report|material)\b/i.test(lower) ||
    /\bassign\s+(?:this\s+)?to\s+[A-Za-z\u0900-\u097F]+/i.test(lower);

  return isAssignment ? DESTINATIONS.TASK_ASSIGNMENT : DESTINATIONS.TASK_MANAGER;
}

// ─── Multi-Action Decomposer ─────────────────────────────────────────────────
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

  // Protect negative repair parentheticals like "No, not Rahul," or "Rahul nahi,"
  working = working.replace(/(?:no,\s*)?(?:not|nahi|nhi)\s+[A-Za-z\u0900-\u097F]+,\s*/gi, '');

  // Split on commas followed by verbs/people/clauses, and standalone conjunctions
  const normalized = working
    .replace(/,\s*(?=[A-Za-z\u0900-\u097F]+\s+(?:ko|se|ke|will|should|par|mein|ko\s+WhatsApp|bata\s+dena|assign))/gi, ' | ')
    .replace(/,\s*(?:aur|and|then|uske\s+baad|fir|phir)\s+/gi, ' | ')
    .replace(/\s+(?:aur|and|then|uske\s+baad|fir|phir|after\s+that|as\s+well\s+as)\s+/gi, ' | ')
    .replace(/[.;\n]+/g, ' | ');

  const clauses = normalized
    .split('|')
    .map(c => c.replace(/__JOIN__/g, ' aur ').trim())
    .filter(c => c.length >= 3);

  return clauses.length > 0 ? clauses : [transcript.trim()];
}

// ─── Destination Conflict Resolver ────────────────────────────────────────────
function resolveConflict(candidates, transcript) {
  const lower = transcript.toLowerCase();

  // WhatsApp wins if message verb or whatsapp keyword is explicit
  if (candidates.includes(DESTINATIONS.WHATSAPP)) {
    if (/\b(?:whatsapp|wa\s+kar|message|msg|bolna|bata\s+dena)\b/i.test(lower)) {
      return DESTINATIONS.WHATSAPP;
    }
  }

  // Calendar wins if meeting keyword or schedule keyword is explicit
  if (candidates.includes(DESTINATIONS.CALENDAR)) {
    if (/\b(?:meeting|appointment|standup|calendar|reschedule|shift)\b/i.test(lower)) {
      return DESTINATIONS.CALENDAR;
    }
  }

  // Shopping wins if food/household items mentioned
  if (candidates.includes(DESTINATIONS.SHOPPING_LIST)) {
    if (/\b(?:bread|milk|doodh|sabzi|atta|chawal|dal|eggs?|sugar|groceries)\b/i.test(lower)) {
      return DESTINATIONS.SHOPPING_LIST;
    }
  }

  // Reminders win if "yaad dila" or "remind"
  if (candidates.includes(DESTINATIONS.PERSONAL_REMINDER)) {
    if (/\b(?:yaad\s+dila|remind|call\s+karna\s+hai)\b/i.test(lower)) {
      return DESTINATIONS.PERSONAL_REMINDER;
    }
  }

  // Assignment vs Task
  if (candidates.includes(DESTINATIONS.TASK_ASSIGNMENT) || candidates.includes(DESTINATIONS.TASK_MANAGER)) {
    return classifyTaskVsAssignment(transcript);
  }

  return candidates[0];
}

// ─── Single Clause Router ────────────────────────────────────────────────────
export function routeClause(clause) {
  const lower = clause.toLowerCase();
  const matched = [];

  for (const rule of ROUTING_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(lower)) {
        matched.push({
          destination: rule.destination,
          weight: rule.weight
        });
        break;
      }
    }
  }

  if (matched.length === 0) {
    const isAction = /\b(?:karo|karna|kar\s+do|banao|complete|create|add|fix)\b/i.test(lower);
    return {
      destination: isAction ? DESTINATIONS.TASK_MANAGER : DESTINATIONS.UNKNOWN,
      confidence: isAction ? 0.6 : 0.25,
      operation: isAction ? 'CREATE_TASK' : 'UNKNOWN'
    };
  }

  // Sort by weight
  matched.sort((a, b) => b.weight - a.weight);
  const candidates = matched.map(m => m.destination);
  const destination = candidates.length > 1 ? resolveConflict(candidates, clause) : candidates[0];

  // Classify operation
  let operation = 'CREATE';
  if (destination === DESTINATIONS.CALENDAR) {
    operation = /\b(?:cancel)\b/i.test(lower) ? 'CANCEL_EVENT'
      : /\b(?:reschedule|shift|postpone)\b/i.test(lower) ? 'RESCHEDULE_EVENT'
      : 'CREATE_EVENT';
  } else if (destination === DESTINATIONS.WHATSAPP) {
    operation = 'SEND_MESSAGE';
  } else if (destination === DESTINATIONS.SHOPPING_LIST) {
    operation = 'ADD_ITEM';
  } else if (destination === DESTINATIONS.PERSONAL_REMINDER) {
    operation = 'CREATE_REMINDER';
  } else if (destination === DESTINATIONS.TASK_ASSIGNMENT) {
    operation = /\b(?:reassign|transfer)\b/i.test(lower) ? 'REASSIGN_TASK' : 'ASSIGN_TASK';
  } else if (destination === DESTINATIONS.TASK_MANAGER) {
    operation = /\b(?:complete|finish|done)\b/i.test(lower) ? 'COMPLETE_TASK'
      : /\b(?:update|change|shift|priority)\b/i.test(lower) ? 'UPDATE_TASK'
      : 'CREATE_TASK';
  } else if (destination === DESTINATIONS.MEETING_RECORDER) {
    operation = 'START_RECORDING';
  } else if (destination === DESTINATIONS.INFORMATION_RETRIEVAL) {
    operation = 'RETRIEVE_TASKS';
  }

  const confidence = Math.min(0.99, (matched[0].weight / 100));

  return { destination, confidence, operation };
}

// ─── Main Routing & Decomposition Function ────────────────────────────────────
/**
 * Routes a full transcript, detecting multiple actions and destinations
 * @param {string} transcript
 * @returns {Object} Full routing and decomposed action plan
 */
export function routeTranscript(transcript) {
  if (!transcript?.trim()) {
    return {
      primary: DESTINATIONS.UNKNOWN,
      isMultiDestination: false,
      actions: [],
      feedbackMessage: 'Please speak or enter a command.',
      confidence: 0
    };
  }

  const clauses = splitMultiActionTranscript(transcript);
  const decomposedActions = [];

  clauses.forEach((clause, index) => {
    const route = routeClause(clause);
    decomposedActions.push({
      id: `action_${Date.now()}_${index}`,
      clause,
      destination: route.destination,
      operation: route.operation,
      confidence: route.confidence,
      destinationLabel: DESTINATION_LABELS[route.destination],
      destinationIcon: DESTINATION_ICONS[route.destination],
      destinationColor: DESTINATION_COLORS[route.destination],
      requiresApproval: [DESTINATIONS.WHATSAPP, DESTINATIONS.EMAIL, DESTINATIONS.CALENDAR].includes(route.destination),
      executionState: 'READY_FOR_APPROVAL'
    });
  });

  const uniqueDestinations = [...new Set(decomposedActions.map(a => a.destination))];
  const primary = decomposedActions[0]?.destination || DESTINATIONS.UNKNOWN;
  const isMultiDestination = uniqueDestinations.length > 1;

  // Build natural feedback message
  let feedbackMessage = '';
  if (decomposedActions.length === 1) {
    const act = decomposedActions[0];
    switch (act.destination) {
      case DESTINATIONS.CALENDAR:
        feedbackMessage = 'Calendar event prepared. Please review date, time and attendees.';
        break;
      case DESTINATIONS.WHATSAPP:
        feedbackMessage = 'WhatsApp message draft prepared. Confirmation required before dispatch.';
        break;
      case DESTINATIONS.SHOPPING_LIST:
        feedbackMessage = 'Items detected for your shopping list.';
        break;
      case DESTINATIONS.PERSONAL_REMINDER:
        feedbackMessage = 'Personal reminder created.';
        break;
      case DESTINATIONS.TASK_ASSIGNMENT:
        feedbackMessage = 'Task delegation identified and assigned.';
        break;
      case DESTINATIONS.INFORMATION_RETRIEVAL:
        feedbackMessage = 'Retrieving task records.';
        break;
      default:
        feedbackMessage = 'Command processed and task prepared.';
    }
  } else {
    feedbackMessage = `Identified ${decomposedActions.length} distinct actions across ${uniqueDestinations.length} destinations.`;
  }

  return {
    primary,
    isMultiDestination,
    uniqueDestinations,
    actions: decomposedActions,
    feedbackMessage,
    confidence: decomposedActions[0]?.confidence || 0.5
  };
}
