/**
 * ActionFlow Server — Intelligent Room Classification & Routing Engine
 *
 * Implements:
 * - Hybrid 3-tier classification:
 *     1. Deterministic (Explicit room priority, multilingual Hindi/Hinglish/English regexes, organization rules)
 *     2. Semantic (Entity, object, and intent mapping)
 *     3. Contextual (Conversation memory, follow-up inheritance, non-merging isolation)
 * - Priority Rule: Explicit room references ALWAYS override generic semantic assumptions.
 *     e.g., "Office ki light repair karwani hai" -> Office (NOT Drawing Room)
 * - Outcomes:
 *     AUTO_ASSIGNED (high confidence >= 0.80 or explicit mention)
 *     NEEDS_REVIEW (moderate confidence or multiple competing choices)
 *     UNASSIGNED (no room matched, routed to room_unassigned)
 * - Feedback loop integration (incorporates previously confirmed user corrections)
 */

import { listRooms, listRoomRules, getRoomFeedbackHistory } from './roomManagementService.js';

// Explicit room mention patterns (Hinglish, Hindi, English)
// Patterns match: "<Room> mein ...", "<Room> par ...", "<Room> ka/ki/ke ...", "in the <Room>", "<Room> lights/ac/table..."
const EXPLICIT_ROOM_PATTERNS = [
  {
    roomId: 'room_kitchen',
    regex: /(?:\b(?:kitchen|rasoi|pantry)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:kitchen|rasoi|pantry))\b|रसोई)/i
  },
  {
    roomId: 'room_reception',
    regex: /(?:\b(?:reception|front\s*desk|swagat\s*kaksh)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:at|on|in)\s+(?:the\s+)?(?:reception|front\s*desk)\b|स्वागत\s*कक्ष)/i
  },
  {
    roomId: 'room_drawing_room',
    regex: /(?:\b(?:drawing\s*room|drawingroom|baithak|parlor)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:drawing\s*room|baithak))\b|बैठक)/i
  },
  {
    roomId: 'room_living_room',
    regex: /(?:\b(?:living\s*room|livingroom|family\s*hall|hall)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:living\s*room|family\s*hall))\b|हॉल)/i
  },
  {
    roomId: 'room_bedroom',
    regex: /(?:\b(?:bedroom|bed\s*room|shayan\s*kaksh|master\s*bedroom)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:bedroom|bed\s*room))\b|शयन\s*कक्ष|कमरा)/i
  },
  {
    roomId: 'room_bathroom',
    regex: /(?:\b(?:bathroom|bath\s*room|washroom|toilet|snan\s*kaksh|gusal\s*khana)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:bathroom|washroom|toilet))\b|स्नान\s*कक्ष|शौचालय)/i
  },
  {
    roomId: 'room_office',
    regex: /(?:\b(?:office|karyalaya|cabin|workstation|desk)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:office|cabin|karyalaya))\b|कार्यालय|दफ़्तर)/i
  },
  {
    roomId: 'room_meeting_room',
    regex: /(?:\b(?:meeting\s*room|conference\s*room|board\s*room|war\s*room)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:meeting\s*room|conference\s*room|board\s*room))\b|बैठक\s*कक्ष)/i
  },
  {
    roomId: 'room_store_room',
    regex: /(?:\b(?:store\s*room|storeroom|godown|warehouse|attic)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:store\s*room|storeroom|godown))\b|गोदाम)/i
  },
  {
    roomId: 'room_dining_room',
    regex: /(?:\b(?:dining\s*room|diningroom|dining\s*area|bhojan\s*kaksh)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:dining\s*room|dining\s*area))\b|भोजन\s*कक्ष)/i
  },
  {
    roomId: 'room_parking_area',
    regex: /(?:\b(?:parking\s*area|parking|garage|driveway|gaadi\s*parking)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:parking|garage|driveway))\b|पार्किंग)/i
  },
  {
    roomId: 'room_general',
    regex: /(?:\b(?:general|utility|bank|bill\s+payment|taxes|itr|gst)\b|बिजली|बिल)/i
  }
];

