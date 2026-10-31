/**
 * ActionFlow Server — Room Management & Persistence Service
 *
 * Implements:
 * - Persistent Room storage (server/data/rooms_store.json)
 * - Persistent Room Routing Rules (server/data/room_rules_store.json)
 * - Default 13 canonical rooms with Hindi, Hinglish, and English entity dictionaries
 * - Organization isolation (multi-tenant support via organizationId)
 * - Room CRUD, ordering, category configuration, and active state management
 * - Audit logging and non-destructive soft-delete
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { auditLog } from './auditService.js';
import { broadcastToSession } from '../websocket/wsServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

function getRoomsStoreFile() {
  if (Boolean(process.env.VITEST)) {
    return path.join(DATA_DIR, 'rooms_store.test.json');
  }
  return path.join(DATA_DIR, 'rooms_store.json');
}

function getRulesStoreFile() {
  if (Boolean(process.env.VITEST)) {
    return path.join(DATA_DIR, 'room_rules_store.test.json');
  }
  return path.join(DATA_DIR, 'room_rules_store.json');
}

function getFeedbackStoreFile() {
  if (Boolean(process.env.VITEST)) {
    return path.join(DATA_DIR, 'room_feedback_store.test.json');
  }
  return path.join(DATA_DIR, 'room_feedback_store.json');
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ─── Default 13 Canonical Rooms ───────────────────────────────────────────────
export const DEFAULT_CANONICAL_ROOMS = Object.freeze([
  {
    roomId: 'room_kitchen',
    name: 'Kitchen',
    roomType: 'KITCHEN',
    description: 'Pantry, cooking, groceries, food items, utensils, and kitchen appliances',
    icon: 'Utensils',
    color: 'amber',
    categories: ['Shopping', 'Groceries', 'Inventory', 'Appliance Maintenance', 'Cleaning'],
    routingKeywords: [
      'kitchen', 'rasoi', 'pantry', 'fridge', 'refrigerator', 'bread', 'milk', 'doodh', 'dudh',
      'vegetables', 'sabzi', 'grocery', 'eggs', 'butter', 'atta', 'dal', 'chawal', 'rice', 'oil',
      'masala', 'stove', 'gas', 'burner', 'crockery', 'bartan', 'utensil', 'dishwasher', 'cookware',
      'oven', 'microwave', 'toaster', 'mixer', 'juicer', 'chai', 'tea', 'coffee'
    ],
    sortOrder: 1,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_reception',
    name: 'Reception',
    roomType: 'RECEPTION',
    description: 'Front desk, visitor entries, guest registers, reception area, and visitor management',
    icon: 'UserCheck',
    color: 'blue',
    categories: ['Visitor Management', 'Guest Coordination', 'Entry Register', 'Front Desk', 'Mail / Packages'],
    routingKeywords: [
      'reception', 'front desk', 'visitor register', 'entry register', 'visitor', 'guest', 'lobby',
      'guest register', 'sign-in', 'badge', 'security desk', 'gate pass', 'courier', 'parcel',
      'receptionist', 'waiting area', 'inward register', 'entry pass', 'swagat kaksh'
    ],
    sortOrder: 2,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_drawing_room',
    name: 'Drawing Room',
    roomType: 'DRAWING_ROOM',
    description: 'Formal guest lounge, formal seating, chandelier, decorative lighting, and main living hall',
    icon: 'Sofa',
    color: 'indigo',
    categories: ['Furniture', 'Lighting', 'Guest Hospitality', 'Living Space Maintenance'],
    routingKeywords: [
      'drawing room', 'drawingroom', 'baithak', 'guest room', 'formal hall', 'parlor', 'sitting room',
      'drawing room light', 'drawing room lights', 'drawing room fan', 'drawing room ac'
    ],
    sortOrder: 3,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_living_room',
    name: 'Living Room',
    roomType: 'LIVING_ROOM',
    description: 'Family hall, entertainment center, television, lounge, curtains, and central living area',
    icon: 'Tv',
    color: 'purple',
    categories: ['Entertainment', 'Lighting', 'HVAC', 'Curtains & Drapes', 'Daily Maintenance'],
    routingKeywords: [
      'living room', 'livingroom', 'hall', 'family hall', 'tv unit', 'television', 'sofa set',
      'center table', 'carpet', 'living area', 'hall light', 'living room lights'
    ],
    sortOrder: 4,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_bedroom',
    name: 'Bedroom',
    roomType: 'BEDROOM',
    description: 'Bedrooms, master bed, mattress, wardrobe, bedroom AC servicing, and nightstands',
    icon: 'Bed',
    color: 'rose',
    categories: ['AC Servicing', 'Furniture', 'Wardrobe', 'Bedding', 'Room Cleaning'],
    routingKeywords: [
      'bedroom', 'bed room', 'kamra', 'shayan kaksh', 'master bedroom', 'bed', 'mattress',
      'wardrobe', 'almirah', 'nightstand', 'bedroom ac', 'ac service', 'ac servicing', 'air conditioner',
      'blanket', 'bedsheet', 'pillow', 'dressing table'
    ],
    sortOrder: 5,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_bathroom',
    name: 'Bathroom',
    roomType: 'BATHROOM',
    description: 'Washrooms, plumbing, geyser, taps, shower, toiletries, and sanitation maintenance',
    icon: 'Droplet',
    color: 'cyan',
    categories: ['Plumbing', 'Geyser Maintenance', 'Sanitation', 'Toiletries', 'Deep Cleaning'],
    routingKeywords: [
      'bathroom', 'washroom', 'toilet', 'gusal khana', 'snan kaksh', 'geyser', 'tap', 'nal',
      'plumbing', 'shower', 'sink', 'commode', 'soap', 'shampoo', 'towel', 'drain', 'leakage',
      'flush', 'sanitary'
    ],
    sortOrder: 6,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_office',
    name: 'Office',
    roomType: 'OFFICE',
    description: 'Workstations, computers, paperwork, employee coordination, reports, and administrative tasks',
    icon: 'Briefcase',
    color: 'violet',
    categories: ['Employee Coordination', 'Documentation', 'Reports', 'IT & Equipment', 'Administration'],
    routingKeywords: [
      'office', 'karyalaya', 'cabin', 'cubicle', 'desk', 'workstation', 'laptop', 'computer',
      'printer', 'scanner', 'paper', 'stationery', 'files', 'dastavej', 'report', 'audit report',
      'presentation', 'excel', 'employee', 'staff', 'hr', 'timesheet', 'payroll'
    ],
    sortOrder: 7,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_meeting_room',
    name: 'Meeting Room',
    roomType: 'MEETING_ROOM',
    description: 'Conference room, board room, meeting schedules, projector, agenda, and client syncs',
    icon: 'Users',
    color: 'emerald',
    categories: ['Client Meetings', 'Team Standups', 'Board Meetings', 'AV Equipment', 'Agenda Preparation'],
    routingKeywords: [
      'meeting room', 'conference room', 'board room', 'war room', 'sync room', 'projector',
      'whiteboard', 'video conference', 'zoom room', 'meeting schedule', 'client meeting', 'team sync',
      'discussion room'
    ],
    sortOrder: 8,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_store_room',
    name: 'Store Room',
    roomType: 'STORE_ROOM',
    description: 'Inventory storage, tool shed, boxes, spare parts, archives, and extra supplies',
    icon: 'Archive',
    color: 'teal',
    categories: ['Inventory Audit', 'Tool Organization', 'Archive Storage', 'Spare Parts'],
    routingKeywords: [
      'store room', 'storeroom', 'godown', 'warehouse', 'storage', 'supplies', 'boxes',
      'spare parts', 'tools', 'kartan', 'extra material', 'inventory store', 'attic', 'basement store'
    ],
    sortOrder: 9,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_dining_room',
    name: 'Dining Room',
    roomType: 'DINING_ROOM',
    description: 'Dining area, dining table, chairs, table mats, cutlery, dinnerware, and meals',
    icon: 'Coffee',
    color: 'orange',
    categories: ['Table Setup', 'Cutlery', 'Dinner Arrangements', 'Dining Furniture'],
    routingKeywords: [
      'dining room', 'diningroom', 'dining table', 'dinner table', 'dining area', 'table mat',
      'cutlery', 'plates', 'spoons', 'table cloth', 'bhojan kaksh'
    ],
    sortOrder: 10,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_parking_area',
    name: 'Parking Area',
    roomType: 'PARKING_AREA',
    description: 'Vehicle parking, garage, cars, bikes, security gates, vehicle wash, and EV charging',
    icon: 'Car',
    color: 'slate',
    categories: ['Vehicle Maintenance', 'Security Gate', 'EV Charging', 'Slot Management', 'Cleaning'],
    routingKeywords: [
      'parking', 'parking area', 'garage', 'driveway', 'car', 'bike', 'scooter', 'vehicle',
      'gaadi', 'gaadi parking', 'gate', 'security gate', 'ev charger', 'car wash', 'tyre', 'tire'
    ],
    sortOrder: 11,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_general',
    name: 'General',
    roomType: 'GENERAL',
    description: 'Utility bills, government filings, taxes, banking, insurance, and universal non-room chores',
    icon: 'Layers',
    color: 'sky',
    categories: ['Bill Payments', 'Banking & Finance', 'General Errand', 'Compliance & Taxes', 'Universal'],
    routingKeywords: [
      'general', 'electricity bill', 'bijli ka bill', 'water bill', 'paani ka bill', 'wifi bill',
      'phone bill', 'tax', 'itr', 'gst', 'bank', 'cheque', 'insurance', 'policy', 'errand', 'payment'
    ],
    sortOrder: 12,
    isActive: true,
    isDefault: true
  },
  {
    roomId: 'room_unassigned',
    name: 'Unassigned',
    roomType: 'UNASSIGNED',
    description: 'Tasks needing human review or with no clear room destination detected',
    icon: 'HelpCircle',
    color: 'gray',
    categories: ['Needs Review', 'Triage'],
    routingKeywords: ['unassigned', 'unknown', 'triage'],
    sortOrder: 13,
    isActive: true,
    isDefault: true
  }
]);

// ─── In-memory Stores ─────────────────────────────────────────────────────────
const _roomsMap = new Map(); // id -> room
const _rulesMap = new Map(); // id -> rule
let _roomsLoaded = false;
let _rulesLoaded = false;

function loadRoomsFromDisk() {
  if (_roomsLoaded) return;
  _roomsLoaded = true;
  ensureDataDir();
  const file = getRoomsStoreFile();

  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.rooms) && data.rooms.length > 0) {
        for (const r of data.rooms) {
          if (r?.roomId) {
            _roomsMap.set(r.roomId, { ...r, id: r.roomId });
          }
        }
        return;
      }
    }
  } catch (err) {
    console.warn('[RoomManagementService] Could not load rooms_store.json:', err.message);
  }

  // Initialize with default canonical rooms if empty
  for (const def of DEFAULT_CANONICAL_ROOMS) {
    _roomsMap.set(def.roomId, {
      ...def,
      id: def.roomId,
      organizationId: 'org_default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  persistRoomsToDisk();
}

function persistRoomsToDisk() {
  try {
    ensureDataDir();
    const file = getRoomsStoreFile();
    const rooms = Array.from(_roomsMap.values());
    fs.writeFileSync(
      file,
      JSON.stringify({ updatedAt: new Date().toISOString(), count: rooms.length, rooms }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn('[RoomManagementService] Could not persist rooms_store.json:', err.message);
  }
}

function loadRulesFromDisk() {
  if (_rulesLoaded) return;
  _rulesLoaded = true;
  ensureDataDir();
  const file = getRulesStoreFile();

  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.rules)) {
        for (const rl of data.rules) {
          if (rl?.ruleId) {
            _rulesMap.set(rl.ruleId, rl);
          }
        }
        return;
      }
    }
  } catch (err) {
    console.warn('[RoomManagementService] Could not load room_rules_store.json:', err.message);
  }

  // Build default rules from canonical rooms
  for (const def of DEFAULT_CANONICAL_ROOMS) {
    const ruleId = `rule_${def.roomId}`;
    _rulesMap.set(ruleId, {
      ruleId,
      organizationId: 'org_default',
      roomId: def.roomId,
      roomName: def.name,
      keywords: def.routingKeywords,
      priority: def.roomId === 'room_unassigned' ? 10 : def.roomId === 'room_general' ? 20 : 50,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  persistRulesToDisk();
}

function persistRulesToDisk() {
  try {
    ensureDataDir();
    const file = getRulesStoreFile();
    const rules = Array.from(_rulesMap.values());
    fs.writeFileSync(
      file,
      JSON.stringify({ updatedAt: new Date().toISOString(), count: rules.length, rules }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn('[RoomManagementService] Could not persist room_rules_store.json:', err.message);
  }
}

// ─── Public Room API ──────────────────────────────────────────────────────────

/**
 * Lists rooms for a given organization (sorted by sortOrder)
 */
