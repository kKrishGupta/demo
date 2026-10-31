/**
 * ActionFlow AI — Dependency-Aware Micro-Action Planner
 * Builds a Directed Acyclic Graph (DAG) of actions, detects cycles,
 * computes topological order, and identifies parallel execution groups.
 */

import { DEPENDENCY_TYPES, EXECUTION_STATES } from './actionTypes.js';

// ─── DAG Node ────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} DAGNode
 * @property {string} id
 * @property {string} title
 * @property {string} priority
 * @property {string} deadline
 * @property {string} executionState
 * @property {string[]} dependsOn   - action IDs this must wait for
 * @property {string[]} blocks      - action IDs that depend on this
 * @property {number} topologicalOrder
 * @property {number} parallelGroup
 */

/**
 * Builds a DAG from an array of MicroActions
 * @param {Array} actions
 * @returns {{ nodes: Map<string,DAGNode>, edges: Array, hasCycle: boolean, cycleInfo: string[] }}
 */
export function buildDAG(actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return { nodes: new Map(), edges: [], hasCycle: false, cycleInfo: [] };
  }

  const nodes = new Map();
  const edges = [];

  // Initialize nodes
  for (const action of actions) {
    nodes.set(action.id, {
      id: action.id,
      title: action.title,
      priority: action.priority,
      deadline: action.deadline,
      executionState: action.executionState,
      dependsOn: [],
      blocks: [],
      topologicalOrder: -1,
      parallelGroup: -1
    });
  }

  // Build edges from explicit dependencies
  for (const action of actions) {
    if (!Array.isArray(action.dependencies)) continue;
    for (const dep of action.dependencies) {
      if (!dep.actionId) continue;
      const from = dep.actionId;
      const to = action.id;

      if (!nodes.has(from) || !nodes.has(to)) continue;

      nodes.get(to).dependsOn.push(from);
      nodes.get(from).blocks.push(to);
      edges.push({ from, to, type: dep.type || DEPENDENCY_TYPES.DEPENDS_ON_COMPLETION_OF });
    }
  }

  // Cycle detection using DFS
  const cycleInfo = detectCycles(nodes);

  return { nodes, edges, hasCycle: cycleInfo.length > 0, cycleInfo };
}

/**
 * Detects cycles in the DAG using DFS coloring
 * @param {Map<string, DAGNode>} nodes
 * @returns {string[]} cycle paths if any
 */
function detectCycles(nodes) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const cycles = [];

  for (const id of nodes.keys()) {
    color.set(id, WHITE);
  }

  function dfs(id, path) {
    color.set(id, GRAY);
    const node = nodes.get(id);
    for (const blocked of (node?.blocks || [])) {
      if (color.get(blocked) === GRAY) {
        cycles.push([...path, id, blocked].join(' → '));
      } else if (color.get(blocked) === WHITE) {
        dfs(blocked, [...path, id]);
      }
    }
    color.set(id, BLACK);
  }

  for (const id of nodes.keys()) {
    if (color.get(id) === WHITE) {
      dfs(id, []);
    }
  }
  return cycles;
}

/**
 * Computes topological order using Kahn's algorithm
 * @param {Map<string, DAGNode>} nodes
 * @returns {string[]} ordered action IDs
 */
