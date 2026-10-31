/**
 * ActionFlow Client — Intelligent Room Classification (Client-Side Mirror)
 *
 * Provides deterministic room classification for offline / fast-path UI rendering:
 * - 13 Canonical Room categories
 * - Explicit room references (HIGHEST PRIORITY)
 * - Multi-lingual Hindi, Hinglish, English patterns
 * - Semantic object & entity mapping
 */

const EXPLICIT_ROOM_PATTERNS = [
  { roomId: 'room_kitchen', name: 'Kitchen', regex: /\b(?:kitchen|rasoi|pantry)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:kitchen|rasoi|pantry))\b/i },
  { roomId: 'room_reception', name: 'Reception', regex: /\b(?:reception|front\s*desk|swagat\s*kaksh)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:at|on|in)\s+(?:the\s+)?(?:reception|front\s*desk)\b/i },
  { roomId: 'room_drawing_room', name: 'Drawing Room', regex: /\b(?:drawing\s*room|drawingroom|baithak|parlor)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:drawing\s*room|baithak))\b/i },
  { roomId: 'room_living_room', name: 'Living Room', regex: /\b(?:living\s*room|livingroom|family\s*hall|hall)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:living\s*room|family\s*hall))\b/i },
  { roomId: 'room_bedroom', name: 'Bedroom', regex: /\b(?:bedroom|bed\s*room|shayan\s*kaksh|master\s*bedroom)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:bedroom|bed\s*room))\b/i },
  { roomId: 'room_bathroom', name: 'Bathroom', regex: /\b(?:bathroom|bath\s*room|washroom|toilet|snan\s*kaksh|gusal\s*khana)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:bathroom|washroom|toilet))\b/i },
  { roomId: 'room_office', name: 'Office', regex: /\b(?:office|karyalaya|cabin|workstation|desk)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:office|cabin|karyalaya))\b/i },
  { roomId: 'room_meeting_room', name: 'Meeting Room', regex: /\b(?:meeting\s*room|conference\s*room|board\s*room|war\s*room)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:meeting\s*room|conference\s*room|board\s*room))\b/i },
  { roomId: 'room_store_room', name: 'Store Room', regex: /\b(?:store\s*room|storeroom|godown|warehouse|attic)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:store\s*room|storeroom|godown))\b/i },
  { roomId: 'room_dining_room', name: 'Dining Room', regex: /\b(?:dining\s*room|diningroom|dining\s*area|bhojan\s*kaksh)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:dining\s*room|dining\s*area))\b/i },
  { roomId: 'room_parking_area', name: 'Parking Area', regex: /\b(?:parking\s*area|parking|garage|driveway|gaadi\s*parking)\b(?:\s+(?:mein|me|par|se|ka|ki|ke|inside|area))?|\b(?:in\s+(?:the\s+)?(?:parking|garage|driveway))\b/i },
  { roomId: 'room_general', name: 'General', regex: /\b(?:general|utility|bank|bill\s+payment|taxes|itr|gst)\b/i }
];

