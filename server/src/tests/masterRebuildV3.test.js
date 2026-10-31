import { describe, it, expect } from 'vitest';
import { SemanticDecomposer, semanticDecomposer } from '../services/semanticDecomposer.js';
import { executeAction } from '../services/executionGateway.js';

describe('ACTIONFLOW AI — MASTER INTELLIGENCE REBUILD V3 (All 10 Core Test Cases)', () => {
  const directory = [
    { id: 'usr_rahul', name: 'Rahul Sharma', email: 'rahul@example.com', department: 'Engineering' },
    { id: 'usr_aman', name: 'Aman Verma', email: 'aman@example.com', phone: '+919876543210', department: 'Operations' },
    { id: 'usr_priya', name: 'Priya Singh', email: 'priya@example.com', department: 'Marketing' }
  ];

  // ── TEST 1: Part 1 Exact Bug & Expected Output ──────────────────────────────
  it('Test Case 1: Decomposes into 4 discrete actions (Calendar, WhatsApp, Bread, Milk)', () => {
    const text = 'Kal Rahul ke saath 10 baje meeting fix kar do, Aman ko WhatsApp kar dena ki production report bhej de, aur bread aur milk laana hai.';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(4);

    // Action 1: Google Calendar Meeting
    const act1 = actions[0];
    expect(['CREATE_EVENT', 'CREATE_CALENDAR_EVENT']).toContain(act1.type);
    expect(act1.destination).toBe('GOOGLE_CALENDAR');
    expect(act1.title).toBe('Meeting with Rahul Sharma');
    expect(act1.attendee?.name).toBe('Rahul Sharma');
    expect(act1.participantRole).toBe('attendee');
    expect(act1.date).toBe('Tomorrow');
    expect(act1.time).toBe('10:00');
    expect(act1.requiresApproval).toBe(true);
    expect(act1.stage).toBe('READY_FOR_APPROVAL');

    // Action 2: WhatsApp
    const act2 = actions[1];
    expect(act2.type).toBe('SEND_WHATSAPP');
    expect(act2.destination).toBe('WHATSAPP');
    expect(act2.recipient?.name).toBe('Aman Verma');
    expect(act2.participantRole).toBe('recipient');
    expect(act2.whatsappMessage).toBe('Hi Aman, please send the latest production report.');
    // Transcript must NEVER be used as the message body
    expect(act2.whatsappMessage).not.toBe(text);
    expect(act2.requiresApproval).toBe(true);

    // Action 3: Bread shopping item
    const act3 = actions[2];
    expect(['ADD_ITEM', 'ADD_SHOPPING_ITEM']).toContain(act3.type);
    expect(act3.destination).toBe('SHOPPING_LIST');
    expect(act3.item).toBe('Bread');
    expect(act3.requiresApproval).toBe(false);

    // Action 4: Milk shopping item
    const act4 = actions[3];
    expect(['ADD_ITEM', 'ADD_SHOPPING_ITEM']).toContain(act4.type);
    expect(act4.destination).toBe('SHOPPING_LIST');
    expect(act4.item).toBe('Milk');
    expect(act4.requiresApproval).toBe(false);
  });

  // ── TEST 2: Online meeting + WhatsApp link notification ──────────────────────
  it('Test Case 2: Online meeting with Rahul + WhatsApp link notification', () => {
    const text = 'Online meeting schedule kar do Rahul ke saath Friday 4 PM, aur usko WhatsApp par link bhej dena';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(2);

    expect(['CREATE_EVENT', 'CREATE_CALENDAR_EVENT']).toContain(actions[0].type);
    expect(actions[0].meetingType).toBe('ONLINE_MEETING');
    expect(actions[0].attendee?.name).toBe('Rahul Sharma');

    expect(actions[1].type).toBe('SEND_WHATSAPP');
    expect(actions[1].recipient?.name).toBe('Rahul Sharma');
    expect(actions[1].whatsappMessage).toContain('link for our online meeting');
  });

  // ── TEST 3: Task Assignment to Rahul without Multiple-Assignee Warning ───────
  it('Test Case 3: Rahul assigned task without false warnings', () => {
    const text = 'Rahul ko ye task assign kar do';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('ASSIGN_TASK');
    expect(actions[0].destination).toBe('TASK_ASSIGNMENT');
    expect(actions[0].assignee?.name).toBe('Rahul Sharma');
    expect(actions[0].participantRole).toBe('assignee');
  });

  // ── TEST 4: Rahul is Attendee, Aman is Recipient (Neither is Assignee) ───────
  it('Test Case 4: Correct participant roles (attendee vs recipient, not assignee)', () => {
    const text = 'Meeting Rahul ke saath hai aur Aman ko report bhejni hai';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(2);
    expect(actions[0].participantRole).toBe('attendee');
    expect(actions[0].attendee?.name).toBe('Rahul Sharma');

    expect(actions[1].participantRole).toBe('recipient');
    expect(actions[1].recipient?.name).toBe('Aman Verma');
  });

  // ── TEST 5: Independent shopping items from kitchen utterance ────────────────
  it('Test Case 5: Kitchen bread and milk split into distinct shopping items', () => {
    const text = 'Kitchen mein bread laana hai, milk bhi';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions.length).toBeGreaterThanOrEqual(2);
    const items = actions.filter(a => a.type === 'ADD_ITEM' || a.type === 'ADD_SHOPPING_ITEM').map(a => a.item);
    expect(items).toContain('Bread');
    expect(items).toContain('Milk');
  });

  // ── TEST 6: Reschedule Meeting to Monday + Inform Rahul ──────────────────────
  it('Test Case 6: Reschedule meeting to Monday and inform Rahul via WhatsApp', () => {
    const text = 'Kal ki meeting Monday shift kar do aur Rahul ko bata dena';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('RESCHEDULE_EVENT');
    expect(actions[0].rescheduledDate).toBe('Monday');

    expect(actions[1].type).toBe('SEND_WHATSAPP');
    expect(actions[1].recipient?.name).toBe('Rahul Sharma');
    expect(actions[1].whatsappMessage).toContain('rescheduled to Monday');
  });

  // ── TEST 7: Negative repair / assignment correction ─────────────────────────
  it('Test Case 7: Assignment correction (Rahul nahi, Aman ko assign karo)', () => {
    const text = 'Rahul nahi, Aman ko assign karo';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('ASSIGN_TASK');
    expect(actions[0].assignee?.name).toBe('Aman Verma');
  });

  // ── TEST 8: Post-meeting summary trigger ────────────────────────────────────
  it('Test Case 8: Post-meeting summary generation', () => {
    const text = 'Meeting ho gayi, ab summary bhejni hai';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('SEND_MEETING_SUMMARY');
    expect(actions[0].destination).toBe('MEETING_INTELLIGENCE');
  });

  // ── TEST 9: Location-associated automation ──────────────────────────────────
  it('Test Case 9: Location-associated automation on coal mine site entry', () => {
    const text = 'Jab coal mine site par enter karo to automatic recording start kar dena';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('LOCATION_AUTOMATION');
    expect(actions[0].location).toMatch(/coal mine/i);
    expect(actions[0].requiresApproval).toBe(true);
  });

  // ── TEST 10: Multi-room personal task + shopping item ───────────────────────
  it('Test Case 10: Master bedroom cleaning + Kitchen bread placement', () => {
    const text = 'Master bedroom ki cleaning karni hai aur kitchen mein bread rakhni hai';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(2);
    expect(actions[0].destination).toBe('TASK_MANAGER');
    expect(actions[0].title).toContain('Master bedroom cleaning');

    expect(actions[1].destination).toBe('SHOPPING_LIST');
    expect(actions[1].item).toBe('Bread');
  });

  // ── BONUS: Verification of Execution Gateway Safe Execution ─────────────────
  it('Execution Gateway safely executes CREATE_CALENDAR_EVENT with top-level success', async () => {
    const calAction = {
      id: 'act_test_cal',
      type: 'CREATE_CALENDAR_EVENT',
      title: 'Meeting with Rahul Sharma',
      startDate: new Date(Date.now() + 86400000).toISOString(),
      deadline: new Date(Date.now() + 90000000).toISOString()
    };

    const res = await executeAction(calAction, { sessionId: 'test_sess', isApproved: true });
    expect(res.success).toBe(true);
    expect(res.status).toBe('COMPLETED');
    expect(res.result.status).toBe('SIMULATED');
  });
});