export function topologicalSort(nodes) {
  const inDegree = new Map();
  for (const [id] of nodes) {
    inDegree.set(id, 0);
  }
  for (const [, node] of nodes) {
    for (const dep of node.dependsOn) {
      inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
    }
  }

  // Recalculate correctly
  inDegree.clear();
  for (const [id] of nodes) inDegree.set(id, 0);
  for (const [, node] of nodes) {
    for (const dep of node.dependsOn) {
      if (inDegree.has(node.id)) {
        inDegree.set(node.id, inDegree.get(node.id) + 1);
      }
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  // Sort initial queue by priority and deadline
  queue.sort((a, b) => {
    const nodeA = nodes.get(a);
    const nodeB = nodes.get(b);
    return getPriorityScore(nodeB?.priority) - getPriorityScore(nodeA?.priority);
  });

  const result = [];
  while (queue.length > 0) {
    const id = queue.shift();
    result.push(id);
    const node = nodes.get(id);
    for (const blocked of (node?.blocks || [])) {
      const newDeg = (inDegree.get(blocked) || 1) - 1;
      inDegree.set(blocked, newDeg);
      if (newDeg === 0) {
        queue.push(blocked);
      }
    }
  }
  return result;
}

function getPriorityScore(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'urgent': return 4;
    case 'high':   return 3;
    case 'normal': return 2;
    case 'low':    return 1;
    default:       return 2;
  }
}

/**
 * Identifies parallel execution groups — actions with no mutual dependencies
 * @param {Map<string, DAGNode>} nodes
 * @param {string[]} orderedIds - topologically sorted IDs
 * @returns {Array<string[]>} groups of action IDs that can run in parallel
 */
export function computeParallelGroups(nodes, orderedIds) {
  const groups = [];
  const assigned = new Set();

  for (const id of orderedIds) {
    if (assigned.has(id)) continue;
    const node = nodes.get(id);
    if (!node) continue;

    // Find a group this node can join (no mutual dependency with any member)
    let placed = false;
    for (const group of groups) {
      const canJoin = group.every(gId => {
        const gNode = nodes.get(gId);
        return (
          !node.dependsOn.includes(gId) &&
          !node.blocks.includes(gId) &&
          !gNode?.dependsOn.includes(id) &&
          !gNode?.blocks.includes(id)
        );
      });
      if (canJoin) {
        group.push(id);
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push([id]);
    }
    assigned.add(id);
  }
  return groups;
}

/**
 * Detects deadline conflicts between dependent actions
 * @param {Map<string, DAGNode>} nodes
 * @returns {Array<{fromId: string, toId: string, message: string}>}
 */
export function detectDeadlineConflicts(nodes) {
  const conflicts = [];
  for (const [, node] of nodes) {
    if (!node.deadline) continue;
    for (const depId of node.dependsOn) {
      const depNode = nodes.get(depId);
      if (!depNode?.deadline) continue;
      if (new Date(node.deadline) <= new Date(depNode.deadline)) {
        conflicts.push({
          fromId: depId,
          toId: node.id,
          message: `"${node.title}" is due before its dependency "${depNode.title}" completes.`
        });
      }
    }
  }
  return conflicts;
}

/**
 * Builds the full execution plan for an array of actions
 * @param {Array} actions - MicroAction array
 * @returns {ExecutionPlan}
 */
export function buildExecutionPlan(actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return {
      orderedActionIds: [],
      parallelGroups: [],
      blockedActionIds: [],
      deadlineConflicts: [],
      hasCycle: false,
      cycleInfo: []
    };
  }

  const { nodes, edges, hasCycle, cycleInfo } = buildDAG(actions);

  if (hasCycle) {
    return {
      orderedActionIds: actions.map(a => a.id),
      parallelGroups: [actions.map(a => a.id)],
      blockedActionIds: [],
      deadlineConflicts: [],
      hasCycle: true,
      cycleInfo,
      warning: 'Circular dependency detected. Please review action dependencies.'
    };
  }

  const orderedIds = topologicalSort(nodes);
  const parallelGroups = computeParallelGroups(nodes, orderedIds);
  const deadlineConflicts = detectDeadlineConflicts(nodes);

  // Identify blocked actions (BLOCKED state or have unresolved dependencies)
  const blockedActionIds = actions
    .filter(a => a.executionState === EXECUTION_STATES.BLOCKED)
    .map(a => a.id);

  // Assign topological order back to nodes
  orderedIds.forEach((id, idx) => {
    const node = nodes.get(id);
    if (node) node.topologicalOrder = idx;
  });

  // Assign parallel groups
  parallelGroups.forEach((group, groupIdx) => {
    for (const id of group) {
      const node = nodes.get(id);
      if (node) node.parallelGroup = groupIdx;
    }
  });

  return {
    orderedActionIds: orderedIds,
    parallelGroups,
    blockedActionIds,
    deadlineConflicts,
    hasCycle: false,
    cycleInfo: []
  };
}

/**
 * Generates smart action recommendations based on the primary action
 * @param {Object} primaryAction - MicroAction
 * @param {Array} existingActions
 * @returns {Array<{type: string, title: string, rationale: string, source: 'SUGGESTED_ACTION'}>}
 */
export function generateRecommendations(primaryAction, existingActions = []) {
  const suggestions = [];
  const titleLower = (primaryAction.title || '').toLowerCase();
  const transcript = (primaryAction.sourceText || '').toLowerCase();

  // Meeting-related recommendations
  if (primaryAction.type === 'CREATE_CALENDAR_EVENT' || /\bmeeting\b/.test(titleLower)) {
    suggestions.push({
      type: 'CREATE_TASK',
      title: 'Prepare meeting agenda',
      rationale: 'Meetings benefit from a prepared agenda.',
      source: 'SUGGESTED_ACTION'
    });
    suggestions.push({
      type: 'CREATE_REMINDER',
      title: 'Meeting reminder 30 minutes before',
      rationale: 'Reminders help ensure attendance.',
      source: 'SUGGESTED_ACTION'
    });
  }

  // Report-related recommendations
  if (/\breport\b/.test(titleLower) && !/\bsend\b/.test(titleLower)) {
    suggestions.push({
      type: 'CREATE_FOLLOW_UP',
      title: `Follow up on ${primaryAction.title}`,
      rationale: 'Track delivery of report.',
      source: 'SUGGESTED_ACTION'
    });
  }

  // Missing deadline
  if (!primaryAction.deadline && primaryAction.type !== 'RETRIEVE_TASKS') {
    suggestions.push({
      type: 'UPDATE_TASK',
      title: 'Set deadline for this task',
      rationale: 'Tasks without deadlines are often missed.',
      source: 'SUGGESTED_ACTION'
    });
  }

  // Missing assignee
  if (!primaryAction.assignee) {
    suggestions.push({
      type: 'ASSIGN_TASK',
      title: 'Assign this task to a team member',
      rationale: 'Unassigned tasks lack clear ownership.',
      source: 'SUGGESTED_ACTION'
    });
  }

  // Follow-up detection from transcript
  if (/(?:i\s+will|i'll|main\s+bhejunga|main\s+karunga|will\s+send|will\s+complete)\s+(?:this|it|the|yeh)\s+(?:tomorrow|kal|by\s+\w+day)/i.test(transcript)) {
    suggestions.push({
      type: 'CREATE_FOLLOW_UP',
      title: 'Follow-up commitment detected',
      rationale: 'A commitment was made in the transcript — create a reminder.',
      source: 'SUGGESTED_ACTION'
    });
  }

  return suggestions;
}
