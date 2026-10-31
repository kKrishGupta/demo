import { describe, it, expect } from 'vitest';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft.js';
import { SAMPLE_PEOPLE } from '../data/samplePeople.js';
import { SAMPLE_PROJECTS } from '../data/sampleProjects.js';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments.js';

describe('Industrial Safety & High-Consequence Controls Suite', () => {
  const refDate = new Date(2026, 9, 29, 10, 0, 0);

  it('flags atmospheric mine ventilation shutdown as critical safety alert', () => {
    const transcript = 'Turn off the ventilation if it gets noisy in shaft 4. Assign to Krish.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.meta.safetyClassification.isSafetyCritical).toBe(true);
    expect(draft.meta.safetyClassification.hazardType).toBe('LIFE_SAFETY_VENTILATION');
    expect(draft.meta.safetyClassification.requiresSupervisorAuthorization).toBe(true);
    expect(draft.meta.warnings.some((w) => w.includes('ventilation shutdown'))).toBe(true);
    expect(draft.meta.clarifications.some((c) => c.field === 'safety')).toBe(true);
  });

  it('flags Lockout / Tagout (LOTO) bypass commands as prohibited action', () => {
    const transcript = 'Bypass the interlock safety guard on conveyor line 3. Rahul to do it.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.meta.safetyClassification.isSafetyCritical).toBe(true);
    expect(draft.meta.safetyClassification.hazardType).toBe('SAFETY_INTERLOCK_BYPASS');
    expect(draft.meta.warnings.some((w) => w.includes('Lockout/Tagout'))).toBe(true);
  });

  it('enforces clinical medication order prohibition (Healthcare Isolation)', () => {
    const transcript = 'Administer medication dosage to patient in room 302. Priya to handle.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'healthcare',
      referenceDate: refDate
    });

    expect(draft.meta.safetyClassification.isSafetyCritical).toBe(true);
    expect(draft.meta.safetyClassification.hazardType).toBe('CLINICAL_PRESCRIPTION_PROHIBITED');
    expect(draft.meta.warnings.some((w) => w.includes('CLINICAL SAFETY HOLD'))).toBe(true);
  });

  it('allows safe non-critical facility tasks without triggering safety alerts', () => {
    const transcript = 'Assign a task to Reena to bring milk daily.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: refDate
    });

    expect(draft.meta.safetyClassification.isSafetyCritical).toBe(false);
    expect(draft.meta.warnings.some((w) => w.includes('CRITICAL SAFETY'))).toBe(false);
  });
});