export function listRooms({ organizationId = 'org_default', includeInactive = false } = {}) {
  loadRoomsFromDisk();
  const rooms = Array.from(_roomsMap.values()).filter(r => {
    const matchOrg = !r.organizationId || r.organizationId === organizationId || r.organizationId === 'org_default';
    const matchActive = includeInactive ? true : r.isActive !== false;
    return matchOrg && matchActive;
  });

  return rooms.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
}

/**
 * Gets a room by ID
 */
export function getRoomById(roomId, { organizationId = 'org_default' } = {}) {
  loadRoomsFromDisk();
  if (!roomId) return null;
  const room = _roomsMap.get(roomId);
  if (!room) return null;
  if (room.organizationId && room.organizationId !== organizationId && room.organizationId !== 'org_default') {
    return null; // Tenant isolation
  }
  return room;
}

/**
 * Creates a new room
 */
export function createRoom(payload = {}, { organizationId = 'org_default' } = {}) {
  loadRoomsFromDisk();

  const name = String(payload.name || '').trim();
  if (!name) {
    throw new Error('Room name is required.');
  }

  // Derive unique ID
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const baseId = `room_${slug || Date.now()}`;
  let roomId = payload.roomId || baseId;
  let counter = 1;
  while (_roomsMap.has(roomId)) {
    roomId = `${baseId}_${counter++}`;
  }

  const sortOrder = Number(payload.sortOrder) || (_roomsMap.size + 1);
  const now = new Date().toISOString();

  const newRoom = {
    id: roomId,
    roomId,
    organizationId,
    name,
    roomType: payload.roomType || slug.toUpperCase() || 'CUSTOM',
    description: payload.description || '',
    icon: payload.icon || 'Folder',
    color: payload.color || 'blue',
    categories: Array.isArray(payload.categories) ? payload.categories : ['General'],
    routingKeywords: Array.isArray(payload.routingKeywords)
      ? payload.routingKeywords.map(k => String(k).toLowerCase().trim()).filter(Boolean)
      : [name.toLowerCase()],
    sortOrder,
    isActive: payload.isActive !== false,
    isDefault: false,
    createdAt: now,
    updatedAt: now
  };

  _roomsMap.set(roomId, newRoom);
  persistRoomsToDisk();

  // Also create a routing rule for this room
  const ruleId = `rule_${roomId}`;
  _rulesMap.set(ruleId, {
    ruleId,
    organizationId,
    roomId,
    roomName: name,
    keywords: newRoom.routingKeywords,
    priority: 60, // Custom user rules have high priority
    isActive: true,
    createdAt: now,
    updatedAt: now
  });
  persistRulesToDisk();

  auditLog({
    event: 'ROOM_CREATED',
    actionId: roomId,
    details: { name, organizationId, categories: newRoom.categories }
  }).catch(() => {});

  return newRoom;
}

