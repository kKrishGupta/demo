/**
 * ActionFlow AI — Smart Destination Router
 *
 * The central intelligence that determines WHERE an extracted command should go.
 * This is Phase 1's most critical component.
 *
 * Supported destinations:
 *   GOOGLE_CALENDAR, TASK_MANAGER, TASK_ASSIGNMENT, WHATSAPP, EMAIL,
 *   REMINDERS, SHOPPING_LIST, MEETING_NOTES, DOCUMENT_WORKFLOW,
 *   SITE_RECORDING, UNKNOWN_DESTINATION
 *
 * Routing is deterministic first (pattern matching), then contextual (Gemini).
 * Never routes by person alone — understands verb + object + context.
 */

export const DESTINATIONS = {
  // Canonical Destination Types
  CALENDAR:              'GOOGLE_CALENDAR',
  GOOGLE_CALENDAR:       'GOOGLE_CALENDAR',
  TASK_MANAGER:          'TASK_MANAGER',
  TASK_ASSIGNMENT:       'TASK_ASSIGNMENT',
  WHATSAPP:              'WHATSAPP',
  EMAIL:                 'EMAIL',
  PERSONAL_REMINDER:     'REMINDERS',
  REMINDERS:             'REMINDERS',
  SHOPPING_LIST:         'SHOPPING_LIST',
  MEETING_RECORDER:      'SITE_RECORDING',
  SITE_RECORDING:        'SITE_RECORDING',
  MEETING_INTELLIGENCE:  'MEETING_NOTES',
  MEETING_NOTES:         'MEETING_NOTES',
  DOCUMENT_SHARING:      'DOCUMENT_WORKFLOW',
  DOCUMENT_WORKFLOW:     'DOCUMENT_WORKFLOW',
  FOLLOW_UP:             'FOLLOW_UP',
  INFORMATION_RETRIEVAL: 'INFORMATION_RETRIEVAL',
  UNKNOWN:               'UNKNOWN_DESTINATION',
  UNKNOWN_DESTINATION:   'UNKNOWN_DESTINATION'
};

export const DESTINATION_LABELS = {
  CALENDAR:              'Google Calendar',
  GOOGLE_CALENDAR:       'Google Calendar',
  TASK_MANAGER:          'Task Manager',
  TASK_ASSIGNMENT:       'Task Assignment',
  WHATSAPP:              'WhatsApp',
  EMAIL:                 'Email',
  PERSONAL_REMINDER:     'Personal Reminder',
  REMINDERS:             'Reminders',
  SHOPPING_LIST:         'Shopping List',
  MEETING_RECORDER:      'Meeting / Site Recorder',
  SITE_RECORDING:        'Site Recording',
  MEETING_INTELLIGENCE:  'Meeting Notes & Summary',
  MEETING_NOTES:         'Meeting Notes',
  DOCUMENT_SHARING:      'Document Sharing',
  DOCUMENT_WORKFLOW:     'Document Workflow',
  FOLLOW_UP:             'Follow-up Task',
  INFORMATION_RETRIEVAL: 'Information Retrieval',
  UNKNOWN:               'General Task',
  UNKNOWN_DESTINATION:   'Unknown'
};

export const DESTINATION_ICONS = {
  CALENDAR:              '📅',
  GOOGLE_CALENDAR:       '📅',
  TASK_MANAGER:          '✅',
  TASK_ASSIGNMENT:       '👤',
  WHATSAPP:              '💬',
  EMAIL:                 '📧',
  PERSONAL_REMINDER:     '🔔',
  REMINDERS:             '🔔',
  SHOPPING_LIST:         '🛒',
  MEETING_RECORDER:      '🎙️',
  SITE_RECORDING:        '🎙️',
  MEETING_INTELLIGENCE:  '📝',
  MEETING_NOTES:         '📝',
  DOCUMENT_SHARING:      '📄',
  DOCUMENT_WORKFLOW:     '📄',
  FOLLOW_UP:             '⏳',
  INFORMATION_RETRIEVAL: '🔍',
  UNKNOWN:               '⚡',
  UNKNOWN_DESTINATION:   '❓'
};

