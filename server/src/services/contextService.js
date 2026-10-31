/**
 * ActionFlow Server — Advanced Conversational Context & Memory Service (Phase 3)
 *
 * Handles:
 * - Cross-turn pronoun & entity resolution (Hinglish + English)
 * - Conversational negation & correction handling ("No, not Rahul, assign this to Aman instead")
 * - Contact ambiguity detection (e.g. Rahul Sharma vs Rahul Verma)
 * - Active project & department session memory
 * - Persistent correction history & audit trail
 */

import { cacheService } from '../cache/cacheService.js';

const CONTEXT_TTL_SECONDS = 60 * 60; // 60 minutes

class ContextService {
  /**
   * Stores the last extracted action for a session
   */
  async setLastAction(sessionId, action) {
    if (!sessionId || !action) return;
    await cacheService.set(
      `af:ctx:${sessionId}:lastAction`,
      sanitizeForStorage(action),
      CONTEXT_TTL_SECONDS
    );
  }

  async getLastAction(sessionId) {
    if (!sessionId) return null;
    return cacheService.get(`af:ctx:${sessionId}:lastAction`);
  }

  /**
   * Stores the last referenced person for pronoun resolution
   */
  async setLastPerson(sessionId, person) {
    if (!sessionId || !person) return;
    const payload = typeof person === 'string' ? { name: person } : person;
    await cacheService.set(
      `af:ctx:${sessionId}:lastPerson`,
      { id: payload.id || null, name: payload.name, department: payload.department || null },
      CONTEXT_TTL_SECONDS
    );
  }

  async getLastPerson(sessionId) {
    if (!sessionId) return null;
    return cacheService.get(`af:ctx:${sessionId}:lastPerson`);
  }

  /**
   * Stores recently referenced people (up to 5)
   */
  async addRecentPerson(sessionId, person) {
    if (!sessionId || !person) return;
    const payload = typeof person === 'string' ? { name: person } : person;
    const existing = (await cacheService.get(`af:ctx:${sessionId}:recentPeople`)) || [];
    const updated = [
      { id: payload.id || null, name: payload.name },
      ...existing.filter(p => p.name?.toLowerCase() !== payload.name?.toLowerCase())
    ].slice(0, 5);
    await cacheService.set(`af:ctx:${sessionId}:recentPeople`, updated, CONTEXT_TTL_SECONDS);
  }

  async getRecentPeople(sessionId) {
    if (!sessionId) return [];
    return (await cacheService.get(`af:ctx:${sessionId}:recentPeople`)) || [];
  }

  /**
   * Active Project Session Memory
   */
  async setActiveProject(sessionId, project) {
    if (!sessionId) return;
    await cacheService.set(`af:ctx:${sessionId}:activeProject`, project, CONTEXT_TTL_SECONDS);
  }

  async getActiveProject(sessionId) {
    if (!sessionId) return null;
    return cacheService.get(`af:ctx:${sessionId}:activeProject`);
  }

  /**
   * Ambiguity Detection: Resolves a contact name against directory
   * If multiple contacts share the same first name/alias, flags ambiguity with options.
   *
   * @param {string} name
   * @param {Array<Object>} directory
   * @returns {{ isAmbiguous: boolean, match?: Object, candidates?: Array<Object>, message?: string }}
   */
  resolveAmbiguousContact(name, directory = []) {
    if (!name || typeof name !== 'string') {
      return { isAmbiguous: false, match: null };
    }

    const trimmed = name.trim().toLowerCase();
    const candidates = directory.filter(contact => {
      const cName = contact.name?.toLowerCase() || '';
      const aliases = (contact.aliases || []).map(a => a.toLowerCase());
      return (
        cName === trimmed ||
        cName.startsWith(trimmed) ||
        aliases.includes(trimmed) ||
        aliases.some(a => a.startsWith(trimmed))
      );
    });

    if (candidates.length > 1) {
      return {
        isAmbiguous: true,
        query: name,
        candidates: candidates.map(c => ({
          id: c.id,
          name: c.name,
          department: c.department || '',
          email: c.email || '',
          role: c.role || ''
        })),
        message: `I found ${candidates.length} contacts matching "${name}". Which one did you mean?`
      };
    }

    if (candidates.length === 1) {
      return { isAmbiguous: false, match: candidates[0] };
    }

    return { isAmbiguous: false, match: null };
  }