/**
 * Updates an existing room
 */
export function updateRoom(roomId, updates = {}, { organizationId = 'org_default' } = {}) {
  loadRoomsFromDisk();
  const room = _roomsMap.get(roomId);
  if (!room) {
    throw new Error(`Room with ID "${roomId}" not found.`);
  }

  if (room.organizationId && room.organizationId !== organizationId && room.organizationId !== 'org_default') {
    throw new Error('Unauthorized room access.');
  }

  const updated = {
    ...room,
    name: updates.name ? String(updates.name).trim() : room.name,
    description: updates.description !== undefined ? updates.description : room.description,
    categories: Array.isArray(updates.categories) ? updates.categories : room.categories,
    routingKeywords: Array.isArray(updates.routingKeywords)
      ? updates.routingKeywords.map(k => String(k).toLowerCase().trim()).filter(Boolean)
      : room.routingKeywords,
    icon: updates.icon || room.icon,
    color: updates.color || room.color,
    sortOrder: updates.sortOrder !== undefined ? Number(updates.sortOrder) : room.sortOrder,
    isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : room.isActive,
    updatedAt: new Date().toISOString()
  };

  _roomsMap.set(roomId, updated);
  persistRoomsToDisk();

  // Synchronize routing rule keywords
  const ruleId = `rule_${roomId}`;
  if (_rulesMap.has(ruleId)) {
    const rl = _rulesMap.get(ruleId);
    _rulesMap.set(ruleId, {
      ...rl,
      roomName: updated.name,
      keywords: updated.routingKeywords,
      isActive: updated.isActive,
      updatedAt: new Date().toISOString()
    });
    persistRulesToDisk();
  }

  auditLog({
    event: 'ROOM_UPDATED',
    actionId: roomId,
    details: { name: updated.name, isActive: updated.isActive }
  }).catch(() => {});

  return updated;
}

