import { describe, it, expect } from 'vitest';
import { SemanticDecomposer, semanticDecomposer } from '../services/semanticDecomposer.js';
import { executeAction } from '../services/executionGateway.js';

describe('ACTIONFLOW AI — V4 INTELLIGENCE & WHATSAPP REGRESSION SUITE (10 Core Cases)', () => {
  const directory = [
    { id: 'usr_rahul', name: 'Rahul Sharma', email: 'rahul@example.com', department: 'Engineering' },
    { id: 'usr_aman', name: 'Aman Verma', email: 'aman@example.com', phone: '+919876543210', department: 'Operations' },
    { id: 'usr_priya', name: 'Priya Singh', email: 'priya@example.com', department: 'Marketing' }
  ];

  // ── TEST 1: Compound Multi-Action (4 Distinct Actions) ──────────────────────
  it('Test Case 1: Decomposes compound utterance into exactly 4 discrete actions', () => {
    const text = 'Kal Rahul ke saath 10 baje meeting fix kar do, Aman ko WhatsApp kar dena ki production report bhej de, aur bread aur milk laana hai.';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(4);

    // Action 1: Google Calendar Meeting
    const act1 = actions[0];
    expect(['CREATE_EVENT', 'CREATE_CALENDAR_EVENT']).toContain(act1.type);
    expect(act1.destination).toBe('GOOGLE_CALENDAR');
    expect(act1.title).toBe('Meeting with Rahul Sharma');
    expect(act1.attendees).toContain('Rahul Sharma');
    expect(act1.participantRole).toBe('attendee');
    expect(act1.date).toBe('Tomorrow');
    expect(act1.time).toBe('10:00');
    expect(act1.status).toBe('NEEDS_CLARIFICATION_OR_APPROVAL');

    // Action 2: WhatsApp to Aman
    const act2 = actions[1];
    expect(act2.type).toBe('SEND_WHATSAPP');
    expect(act2.destination).toBe('WHATSAPP');
    expect(act2.recipientName).toBe('Aman Verma');
    expect(act2.whatsappMessage).toBe('Hi Aman, please send the latest production report.');
    expect(act2.whatsappMessage).not.toBe(text);
    expect(act2.participantRole).toBe('recipient');

    // Action 3: Bread shopping item
    const act3 = actions[2];
    expect(['ADD_ITEM', 'ADD_SHOPPING_ITEM']).toContain(act3.type);
    expect(act3.destination).toBe('SHOPPING_LIST');
    expect(act3.item).toBe('Bread');

    // Action 4: Milk shopping item
    const act4 = actions[3];
    expect(['ADD_ITEM', 'ADD_SHOPPING_ITEM']).toContain(act4.type);
    expect(act4.destination).toBe('SHOPPING_LIST');
    expect(act4.item).toBe('Milk');
  });

  // ── TEST 2: WhatsApp to Aman without explicit message ────────────────────────
  it('Test Case 2: "Aman ko WhatsApp kar do" routes to SEND_WHATSAPP with pending status', () => {
    const text = 'Aman ko WhatsApp kar do.';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(1);
    const act = actions[0];
    expect(act.type).toBe('SEND_WHATSAPP');
    expect(act.destination).toBe('WHATSAPP');
    expect(act.recipientName).toBe('Aman Verma');
    expect(['NEEDS_RECIPIENT_NUMBER_OR_APPROVAL', 'READY_FOR_APPROVAL']).toContain(act.status);
  });

  // ── TEST 3: Explicit International Phone Number & Running Late Message ──────
  it('Test Case 3: Explicit phone number and custom message extraction', () => {
    const text = 'WhatsApp number +919876543210 par message bhejo ki main 10 minute late hoon.';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(1);
    const act = actions[0];
    expect(act.type).toBe('SEND_WHATSAPP');
    expect(act.destination).toBe('WHATSAPP');
    expect(act.recipientPhone).toBe('+919876543210');
    expect(act.whatsappMessage).toContain('running 10 minutes late');
    expect(act.whatsappMessage).not.toBe(text);
  });

  // ── TEST 4: Dual Actions ("Rahul ko calendar invite aur WhatsApp notification dono bhejo")
  it('Test Case 4: Dual invite and notification generates both calendar and whatsapp actions', () => {
    const text = 'Rahul ko calendar invite aur WhatsApp notification dono bhejo.';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(2);
    expect(['CREATE_EVENT', 'CREATE_CALENDAR_EVENT']).toContain(actions[0].type);
    expect(actions[0].destination).toBe('GOOGLE_CALENDAR');
    expect(actions[1].type).toBe('SEND_WHATSAPP');
    expect(actions[1].destination).toBe('WHATSAPP');
  });

  // ── TEST 5: Dual Shopping Items ("Bread aur milk dono shopping list mein add karo")
  it('Test Case 5: Shopping list addition extracts discrete items', () => {
    const text = 'Bread aur milk dono shopping list mein add karo.';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(2);
    const items = actions.map(a => a.item);
    expect(items).toContain('Bread');
    expect(items).toContain('Milk');
    actions.forEach(a => {
      expect(['ADD_ITEM', 'ADD_SHOPPING_ITEM']).toContain(a.type);
      expect(a.destination).toBe('SHOPPING_LIST');
    });
  });

  // ── TEST 6: Item Negation ("Milk nahi laana, sirf bread laana") ──────────────
  it('Test Case 6: Item negation correctly includes bread and excludes milk', () => {
    const text = 'Milk nahi laana, sirf bread laana.';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(1);
    expect(actions[0].item).toBe('Bread');
    const items = actions.map(a => a.item);
    expect(items).not.toContain('Milk');
  });

  // ── TEST 7: Contact Update Workflow ("Aman ka number change kar do") ──────────
  it('Test Case 7: Contact number update routes to UPDATE_CONTACT without sending message', () => {
    const text = 'Aman ka number change kar do.';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(1);
    const act = actions[0];
    expect(act.type).toBe('UPDATE_CONTACT');
    expect(act.destination).toBe('CONTACT_MANAGEMENT');
    expect(act.contactName).toBe('Aman Verma');
  });

  // ── TEST 8: Preview Request Workflow ("Message bhejne se pehle mujhe preview dikhao")
  it('Test Case 8: Preview request generates PREVIEW_MESSAGE action', () => {
    const text = 'Message bhejne se pehle mujhe preview dikhao.';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(1);
    const act = actions[0];
    expect(act.type).toBe('PREVIEW_MESSAGE');
    expect(act.destination).toBe('WHATSAPP');
    expect(act.requiresApproval).toBe(true);
  });

  // ── TEST 9: Conversational Negative Correction ("Rahul nahi, Aman ko message bhejna")
  it('Test Case 9: Negative repair selects Aman and negates Rahul', () => {
    const text = 'Rahul nahi, Aman ko message bhejna.';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(1);
    const act = actions[0];
    expect(act.type).toBe('SEND_WHATSAPP');
    expect(act.recipientName).toBe('Aman Verma');
    expect(act.recipientName).not.toBe('Rahul');
  });

  // ── TEST 10: Mixed Message & Shopping ("Production report bhej do aur bread bhi le aana")
  it('Test Case 10: Compound message + shopping item extraction', () => {
    const text = 'Production report bhej do aur bread bhi le aana.';
    const actions = semanticDecomposer.decompose(text, { directory });

    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('SEND_WHATSAPP');
    expect(actions[0].destination).toBe('WHATSAPP');
    expect(['ADD_ITEM', 'ADD_SHOPPING_ITEM']).toContain(actions[1].type);
    expect(actions[1].destination).toBe('SHOPPING_LIST');
    expect(actions[1].item).toBe('Bread');
  });

  // ── BONUS VERIFICATION: Execution Gateway WhatsApp Execution ─────────────────
  it('Execution Gateway safely executes SEND_WHATSAPP when approved', async () => {
    const whatsappAction = {
      id: `act_wa_test_${Date.now()}`,
      type: 'SEND_WHATSAPP',
      title: 'Send WhatsApp to Aman',
      recipientPhone: '+919876543210',
      whatsappMessage: 'Hi Aman, please send the latest production report.',
      destination: 'WHATSAPP',
      customFetch: async () => ({
        ok: true,
        status: 201,
        json: async () => ({ sid: `SM_TEST_${Date.now()}`, status: 'queued' })
      })
    };

    const res = await executeAction(whatsappAction, {
      sessionId: 'sess_v4_test',
      isApproved: true
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('COMPLETED');
    expect(res.result).toBeDefined();
    expect(res.result.success).toBe(true);
  });
});