  /**
   * Conversational Negation & Correction Detector
   * Examples:
   * - "No, not Rahul, assign this to Aman instead"
   * - "Rahul nahi, Aman ko assign karo"
   * - "Deadline Friday kar do"
   * - "Change priority to Urgent"
   *
   * @param {string} sessionId
   * @param {string} transcript
   * @param {Array<Object>} directory
   * @returns {Promise<{ isCorrection: boolean, updatedAction?: Object, field?: string, change?: Object }>}
   */
  async handleConversationalCorrection(sessionId, transcript, directory = []) {
    const lastAction = await this.getLastAction(sessionId);
    const lower = transcript.toLowerCase();

    // 1. Assignee Negation / Reassignment
    const reassignMatch =
      transcript.match(/(?:no\s*,?\s*not\s+([A-Za-z\u0900-\u097F]+)[^,]*,?\s*assign\s+(?:this\s+)?to\s+([A-Za-z\u0900-\u097F]+)(?:\s+instead)?)/i) ||
      transcript.match(/([A-Za-z\u0900-\u097F]+)\s+(?:nahi|ko\s+nahi)[^,]*,?\s*([A-Za-z\u0900-\u097F]+)\s+ko\s+assign\s+(?:kar\s+do|karo)/i);

    if (reassignMatch) {
      const oldName = reassignMatch[1].trim();
      const newName = reassignMatch[2].trim();

      const resolvedNew = this.resolveAmbiguousContact(newName, directory);
      const newPerson = resolvedNew.match || { name: newName };

      await this.setLastPerson(sessionId, newPerson);
      await this.recordCorrection(sessionId, {
        field: 'assignee',
        oldValue: oldName,
        newValue: newPerson.name,
        transcript
      });

      const updatedAction = lastAction ? {
        ...lastAction,
        assignee: newPerson,
        title: lastAction.title?.replace(new RegExp(oldName, 'i'), newPerson.name) || lastAction.title
      } : null;

      if (updatedAction) await this.setLastAction(sessionId, updatedAction);

      return {
        isCorrection: true,
        field: 'assignee',
        oldValue: oldName,
        newValue: newPerson.name,
        updatedAction,
        message: `Updated assignee from ${oldName} to ${newPerson.name}.`
      };
    }

    // 2. Deadline Adjustment
    const deadlineMatch = transcript.match(/(?:change\s+deadline\s+to|deadline\s+(?:shift\s+to|kar\s+do|bada\s+do))\s+([^.;!?]+)/i);
    if (deadlineMatch && lastAction) {
      const newDeadline = deadlineMatch[1].trim();
      const updatedAction = { ...lastAction, deadline: newDeadline, deadlineRaw: newDeadline };
      await this.setLastAction(sessionId, updatedAction);
      await this.recordCorrection(sessionId, { field: 'deadline', oldValue: lastAction.deadline, newValue: newDeadline, transcript });

      return {
        isCorrection: true,
        field: 'deadline',
        newValue: newDeadline,
        updatedAction,
        message: `Updated deadline to ${newDeadline}.`
      };
    }

    // 3. Priority Adjustment
    const priorityMatch = transcript.match(/(?:mark|set|change)?\s*priority\s+(?:as|to|kar\s+do)\s+(urgent|high|medium|normal|low)/i);
    if (priorityMatch && lastAction) {
      const newPriority = priorityMatch[1].charAt(0).toUpperCase() + priorityMatch[1].slice(1).toLowerCase();
      const updatedAction = { ...lastAction, priority: newPriority };
      await this.setLastAction(sessionId, updatedAction);
      await this.recordCorrection(sessionId, { field: 'priority', oldValue: lastAction.priority, newValue: newPriority, transcript });

      return {
        isCorrection: true,
        field: 'priority',
        newValue: newPriority,
        updatedAction,
        message: `Updated priority to ${newPriority}.`
      };
    }

    return { isCorrection: false };
  }

  /**
   * Resolves pronouns/references using session context
   */
  async resolveReferences(sessionId, transcript) {
    const resolutions = [];
    let resolved = transcript;

    const lastPerson = await this.getLastPerson(sessionId);
    if (lastPerson?.name) {
      // Matches both English and Hinglish third-person pronouns
      const pronounRegex = /\b(usse|unko|unhe|inhe|use|him|her|them)\b/gi;
      if (pronounRegex.test(transcript)) {
        resolved = resolved.replace(pronounRegex, lastPerson.name);
        resolutions.push({
          type: 'pronoun',
          original: transcript.match(pronounRegex)?.[0] || 'pronoun',
          resolved: lastPerson.name,
          confidence: 0.88
        });
      }
    }

    const lastAction = await this.getLastAction(sessionId);
    if (lastAction?.title) {
      const taskRefRegex = /\b(wahi\s+task|previous\s+task|that\s+task|is\s+task|same\s+task|that\s+assignment|us\s+task)\b/gi;
      if (taskRefRegex.test(transcript)) {
        resolutions.push({
          type: 'task_reference',
          original: 'task reference',
          resolved: lastAction.title,
          confidence: 0.9,
          actionId: lastAction.id
        });
      }
    }

    return { resolvedTranscript: resolved, resolutions };
  }

  /**
   * Stores a correction record for feedback-driven improvement
   */
  async recordCorrection(sessionId, correction) {
    if (!sessionId) return;
    const key = `af:ctx:${sessionId}:corrections`;
    const existing = (await cacheService.get(key)) || [];
    existing.push({
      ...correction,
      id: `corr_${Date.now()}`,
      sessionId,
      timestamp: new Date().toISOString(),
      evaluationResult: 'PENDING'
    });
    const trimmed = existing.slice(-50);
    await cacheService.set(key, trimmed, CONTEXT_TTL_SECONDS * 2);
  }

  async getCorrections(sessionId) {
    if (!sessionId) return [];
    return (await cacheService.get(`af:ctx:${sessionId}:corrections`)) || [];
  }

  /**
   * Clears all context for a session
   */
  async clearSession(sessionId) {
    if (!sessionId) return;
    const keys = [
      `af:ctx:${sessionId}:lastAction`,
      `af:ctx:${sessionId}:lastPerson`,
      `af:ctx:${sessionId}:recentPeople`,
      `af:ctx:${sessionId}:activeProject`,
      `af:ctx:${sessionId}:corrections`
    ];
    await Promise.all(keys.map(k => cacheService.del(k)));
  }
}

function sanitizeForStorage(action) {
  if (!action) return null;
  return {
    id: action.id,
    title: action.title,
    type: action.type,
    destination: action.destination,
    assignee: action.assignee ? { id: action.assignee.id, name: action.assignee.name } : null,
    deadline: action.deadline,
    priority: action.priority,
    executionState: action.executionState
  };
}

export const contextService = new ContextService();
