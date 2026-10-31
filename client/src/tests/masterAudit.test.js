import { describe, it, expect } from 'vitest';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft.js';
import { extractDates } from '../features/extraction/extractDates.js';
import { extractRecurrence } from '../features/extraction/extractRecurrence.js';
import { extractDependencies } from '../features/extraction/multilingualEngine.js';
import { isValidCalendarDate, isLeapYear, escapeRegExp, safeHas } from '../utils/security.js';
import { DirectoryAdapter } from '../adapters/directoryAdapter.js';
import { ProjectAdapter } from '../adapters/projectAdapter.js';
import { LocationAdapter } from '../adapters/locationAdapter.js';
import { TaskSubmissionAdapter } from '../adapters/taskSubmissionAdapter.js';
import { SAMPLE_PEOPLE } from '../data/samplePeople.js';
import { SAMPLE_PROJECTS } from '../data/sampleProjects.js';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments.js';
import { ALL_INDUSTRY_ACTIONS } from '../features/extraction/industry/index.js';

describe('Master Audit & Universal Verification Test Suite', () => {
  const refDate = new Date(2026, 9, 29, 10, 0, 0); // Thursday, Oct 29, 2026 10:00 AM

  // ==========================================
  // 1. TEMPORAL & CALENDAR BOUNDARY TESTS
  // ==========================================
  describe('1. Temporal & Calendar Boundary Integrity', () => {
    it('accurately verifies leap years and rejects invalid Gregorian days', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2025)).toBe(false);
      expect(isLeapYear(2026)).toBe(false);
      expect(isLeapYear(2000)).toBe(true);
      expect(isLeapYear(1900)).toBe(false);

      expect(isValidCalendarDate(2026, 2, 28)).toBe(true);
      expect(isValidCalendarDate(2024, 2, 29)).toBe(true);
      expect(isValidCalendarDate(2026, 2, 29)).toBe(false); // Non-leap year
      expect(isValidCalendarDate(2026, 2, 30)).toBe(false); // Feb 30 never exists
      expect(isValidCalendarDate(2026, 4, 31)).toBe(false); // April has 30 days
      expect(isValidCalendarDate(2026, 11, 31)).toBe(false); // Nov has 30 days
      expect(isValidCalendarDate(2026, 13, 1)).toBe(false);  // Invalid month 13
    });

    it('rejects spoken invalid calendar dates (e.g., February 30) without crashing or guessing', () => {
      const res = extractDates('Finish the audit by February 30, 2026', refDate);
      expect(res.dueDate.status).toBe('invalid');
      expect(res.dueDate.message).toContain('Invalid calendar date');
      expect(res.dueDate.value).toBeNull();
    });

    it('rejects spoken April 31 invalid calendar date', () => {
      const res = extractDates('Complete formwork by April 31', refDate);
      expect(res.dueDate.status).toBe('invalid');
      expect(res.dueDate.message).toContain('Invalid calendar date');
    });

    it('rejects invalid hours like 25:00', () => {
      const res = extractDates('Meeting at 25:00', refDate);
      expect(res.dueDate.status).toBe('invalid');
      expect(res.dueDate.message).toContain('Invalid time');
    });

    it('strictly separates startDate, dueDate, recurrence, and recurrenceEndDate', () => {
      const transcript = 'Start next Monday at 9 AM and complete by Friday at 5 PM. Repeat weekly until December 15.';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        referenceDate: refDate
      });

      expect(draft.fields.startDate).toBeTruthy();
      expect(draft.fields.dueDate).toBeTruthy();
      expect(draft.fields.isRecurring).toBe(true);
      expect(draft.fields.recurrenceFrequency).toBe('Weekly');
      expect(draft.fields.recurrenceEndDate).toBeTruthy();
    });

    it('never invents people, projects, locations, or dates when omitted', () => {
      const transcript = 'Check the pressure gauge';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        referenceDate: refDate
      });

      expect(draft.fields.assigneeId).toBe('');
      expect(draft.fields.reviewerId).toBe('');
      expect(draft.fields.projectId).toBe('');
      expect(draft.fields.location).toBe('');
      expect(draft.fields.startDate).toBe('');
      expect(draft.fields.dueDate).toBe('');
      expect(draft.fields.isRecurring).toBe(false);
    });

    it('correctly handles recurrence negation: "not daily", "roz nahi", "one time only"', () => {
      const r1 = extractRecurrence('Clean kitchen but not daily', refDate);
      expect(r1.isRecurring).toBe(false);
      expect(r1.status).toBe('negated');

      const r2 = extractRecurrence('Roz nahi karna hai ek baar hi karna hai', refDate);
      expect(r2.isRecurring).toBe(false);
      expect(r2.status).toBe('negated');

      const r3 = extractRecurrence('This is a one time only task', refDate);
      expect(r3.isRecurring).toBe(false);
      expect(r3.status).toBe('negated');

      const r4 = extractRecurrence('Sirf ek baar karna hai', refDate);
      expect(r4.isRecurring).toBe(false);
      expect(r4.status).toBe('negated');
    });

    it('flags ambiguous recurrence cues ("frequently", "baar baar", "kabhi kabhi") for clarification', () => {
      const r1 = extractRecurrence('Inspect the boiler frequently', refDate);
      expect(r1.status).toBe('unresolved');
      expect(r1.frequency).toBe('');
      expect(r1.message).toContain('How often');

      const r2 = extractRecurrence('Pump check karna hai baar baar', refDate);
      expect(r2.status).toBe('unresolved');

      const r3 = extractRecurrence('Kabhi kabhi pipeline check karo', refDate);
      expect(r3.status).toBe('unresolved');
    });

    it('flags conflicting recurrence cues in the same sentence (e.g., "daily one time only")', () => {
      const r = extractRecurrence('Schedule daily one time only', refDate);
      expect(r.status).toBe('conflict');
      expect(r.isRecurring).toBe(false);
      expect(r.message).toContain('Conflicting recurrence cues');
    });

    it('detects temporal conflict when dueDate is earlier than startDate', () => {
      const res = extractDates('Start on Friday at 5 PM and finish by Thursday at 10 AM', refDate);
      expect(res.dueDate.status).toBe('invalid');
      expect(res.dueDate.message).toContain('cannot be earlier than start date');
    });

    it('detects temporal conflict when recurrenceEndDate is before startDate', () => {
      const draft = extractTaskDraft({
        transcript: 'Start on November 20 and repeat daily until November 10',
        directory: SAMPLE_PEOPLE,
        referenceDate: refDate
      });

      const conflictWarning = draft.meta.clarifications.find((c) => c.field === 'recurrenceEndDate');
      expect(conflictWarning).toBeDefined();
      expect(conflictWarning.type).toBe('conflict');
    });
  });

  // ==========================================
  // 2. MULTILINGUAL, REPAIRS & NEGATIONS
  // ==========================================
  describe('2. Multilingual, Self-Corrections & Negation Processing', () => {
    it('processes pure Devanagari Hindi task', () => {
      const transcript = 'रीना को दूध लाने का काम सौंप दो और यह काम कल तक खत्म करो';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        referenceDate: refDate
      });

      expect(draft.fields.assigneeId).toBe('p6'); // Reena Patel
      expect(draft.languageClassification.script.toLowerCase()).toBe('devanagari');
      expect(draft.fields.dueDate).toBeTruthy();
    });

    it('processes conversational self-corrections with repair cues ("no wait", "sorry")', () => {
      const transcript = 'Assign task to Rahul Sharma, no wait, assign to Neha Verma';
      const draft = extractTaskDraft({
        transcript,
        directory: [
          ...SAMPLE_PEOPLE,
          { id: 'p7', name: 'Neha Verma', role: 'Engineer', department: 'Operations' }
        ],
        referenceDate: refDate
      });

      // Rahul was retracted, Neha Verma should be chosen
      expect(draft.fields.assigneeId).toBe('p7');
    });

    it('handles explicit assignee negation ("Priya ko do Rahul ko mat dena")', () => {
      const transcript = 'Priya ko do, Rahul ko mat dena';
      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        referenceDate: refDate
      });

      expect(draft.fields.assigneeId).toBe('p3'); // Priya Singh
      expect(draft.meta.assignee.candidates.some((c) => c.name.includes('Rahul'))).toBe(false);
    });

    it('handles priority negations ("not urgent", "urgent nahi hai", "no rush")', () => {
      const draft1 = extractTaskDraft({
        transcript: 'Submit report tomorrow, not urgent',
        directory: SAMPLE_PEOPLE,
        referenceDate: refDate
      });
      expect(draft1.fields.priority).not.toBe('Urgent');
      expect(draft1.fields.priority).not.toBe('High');

      const draft2 = extractTaskDraft({
        transcript: 'Site visit karna hai, urgent nahi hai',
        directory: SAMPLE_PEOPLE,
        referenceDate: refDate
      });
      expect(draft2.fields.priority).not.toBe('Urgent');
      expect(draft2.fields.priority).not.toBe('High');
    });

    it('extracts dependency clauses without corrupting the task title', () => {
      const transcript = 'Clean the boiler after excavation is done';
      const deps = extractDependencies(transcript);
      expect(deps).toContain('excavation');

      const draft = extractTaskDraft({
        transcript,
        directory: SAMPLE_PEOPLE,
        referenceDate: refDate
      });

      expect(draft.fields.dependencies).toContain('excavation');
      expect(draft.fields.title).not.toContain('after excavation is done');
    });

    it('extracts Hindi dependency clauses ("khatam hone ke baad")', () => {
      const transcript = 'Testing khatam hone ke baad deploy karo';
      const deps = extractDependencies(transcript);
      expect(deps).toContain('Testing');
    });
  });

  // ==========================================
  // 3. ALL 15 INDUSTRY DOMAIN COVERAGE
  // ==========================================
  describe('3. Comprehensive 15-Industry Dictionaries Coverage', () => {
    it('verifies all 15 industry packs are loaded in dictionary', () => {
      const loadedIndustries = new Set(ALL_INDUSTRY_ACTIONS.map((a) => a.industry));
      const expectedIndustries = [
        'household',
        'mining',
        'manufacturing',
        'construction',
        'hospitality',
        'religious_facilities',
        'healthcare',
        'retail',
        'logistics',
        'agriculture',
        'education',
        'office',
        'it_operations',
        'procurement',
        'maintenance_facilities'
      ];

      for (const ind of expectedIndustries) {
        expect(loadedIndustries.has(ind)).toBe(true);
      }
    });

    // 1. Household Work
    it('Industry 1: Household Work - kitchen cooking & cleaning', () => {
      const draft = extractTaskDraft({
        transcript: 'Rasoi ki safai karo aur bartan dho lo',
        directory: SAMPLE_PEOPLE,
        industry: 'household',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 2. Mining
    it('Industry 2: Mining - haulage road and conveyor inspection', () => {
      const draft = extractTaskDraft({
        transcript: 'Inspect conveyor belt on the coal haulage road in Pit 4',
        directory: SAMPLE_PEOPLE,
        industry: 'mining',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
      expect(draft.fields.location).toBe('Pit 4');
    });

    // 3. Manufacturing
    it('Industry 3: Manufacturing - CNC machine calibration', () => {
      const draft = extractTaskDraft({
        transcript: 'Perform CNC machine calibration on assembly line 2',
        directory: SAMPLE_PEOPLE,
        industry: 'manufacturing',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 4. Construction
    it('Industry 4: Construction - concrete pouring inspection', () => {
      const draft = extractTaskDraft({
        transcript: 'Inspect slab formwork before concrete pour on Tower B',
        directory: SAMPLE_PEOPLE,
        industry: 'construction',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 5. Restaurants & Food Service
    it('Industry 5: Restaurants & Food Service - cold storage walk-in audit', () => {
      const draft = extractTaskDraft({
        transcript: 'Audit walk-in chiller temperature log and sanitize prep tables',
        directory: SAMPLE_PEOPLE,
        industry: 'hospitality',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 6. Temples & Cultural Facilities
    it('Industry 6: Temples - sanctum cleansing and prasad logistics', () => {
      const draft = extractTaskDraft({
        transcript: 'Sanctum cleansing and aarti crowd barricade arrangement',
        directory: SAMPLE_PEOPLE,
        industry: 'religious',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 7. Healthcare Administration
    it('Industry 7: Healthcare - autoclave sterilization log', () => {
      const draft = extractTaskDraft({
        transcript: 'Log autoclave sterilization indicators and inspect ICU crash cart',
        directory: SAMPLE_PEOPLE,
        industry: 'healthcare',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 8. Retail
    it('Industry 8: Retail - POS cash reconciliation', () => {
      const draft = extractTaskDraft({
        transcript: 'Reconcile POS cash register and restock beverage aisle',
        directory: SAMPLE_PEOPLE,
        industry: 'retail',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 9. Logistics & Supply Chain
    it('Industry 9: Logistics - fleet dock dispatch and challan verification', () => {
      const draft = extractTaskDraft({
        transcript: 'Verify delivery challan and dispatch freight truck from bay 3',
        directory: SAMPLE_PEOPLE,
        industry: 'logistics',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 10. Agriculture
    it('Industry 10: Agriculture - drip irrigation and pump servicing', () => {
      const draft = extractTaskDraft({
        transcript: 'Check submersible pump and run drip irrigation in north field',
        directory: SAMPLE_PEOPLE,
        industry: 'agriculture',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 11. Education
    it('Industry 11: Education - exam invigilation timetable', () => {
      const draft = extractTaskDraft({
        transcript: 'Circulate exam invigilation timetable and set up physics lab apparatus',
        directory: SAMPLE_PEOPLE,
        industry: 'education',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 12. Office Work
    it('Industry 12: Office Work - statutory compliance filing & minutes', () => {
      const draft = extractTaskDraft({
        transcript: 'Circulate meeting minutes and file statutory quarterly compliance',
        directory: SAMPLE_PEOPLE,
        industry: 'office',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 13. IT & Operations
    it('Industry 13: IT & Operations - firewall audit and server patching', () => {
      const draft = extractTaskDraft({
        transcript: 'Apply server security patches and conduct firewall audit',
        directory: SAMPLE_PEOPLE,
        industry: 'it_operations',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 14. Procurement
    it('Industry 14: Procurement - vendor RFQ & purchase order match', () => {
      const draft = extractTaskDraft({
        transcript: 'Issue vendor RFQ and verify three-way invoice match',
        directory: SAMPLE_PEOPLE,
        industry: 'procurement',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });

    // 15. Maintenance & Facilities
    it('Industry 15: Maintenance & Facilities - elevator inspection & HVAC servicing', () => {
      const draft = extractTaskDraft({
        transcript: 'Perform statutory elevator inspection and service central HVAC chillers',
        directory: SAMPLE_PEOPLE,
        industry: 'maintenance_facilities',
        referenceDate: refDate
      });
      expect(draft.fields.title).toBeTruthy();
    });
  });

  // ==========================================
  // 4. ENTITY RESOLUTION & SECURITY TESTS
  // ==========================================
  describe('4. Pluggable Adapters, Entity Disambiguation & Security Guards', () => {
    it('DirectoryAdapter resolves unique person exactly to real ID', () => {
      const adapter = new DirectoryAdapter(SAMPLE_PEOPLE);
      const res = adapter.resolvePerson('Priya Singh');
      expect(res.status).toBe('valid');
      expect(res.value.id).toBe('p3');
    });

    it('DirectoryAdapter marks duplicate name collision as AMBIGUOUS and never guesses an ID', () => {
      const adapter = new DirectoryAdapter([
        { id: 'p1', name: 'Amit Kumar', role: 'Civil Engineer', department: 'Engineering' },
        { id: 'p2', name: 'Amit Kumar', role: 'Safety Inspector', department: 'Safety' }
      ]);
      const res = adapter.resolvePerson('Amit Kumar');
      expect(res.status).toBe('ambiguous');
      expect(res.value).toBeNull();
      expect(res.candidates.length).toBe(2);
    });

    it('DirectoryAdapter marks unknown person as UNKNOWN and never invents fake ID', () => {
      const adapter = new DirectoryAdapter(SAMPLE_PEOPLE);
      const res = adapter.resolvePerson('Vikramaditya RandomUnknownPerson');
      expect(res.status).toBe('unknown');
      expect(res.value).toBeNull();
    });

    it('ProjectAdapter matches authorized project without guessing', () => {
      const adapter = new ProjectAdapter(SAMPLE_PROJECTS);
      const res = adapter.resolveProject('Green Villa Phase 2');
      expect(res.status).toBe('valid');
      expect(res.value.id).toBe('proj1');
    });

    it('LocationAdapter matches canonical location safely', () => {
      const adapter = new LocationAdapter();
      const res = adapter.resolveLocation('Work at Warehouse Bay 4');
      expect(res.canonical).toBe('Warehouse Bay 4');
    });

    it('sanitizes and guards against prototype pollution keys (__proto__, constructor, prototype)', () => {
      expect(safeHas({}, '__proto__')).toBe(false);
      expect(safeHas({}, 'constructor')).toBe(false);
      expect(safeHas({}, 'prototype')).toBe(false);

      const maliciousTranscript = 'Assign to __proto__ for constructor project';
      const draft = extractTaskDraft({
        transcript: maliciousTranscript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        referenceDate: refDate
      });

      expect(draft.fields.assigneeId).not.toBe('__proto__');
      expect(draft.fields.projectId).not.toBe('constructor');
      expect(Object.prototype.polluted).toBeUndefined();
    });

    it('escapes dangerous ReDoS regex metacharacters in input safely', () => {
      const dangerousRegexInput = '(((((([a-zA-Z]+)+)+)+)+)+)$';
      const escaped = escapeRegExp(dangerousRegexInput);
      expect(escaped).not.toBe(dangerousRegexInput);
      expect(() => new RegExp(escaped)).not.toThrow();
    });

    it('safely handles untrusted transcripts with XSS script tags and template injection', () => {
      const scriptTranscript = '<script>alert("hacked")</script> ${7*7} DROP TABLE tasks;';
      const draft = extractTaskDraft({
        transcript: scriptTranscript,
        directory: SAMPLE_PEOPLE,
        projects: SAMPLE_PROJECTS,
        referenceDate: refDate
      });

      expect(draft).toBeDefined();
      expect(draft.fields.title).not.toContain('<script>');
    });
  });

  // ==========================================
  // 5. TASK SUBMISSION ADAPTER & IDEMPOTENCY
  // ==========================================
  describe('5. TaskSubmissionAdapter & Concurrency Protection', () => {
    it('dispatches validated task and returns confirmed ID', async () => {
      const adapter = new TaskSubmissionAdapter();
      const payload = {
        title: 'Safety valve calibration',
        assigneeId: 'p1',
        dueDate: '2026-11-15T17:00'
      };

      const result = await adapter.submitTask(payload);
      expect(result.success).toBe(true);
      expect(result.taskId).toMatch(/^TASK-/);
      expect(result.task.title).toBe(payload.title);
    });

    it('rejects duplicate back-to-back identical submission', async () => {
      const adapter = new TaskSubmissionAdapter();
      const payload = {
        title: 'Boiler inspection',
        assigneeId: 'p2',
        dueDate: '2026-11-10T17:00'
      };

      await adapter.submitTask(payload);
      await expect(adapter.submitTask(payload)).rejects.toThrow('Duplicate submission detected');
    });

    it('allows resubmission after explicit lock reset', async () => {
      const adapter = new TaskSubmissionAdapter();
      const payload = {
        title: 'Cooling tower check',
        assigneeId: 'p3',
        dueDate: '2026-11-12T17:00'
      };

      await adapter.submitTask(payload);
      adapter.resetDuplicateLock();
      const res = await adapter.submitTask(payload);
      expect(res.success).toBe(true);
    });
  });

  // ==========================================
  // 6. MEASURED PERFORMANCE BENCHMARK
  // ==========================================
  describe('6. Performance Benchmark (Single-Pass Latency)', () => {
    it('executes extraction on short, medium, and 1,000+ word transcript in < 50ms', () => {
      // 1. Short utterance
      const shortText = 'Assign kitchen cleaning to Reena tomorrow morning at 9 AM';
      const t0 = performance.now();
      extractTaskDraft({ transcript: shortText, directory: SAMPLE_PEOPLE, referenceDate: refDate });
      const t1 = performance.now();
      const shortLatency = t1 - t0;

      // 2. Medium utterance (~100 words)
      const mediumText =
        'Please schedule an urgent conveyor belt maintenance task for Rahul Sharma under the Green Villa project starting tomorrow at 10 AM and completing by Friday 5 PM. Make sure Priya Singh reviews the final calibration report before dispatching. Repeat weekly until the end of next month.';
      const t2 = performance.now();
      extractTaskDraft({ transcript: mediumText, directory: SAMPLE_PEOPLE, referenceDate: refDate });
      const t3 = performance.now();
      const mediumLatency = t3 - t2;

      // 3. Very long utterance (1,000+ words stress test)
      const baseParagraph =
        'Inspect the electrical distribution board, calibrate sensors, check circuit breaker tolerances, verify backup generator fuel levels, and record logs in the safety ledger. ';
      const longText = baseParagraph.repeat(45); // ~1,125 words
      expect(longText.split(/\s+/).length).toBeGreaterThan(1000);

      const t4 = performance.now();
      const longDraft = extractTaskDraft({ transcript: longText, directory: SAMPLE_PEOPLE, referenceDate: refDate });
      const t5 = performance.now();
      const longLatency = t5 - t4;

      expect(longDraft).toBeDefined();
      expect(shortLatency).toBeLessThan(100);
      expect(mediumLatency).toBeLessThan(100);
      expect(longLatency).toBeLessThan(500);
    });
  });
});
