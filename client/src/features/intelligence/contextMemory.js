/**
 * ActionFlow AI — Context Memory Engine
 * In-session context store for pronoun resolution, follow-up references,
 * entity aliases, and recent action history.
 * All data is session-scoped (in-memory only) — no persistence across sessions.
 */

// ─── Session Context Store ───────────────────────────────────────────────────
const SESSION_TTL_MS = 30 * 60 * 1000; // 30-minute expiry for context entries

class ContextMemory {
  constructor() {
    this._recentActions = [];        // Last N processed actions
    this._recentPeople  = [];        // Recently referenced people
    this._recentProjects = [];       // Recently referenced projects
    this._corrections   = [];        // User corrections for feedback
    this._conversationTurns = [];    // Transcript history (limited)
    this._entityAliases = new Map(); // User-defined aliases
    this._lastMentionedTask = null;
    this._lastMentionedPerson = null;
    this._sessionStart = Date.now();
    this._maxHistorySize = 20;
  }

  // ── Action History ──────────────────────────────────────────────────────────
  addAction(action) {
    this._recentActions.unshift({
      ...action,
      _addedAt: Date.now()
    });
    if (this._recentActions.length > this._maxHistorySize) {
      this._recentActions.pop();
    }
    this._lastMentionedTask = action;

    // Track recently mentioned people
    if (action.assignee) {
      this.addRecentPerson(action.assignee);
    }
    if (action.reviewer) {
      this.addRecentPerson(action.reviewer);
    }
    if (action.project) {
      this.addRecentProject(action.project);
    }
  }

  getRecentActions(limit = 5) {
    return this._recentActions.slice(0, limit);
  }

  getLastMentionedTask() {
    return this._lastMentionedTask;
  }

  // ── People History ──────────────────────────────────────────────────────────
  addRecentPerson(person) {
    if (!person?.id) return;
    this._recentPeople = [
      person,
      ...this._recentPeople.filter(p => p.id !== person.id)
    ].slice(0, 10);
    this._lastMentionedPerson = person;
  }

  getLastMentionedPerson() {
    return this._lastMentionedPerson;
  }

  getRecentPeople(limit = 5) {
    return this._recentPeople.slice(0, limit);
  }

  // ── Project History ─────────────────────────────────────────────────────────
  addRecentProject(project) {
    if (!project?.id) return;
    this._recentProjects = [
      project,
      ...this._recentProjects.filter(p => p.id !== project.id)
    ].slice(0, 5);
  }

  getRecentProject() {
    return this._recentProjects[0] || null;
  }

  // ── Pronoun Resolution ──────────────────────────────────────────────────────
  /**
   * Resolves pronouns and vague references in transcript
   * @param {string} transcript
   * @returns {{ resolvedTranscript: string, resolutions: Array }}
   */
  resolvePronounsAndReferences(transcript) {
    if (!transcript) return { resolvedTranscript: transcript, resolutions: [] };

    let resolved = transcript;
    const resolutions = [];

    // Resolve person pronouns (usse, unko, him, her, he, she)
    const personPronouns = /\b(usse|unko|unhe|inhe|use|he|she|him|her|they|them)\b/gi;
    if (personPronouns.test(resolved) && this._lastMentionedPerson) {
      const person = this._lastMentionedPerson;
      resolved = resolved.replace(personPronouns, person.name);
      resolutions.push({
        type: 'person_pronoun',
        original: transcript.match(personPronouns)?.[0] || '',
        resolved: person.name,
        confidence: 0.8
      });
    }

    // Resolve task references (wahi task, previous task, that task, is task)
    const taskRefs = /\b(wahi\s+task|previous\s+task|that\s+task|is\s+task|usi\s+task|same\s+task|this\s+task)\b/gi;
    if (taskRefs.test(resolved) && this._lastMentionedTask) {
      const task = this._lastMentionedTask;
      resolutions.push({
        type: 'task_reference',
        original: 'task reference',
        resolved: task.title || 'previous task',
        confidence: 0.85,
        actionId: task.id
      });
    }

    return { resolvedTranscript: resolved, resolutions };
  }

  // ── Correction Feedback ─────────────────────────────────────────────────────
  /**
   * Records a user correction for feedback-driven improvement
   * @param {Object} correction
   */
  recordCorrection({
    originalTranscript,
    originalExtracted,
    correctedField,
    correctedValue,
    originalValue,
    actionId,
    modelVersion = 'rule-engine-v2',
    promptVersion = 'v1'
  }) {
    this._corrections.push({
      id: `corr_${Date.now()}`,
      originalTranscript,
      originalExtracted,
      correctedField,
      correctedValue,
      originalValue,
      actionId,
      modelVersion,
      promptVersion,
      timestamp: new Date().toISOString(),
      evaluationResult: 'PENDING'
    });
    // Keep last 100 corrections
    if (this._corrections.length > 100) {
      this._corrections.shift();
    }
  }

  getCorrections() {
    return [...this._corrections];
  }

  // ── Conversation History ────────────────────────────────────────────────────
  addConversationTurn(turn) {
    this._conversationTurns.push({
      ...turn,
      timestamp: Date.now()
    });
    // Keep last 10 turns (avoid large context)
    if (this._conversationTurns.length > 10) {
      this._conversationTurns.shift();
    }
  }

  /**
   * Retrieves relevant context for a new input without sending all history
   * @param {string} transcript
   * @returns {Object} relevant context snippet
   */
  getRelevantContext(transcript) {
    const lower = (transcript || '').toLowerCase();

    // Check if transcript references previous people or tasks
    const referencesLastPerson = /\b(usse|unko|him|her|he|she)\b/i.test(lower);
    const referencesLastTask = /\b(wahi|previous|same|that|this)\s+(?:task|kaam)\b/i.test(lower);
    const referencesLastProject = /\b(same|usi)\s+project\b/i.test(lower);

    return {
      lastPerson: referencesLastPerson ? this._lastMentionedPerson : null,
      lastTask: referencesLastTask ? this._lastMentionedTask : null,
      lastProject: referencesLastProject ? this.getRecentProject() : null,
      recentPeople: this._recentPeople.slice(0, 3),
      recentActions: this._recentActions.slice(0, 3)
    };
  }

  // ── Session Management ───────────────────────────────────────────────────────
  reset() {
    this._recentActions = [];
    this._recentPeople = [];
    this._recentProjects = [];
    this._lastMentionedTask = null;
    this._lastMentionedPerson = null;
    this._conversationTurns = [];
  }

  getSessionStats() {
    return {
      sessionAge: Date.now() - this._sessionStart,
      actionsProcessed: this._recentActions.length,
      correctionsRecorded: this._corrections.length,
      peopleReferenced: this._recentPeople.length
    };
  }
}

// Singleton session context — browser-scoped
export const sessionContext = new ContextMemory();

// Export the class for testing
export { ContextMemory };