/**
 * Deactivates or removes a room (soft-delete preserves historical task links)
 */
export function deleteRoom(roomId, { organizationId = 'org_default', hardDelete = false } = {}) {
  loadRoomsFromDisk();
  const room = _roomsMap.get(roomId);
  if (!room) {
    throw new Error(`Room with ID "${roomId}" not found.`);
  }

  if (room.isDefault && hardDelete) {
    // Default rooms can only be deactivated, never deleted from schema
    room.isActive = false;
    room.updatedAt = new Date().toISOString();
    _roomsMap.set(roomId, room);
    persistRoomsToDisk();
    return { success: true, deactivated: true, room };
  }

  if (hardDelete) {
    _roomsMap.delete(roomId);
    _rulesMap.delete(`rule_${roomId}`);
    persistRoomsToDisk();
    persistRulesToDisk();
  } else {
    room.isActive = false;
    room.updatedAt = new Date().toISOString();
    _roomsMap.set(roomId, room);
    persistRoomsToDisk();
  }

  auditLog({
    event: 'ROOM_DEACTIVATED',
    actionId: roomId,
    details: { hardDelete }
  }).catch(() => {});

  return { success: true, deactivated: true, roomId };
}

/**
 * Reorders rooms
 */
export function reorderRooms(orderedRoomIds = [], { organizationId = 'org_default' } = {}) {
  loadRoomsFromDisk();
  orderedRoomIds.forEach((id, idx) => {
    const r = _roomsMap.get(id);
    if (r) {
      r.sortOrder = idx + 1;
      r.updatedAt = new Date().toISOString();
      _roomsMap.set(id, r);
    }
  });
  persistRoomsToDisk();
  return listRooms({ organizationId, includeInactive: true });
}