// Semantic entity associations when room is NOT explicitly mentioned
const SEMANTIC_OBJECT_ROOM_MAP = [
  // Kitchen items
  {
    entities: ['bread', 'milk', 'doodh', 'dudh', 'vegetables', 'sabzi', 'grocery', 'atta', 'dal', 'chawal', 'rice', 'oil', 'masala', 'stove', 'gas cylinder', 'crockery', 'bartan', 'utensil', 'dishwasher', 'cookware', 'microwave', 'toaster', 'mixer', 'juicer', 'chai', 'coffee', 'fridge repair', 'refrigerator repair'],
    roomId: 'room_kitchen',
    category: 'Shopping',
    confidence: 0.92,
    reason: 'Identified grocery, food, or kitchen utensil entities'
  },
  // Reception items
  {
    entities: ['visitor register', 'entry register', 'visitor entry', 'guest register', 'sign-in sheet', 'gate pass', 'visitor badge', 'front desk', 'inward register', 'entry pass'],
    roomId: 'room_reception',
    category: 'Visitor Management',
    confidence: 0.94,
    reason: 'Identified visitor management, guest register, or front-desk entities'
  },
  // Bedroom items
  {
    entities: ['bed', 'mattress', 'almirah', 'wardrobe', 'bedsheet', 'pillow', 'blanket', 'nightstand', 'dressing table', 'ac service', 'ac servicing', 'air conditioner service'],
    roomId: 'room_bedroom',
    category: 'AC Servicing',
    confidence: 0.88,
    reason: 'Identified bedroom furniture or AC servicing'
  },
  // Bathroom items
  {
    entities: ['geyser', 'tap', 'nal', 'shower', 'sink', 'commode', 'flush', 'plumbing', 'toilet paper', 'towel', 'soap', 'shampoo', 'drain', 'bathroom leakage'],
    roomId: 'room_bathroom',
    category: 'Plumbing',
    confidence: 0.93,
    reason: 'Identified plumbing, sanitary, or washroom items'
  },
  // Office items
  {
    entities: ['presentation', 'audit report', 'sales report', 'laptop', 'printer', 'scanner', 'stationery', 'payroll', 'timesheet', 'staff coordination', 'employee meeting', 'karyalaya'],
    roomId: 'room_office',
    category: 'Documentation',
    confidence: 0.89,
    reason: 'Identified corporate, administrative, or office work equipment'
  },
  // Meeting Room items
  {
    entities: ['projector', 'whiteboard', 'video conference', 'zoom room', 'client presentation', 'board meeting', 'standup call'],
    roomId: 'room_meeting_room',
    category: 'Client Meetings',
    confidence: 0.90,
    reason: 'Identified conference room, projector, or meeting facilities'
  },
  // Store Room items
  {
    entities: ['spare parts', 'storage boxes', 'cartons', 'extra inventory', 'old files', 'archive boxes', 'tools shed', 'godown'],
    roomId: 'room_store_room',
    category: 'Inventory Audit',
    confidence: 0.89,
    reason: 'Identified inventory storage, archives, or spare parts'
  },
  // Dining Room items
  {
    entities: ['dining table', 'table mat', 'cutlery', 'plates and spoons', 'dinner table', 'dinnerware'],
    roomId: 'room_dining_room',
    category: 'Table Setup',
    confidence: 0.91,
    reason: 'Identified dining furniture or dinnerware entities'
  },
  // Parking Area items
  {
    entities: ['car wash', 'bike wash', 'ev charger', 'tyre puncture', 'tire air', 'garage gate', 'security gate', 'parking slot'],
    roomId: 'room_parking_area',
    category: 'Vehicle Maintenance',
    confidence: 0.92,
    reason: 'Identified vehicle, garage, or parking gate entities'
  },
  // General items
  {
    entities: ['electricity bill', 'bijli ka bill', 'water bill', 'paani ka bill', 'wifi bill', 'broadband bill', 'income tax', 'itr', 'gst filing', 'bank deposit', 'cheque clearing', 'insurance premium', 'policy renewal'],
    roomId: 'room_general',
    category: 'Bill Payments',
    confidence: 0.93,
    reason: 'Identified universal utility bill payment or financial errand'
  }
];

export class RoomClassificationEngine {
  constructor() {
    this._recentClassifications = new Map(); // sessionId -> array of recent classifications
  }

