import { describe, it, expect } from 'vitest';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft.js';
import { SAMPLE_PEOPLE } from '../data/samplePeople.js';
import { SAMPLE_PROJECTS } from '../data/sampleProjects.js';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments.js';

describe('Universal Industry Packs Test Suite (12 Sectors)', () => {
  const refDate = new Date(2026, 9, 29, 10, 0, 0);

  // 1. Mining & Extraction
  it('Sector 1: Mining & Extraction - coal conveyor inspection', () => {
    const transcript = 'Inspect coal conveyor belt before the shift starts. Assign to Krish.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'mining',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Inspect coal conveyor belt');
    expect(draft.meta.safetyClassification.isSafetyCritical).toBe(true);
  });

  // 2. Manufacturing & Production
  it('Sector 2: Manufacturing & Production - machine calibration', () => {
    const transcript = 'Calibrate assembly machine for production line. Reena to execute.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'manufacturing',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Calibrate assembly machine');
    expect(draft.fields.assigneeId).toBe('p6'); // Reena Patel
  });

  // 3. Construction & Infrastructure
  it('Sector 3: Construction & Infrastructure - concrete pour inspection', () => {
    const transcript = 'Inspect concrete pour and curing on site. Assign to Jayant.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'construction',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Inspect concrete pour');
    expect(draft.fields.assigneeId).toBe('p5'); // Jayant Midde
  });

  // 4. Hospitality & Commercial Kitchens
  it('Sector 4: Hospitality & Commercial Kitchens - deep clean kitchen', () => {
    const transcript = 'Deep clean kitchen and pantry before opening. Reena should handle it.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'hospitality',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Deep clean kitchen and pantry');
    expect(draft.fields.assigneeId).toBe('p6');
  });

  // 5. Temples, Religious Facilities & Event Venues
  it('Sector 5: Religious Facilities & Venues - crowd control barricades', () => {
    const transcript = 'Arrange crowd control barricades for festival darshan. Jayant to oversee.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'religious_facilities',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Arrange crowd control barricades');
    expect(draft.fields.assigneeId).toBe('p5'); // Jayant Midde
  });

  // 6. Healthcare Administration
  it('Sector 6: Healthcare Administration - autoclave sterilization logging', () => {
    const transcript = 'Log autoclave sterilization cycle daily. Priya to verify.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'healthcare',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Log autoclave sterilization cycle');
    expect(draft.fields.isRecurring).toBe(true);
    expect(draft.fields.recurrenceFrequency).toBe('Daily');
  });

  // 7. Retail & Commerce
  it('Sector 7: Retail & Commerce - cash reconciliation and restock', () => {
    const transcript = 'Reconcile register cash drawer at closing. Assign to Priya.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'retail',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Reconcile register cash drawer');
    expect(draft.fields.assigneeId).toBe('p3');
  });

  // 8. Logistics & Warehousing
  it('Sector 8: Logistics & Warehousing - forklift pre-shift checklist', () => {
    const transcript = 'Complete forklift pre-shift safety checklist every morning. Assign to Krish.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'logistics',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Complete forklift pre-shift safety checklist');
    expect(draft.meta.safetyClassification.isSafetyCritical).toBe(true);
  });

  // 9. Agriculture & Farming
  it('Sector 9: Agriculture & Farming - drip irrigation', () => {
    const transcript = 'Run field drip irrigation system tomorrow morning. Reena karegi.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'agriculture',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Run field drip irrigation system');
    expect(draft.fields.assigneeId).toBe('p6');
  });

  // 10. Education & Campuses
  it('Sector 10: Education & Campuses - lab apparatus audit', () => {
    const transcript = 'Audit physics and chemistry lab equipment before semester exams. Jayant will do.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'education',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Audit physics and chemistry lab equipment');
    expect(draft.fields.assigneeId).toBe('p5'); // Jayant Midde
  });

  // 11. Offices, IT & Software
  it('Sector 11: Offices & IT - security audit', () => {
    const transcript = 'Conduct infrastructure security audit. Jayant is responsible.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'office_it',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Conduct infrastructure security audit');
    expect(draft.fields.assigneeId).toBe('p5'); // Jayant Midde
  });

  // 12. Household & Domestic Operations
  it('Sector 12: Household Operations - bring groceries', () => {
    const transcript = 'Bring groceries tomorrow morning. Reena ko bolo.';
    const draft = extractTaskDraft({
      transcript,
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      industry: 'household',
      referenceDate: refDate
    });

    expect(draft.fields.title).toContain('Bring groceries');
    expect(draft.fields.assigneeId).toBe('p6');
  });
});
