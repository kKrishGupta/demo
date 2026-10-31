/**
 * ActionFlow Server — Dependency Graph & Multi-Task DAG Service (Phase 3)
 *
 * Decomposes multi-task utterances and builds Directed Acyclic Graphs (DAGs)
 * representing task prerequisites and execution sequence.
 *
 * Example:
 * "Pehle design complete karo fir backend develop karna aur uske baad client ko demo dena"
 *
 * Node A: "Design complete karo" (Prerequisite for B)
 * Node B: "Backend develop karna" (Depends on A, Prerequisite for C)
 * Node C: "Client ko demo dena" (Depends on B)
 */

export class DependencyGraphService {
  /**
   * Analyzes an array of decomposed action candidates or transcript clauses
   * and links dependencies based on sequential / prerequisite temporal markers.
   *
   * @param {Array<Object>} actions - Decomposed micro-actions
   * @param {string} fullTranscript - Full input utterance
   * @returns {{ actions: Array<Object>, graph: { nodes: Array, edges: Array, executionOrder: Array } }}
   */
  buildDependencyGraph(actions, fullTranscript = '') {
    if (!Array.isArray(actions) || actions.length <= 1) {
      return {
        actions: actions.map(a => ({ ...a, dependencies: a.dependencies || [] })),
        graph: {
          nodes: (actions || []).map(a => a.id),
          edges: [],
          executionOrder: (actions || []).map(a => a.id)
        }
      };
    }

    const lower = (fullTranscript || '').toLowerCase();
    const edges = [];
    const enrichedActions = [...actions];

    // Detect explicit sequential patterns
    const hasSequentialFlow =
      /\b(?:pehle|first|initially|start with)\b/i.test(lower) ||
      /\b(?:fir|phir|then|after that|uske baad|next|subsequently)\b/i.test(lower) ||
      /\b(?:before|prior to|prerequisite)\b/i.test(lower);

    if (hasSequentialFlow) {
      for (let i = 0; i < enrichedActions.length - 1; i++) {
        const current = enrichedActions[i];
        const next = enrichedActions[i + 1];

        // Current action is a prerequisite for next action
        edges.push({
          from: current.id,
          to: next.id,
          type: 'PREREQUISITE',
          description: `"${current.title}" must complete before "${next.title}"`
        });

        // Attach dependency reference to next action
        next.dependencies = next.dependencies || [];
        if (!next.dependencies.includes(current.id)) {
          next.dependencies.push(current.id);
        }

        // Flag execution gating
        next.isBlockedByDependency = true;
      }
    }

    // Compute topological execution order
    const executionOrder = this.topologicalSort(enrichedActions.map(a => a.id), edges);

    return {
      actions: enrichedActions,
      graph: {
        nodes: enrichedActions.map(a => ({ id: a.id, title: a.title, type: a.type })),
        edges,
        executionOrder
      }
    };
  }

  /**
   * Standard Kahn's algorithm for topological sorting of DAG nodes
   */
  topologicalSort(nodeIds, edges) {
    const inDegree = new Map();
    const adjList = new Map();

    nodeIds.forEach(id => {
      inDegree.set(id, 0);
      adjList.set(id, []);
    });

    edges.forEach(edge => {
      if (adjList.has(edge.from) && inDegree.has(edge.to)) {
        adjList.get(edge.from).push(edge.to);
        inDegree.set(edge.to, inDegree.get(edge.to) + 1);
      }
    });

    const queue = [];
    inDegree.forEach((degree, id) => {
      if (degree === 0) queue.push(id);
    });

    const order = [];
    while (queue.length > 0) {
      const u = queue.shift();
      order.push(u);

      const neighbors = adjList.get(u) || [];
      for (const v of neighbors) {
        inDegree.set(v, inDegree.get(v) - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    // If cycle detected, fallback to original order
    return order.length === nodeIds.length ? order : nodeIds;
  }

  /**
   * Validates whether an action is executable given the completion states of its prerequisites
   */
  isActionReadyForExecution(action, completedActionIds = new Set()) {
    if (!action.dependencies || action.dependencies.length === 0) {
      return { isReady: true, pendingDependencies: [] };
    }

    const pending = action.dependencies.filter(depId => !completedActionIds.has(depId));
    return {
      isReady: pending.length === 0,
      pendingDependencies: pending
    };
  }
}

export const dependencyGraphService = new DependencyGraphService();

