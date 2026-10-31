/**
 * ActionFlow AI — Phase 1 Voice Intelligence Test Suite
 *
 * Verifies:
 * 1. 13 Canonical Destination Routing
 * 2. Multi-Action Utterance Decomposition
 * 3. Task vs. Assignment Classification
 * 4. Conversational Voice Feedback Generation
 * 5. Audio Transcription Pipeline
 */

import { describe, it, expect } from 'vitest';
import {
  routeTranscript,
  routeClause,
  classifyTaskVsAssignment,
  splitMultiActionTranscript,
  DESTINATIONS
} from '../services/smartRouterService.js';
import { transcribeAudio } from '../services/transcriptionService.js';

describe('Phase 1: Smart Action Router (13 Canonical Destinations)', () => {
  const cases = [
    // 1. CALENDAR
    { input: 'Kal Rahul ke saath 10 baje meeting fix kar do.', expected: DESTINATIONS.CALENDAR },
    { input: 'Friday wali meeting Monday shift kar do.', expected: DESTINATIONS.CALENDAR },
    { input: 'Schedule a standup with the design team tomorrow morning.', expected: DESTINATIONS.CALENDAR },
    { input: 'Meeting cancel kar do.', expected: DESTINATIONS.CALENDAR },

    // 2. WHATSAPP
    { input: 'Aman ko WhatsApp kar do ki production report bhej de.', expected: DESTINATIONS.WHATSAPP },
    { input: 'Rahul ko message kar do main late aaunga.', expected: DESTINATIONS.WHATSAPP },
    { input: 'Send WhatsApp message to Priya saying presentation is ready.', expected: DESTINATIONS.WHATSAPP },

    // 3. EMAIL
    { input: 'Aman ko mail karo ki report ready hai.', expected: DESTINATIONS.EMAIL },
    { input: 'Send email to team with the quarterly numbers.', expected: DESTINATIONS.EMAIL },

    // 4. PERSONAL_REMINDER
    { input: 'Shaam ko mujhe electricity bill yaad dilana.', expected: DESTINATIONS.PERSONAL_REMINDER },
    { input: 'Papa ko call karna hai.', expected: DESTINATIONS.PERSONAL_REMINDER },
    { input: '5 baje medicine yaad dila dena.', expected: DESTINATIONS.PERSONAL_REMINDER },

    // 5. SHOPPING_LIST
    { input: 'Kitchen mein bread aur milk laana hai.', expected: DESTINATIONS.SHOPPING_LIST },
    { input: 'Shopping list mein dal aur atta add karo.', expected: DESTINATIONS.SHOPPING_LIST },
    { input: 'Add eggs and butter to grocery list.', expected: DESTINATIONS.SHOPPING_LIST },

    // 6. MEETING_RECORDER
    { input: 'Coal mine site par recording start karni hai.', expected: DESTINATIONS.MEETING_RECORDER },
    { input: 'Start site recording for inspection.', expected: DESTINATIONS.MEETING_RECORDER },

    // 7. MEETING_INTELLIGENCE
    { input: 'Meeting notes lena hai aur action items save karo.', expected: DESTINATIONS.MEETING_INTELLIGENCE },

    // 8. DOCUMENT_SHARING
    { input: 'Share the presentation document with client.', expected: DESTINATIONS.DOCUMENT_SHARING },

    // 9. INFORMATION_RETRIEVAL
    { input: 'Saare pending tasks dikhao.', expected: DESTINATIONS.INFORMATION_RETRIEVAL },
    { input: 'Show all my pending tasks.', expected: DESTINATIONS.INFORMATION_RETRIEVAL },

    // 10. TASK_ASSIGNMENT
    { input: 'Rahul ko production report complete karne ke liye assign karo.', expected: DESTINATIONS.TASK_ASSIGNMENT },
    { input: 'No, not Rahul, assign this to Aman instead.', expected: DESTINATIONS.TASK_ASSIGNMENT },
    { input: 'Rahul ko ye task assign kar do.', expected: DESTINATIONS.TASK_ASSIGNMENT },

    // 11. TASK_MANAGER
    { input: 'Production report complete karna hai.', expected: DESTINATIONS.TASK_MANAGER },
    { input: 'Friday tak presentation complete honi chahiye.', expected: DESTINATIONS.TASK_MANAGER },
    { input: 'Mark this task as complete.', expected: DESTINATIONS.TASK_MANAGER }
  ];

  for (const { input, expected } of cases) {
    it(`routes "${input}" -> ${expected}`, () => {
      const res = routeTranscript(input);
      expect(res.primary).toBe(expected);
      expect(res.confidence).toBeGreaterThanOrEqual(0.7);
    });
  }
});

describe('Phase 1: Task vs. Assignment Classification', () => {
  it('classifies general work as TASK_MANAGER', () => {
    expect(classifyTaskVsAssignment('Production report complete karna hai.')).toBe(DESTINATIONS.TASK_MANAGER);
    expect(classifyTaskVsAssignment('Presentation complete honi chahiye.')).toBe(DESTINATIONS.TASK_MANAGER);
  });

  it('classifies delegated responsibility as TASK_ASSIGNMENT', () => {
    expect(classifyTaskVsAssignment('Rahul ko production report complete karne ke liye assign karo.')).toBe(DESTINATIONS.TASK_ASSIGNMENT);
    expect(classifyTaskVsAssignment('Assign kitchen material selection to Priya.')).toBe(DESTINATIONS.TASK_ASSIGNMENT);
    expect(classifyTaskVsAssignment('Aman ko ye kaam saup do.')).toBe(DESTINATIONS.TASK_ASSIGNMENT);
  });
});

describe('Phase 1: Multi-Action Utterance Decomposition', () => {
  it('decomposes compound voice command into distinct sub-actions', () => {
    const compound = 'Kal 10 baje Rahul ke saath meeting fix karna, Aman se production report mangwani hai aur bread aur milk laana hai.';
    const res = routeTranscript(compound);

    expect(res.isMultiDestination).toBe(true);
    expect(res.actions.length).toBeGreaterThanOrEqual(2);

    const destinations = res.actions.map(a => a.destination);
    expect(destinations).toContain(DESTINATIONS.CALENDAR);
    expect(destinations).toContain(DESTINATIONS.SHOPPING_LIST);
  });

  it('correctly splits multi-action clauses', () => {
    const text = 'Meeting fix karo aur WhatsApp bhej do then task assign karo.';
    const clauses = splitMultiActionTranscript(text);
    expect(clauses.length).toBe(3);
  });
});

describe('Phase 1: Voice Feedback Confirmation', () => {
  it('generates clear, actionable feedback for calendar events', () => {
    const res = routeTranscript('Kal 10 baje Rahul ke saath meeting schedule karo.');
    expect(res.feedbackMessage).toContain('Calendar');
  });

  it('generates feedback for multi-action commands', () => {
    const res = routeTranscript('Meeting schedule karo aur Aman ko WhatsApp karo.');
    expect(res.feedbackMessage).toContain('distinct actions');
  });
});

describe('Phase 1: Audio Transcription Pipeline', () => {
  it('processes base64 audio and provides fallback transcript', async () => {
    // 1-second silent webm audio mock
    const dummyAudio = Buffer.alloc(1024).toString('base64');
    const result = await transcribeAudio({
      audio: dummyAudio,
      mimeType: 'audio/webm',
      mode: 'quick'
    });

    expect(result).toHaveProperty('transcript');
    expect(result).toHaveProperty('language');
    expect(result).toHaveProperty('confidence');
  });
});

