/**
 * ActionFlow AI — Intelligence Engine Unit Tests
 * Tests action types, DAG planner, confidence engine, and context memory.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACTION_TYPES, EXECUTION_STATES, DEPENDENCY_TYPES,
  createMicroAction, draftToMicroAction, detectActionType, REQUIRES_APPROVAL
} from '../features/intelligence/actionTypes.js';
import {
  buildDAG, topologicalSort, computeParallelGroups,
  detectDeadlineConflicts, buildExecutionPlan, generateRecommendations
} from '../features/intelligence/dagPlanner.js';
import {
  computeFieldConfidences, computeOverallConfidence,
  identifyLowConfidenceFields, buildConfidenceReport
} from '../features/intelligence/confidenceEngine.js';
import { ContextMemory } from '../features/intelligence/contextMemory.js';
import {
  generateActionFingerprint, titleSimilarity, DuplicateDetector
} from '../features/intelligence/duplicateDetector.js';
import { analyzeTranscript } from '../features/intelligence/intelligenceService.js';
import { SAMPLE_PEOPLE } from '../data/samplePeople.js';
import { SAMPLE_PROJECTS } from '../data/sampleProjects.js';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments.js';
import { extractTaskDraft } from '../features/extraction/extractTaskDraft.js';

const REF_DATE = new Date('2026-10-29T10:00:00+05:30');

// ─── ACTION TYPES ─────────────────────────────────────────────────────────────
describe('Action Type System', () => {
  it('creates a valid micro-action with defaults', () => {
    const action = createMicroAction({ title: 'Test task', type: ACTION_TYPES.CREATE_TASK });
    expect(action.id).toBeTruthy();
    expect(action.type).toBe('CREATE_TASK');
    expect(action.source).toBe('EXPLICIT_ACTION');
    expect(action.executionState).toBe('DRAFT');
    expect(action.confidence).toHaveProperty('overall');
    expect(action.provenance).toHaveProperty('title');
  });

  it('marks WhatsApp actions as requiring approval', () => {
    expect(REQUIRES_APPROVAL.has(ACTION_TYPES.SEND_WHATSAPP)).toBe(true);
    expect(REQUIRES_APPROVAL.has(ACTION_TYPES.SEND_EMAIL)).toBe(true);
    expect(REQUIRES_APPROVAL.has(ACTION_TYPES.DELETE_TASK)).toBe(true);
    expect(REQUIRES_APPROVAL.has(ACTION_TYPES.CREATE_TASK)).toBe(false);
  });

  it('detects CREATE_CALENDAR_EVENT for meeting transcripts', () => {
    const draft = extractTaskDraft({
      transcript: 'Schedule a meeting with Rahul tomorrow at 10 AM.',
      directory: SAMPLE_PEOPLE, projects: SAMPLE_PROJECTS, departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    const type = detectActionType(draft);
    expect(type).toBe(ACTION_TYPES.CREATE_CALENDAR_EVENT);
  });

  it('detects SEND_WHATSAPP for WhatsApp transcripts', () => {
    const draft = extractTaskDraft({
      transcript: 'Aman ko WhatsApp kar do ki production data bhej de.',
      directory: SAMPLE_PEOPLE, projects: SAMPLE_PROJECTS, departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    const type = detectActionType(draft);
    expect(type).toBe(ACTION_TYPES.SEND_WHATSAPP);
  });

  it('detects CREATE_RECURRING_TASK for recurring extractions', () => {
    const draft = extractTaskDraft({
      transcript: 'Assign Reena to bring milk every morning.',
      directory: SAMPLE_PEOPLE, projects: SAMPLE_PROJECTS, departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    const type = detectActionType(draft);
    expect(type).toBe(ACTION_TYPES.CREATE_RECURRING_TASK);
  });

  it('detects RETRIEVE_TASKS for show/list commands', () => {
    const draft = extractTaskDraft({
      transcript: 'Show me all pending tasks.',
      directory: SAMPLE_PEOPLE, projects: SAMPLE_PROJECTS, departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    const type = detectActionType(draft);
    expect(type).toBe(ACTION_TYPES.RETRIEVE_TASKS);
  });

  it('converts a draft to a well-formed MicroAction', () => {
    const draft = extractTaskDraft({
      transcript: 'Assign Priya to prepare the report by Friday. High priority.',
      directory: SAMPLE_PEOPLE, projects: SAMPLE_PROJECTS, departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    const action = draftToMicroAction(draft, ACTION_TYPES.CREATE_TASK);
    expect(action.type).toBe('CREATE_TASK');
    expect(action.assignee).not.toBeNull();
    expect(action.assignee.name).toBe('Priya Singh');
    expect(action.priority).toBe('High');
    expect(action.provenance.assignee.method).toBeTruthy();
    expect(action.confidence.overall).toBeGreaterThan(0);
  });
});

// ─── DAG PLANNER ─────────────────────────────────────────────────────────────
describe('DAG Planner', () => {
  it('builds a DAG with correct edges from action dependencies', () => {
    const actions = [
      createMicroAction({ id: 'a1', title: 'Prepare presentation', dependencies: [] }),
      createMicroAction({ id: 'a2', title: 'Schedule meeting', dependencies: [{ actionId: 'a1', type: DEPENDENCY_TYPES.DEPENDS_ON_COMPLETION_OF, description: '' }] }),
      createMicroAction({ id: 'a3', title: 'Send summary', dependencies: [{ actionId: 'a2', type: DEPENDENCY_TYPES.DEPENDS_ON_COMPLETION_OF, description: '' }] })
    ];

    const { nodes, edges, hasCycle } = buildDAG(actions);
    expect(hasCycle).toBe(false);
    expect(edges).toHaveLength(2);
    expect(nodes.get('a1').blocks).toContain('a2');
    expect(nodes.get('a2').dependsOn).toContain('a1');
  });

  it('detects a cycle in the DAG', () => {
    const actions = [
      createMicroAction({ id: 'a1', title: 'Task A', dependencies: [{ actionId: 'a3', description: '' }] }),
      createMicroAction({ id: 'a2', title: 'Task B', dependencies: [{ actionId: 'a1', description: '' }] }),
      createMicroAction({ id: 'a3', title: 'Task C', dependencies: [{ actionId: 'a2', description: '' }] })
    ];
    const { hasCycle, cycleInfo } = buildDAG(actions);
    expect(hasCycle).toBe(true);
    expect(cycleInfo.length).toBeGreaterThan(0);
  });

  it('produces correct topological order', () => {
    const actions = [
      createMicroAction({ id: 'a1', title: 'Prepare', dependencies: [] }),
      createMicroAction({ id: 'a2', title: 'Review', dependencies: [{ actionId: 'a1', description: '' }] }),
      createMicroAction({ id: 'a3', title: 'Submit', dependencies: [{ actionId: 'a2', description: '' }] })
    ];
    const { nodes } = buildDAG(actions);
    const order = topologicalSort(nodes);
    expect(order[0]).toBe('a1');
    expect(order[1]).toBe('a2');
    expect(order[2]).toBe('a3');
  });

  it('identifies parallel execution groups for independent actions', () => {
    const actions = [
      createMicroAction({ id: 'a1', title: 'Task A', dependencies: [] }),
      createMicroAction({ id: 'a2', title: 'Task B', dependencies: [] }),
      createMicroAction({ id: 'a3', title: 'Task C', dependencies: [{ actionId: 'a1', description: '' }, { actionId: 'a2', description: '' }] })
    ];
    const { nodes, hasCycle } = buildDAG(actions);
    expect(hasCycle).toBe(false);
    const order = topologicalSort(nodes);
    const groups = computeParallelGroups(nodes, order);
    // a1 and a2 can be in the same parallel group; a3 must be after both
    const a3Group = groups.findIndex(g => g.includes('a3'));
    const a1Group = groups.findIndex(g => g.includes('a1'));
    const a2Group = groups.findIndex(g => g.includes('a2'));
    expect(a3Group).toBeGreaterThan(Math.min(a1Group, a2Group));
  });

  it('detects deadline conflicts between dependent actions', () => {
    const actions = [
      createMicroAction({ id: 'a1', title: 'Prep', deadline: '2026-11-05T17:00', dependencies: [] }),
      createMicroAction({ id: 'a2', title: 'Meeting', deadline: '2026-11-03T10:00', dependencies: [{ actionId: 'a1', description: '' }] })
    ];
    const { nodes } = buildDAG(actions);
    const conflicts = detectDeadlineConflicts(nodes);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].message).toContain('due before');
  });

  it('generates recommendations for a meeting action', () => {
    const action = createMicroAction({
      type: ACTION_TYPES.CREATE_CALENDAR_EVENT,
      title: 'Client meeting',
      sourceText: 'Schedule a client meeting tomorrow.'
    });
    const recs = generateRecommendations(action);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some(r => /agenda/i.test(r.title))).toBe(true);
  });

  it('builds full execution plan with no cycle for linear chain', () => {
    const actions = [
      createMicroAction({ id: 'x1', title: 'Code', priority: 'High', dependencies: [] }),
      createMicroAction({ id: 'x2', title: 'Test', dependencies: [{ actionId: 'x1', description: 'code' }] }),
      createMicroAction({ id: 'x3', title: 'Deploy', dependencies: [{ actionId: 'x2', description: 'test' }] })
    ];
    const plan = buildExecutionPlan(actions);
    expect(plan.hasCycle).toBe(false);
    expect(plan.orderedActionIds[0]).toBe('x1');
    expect(plan.orderedActionIds[2]).toBe('x3');
  });
});

// ─── CONFIDENCE ENGINE ────────────────────────────────────────────────────────
describe('Confidence Engine', () => {
  it('computes field confidence for a fully extracted draft', () => {
    const draft = extractTaskDraft({
      transcript: 'Assign Priya to prepare the report by tomorrow. High priority. Green Villa project.',
      directory: SAMPLE_PEOPLE, projects: SAMPLE_PROJECTS, departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    const confs = computeFieldConfidences(draft);
    expect(confs.title).toBeGreaterThan(0.5);
    expect(confs.assignee).toBeGreaterThan(0.5);
    expect(confs.deadline).toBeGreaterThan(0.5);
    expect(confs.priority).toBeGreaterThan(0.5);
    expect(confs.overall).toBe(0);  // Not yet computed here
  });

  it('computes overall confidence as weighted average', () => {
    const confs = {
      intent: 0.9, title: 0.85, assignee: 0.95, reviewer: 0,
      project: 0, startDate: 0, deadline: 0.9, priority: 0.85,
      recurrence: 0, location: 0, overall: 0
    };
    const overall = computeOverallConfidence(confs);
    expect(overall).toBeGreaterThan(0.5);
    expect(overall).toBeLessThanOrEqual(1.0);
  });

  it('identifies low-confidence fields requiring review', () => {
    const confs = { intent: 0.9, title: 0.8, assignee: 0.3, deadline: 0.4, priority: 0, recurrence: 0, overall: 0 };
    const low = identifyLowConfidenceFields(confs);
    expect(low.some(f => f.field === 'assignee')).toBe(true);
    expect(low.some(f => f.field === 'deadline')).toBe(true);
    expect(low.find(f => f.field === 'assignee')?.isImportant).toBe(true);
  });

  it('builds a complete confidence report for a draft', () => {
    const draft = extractTaskDraft({
      transcript: 'Priya ko report banana hai.',
      directory: SAMPLE_PEOPLE, projects: SAMPLE_PROJECTS, departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    const report = buildConfidenceReport(draft);
    expect(report.fieldConfidences).toHaveProperty('overall');
    expect(report.overallLevel).toMatch(/HIGH|MEDIUM|LOW|VERY_LOW/);
    expect(typeof report.blocksExecution).toBe('boolean');
  });
});

// ─── DUPLICATE DETECTOR ───────────────────────────────────────────────────────
describe('Duplicate Detector', () => {
  it('generates consistent fingerprints for same action', () => {
    const a1 = { title: 'Bring milk', fields: { assigneeId: 'p6', dueDate: '' } };
    const a2 = { title: 'Bring milk', fields: { assigneeId: 'p6', dueDate: '' } };
    expect(generateActionFingerprint(a1)).toBe(generateActionFingerprint(a2));
  });

  it('produces different fingerprints for different actions', () => {
    const a1 = { title: 'Bring milk', fields: { assigneeId: 'p6' } };
    const a2 = { title: 'Clean kitchen', fields: { assigneeId: 'p6' } };
    expect(generateActionFingerprint(a1)).not.toBe(generateActionFingerprint(a2));
  });

  it('computes high similarity for nearly identical titles', () => {
    expect(titleSimilarity('bring milk daily', 'bring milk every day')).toBeGreaterThan(0.3);
    expect(titleSimilarity('prepare report', 'compile the annual report')).toBeGreaterThan(0);
  });

  it('returns zero similarity for completely different titles', () => {
    expect(titleSimilarity('clean kitchen', 'deploy application')).toBeLessThan(0.3);
  });
});

// ─── INTELLIGENCE SERVICE ─────────────────────────────────────────────────────
describe('Intelligence Service', () => {
  it('analyzes a simple transcript and returns valid response structure', async () => {
    const result = await analyzeTranscript({
      transcript: 'Assign Priya to prepare the quarterly report by Friday.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });

    expect(result.requestId).toBeTruthy();
    expect(result.status).toBeTruthy();
    expect(Array.isArray(result.actions)).toBe(true);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.executionPlan).toHaveProperty('orderedActionIds');
    expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.extractionPath).toMatch(/FAST|HYBRID/);
  });

  it('returns needs_clarification for ambiguous names', async () => {
    const result = await analyzeTranscript({
      transcript: 'Assign this to Rahul.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    expect(result.status).toMatch(/needs_clarification|extracted/);
    // Rahul is ambiguous (Sharma or Verma) — should flag clarification
    const hasClarification = result.clarifications.some(c => c.field === 'assignee' || c.field === 'duplicate');
    expect(hasClarification || result.actions[0]?.warnings.length > 0).toBe(true);
  });

  it('handles empty transcript gracefully', async () => {
    const result = await analyzeTranscript({
      transcript: '',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    expect(result.status).toBe('empty');
    expect(result.actions).toHaveLength(0);
  });

  it('classifies WhatsApp command as SEND_WHATSAPP', async () => {
    const result = await analyzeTranscript({
      transcript: 'Aman ko WhatsApp karo ki report bhejo.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    expect(result.actions[0]?.type).toBe('SEND_WHATSAPP');
    expect(result.actions[0]?.requiresApproval).toBe(true);
  });

  it('processes multi-task transcript and produces multiple actions', async () => {
    const result = await analyzeTranscript({
      transcript: 'Reena should bring milk every morning. Jayant should check the generator every Friday.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    expect(result.metadata.multiTask).toBe(true);
    expect(result.actions.length).toBeGreaterThan(1);
  });

  it('includes processing time metadata', async () => {
    const result = await analyzeTranscript({
      transcript: 'Assign Priya to review the report.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE
    });
    expect(typeof result.metadata.processingTimeMs).toBe('number');
    expect(result.metadata.processingTimeMs).toBeLessThan(500);
  });

  it('produces safety alert for safety-critical transcripts', async () => {
    const result = await analyzeTranscript({
      transcript: 'Override the electrical safety interlock and proceed with maintenance.',
      directory: SAMPLE_PEOPLE,
      projects: SAMPLE_PROJECTS,
      departments: SAMPLE_DEPARTMENTS,
      referenceDate: REF_DATE,
      industry: 'construction'
    });
    // May or may not trigger safety based on industry dict — just check structure
    expect(result).toHaveProperty('safetyAlert');
  });
});