export const DESTINATION_COLORS = {
  CALENDAR:              'blue',
  GOOGLE_CALENDAR:       'blue',
  TASK_MANAGER:          'emerald',
  TASK_ASSIGNMENT:       'violet',
  WHATSAPP:              'pink',
  EMAIL:                 'indigo',
  PERSONAL_REMINDER:     'amber',
  REMINDERS:             'amber',
  SHOPPING_LIST:         'orange',
  MEETING_RECORDER:      'rose',
  SITE_RECORDING:        'rose',
  MEETING_INTELLIGENCE:  'slate',
  MEETING_NOTES:         'slate',
  DOCUMENT_SHARING:      'cyan',
  DOCUMENT_WORKFLOW:     'cyan',
  FOLLOW_UP:             'purple',
  INFORMATION_RETRIEVAL: 'sky',
  UNKNOWN:               'gray',
  UNKNOWN_DESTINATION:   'gray'
};

// ─── Routing Signal Patterns ───────────────────────────────────────────────────
// Order matters — more specific patterns first

const ROUTING_RULES = [
  // ── SITE_RECORDING ────────────────────────────────────────────────────────
  {
    destination: DESTINATIONS.SITE_RECORDING,
    weight: 100,
    patterns: [
      /\b(?:recording|record\s+start|start\s+recording|site\s+recording|meeting\s+record|baithak\s+record)\b/i
    ]
  },

  // ── WHATSAPP ──────────────────────────────────────────────────────────────
  {
    destination: DESTINATIONS.WHATSAPP,
    weight: 95,
    patterns: [
      /\b(?:whatsapp|whats\s*app|wa\s+kar|wa\s+bhej|message\s+kar\s+do|msg\s+kar|chat\s+kar)\b/i,
      /\bko\s+(?:whatsapp|message|msg)\b/i
    ]
  },

  // ── EMAIL ─────────────────────────────────────────────────────────────────
  {
    destination: DESTINATIONS.EMAIL,
    weight: 95,
    patterns: [
      /\b(?:email|mail|ek\s+email|email\s+bhej|mail\s+kar)\b/i,
      /\bko\s+(?:email|mail)\b/i
    ]
  },

  // ── GOOGLE_CALENDAR ───────────────────────────────────────────────────────
  {
    destination: DESTINATIONS.GOOGLE_CALENDAR,
    weight: 90,
    patterns: [
      /\b(?:meeting\s+(?:fix|schedule|set|lagao|rakho|kar\s+do)|schedule\s+(?:a\s+)?meeting|calendar\s+mein|calendar\s+par)\b/i,
      /\b(?:meeting\s+fix|meet\s+set|appointment|event\s+(?:create|add|banao))\b/i,
      // "Rahul ke saath meeting" — person + ke saath + meeting
      /\b(?:[A-Za-z\u0900-\u097F]+)\s+ke\s+saath\s+(?:\d+\s*baje\s+)?meeting\b/i,
      /\b(?:kal|aaj|parso|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b.*\b(?:meeting|appointment)\b/i,
      /\b(?:meeting|appointment)\b.*\b(?:kal|aaj|tomorrow|next\s+week|\d+\s*(?:am|pm|baje))\b/i,
      /\b(?:tomorrow|next\s+\w+|\d+\s*(?:am|pm))\b.*\b(?:meeting|appointment)\b/i,
      /\b(?:reschedule|postpone|cancel\s+(?:the\s+)?meeting|meeting\s+cancel|meeting\s+postpone|meeting\s+shift)\b/i,
      /\b(?:invite|attendee|free\s+slot|availability|available)\b.*\b(?:meeting|call)\b/i,
      /\b(?:schedule\s+(?:a\s+)?(?:weekly|daily|monthly|recurring|repeat)\s+(?:meeting|call|standup|sync))\b/i,
      // Standup / sync calls
      /\b(?:standup|stand-up|stand\s+up|sync\s+call|team\s+call|team\s+meeting)\b/i,
      /\b(?:invite)\b.+\b(?:meeting|call|standup|event|sync)\b/i
    ]
  },

  // ── SHOPPING_LIST ─────────────────────────────────────────────────────────
  {
    destination: DESTINATIONS.SHOPPING_LIST,
    weight: 90,
    patterns: [
      /\b(?:shopping\s+(?:list|mein|par)|grocery|groceries)\b/i,
      /\b(?:laana\s+hai|le\s+aana|khareedna|khareedni|market\s+se|shop\s+se|store\s+se)\b.*\b(?:bread|milk|sabzi|doodh|atta|chawal|dal|vegetables?|fruits?|eggs?)\b/i,
      /\b(?:bread|milk|sabzi|doodh|atta|chawal|dal|vegetables?|fruits?|eggs?|sugar|namak|oil|tel)\b.*\b(?:laana|le\s+aana|khareedna|lena|chahiye)\b/i,
      /\b(?:kitchen|ghar)\s+(?:mein|ke\s+liye).*\b(?:laana|chahiye|lena)\b/i,
      /\b(?:add\s+to\s+(?:shopping|grocery|list)|shopping\s+list\s+mein)\b/i
    ]
  },

  // ── REMINDERS ─────────────────────────────────────────────────────────────
  // NOTE: Reminders must be checked BEFORE calendar since "kal X baje yaad dila" has both patterns
  {
    destination: DESTINATIONS.REMINDERS,
    weight: 92,
    patterns: [
      /\b(?:remind|reminder|yaad\s+dila|yaad\s+dilana|mujhe\s+yaad|notification)\b/i,
      /\b(?:alert|alarm|remind\s+me|yaad\s+rakhna|bhool\s+na|mujhe\s+batana)\b/i,
      /\b(?:shaam\s+ko\s+(?:mujhe\s+)?yaad|kal\s+(?:mujhe\s+)?yaad|yaad\s+dilao)\b/i,
      /\b(?:mujhe\s+(?:kal|aaj|shaam|subah|raat)\s+(?:yaad|batana|remind))\b/i,
      // Personal call reminders: "Papa ko call karna hai", "X ko call karna hai"
      /\b(?:ko\s+call\s+karna\s+hai|ko\s+call\s+karo|call\s+karna\s+hai|ko\s+phone\s+karna)\b/i
    ]
  },

  // ── MEETING_NOTES ─────────────────────────────────────────────────────────
  {
    destination: DESTINATIONS.MEETING_NOTES,
    weight: 85,
    patterns: [
      /\b(?:meeting\s+(?:notes?|minutes?|summary|points?)|notes?\s+(?:lena|banana|banao|save))\b/i,
      /\b(?:action\s+items?|follow.?up\s+(?:items?|points?)|decisions?|agenda)\b/i,
      /\b(?:transcript\s+(?:save|store|send)|baithak\s+(?:notes?|summary))\b/i
    ]
  },

  // ── DOCUMENT_WORKFLOW ─────────────────────────────────────────────────────
  {
    destination: DESTINATIONS.DOCUMENT_WORKFLOW,
    weight: 82,
    patterns: [
      /\b(?:document|doc|file|pdf|report)\s+(?:share|send|upload|approve|sign|bhej|bhejo)\b/i,
      /\b(?:approval\s+(?:lena|dena|process)|sign\s+off|authorize)\b/i,
      /\b(?:share\s+(?:the\s+)?(?:document|file|report)|document\s+(?:workflow|process))\b/i
    ]
  },

  // ── TASK_ASSIGNMENT ───────────────────────────────────────────────────────
  // Must come after specific destinations but before generic TASK_MANAGER
  {
    destination: DESTINATIONS.TASK_ASSIGNMENT,
    weight: 80,
    patterns: [
      /\b(?:assign\s+(?:to|kar)|assign\s+karo|assign\s+kar\s+do|delegate)\b/i,
      /\b(?:ko\s+(?:assign|de\s+do|saup\s+do|zimma\s+do|karne\s+bol))\b/i,
      /\b(?:transfer\s+(?:task|kaam)|reassign|re-assign|se\s+task\s+\w+\s+ko\s+transfer)\b/i,
      /\b(?:kisko\s+assign|task\s+(?:de\s+do|saup\s+do)|responsibility\s+(?:do|de))\b/i,
      // Recurring weekday: "Har Friday Jayant ko report submit karna hai"
      /\bhar\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.+\bko\b/i,
      // Correction reassignment: "not Rahul, assign to Priya"
      /\b(?:not\s+\w+[,\s]+assign|instead[,\s]+assign|no[,\s]+not\s+\w+[,\s]+assign)\b/i
    ]
  },

  // ── TASK_MANAGER ──────────────────────────────────────────────────────────
  {
    destination: DESTINATIONS.TASK_MANAGER,
    weight: 70,
    patterns: [
      /\b(?:task\s+(?:create|bana|banao|add|update|complete|done|finish))\b/i,
      /\b(?:pending\s+(?:task|kaam)|task\s+(?:list|dikhao|show))\b/i,
      /\b(?:priority\s+(?:high|low|urgent|set)|deadline\s+set|due\s+date)\b/i,
      /\b(?:kaam\s+(?:karna|karni|complete|finish)|project\s+(?:complete|finish|deliver))\b/i,
      /\b(?:todo|to.do|action\s+item)\b/i
    ]
  }
];

// ─── Context-Based Disambiguation ────────────────────────────────────────────
// When multiple signals match, these rules resolve ambiguity

function resolveConflict(candidates, transcript) {
  const lower = transcript.toLowerCase();

  // If WhatsApp is a candidate and message verb is present → WhatsApp wins
  if (candidates.includes(DESTINATIONS.WHATSAPP)) {
    if (/\b(?:bolna|bol\s+do|batana|bhej\s+do|send|message|msg)\b/i.test(lower)) {
      return DESTINATIONS.WHATSAPP;
    }
  }

  // Calendar wins if time is explicitly mentioned alongside meeting
  if (candidates.includes(DESTINATIONS.GOOGLE_CALENDAR)) {
    if (/\d+\s*(?:am|pm|baje|o'clock)/i.test(lower)) {
      return DESTINATIONS.GOOGLE_CALENDAR;
    }
  }

  // Shopping wins if food/household items are mentioned
  if (candidates.includes(DESTINATIONS.SHOPPING_LIST)) {
    if (/\b(?:bread|milk|doodh|sabzi|atta|chawal|dal|eggs?|sugar|namak|oil|tel|fruits?)\b/i.test(lower)) {
      return DESTINATIONS.SHOPPING_LIST;
    }
  }

  // Reminders win if "mujhe yaad" or time-based recall is used
  if (candidates.includes(DESTINATIONS.REMINDERS)) {
    if (/\b(?:mujhe\s+yaad|yaad\s+dila|remind\s+me)\b/i.test(lower)) {
      return DESTINATIONS.REMINDERS;
    }
  }

  // Task Assignment wins if a person + verb pattern is present
  if (candidates.includes(DESTINATIONS.TASK_ASSIGNMENT)) {
    if (/\b(?:rahul|priya|aman|ashok|jayant|krish|riya|reena)\s+ko\b/i.test(lower)) {
      return DESTINATIONS.TASK_ASSIGNMENT;
    }
  }

  // Return highest-weight candidate
  return candidates[0];
}

// ─── Main Routing Function ────────────────────────────────────────────────────
/**
 * Routes a transcript to its correct destination(s).
 * Supports multi-action transcripts that span multiple destinations.
 *
 * @param {string} transcript
 * @returns {RoutingResult}
 */
export function routeTranscript(transcript) {
  if (!transcript?.trim()) {
    return {
      primary: DESTINATIONS.UNKNOWN_DESTINATION,
      all: [],
      isMultiDestination: false,
      confidence: 0,
      signals: []
    };
  }

  const lower = transcript.toLowerCase();
  const matchedDestinations = new Map(); // destination → { weight, matchedPatterns }

  // Run all routing rules
  for (const rule of ROUTING_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(lower)) {
        const existing = matchedDestinations.get(rule.destination);
        if (existing) {
          existing.weight = Math.max(existing.weight, rule.weight);
          existing.matchedPatterns.push(pattern.source);
        } else {
          matchedDestinations.set(rule.destination, {
            weight: rule.weight,
            matchedPatterns: [pattern.source]
          });
        }
        break; // Only count each destination once per rule
      }
    }
  }

  if (matchedDestinations.size === 0) {
    // Default to TASK_MANAGER for actionable-sounding commands, UNKNOWN for rest
    const isActionable = /\b(?:karo|karna|kare|kar\s+do|banao|banana|bhejo|bhejdo|create|make|add|do|please)\b/i.test(lower);
    return {
      primary: isActionable ? DESTINATIONS.TASK_MANAGER : DESTINATIONS.UNKNOWN_DESTINATION,
      all: isActionable ? [{ destination: DESTINATIONS.TASK_MANAGER, weight: 50, confidence: 0.5 }] : [],
      isMultiDestination: false,
      confidence: isActionable ? 0.5 : 0.2,
      signals: []
    };
  }

  // Sort by weight descending
  const sorted = [...matchedDestinations.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .map(([dest, info]) => ({
      destination: dest,
      weight: info.weight,
      confidence: Math.min(0.99, info.weight / 100),
      matchedPatterns: info.matchedPatterns
    }));

  const candidates = sorted.map(s => s.destination);
  const primary = candidates.length > 1 ? resolveConflict(candidates, transcript) : candidates[0];
  const isMultiDestination = sorted.length > 1;

  return {
    primary,
    all: sorted,
    isMultiDestination,
    confidence: sorted[0].confidence,
    signals: sorted.map(s => ({
      destination: s.destination,
      label: DESTINATION_LABELS[s.destination],
      icon: DESTINATION_ICONS[s.destination],
      confidence: s.confidence
    }))
  };
}

/**
 * Routes individual actions from a multi-action extraction
 * @param {Array} actions - array of extracted MicroActions
 * @returns {Array} actions with destination attached
 */
export function routeActions(actions) {
  return actions.map(action => {
    const sourceText = action.sourceText || action.title || '';
    const routing = routeTranscript(sourceText);

    // Override with action type if it already strongly implies a destination
    let destination = routing.primary;

    const typeMap = {
      'CREATE_CALENDAR_EVENT':  DESTINATIONS.GOOGLE_CALENDAR,
      'UPDATE_CALENDAR_EVENT':  DESTINATIONS.GOOGLE_CALENDAR,
      'DELETE_CALENDAR_EVENT':  DESTINATIONS.GOOGLE_CALENDAR,
      'SEND_WHATSAPP':          DESTINATIONS.WHATSAPP,
      'SEND_EMAIL':             DESTINATIONS.EMAIL,
      'CREATE_REMINDER':        DESTINATIONS.REMINDERS,
      'CREATE_RECURRING_TASK':  DESTINATIONS.TASK_MANAGER,
      'RETRIEVE_TASKS':         DESTINATIONS.TASK_MANAGER,
      'GENERATE_SUMMARY':       DESTINATIONS.MEETING_NOTES,
      'ASSIGN_TASK':            DESTINATIONS.TASK_ASSIGNMENT
    };

    if (typeMap[action.type]) {
      destination = typeMap[action.type];
    } else if (action.type === 'CREATE_TASK') {
      // Distinguish personal tasks (shopping/reminders) from assigned tasks
      if (routing.primary === DESTINATIONS.SHOPPING_LIST || routing.primary === DESTINATIONS.REMINDERS) {
        destination = routing.primary;
      } else if (action.assignee) {
        destination = DESTINATIONS.TASK_ASSIGNMENT;
      } else {
        destination = DESTINATIONS.TASK_MANAGER;
      }
    }

    return {
      ...action,
      destination,
      destinationLabel: DESTINATION_LABELS[destination],
      destinationIcon: DESTINATION_ICONS[destination],
      destinationColor: DESTINATION_COLORS[destination],
      routingConfidence: routing.confidence
    };
  });
}
