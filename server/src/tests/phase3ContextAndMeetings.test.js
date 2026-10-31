/**
 * ActionFlow AI — Phase 3: Context, Memory, Meeting Intelligence & DAG Test Suite
 *
 * Covers:
 * 1. Conversational Context & Multi-turn Pronoun Resolution
 * 2. Conversational Negation & Correction ("No, not Rahul, assign this to Aman instead")
 * 3. Ambiguous Contact Resolution with Candidate Generation
 * 4. Multi-Action Utterance Decomposition & Sequential Dependency DAGs
 * 5. Execution Gateway Dependency Gating (Blocks dependent actions until prerequisites complete)
 * 6. Long-Form Continuous Meeting Intelligence (Chunk processing, incremental extraction, end-of-meeting synthesis)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { contextService } from '../services/contextService.js';
import { dependencyGraphService } from '../services/dependencyGraphService.js';
import { meetingService } from '../services/meetingService.js';
import { executeAction, getActionState, EXECUTION_STATES } from '../services/executionGateway.js';

describe('Phase 3: Conversational Context & Pronoun Resolution', () => {
  const sessionId = 'session_p3_context_test';

  beforeEach(async () => {
    await contextService.clearSession(sessionId);
  });

  it('resolves pronouns across multi-turn interactions using last referenced person', async () => {
    // Turn 1: User mentions Rahul
    await contextService.setLastPerson(sessionId, { id: 'p1', name: 'Rahul', department: 'Operations' });

    // Turn 2: User says "Usse bolo kal meeting hai"
    const res = await contextService.resolveReferences(sessionId, 'Usse bolo kal meeting hai');
    expect(res.resolvedTranscript).toContain('Rahul');
    expect(res.resolutions.length).toBeGreaterThan(0);
    expect(res.resolutions[0].type).toBe('pronoun');
    expect(res.resolutions[0].resolved).toBe('Rahul');
  });

  it('resolves English third-person pronouns (him, her, them)', async () => {
    await contextService.setLastPerson(sessionId, { id: 'p2', name: 'Priya', department: 'Design' });

    const res = await contextService.resolveReferences(sessionId, 'Tell her the report is ready');
    expect(res.resolvedTranscript).toContain('Priya');
    expect(res.resolutions[0].resolved).toBe('Priya');
  });

  it('resolves anaphoric task references to last action', async () => {
    await contextService.setLastAction(sessionId, {
      id: 'act_prev_101',
      title: 'Complete Quarterly Financial Audit',
      type: 'CREATE_TASK'
    });

    const res = await contextService.resolveReferences(sessionId, 'wahi task complete mark kar do');
    expect(res.resolutions.some(r => r.type === 'task_reference')).toBe(true);
    expect(res.resolutions[0].resolved).toBe('Complete Quarterly Financial Audit');
  });
});

describe('Phase 3: Conversational Negation & Correction Handling', () => {
  const sessionId = 'session_p3_negation_test';
  const directory = [
    { id: 'p1', name: 'Rahul Sharma', department: 'Engineering', aliases: ['rahul'] },
    { id: 'p2', name: 'Aman Gupta', department: 'Operations', aliases: ['aman'] }
  ];

  beforeEach(async () => {
    await contextService.clearSession(sessionId);
    await contextService.setLastAction(sessionId, {
      id: 'act_task_neg',
      title: 'Prepare production report for Rahul',
      assignee: { name: 'Rahul' },
      deadline: 'Tomorrow 5 PM',
      priority: 'Normal'
    });
  });

  it('correctly handles negation reassignment: "No, not Rahul, assign this to Aman instead"', async () => {
    const correction = await contextService.handleConversationalCorrection(
      sessionId,
      'No, not Rahul, assign this to Aman instead',
      directory
    );

    expect(correction.isCorrection).toBe(true);
    expect(correction.field).toBe('assignee');
    expect(correction.oldValue).toBe('Rahul');
    expect(correction.newValue).toBe('Aman Gupta');
    expect(correction.updatedAction.assignee.name).toBe('Aman Gupta');

    const history = await contextService.getCorrections(sessionId);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].field).toBe('assignee');
  });

  it('handles Hinglish negation: "Rahul nahi, Aman ko assign karo"', async () => {
    const correction = await contextService.handleConversationalCorrection(
      sessionId,
      'Rahul nahi, Aman ko assign karo',
      directory
    );

    expect(correction.isCorrection).toBe(true);
    expect(correction.field).toBe('assignee');
    expect(correction.newValue).toBe('Aman Gupta');
  });

  it('handles dynamic deadline change: "Change deadline to Friday"', async () => {
    const correction = await contextService.handleConversationalCorrection(
      sessionId,
      'Change deadline to Friday',
      directory
    );

    expect(correction.isCorrection).toBe(true);
    expect(correction.field).toBe('deadline');
    expect(correction.newValue).toBe('Friday');
    expect(correction.updatedAction.deadline).toBe('Friday');
  });

  it('handles priority escalation: "Mark priority as Urgent"', async () => {
    const correction = await contextService.handleConversationalCorrection(
      sessionId,
      'Mark priority as Urgent',
      directory
    );

    expect(correction.isCorrection).toBe(true);
    expect(correction.field).toBe('priority');
    expect(correction.newValue).toBe('Urgent');
    expect(correction.updatedAction.priority).toBe('Urgent');
  });
});

describe('Phase 3: Contact Ambiguity Detection', () => {
  const directory = [
    { id: 'p1', name: 'Rahul Verma', department: 'Operations', role: 'Plant Supervisor' },
    { id: 'p2', name: 'Rahul Sharma', department: 'Engineering', role: 'DevOps Lead' },
    { id: 'p3', name: 'Neha Joshi', department: 'Finance', role: 'Accountant' }
  ];

  it('detects multiple candidates when ambiguous name is queried', () => {
    const res = contextService.resolveAmbiguousContact('Rahul', directory);
    expect(res.isAmbiguous).toBe(true);
    expect(res.candidates.length).toBe(2);
    expect(res.candidates.map(c => c.name)).toContain('Rahul Verma');
    expect(res.candidates.map(c => c.name)).toContain('Rahul Sharma');
    expect(res.message).toContain('found 2 contacts');
  });

  it('unambiguously resolves a distinct contact', () => {
    const res = contextService.resolveAmbiguousContact('Neha', directory);
    expect(res.isAmbiguous).toBe(false);
    expect(res.match).toBeDefined();
    expect(res.match.name).toBe('Neha Joshi');
  });
});

describe('Phase 3: Multi-Task Utterance DAG & Dependency Gating', () => {
  const sessionId = 'session_p3_dag_test';

  it('builds a sequential DAG from multi-task utterance with temporal markers', () => {
    const actions = [
      { id: 'act_1', title: 'Complete system design spec', type: 'CREATE_TASK' },
      { id: 'act_2', title: 'Develop backend API endpoints', type: 'CREATE_TASK' },
      { id: 'act_3', title: 'Conduct client staging demo', type: 'CREATE_TASK' }
    ];

    const transcript = 'Pehle complete system design spec fir develop backend API endpoints aur uske baad conduct client staging demo';
    const { actions: enriched, graph } = dependencyGraphService.buildDependencyGraph(actions, transcript);

    expect(graph.edges.length).toBe(2);
    expect(graph.edges[0]).toEqual(expect.objectContaining({ from: 'act_1', to: 'act_2' }));
    expect(graph.edges[1]).toEqual(expect.objectContaining({ from: 'act_2', to: 'act_3' }));

    // Topological order
    expect(graph.executionOrder).toEqual(['act_1', 'act_2', 'act_3']);

    // Act 2 depends on Act 1
    expect(enriched[1].dependencies).toContain('act_1');
    expect(enriched[2].dependencies).toContain('act_2');
  });

  it('blocks execution of an action until prerequisite dependency completes', async () => {
    const prerequisiteAction = {
      id: `act_prereq_${Date.now()}`,
      title: 'Prerequisite Database Migration',
      type: 'CREATE_TASK'
    };

    const dependentAction = {
      id: `act_dep_${Date.now()}`,
      title: 'Start Production Workload',
      type: 'CREATE_TASK',
      dependencies: [prerequisiteAction.id]
    };

    // 1. Attempt to execute dependent action while prerequisite is NOT completed
    const blockedRes = await executeAction(dependentAction, { sessionId, isApproved: true });
    expect(blockedRes.status).toBe(EXECUTION_STATES.BLOCKED);
    expect(blockedRes.pendingDependencies).toContain(prerequisiteAction.id);

    // 2. Now execute and complete prerequisite action
    const prereqRes = await executeAction(prerequisiteAction, { sessionId, isApproved: true });
    expect(prereqRes.status).toBe(EXECUTION_STATES.COMPLETED);

    // 3. Retry dependent action — now succeeds!
    const unblockedRes = await executeAction(dependentAction, { sessionId, isApproved: true });
    expect(unblockedRes.status).toBe(EXECUTION_STATES.COMPLETED);
  });
});

describe('Phase 3: Long-Form Continuous Meeting Intelligence', () => {
  const sessionId = 'session_p3_meeting_test';

  it('manages complete meeting lifecycle with incremental chunks and AI synthesis', async () => {
    // 1. Start meeting
    const meeting = meetingService.startMeeting({
      title: 'Q3 Product Architecture Review',
      sessionId,
      participants: ['Rahul Verma', 'Aman Gupta', 'Neha Joshi']
    });

    expect(meeting.id).toBeDefined();
    expect(meeting.status).toBe('IN_PROGRESS');

    // 2. Process Chunk 1
    const chunk1 = await meetingService.processMeetingChunk({
      meetingId: meeting.id,
      chunkIndex: 0,
      transcript: 'Aman will prepare the migration strategy document by tomorrow.',
      speaker: 'Rahul Verma',
      sessionId
    });

    expect(chunk1.success).toBe(true);
    expect(chunk1.extractedActions.length).toBeGreaterThan(0);
    expect(chunk1.extractedActions[0].assignee.name).toBe('Aman');

    // 3. Process Chunk 2 with a formal decision
    const chunk2 = await meetingService.processMeetingChunk({
      meetingId: meeting.id,
      chunkIndex: 1,
      transcript: 'We decided that PostgreSQL will be used as primary relational store for analytics.',
      speaker: 'Neha Joshi',
      sessionId
    });

    expect(chunk2.success).toBe(true);

    // 4. End meeting and generate synthesis
    const completed = await meetingService.endMeeting({
      meetingId: meeting.id,
      sessionId
    });

    expect(completed.status).toBe('COMPLETED');
    expect(completed.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(completed.summary).toBeDefined();
    expect(completed.summary.executiveSummary).toBeDefined();
    expect(Array.isArray(completed.summary.keyDiscussionPoints)).toBe(true);
    expect(completed.summary.actionItems.length).toBeGreaterThan(0);
  });
});