// ─── Routing Rules API ────────────────────────────────────────────────────────

export function listRoomRules({ organizationId = 'org_default' } = {}) {
  loadRulesFromDisk();
  return Array.from(_rulesMap.values()).filter(r => {
    return !r.organizationId || r.organizationId === organizationId || r.organizationId === 'org_default';
  });
}

export function saveRoomRule(rulePayload = {}, { organizationId = 'org_default' } = {}) {
  loadRulesFromDisk();
  const ruleId = rulePayload.ruleId || `rule_custom_${Date.now()}`;
  const now = new Date().toISOString();

  const rule = {
    ruleId,
    organizationId,
    roomId: rulePayload.roomId,
    roomName: rulePayload.roomName || 'Custom Room',
    keywords: Array.isArray(rulePayload.keywords) ? rulePayload.keywords : [],
    priority: Number(rulePayload.priority) || 50,
    isActive: rulePayload.isActive !== false,
    createdAt: rulePayload.createdAt || now,
    updatedAt: now
  };

  _rulesMap.set(ruleId, rule);
  persistRulesToDisk();
  return rule;
}

// ─── User Correction Feedback Storage ─────────────────────────────────────────

export function recordRoomCorrectionFeedback({
  taskId,
  taskTitle,
  originalRoomId,
  correctedRoomId,
  transcript,
  reason,
  sessionId = 'default_session',
  organizationId = 'org_default'
}) {
  ensureDataDir();
  const file = getFeedbackStoreFile();
  let feedbacks = [];

  try {
    if (fs.existsSync(file)) {
      feedbacks = JSON.parse(fs.readFileSync(file, 'utf8')).feedbacks || [];
    }
  } catch {}

  const entry = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    taskId,
    taskTitle,
    originalRoomId,
    correctedRoomId,
    transcript: transcript || '',
    reason: reason || 'User manual reassignment',
    sessionId,
    organizationId,
    timestamp: new Date().toISOString()
  };

  feedbacks.unshift(entry);
  if (feedbacks.length > 500) feedbacks.pop();

  try {
    fs.writeFileSync(file, JSON.stringify({ updatedAt: new Date().toISOString(), feedbacks }, null, 2), 'utf8');
  } catch (err) {
    console.warn('[RoomManagementService] Could not persist feedback:', err.message);
  }

  auditLog({
    event: 'TASK_ROOM_REASSIGNED',
    actionId: taskId,
    sessionId,
    details: { originalRoomId, correctedRoomId, taskTitle }
  }).catch(() => {});

  return entry;
}

export function getRoomFeedbackHistory({ organizationId = 'org_default' } = {}) {
  ensureDataDir();
  const file = getFeedbackStoreFile();
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return data.feedbacks || [];
    }
  } catch {}
  return [];
}

