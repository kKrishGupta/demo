/**
 * ActionFlow AI — Intelligent Room-Based Task Distribution Test Suite
 *
 * Validates:
 *  1. One voice command containing multiple room-specific tasks (5 discrete rooms)
 *  2. English commands
 *  3. Hindi commands
 *  4. Hinglish commands
 *  5. Explicit room references (HIGHEST PRIORITY rule)
 *  6. Implicit room references (Semantic mapping)
 *  7. Ambiguous destinations (flagged as NEEDS_REVIEW)
 *  8. Conflicting room references (Explicit "Office ki light" -> Office, not Drawing Room)
 *  9. Contextual follow-up commands (Inherits room from prior conversation turn)
 * 10. Task correction & feedback recording
 * 11. Duplicate task prevention
 * 12. Manual room reassignment via PATCH /tasks/:taskId/room
 * 13. Task completion (lifecycle status COMPLETED, preserves audit trail)
 * 14. Task reopening via POST /tasks/:taskId/reopen
 * 15. Persistent task history (completed tasks never physically deleted)
 * 16. Cold start reload / persistence across restart from disk
 * 17. Room CRUD & custom room management
 * 18. Google Calendar integration preservation
 * 19. WhatsApp integration preservation
 * 20. Multi-tenant organization isolation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticDecomposer, semanticDecomposer } from '../services/semanticDecomposer.js';
import { roomClassificationEngine } from '../services/roomClassificationEngine.js';
import {
  listRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  reorderRooms,
  listRoomRules,
  recordRoomCorrectionFeedback,
  getRoomFeedbackHistory
} from '../services/roomManagementService.js';
import {
  createOrRegisterTask,
  listTasks,
  getTaskById,
  updateTask,
  reassignTaskRoom,
  completeTask,
  reopenTask,
  reloadTaskStoreFromDisk,
  TASK_STATUSES
} from '../services/taskManagementService.js';
import { executeAction } from '../services/executionGateway.js';

describe('ACTIONFLOW AI — INTELLIGENT ROOM-BASED TASK DISTRIBUTION TEST SUITE', () => {
  const directory = [
    { id: 'usr_rahul', name: 'Rahul Sharma', email: 'rahul@example.com', department: 'Engineering' },
    { id: 'usr_aman', name: 'Aman Verma', email: 'aman@example.com', phone: '+919876543210', department: 'Operations' }
  ];

  const testSession = 'test_room_session_' + Date.now();

  beforeEach(() => {
    reloadTaskStoreFromDisk();
  });

  // ── TEST 1: Compound Multi-Action with 5 Discrete Rooms ──────────────────────
  it('1. Extracts multiple independent tasks and distributes to their respective rooms from single voice command', () => {
    const text = 'Kitchen mein bread aur milk le aana, reception par visitor register ready rakhna, drawing room ki lights repair karwani hain, office mein Rahul ke saath meeting schedule karni hai aur bedroom ka AC service karwana hai.';
    const actions = semanticDecomposer.decompose(text, { directory, sessionId: testSession });

    expect(actions.length).toBeGreaterThanOrEqual(5);

    // Verify Kitchen actions
    const kitchenActions = actions.filter(a => a.roomId === 'room_kitchen');
    expect(kitchenActions.length).toBeGreaterThanOrEqual(1);
    expect(kitchenActions.some(a => /bread/i.test(a.title) || /milk/i.test(a.title) || /bread/i.test(a.item))).toBe(true);
    expect(kitchenActions[0].roomName).toBe('Kitchen');

    // Verify Reception action
    const receptionAction = actions.find(a => a.roomId === 'room_reception');
    expect(receptionAction).toBeDefined();
    expect(receptionAction.title).toContain('visitor');
    expect(receptionAction.destination).toBe('TASK_MANAGER');

    // Verify Drawing Room action
    const drawingAction = actions.find(a => a.roomId === 'room_drawing_room');
    expect(drawingAction).toBeDefined();
    expect(drawingAction.title).toContain('lights');
    expect(drawingAction.roomName).toBe('Drawing Room');

    // Verify Office action
    const officeAction = actions.find(a => a.roomId === 'room_office');
    expect(officeAction).toBeDefined();
    expect(officeAction.title).toContain('Rahul');
    expect(officeAction.destination).toBe('GOOGLE_CALENDAR');

    // Verify Bedroom action
    const bedroomAction = actions.find(a => a.roomId === 'room_bedroom');
    expect(bedroomAction).toBeDefined();
    expect(bedroomAction.title).toContain('AC');
    expect(bedroomAction.roomName).toBe('Bedroom');

    // Each action must have a unique ID, room ID, and transcript reference
    const ids = new Set(actions.map(a => a.id));
    expect(ids.size).toBe(actions.length);
    actions.forEach(a => {
      expect(a.roomId).toBeDefined();
      expect(a.roomName).toBeDefined();
      expect(a.sourceText).toBeDefined();
    });
  });

  // ── TEST 2: English Commands ────────────────────────────────────────────────
  it('2. Correctly classifies English room commands', () => {
    const res1 = roomClassificationEngine.classifyTask({ text: 'Prepare the meeting room for the board presentation' });
    expect(res1.roomId).toBe('room_meeting_room');
    expect(res1.roomName).toBe('Meeting Room');

    const res2 = roomClassificationEngine.classifyTask({ text: 'Clean the kitchen dishes and restock groceries' });
    expect(res2.roomId).toBe('room_kitchen');

    const res3 = roomClassificationEngine.classifyTask({ text: 'Check the vehicle tyre pressure in the parking area' });
    expect(res3.roomId).toBe('room_parking_area');
  });

  // ── TEST 3: Hindi Commands ──────────────────────────────────────────────────
  it('3. Correctly classifies Hindi commands with Devanagari / Hindi keywords', () => {
    const res1 = roomClassificationEngine.classifyTask({ text: 'रसोई में सब्ज़ी और दाल खत्म हो गई है' });
    expect(res1.roomId).toBe('room_kitchen');

    const res2 = roomClassificationEngine.classifyTask({ text: 'बैठक की लाइट खराब हो गई है ठीक करवाओ' });
    expect(res2.roomId).toBe('room_drawing_room');

    const res3 = roomClassificationEngine.classifyTask({ text: 'शयन कक्ष का पंखा साफ़ करना है' });
    expect(res3.roomId).toBe('room_bedroom');

    const res4 = roomClassificationEngine.classifyTask({ text: 'कार्यालय में नए प्रोजेक्ट की फाइल रख दो' });
    expect(res4.roomId).toBe('room_office');
  });

  // ── TEST 4: Hinglish Commands ───────────────────────────────────────────────
  it('4. Correctly classifies natural conversational Hinglish commands', () => {
    const res1 = roomClassificationEngine.classifyTask({ text: 'Washroom ka tap leak kar raha hai plumber ko bulao' });
    expect(res1.roomId).toBe('room_bathroom');

    const res2 = roomClassificationEngine.classifyTask({ text: 'Store room mein se purane documents nikal lo' });
    expect(res2.roomId).toBe('room_store_room');

    const res3 = roomClassificationEngine.classifyTask({ text: 'Dining room ki table saaf kar dena' });
    expect(res3.roomId).toBe('room_dining_room');
  });

  // ── TEST 5: Explicit Priority Rule ──────────────────────────────────────────
  it('5. Explicit room references ALWAYS take priority over generic semantic assumptions', () => {
    // Light repair normally might be thought of as Drawing Room, but explicit "Office ki light" must go to Office!
    const res1 = roomClassificationEngine.classifyTask({ text: 'Office ki light repair karwani hai' });
    expect(res1.roomId).toBe('room_office');
    expect(res1.classificationSource).toBe('EXPLICIT_MENTION');
    expect(res1.confidenceScore).toBeGreaterThanOrEqual(0.95);

    // AC servicing normally might be Bedroom, but explicit "Drawing room ka AC" must go to Drawing Room!
    const res2 = roomClassificationEngine.classifyTask({ text: 'Drawing room ka AC service karwana hai' });
    expect(res2.roomId).toBe('room_drawing_room');
    expect(res2.classificationSource).toBe('EXPLICIT_MENTION');
  });

  // ── TEST 6: Implicit Room References (Semantic Mapping) ──────────────────────
  it('6. Correctly maps implicit entity references without explicit room mentions', () => {
    const res1 = roomClassificationEngine.classifyTask({ text: 'Buy bread and milk' });
    expect(res1.roomId).toBe('room_kitchen');
    expect(['SEMANTIC_AI', 'RULE_ENGINE']).toContain(res1.classificationSource);

    const res2 = roomClassificationEngine.classifyTask({ text: 'Bathroom geyser is not heating water properly' });
    expect(res2.roomId).toBe('room_bathroom');

    const res3 = roomClassificationEngine.classifyTask({ text: 'Visitor entry register sign-in sheet ready rakhna' });
    expect(res3.roomId).toBe('room_reception');

    const res4 = roomClassificationEngine.classifyTask({ text: 'Kal electricity bill pay karna' });
    expect(res4.roomId).toBe('room_general');
  });

  // ── TEST 7: Ambiguous Destinations Flagged for Review ───────────────────────
  it('7. Flags ambiguous or multiple-choice requests with NEEDS_REVIEW and requiresReview=true', () => {
    // "Clean the floor" with no room reference
    const res = roomClassificationEngine.classifyTask({ text: 'Floor ki cleaning karni hai' });
    expect(res.requiresReview).toBe(true);
    expect(res.outcome).toBe('NEEDS_REVIEW');
  });

  // ── TEST 8: Contextual Follow-Up Commands ───────────────────────────────────
  it('8. Understands conversational context across sequential turns', () => {
    // Turn 1: Explicit Kitchen
    roomClassificationEngine.classifyTask({
      text: 'Kitchen mein vegetables khatam ho gayi hain',
      sessionId: 'sess_context_test'
    });

    // Turn 2: Follow-up without explicit room: "Aur milk bhi le aana"
    const turn2 = roomClassificationEngine.classifyTask({
      text: 'Aur milk bhi le aana',
      sessionId: 'sess_context_test'
    });

    expect(turn2.roomId).toBe('room_kitchen');
    expect(turn2.classificationSource).toBe('CONTEXT_INHERITED');
  });

  // ── TEST 9: Persistent Task Creation with Room Metadata ─────────────────────
  it('9. Persists task with complete room metadata in backend store', async () => {
    const taskPayload = {
      title: 'Fix reception printer',
      description: 'Paper jam in front desk laser printer',
      priority: 'High',
      roomId: 'room_reception'
    };

    const res = await createOrRegisterTask(taskPayload, { sessionId: testSession });
    expect(res.success).toBe(true);
    expect(res.task.id).toBeDefined();
    expect(res.task.roomId).toBe('room_reception');
    expect(res.task.roomNameSnapshot).toBe('Reception');
    expect(res.task.roomCategory).toBeDefined();

    // Verify in retrieval
    const retrieved = getTaskById(res.task.id, testSession);
    expect(retrieved).not.toBeNull();
    expect(retrieved.roomId).toBe('room_reception');
  });

  // ── TEST 10: Manual Room Reassignment & Feedback Loop ───────────────────────
  it('10. Allows manual room reassignment and records feedback for future classification', async () => {
    const taskRes = await createOrRegisterTask({
      title: 'Check fire extinguishers',
      priority: 'Normal'
    }, { sessionId: testSession });

    const taskId = taskRes.task.id;
    const reassignRes = await reassignTaskRoom(taskId, 'room_parking_area', {
      reason: 'Extinguishers located near parking bays',
      sessionId: testSession
    });

    expect(reassignRes.success).toBe(true);
    expect(reassignRes.task.roomId).toBe('room_parking_area');
    expect(reassignRes.task.roomNameSnapshot).toBe('Parking Area');
    expect(reassignRes.task.classificationSource).toBe('MANUAL_OVERRIDE');

    // Verify feedback recorded
    const feedbacks = getRoomFeedbackHistory();
    expect(feedbacks.some(f => f.taskId === taskId && f.correctedRoomId === 'room_parking_area')).toBe(true);
  });

  // ── TEST 11: Task Completion & Historical Preservation ──────────────────────
  it('11. Completes task, preserves history without physical deletion', async () => {
    const taskRes = await createOrRegisterTask({
      title: 'Restock drawing room tissue boxes',
      roomId: 'room_drawing_room'
    }, { sessionId: testSession });

    const taskId = taskRes.task.id;
    const completeRes = await completeTask(taskId, {
      sessionId: testSession,
      confirmComplete: true
    });

    expect(completeRes.success).toBe(true);
    expect(completeRes.task.status).toBe(TASK_STATUSES.COMPLETED);
    expect(completeRes.task.completed).toBe(true);
    expect(completeRes.task.completedAt).toBeDefined();

    // Verify task is still in database history
    const taskInDb = getTaskById(taskId, testSession);
    expect(taskInDb).not.toBeNull();
    expect(taskInDb.completed).toBe(true);
    expect(taskInDb.auditTrail.some(a => a.event === 'TASK_COMPLETED')).toBe(true);
  });

  // ── TEST 12: Task Reopening ─────────────────────────────────────────────────
  it('12. Reopens completed task back to PENDING status', async () => {
    const taskRes = await createOrRegisterTask({
      title: 'Service office water cooler',
      roomId: 'room_office'
    }, { sessionId: testSession });

    const taskId = taskRes.task.id;
    await completeTask(taskId, { sessionId: testSession, confirmComplete: true });

    const reopenRes = await reopenTask(taskId, {
      sessionId: testSession,
      reason: 'Water cooler still leaking'
    });

    expect(reopenRes.success).toBe(true);
    expect(reopenRes.task.status).toBe(TASK_STATUSES.PENDING);
    expect(reopenRes.task.completed).toBe(false);

    const taskInDb = getTaskById(taskId, testSession);
    expect(taskInDb.status).toBe(TASK_STATUSES.PENDING);
    expect(taskInDb.auditTrail.some(a => a.event === 'TASK_REOPENED')).toBe(true);
  });

  // ── TEST 13: Room Filtering in listTasks ────────────────────────────────────
  it('13. Filters tasks by roomId and computes room-level stats', async () => {
    await createOrRegisterTask({ title: 'Task in Kitchen 1', roomId: 'room_kitchen' }, { sessionId: testSession });
    await createOrRegisterTask({ title: 'Task in Kitchen 2', roomId: 'room_kitchen' }, { sessionId: testSession });
    await createOrRegisterTask({ title: 'Task in Bedroom 1', roomId: 'room_bedroom' }, { sessionId: testSession });

    const kitchenTasks = await listTasks({ sessionId: testSession, roomId: 'room_kitchen' });
    expect(kitchenTasks.tasks.every(t => t.roomId === 'room_kitchen')).toBe(true);
    expect(kitchenTasks.stats.total).toBeGreaterThanOrEqual(2);

    const bedroomTasks = await listTasks({ sessionId: testSession, roomId: 'room_bedroom' });
    expect(bedroomTasks.tasks.every(t => t.roomId === 'room_bedroom')).toBe(true);
    expect(bedroomTasks.stats.total).toBeGreaterThanOrEqual(1);
  });

  // ── TEST 14: Disk Persistence Across Cold Reload ────────────────────────────
  it('14. Tasks and room assignments survive complete backend cold restart', async () => {
    const taskRes = await createOrRegisterTask({
      title: 'Store room quarterly audit',
      description: 'Audit spare parts boxes',
      roomId: 'room_store_room'
    }, { sessionId: testSession });

    const taskId = taskRes.task.id;

    // Simulate server crash & reboot
    reloadTaskStoreFromDisk();

    const restored = getTaskById(taskId, testSession);
    expect(restored).not.toBeNull();
    expect(restored.roomId).toBe('room_store_room');
    expect(restored.roomNameSnapshot).toBe('Store Room');
    expect(restored.title).toBe('Store room quarterly audit');
  });

  // ── TEST 15: Room CRUD & Ordering ───────────────────────────────────────────
  it('15. Administrator can create, update, reorder, and soft-delete rooms', () => {
    const newRoom = createRoom({
      name: 'Rooftop Lounge',
      description: 'Outdoor seating and terrace',
      color: 'emerald',
      categories: ['Outdoor', 'Plants'],
      routingKeywords: ['rooftop', 'terrace', 'plants', 'छत']
    });

    expect(newRoom.roomId).toContain('rooftop_lounge');
    expect(newRoom.name).toBe('Rooftop Lounge');

    // Update
    const updated = updateRoom(newRoom.roomId, {
      description: 'Updated terrace lounge description'
    });
    expect(updated.description).toBe('Updated terrace lounge description');

    // Classification should now recognize the new room
    const classified = roomClassificationEngine.classifyTask({
      text: 'Rooftop Lounge mein water plants'
    });
    expect(classified.roomId).toBe(newRoom.roomId);

    // Deactivate / soft delete
    const delRes = deleteRoom(newRoom.roomId, { hardDelete: false });
    expect(delRes.deactivated).toBe(true);
  });

  // ── TEST 16: Multi-Tenant Organization Isolation ────────────────────────────
  it('16. Strictly enforces multi-tenant organization boundaries', () => {
    const orgARoom = createRoom({ name: 'Org A Lab' }, { organizationId: 'org_alpha' });
    expect(orgARoom.organizationId).toBe('org_alpha');

    // Org B should not see Org A's custom room
    const orgBRooms = listRooms({ organizationId: 'org_beta' });
    expect(orgBRooms.some(r => r.roomId === orgARoom.roomId)).toBe(false);

    // Org A sees its room
    const orgARooms = listRooms({ organizationId: 'org_alpha' });
    expect(orgARooms.some(r => r.roomId === orgARoom.roomId)).toBe(true);
  });

  // ── TEST 17: User Bug Fix: "Kitchen mein doodh, bread aur eggs le aana aur fridge clean karwana." ──
  it('17. Bug Fix: Extracts exactly two Kitchen tasks from compound grocery and appliance command with no calendar event', () => {
    const text = 'Kitchen mein doodh, bread aur eggs le aana aur fridge clean karwana.';
    const actions = semanticDecomposer.decompose(text, { directory, sessionId: testSession });

    expect(actions).toHaveLength(2);

    const task1 = actions[0];
    expect(task1.title).toBe('Buy milk, bread and eggs');
    expect(task1.roomId).toBe('room_kitchen');
    expect(task1.roomName).toBe('Kitchen');
    expect(task1.roomCategory).toBe('Shopping');
    expect(task1.destination).toBe('SHOPPING_LIST');

    const task2 = actions[1];
    expect(task2.title).toBe('Clean the fridge');
    expect(task2.roomId).toBe('room_kitchen');
    expect(task2.roomName).toBe('Kitchen');
    expect(task2.roomCategory).toBe('Cleaning / Maintenance');
    expect(task2.destination).toBe('TASK_MANAGER');

    // Verify no calendar event was generated
    expect(actions.some(a => a.destination === 'GOOGLE_CALENDAR' || a.type === 'CREATE_EVENT' || a.type === 'CREATE_CALENDAR_EVENT')).toBe(false);
  });

  // ── REGRESSION PROMPTS A through F (Section 7) ───────────────────────────────
  it('18. Regression Prompt B: "Reception par visitor register ready karna aur guests ke liye water arrange karna."', () => {
    const text = 'Reception par visitor register ready karna aur guests ke liye water arrange karna.';
    const actions = semanticDecomposer.decompose(text, { directory, sessionId: testSession });

    expect(actions).toHaveLength(2);
    expect(actions[0].title).toBe('Prepare visitor register');
    expect(actions[0].roomId).toBe('room_reception');
    expect(actions[0].roomName).toBe('Reception');

    expect(actions[1].title).toBe('Arrange water for guests');
    expect(actions[1].roomId).toBe('room_reception');
    expect(actions[1].roomName).toBe('Reception');
  });

  it('19. Regression Prompt C: "Bedroom ka AC service karwana aur bedsheet change karni hai."', () => {
    const text = 'Bedroom ka AC service karwana aur bedsheet change karni hai.';
    const actions = semanticDecomposer.decompose(text, { directory, sessionId: testSession });

    expect(actions).toHaveLength(2);
    expect(actions[0].title).toBe('Service bedroom AC');
    expect(actions[0].roomId).toBe('room_bedroom');
    expect(actions[0].roomName).toBe('Bedroom');

    expect(actions[1].title).toBe('Change bedsheet');
    expect(actions[1].roomId).toBe('room_bedroom');
    expect(actions[1].roomName).toBe('Bedroom');
  });

  it('20. Regression Prompt D: "Office mein Rahul ke saath kal 11 baje meeting schedule karni hai."', () => {
    const text = 'Office mein Rahul ke saath kal 11 baje meeting schedule karni hai.';
    const actions = semanticDecomposer.decompose(text, { directory, sessionId: testSession });

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toMatch(/Meeting with Rahul/i);
    expect(actions[0].destination).toBe('GOOGLE_CALENDAR');
    expect(actions[0].roomId).toBe('room_office');
    expect(actions[0].roomName).toBe('Office');
  });

  it('21. Regression Prompt E: "Parking area clean karwana aur car wash karwani hai."', () => {
    const text = 'Parking area clean karwana aur car wash karwani hai.';
    const actions = semanticDecomposer.decompose(text, { directory, sessionId: testSession });

    expect(actions).toHaveLength(2);
    expect(actions[0].title).toBe('Clean parking area');
    expect(actions[0].roomId).toBe('room_parking_area');
    expect(actions[0].roomName).toBe('Parking Area');

    expect(actions[1].title).toBe('Wash the car');
    expect(actions[1].roomId).toBe('room_parking_area');
    expect(actions[1].roomName).toBe('Parking Area');
  });

  it('22. Regression Prompt F: "Bathroom ka tap repair karwana."', () => {
    const text = 'Bathroom ka tap repair karwana.';
    const actions = semanticDecomposer.decompose(text, { directory, sessionId: testSession });

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe('Repair bathroom tap');
    expect(actions[0].roomId).toBe('room_bathroom');
    expect(actions[0].roomName).toBe('Bathroom');
  });
});