const SEMANTIC_OBJECTS = [
  { entities: ['bread', 'milk', 'doodh', 'dudh', 'vegetables', 'sabzi', 'grocery', 'atta', 'dal', 'chawal', 'rice', 'oil', 'masala', 'stove', 'gas cylinder', 'crockery', 'bartan', 'utensil', 'dishwasher', 'cookware', 'microwave', 'toaster', 'mixer', 'juicer', 'chai', 'coffee', 'fridge repair'], roomId: 'room_kitchen', name: 'Kitchen', category: 'Shopping', confidence: 0.92 },
  { entities: ['visitor register', 'entry register', 'visitor entry', 'guest register', 'sign-in sheet', 'gate pass', 'visitor badge', 'front desk', 'inward register'], roomId: 'room_reception', name: 'Reception', category: 'Visitor Management', confidence: 0.94 },
  { entities: ['bed', 'mattress', 'almirah', 'wardrobe', 'bedsheet', 'pillow', 'blanket', 'nightstand', 'dressing table', 'ac service', 'ac servicing', 'air conditioner service'], roomId: 'room_bedroom', name: 'Bedroom', category: 'AC Servicing', confidence: 0.88 },
  { entities: ['geyser', 'tap', 'nal', 'shower', 'sink', 'commode', 'flush', 'plumbing', 'toilet paper', 'towel', 'soap', 'shampoo', 'drain', 'bathroom leakage'], roomId: 'room_bathroom', name: 'Bathroom', category: 'Plumbing', confidence: 0.93 },
  { entities: ['presentation', 'audit report', 'sales report', 'laptop', 'printer', 'scanner', 'stationery', 'payroll', 'timesheet', 'staff coordination', 'employee meeting'], roomId: 'room_office', name: 'Office', category: 'Documentation', confidence: 0.89 },
  { entities: ['projector', 'whiteboard', 'video conference', 'zoom room', 'client presentation', 'board meeting', 'standup call'], roomId: 'room_meeting_room', name: 'Meeting Room', category: 'Client Meetings', confidence: 0.90 },
  { entities: ['spare parts', 'storage boxes', 'cartons', 'extra inventory', 'old files', 'archive boxes', 'tools shed', 'godown'], roomId: 'room_store_room', name: 'Store Room', category: 'Inventory Audit', confidence: 0.89 },
  { entities: ['dining table', 'table mat', 'cutlery', 'plates and spoons', 'dinner table', 'dinnerware'], roomId: 'room_dining_room', name: 'Dining Room', category: 'Table Setup', confidence: 0.91 },
  { entities: ['car wash', 'bike wash', 'ev charger', 'tyre puncture', 'tire air', 'garage gate', 'security gate', 'parking slot'], roomId: 'room_parking_area', name: 'Parking Area', category: 'Vehicle Maintenance', confidence: 0.92 },
  { entities: ['electricity bill', 'bijli ka bill', 'water bill', 'paani ka bill', 'wifi bill', 'broadband bill', 'income tax', 'itr', 'gst filing', 'bank deposit', 'cheque clearing', 'insurance premium', 'policy renewal'], roomId: 'room_general', name: 'General', category: 'Bill Payments', confidence: 0.93 }
];

export function classifyRoomDeterministic(text = '', destination = '') {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();

  // 1. Explicit mention (Priority 1)
  for (const pat of EXPLICIT_ROOM_PATTERNS) {
    if (pat.regex.test(raw)) {
      return {
        roomId: pat.roomId,
        roomName: pat.name,
        roomCategory: 'General',
        confidenceScore: 0.98,
        classificationReason: `Explicitly directed to ${pat.name}`,
        classificationSource: 'EXPLICIT_MENTION',
        requiresReview: false,
        outcome: 'AUTO_ASSIGNED'
      };
    }
  }

  // 2. Semantic object mapping
  for (const sem of SEMANTIC_OBJECTS) {
    for (const ent of sem.entities) {
      if (lower.includes(ent)) {
        return {
          roomId: sem.roomId,
          roomName: sem.name,
          roomCategory: sem.category,
          confidenceScore: sem.confidence,
          classificationReason: `Identified ${ent} entity`,
          classificationSource: 'SEMANTIC_AI',
          requiresReview: false,
          outcome: 'AUTO_ASSIGNED'
        };
      }
    }
  }

  // 3. Destination fallback
  if (destination === 'SHOPPING_LIST') {
    return {
      roomId: 'room_kitchen',
      roomName: 'Kitchen',
      roomCategory: 'Shopping',
      confidenceScore: 0.85,
      classificationReason: 'Shopping action mapped to Kitchen',
      classificationSource: 'RULE_ENGINE',
      requiresReview: false,
      outcome: 'AUTO_ASSIGNED'
    };
  }

  if (destination === 'GOOGLE_CALENDAR') {
    return {
      roomId: 'room_office',
      roomName: 'Office',
      roomCategory: 'Client Meetings',
      confidenceScore: 0.82,
      classificationReason: 'Calendar action mapped to Office',
      classificationSource: 'RULE_ENGINE',
      requiresReview: false,
      outcome: 'AUTO_ASSIGNED'
    };
  }

  return {
    roomId: 'room_unassigned',
    roomName: 'Unassigned',
    roomCategory: 'Needs Review',
    confidenceScore: 0.40,
    classificationReason: 'No specific room detected',
    classificationSource: 'RULE_ENGINE',
    requiresReview: true,
    outcome: 'UNASSIGNED'
  };
}