  /**
   * Classifies a task into the appropriate room using the 3-tier hybrid engine.
   *
   * @param {Object} params
   * @param {string} params.text - The task clause or description
   * @param {string} [params.fullTranscript] - Full multi-command transcript for context
   * @param {string} [params.intent] - Detected intent (create_task, shopping, meeting, reminder, etc.)
   * @param {string} [params.destination] - Detected destination (TASK_MANAGER, GOOGLE_CALENDAR, SHOPPING_LIST, etc.)
   * @param {string} [params.sessionId='default_session'] - Client session ID
   * @param {string} [params.organizationId='org_default'] - Organization ID
   * @returns {Object} Room assignment payload
   */
  classifyTask({
    text = '',
    fullTranscript = '',
    intent = '',
    destination = '',
    sessionId = 'default_session',
    organizationId = 'org_default'
  } = {}) {
    const rawText = String(text || '').trim();
    const lower = rawText.toLowerCase();
    const allRooms = listRooms({ organizationId, includeInactive: false });
    const rules = listRoomRules({ organizationId });
    const roomMap = new Map(allRooms.map(r => [r.roomId, r]));

    // ─── TIER 1: DETERMINISTIC EXPLICIT ROOM MATCHING (HIGHEST PRIORITY) ────────
    // If user explicitly says "Office ki lights", "Reception par...", "Kitchen mein..."
    for (const pat of EXPLICIT_ROOM_PATTERNS) {
      if (pat.regex.test(rawText)) {
        const targetRoom = roomMap.get(pat.roomId) || allRooms.find(r => r.roomId === pat.roomId);
        if (targetRoom) {
          const matchedText = rawText.match(pat.regex)?.[0] || targetRoom.name;
          const assigned = {
            roomId: targetRoom.roomId,
            roomName: targetRoom.name,
            roomCategory: targetRoom.categories?.[0] || 'General',
            confidenceScore: 0.98,
            classificationReason: `Explicitly directed to ${targetRoom.name} via "${matchedText.trim()}"`,
            classificationSource: 'EXPLICIT_MENTION',
            matchedEntities: [matchedText.trim()],
            routingRuleId: `rule_explicit_${targetRoom.roomId}`,
            requiresReview: false,
            outcome: 'AUTO_ASSIGNED'
          };
          this._recordSessionContext(sessionId, assigned);
          return assigned;
        }
      }
    }

    // Check dynamic custom room names from database/configuration
    for (const room of allRooms) {
      if (room.isDefault) continue; // default rooms already checked above
      const roomNameLower = room.name.toLowerCase();
      const customRegex = new RegExp(`\\b${escapeRegExp(roomNameLower)}\\b(?:\\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?`, 'i');
      if (customRegex.test(rawText)) {
        const assigned = {
          roomId: room.roomId,
          roomName: room.name,
          roomCategory: room.categories?.[0] || 'General',
          confidenceScore: 0.97,
          classificationReason: `Explicitly directed to custom room "${room.name}"`,
          classificationSource: 'EXPLICIT_MENTION',
          matchedEntities: [room.name],
          routingRuleId: `rule_custom_${room.roomId}`,
          requiresReview: false,
          outcome: 'AUTO_ASSIGNED'
        };
        this._recordSessionContext(sessionId, assigned);
        return assigned;
      }
    }

    // ─── TIER 2: CONTEXTUAL CONTINUATION (CROSS-TASK CONVERSATION INTELLIGENCE) ──
    // If the clause begins with an additive connector (e.g. "Aur milk bhi le aana", "And also clean the floor")
    // and a previous task in this same session was assigned to a room within the last 15 minutes:
    if (/^(?:aur|and|also|bhi|uske\s+baad|fir|phir)\b/i.test(rawText) || /\b(?:bhi|also)\s+(?:le\s+aana|laana|karna|kar\s+dena)\b/i.test(rawText)) {
      const recent = this._getSessionContext(sessionId);
      if (recent && recent.roomId && recent.roomId !== 'room_unassigned') {
        const targetRoom = roomMap.get(recent.roomId);
        if (targetRoom) {
          const assigned = {
            roomId: targetRoom.roomId,
            roomName: targetRoom.name,
            roomCategory: targetRoom.categories?.[0] || 'General',
            confidenceScore: 0.90,
            classificationReason: `Inherited contextual room ${targetRoom.name} from previous conversational turn`,
            classificationSource: 'CONTEXT_INHERITED',
            matchedEntities: recent.matchedEntities || [],
            routingRuleId: `rule_context_${targetRoom.roomId}`,
            requiresReview: false,
            outcome: 'AUTO_ASSIGNED'
          };
          return assigned;
        }
      }
    }

    // ─── TIER 3: ORGANIZATIONAL ROUTING RULES & SEMANTIC ENTITY MATCHING ────────
    // Check custom active routing rules first (sorted by priority)
    const sortedRules = [...rules].filter(r => r.isActive !== false).sort((a, b) => (b.priority || 0) - (a.priority || 0));
    for (const rule of sortedRules) {
      if (Array.isArray(rule.keywords)) {
        for (const kw of rule.keywords) {
          const kwClean = String(kw).toLowerCase().trim();
          if (kwClean.length >= 3 && new RegExp(`\\b${escapeRegExp(kwClean)}\\b`, 'i').test(rawText)) {
            const targetRoom = roomMap.get(rule.roomId);
            if (targetRoom && targetRoom.roomId !== 'room_unassigned') {
              const assigned = {
                roomId: targetRoom.roomId,
                roomName: targetRoom.name,
                roomCategory: targetRoom.categories?.[0] || 'General',
                confidenceScore: 0.91,
                classificationReason: `Matched configured keyword "${kwClean}" for ${targetRoom.name}`,
                classificationSource: 'RULE_ENGINE',
                matchedEntities: [kwClean],
                routingRuleId: rule.ruleId,
                requiresReview: false,
                outcome: 'AUTO_ASSIGNED'
              };
              this._recordSessionContext(sessionId, assigned);
              return assigned;
            }
          }
        }
      }
    }

    // Check semantic object and entity map
    for (const sem of SEMANTIC_OBJECT_ROOM_MAP) {
      for (const ent of sem.entities) {
        if (new RegExp(`\\b${escapeRegExp(ent)}\\b`, 'i').test(rawText)) {
          const targetRoom = roomMap.get(sem.roomId);
          if (targetRoom) {
            const assigned = {
              roomId: targetRoom.roomId,
              roomName: targetRoom.name,
              roomCategory: sem.category || targetRoom.categories?.[0] || 'General',
              confidenceScore: sem.confidence || 0.88,
              classificationReason: sem.reason,
              classificationSource: 'SEMANTIC_AI',
              matchedEntities: [ent],
              routingRuleId: `rule_sem_${sem.roomId}`,
              requiresReview: false,
              outcome: 'AUTO_ASSIGNED'
            };
            this._recordSessionContext(sessionId, assigned);
            return assigned;
          }
        }
      }
    }

    // Check user corrections history (adaptive feedback)
    const feedbackList = getRoomFeedbackHistory({ organizationId });
    for (const fb of feedbackList) {
      if (fb.taskTitle && fb.correctedRoomId && roomMap.has(fb.correctedRoomId)) {
        const titleTokens = fb.taskTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const matchCount = titleTokens.filter(tok => lower.includes(tok)).length;
        if (titleTokens.length > 0 && matchCount / titleTokens.length >= 0.75) {
          const targetRoom = roomMap.get(fb.correctedRoomId);
          const assigned = {
            roomId: targetRoom.roomId,
            roomName: targetRoom.name,
            roomCategory: targetRoom.categories?.[0] || 'General',
            confidenceScore: 0.89,
            classificationReason: `Inherited user correction from previous task "${fb.taskTitle}"`,
            classificationSource: 'RULE_ENGINE',
            matchedEntities: titleTokens.slice(0, 3),
            routingRuleId: `feedback_${fb.id}`,
            requiresReview: false,
            outcome: 'AUTO_ASSIGNED'
          };
          this._recordSessionContext(sessionId, assigned);
          return assigned;
        }
      }
    }

    // ─── TIER 3: CONTEXTUAL INHERITANCE (CROSS-TASK CONVERSATION INTELLIGENCE) ───
    // If the clause begins with an additive connector (e.g. "Aur milk bhi le aana", "And also clean the floor")
    // and a previous task in this same session was assigned to a room within the last 15 minutes:
    if (/^(?:aur|and|also|bhi|uske\s+saath|in\s+addition)\b/i.test(rawText) || /\b(?:bhi|also)\s+(?:le\s+aana|laana|karna|kar\s+dena)\b/i.test(rawText)) {
      const recent = this._getSessionContext(sessionId);
      if (recent && recent.roomId && recent.roomId !== 'room_unassigned') {
        const targetRoom = roomMap.get(recent.roomId);
        if (targetRoom) {
          const assigned = {
            roomId: targetRoom.roomId,
            roomName: targetRoom.name,
            roomCategory: targetRoom.categories?.[0] || 'General',
            confidenceScore: 0.84,
            classificationReason: `Inherited contextual room ${targetRoom.name} from previous utterance "${recent.matchedEntities?.[0] || ''}"`,
            classificationSource: 'CONTEXT_INHERITED',
            matchedEntities: recent.matchedEntities || [],
            routingRuleId: `rule_context_${targetRoom.roomId}`,
            requiresReview: false,
            outcome: 'AUTO_ASSIGNED'
          };
          return assigned;
        }
      }
    }

    // ─── TIER 4: DESTINATION FALLBACK RULES ──────────────────────────────────────
    // If destination is SHOPPING_LIST -> Kitchen
    if (destination === 'SHOPPING_LIST' || intent === 'shopping') {
      const kRoom = roomMap.get('room_kitchen');
      if (kRoom) {
        return {
          roomId: kRoom.roomId,
          roomName: kRoom.name,
          roomCategory: 'Shopping',
          confidenceScore: 0.86,
          classificationReason: 'Shopping action automatically associated with Kitchen/Pantry',
          classificationSource: 'RULE_ENGINE',
          matchedEntities: ['shopping'],
          routingRuleId: 'rule_dest_shopping',
          requiresReview: false,
          outcome: 'AUTO_ASSIGNED'
        };
      }
    }

    // If destination is GOOGLE_CALENDAR and mentions office/meeting
    if (destination === 'GOOGLE_CALENDAR' || intent === 'meeting') {
      const offRoom = roomMap.get('room_office') || roomMap.get('room_meeting_room');
      if (offRoom) {
        return {
          roomId: offRoom.roomId,
          roomName: offRoom.name,
          roomCategory: 'Client Meetings',
          confidenceScore: 0.82,
          classificationReason: 'Meeting/Calendar action mapped to Office / Meeting facilities',
          classificationSource: 'RULE_ENGINE',
          matchedEntities: ['meeting'],
          routingRuleId: 'rule_dest_calendar',
          requiresReview: false,
          outcome: 'AUTO_ASSIGNED'
        };
      }
    }

    // ─── TIER 5: AMBIGUITY DETECTION & UNASSIGNED TRIAGE ─────────────────────────
    // Check if multiple potential rooms could match (e.g., generic "light repair" or "clean the floor")
    if (/\b(?:light|lights|bulb|fan|pankha|repair|cleaning|safai)\b/i.test(rawText)) {
      // Ambiguous: could be Drawing Room, Living Room, or Bedroom
      const defaultAmbiguousRoom = roomMap.get('room_drawing_room') || allRooms[0];
      return {
        roomId: defaultAmbiguousRoom?.roomId || 'room_unassigned',
        roomName: defaultAmbiguousRoom?.name || 'Unassigned',
        roomCategory: 'Maintenance',
        confidenceScore: 0.65,
        classificationReason: 'Generic maintenance entity with multiple possible rooms. Human review suggested.',
        classificationSource: 'RULE_ENGINE',
        matchedEntities: ['repair / cleaning'],
        routingRuleId: 'rule_ambiguous_review',
        requiresReview: true,
        outcome: 'NEEDS_REVIEW'
      };
    }

    // Fallback: If nothing matched, assign to General (for chores) or Unassigned (for triage)
    if (/\b(?:bill|payment|pay|cheque|deposit|form|document)\b/i.test(rawText)) {
      const genRoom = roomMap.get('room_general');
      return {
        roomId: genRoom ? genRoom.roomId : 'room_general',
        roomName: genRoom ? genRoom.name : 'General',
        roomCategory: 'General Errand',
        confidenceScore: 0.80,
        classificationReason: 'General errand / utility task with no room restriction',
        classificationSource: 'RULE_ENGINE',
        matchedEntities: [],
        routingRuleId: 'rule_fallback_general',
        requiresReview: false,
        outcome: 'AUTO_ASSIGNED'
      };
    }

    const unassignedRoom = roomMap.get('room_unassigned');
    return {
      roomId: unassignedRoom ? unassignedRoom.roomId : 'room_unassigned',
      roomName: unassignedRoom ? unassignedRoom.name : 'Unassigned',
      roomCategory: 'Needs Review',
      confidenceScore: 0.40,
      classificationReason: 'No reliable room destination identified. Please assign manually.',
      classificationSource: 'RULE_ENGINE',
      matchedEntities: [],
      routingRuleId: 'rule_unassigned',
      requiresReview: true,
      outcome: 'UNASSIGNED'
    };
  }

  _recordSessionContext(sessionId, assignment) {
    if (!sessionId) return;
    this._recentClassifications.set(sessionId, {
      ...assignment,
      timestamp: Date.now()
    });
  }

  _getSessionContext(sessionId) {
    if (!sessionId) return null;
    const ctx = this._recentClassifications.get(sessionId);
    if (!ctx) return null;
    // Expire context after 15 minutes
    if (Date.now() - ctx.timestamp > 15 * 60 * 1000) {
      this._recentClassifications.delete(sessionId);
      return null;
    }
    return ctx;
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const roomClassificationEngine = new RoomClassificationEngine();
