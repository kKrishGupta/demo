/**
 * ActionFlow AI — Duplicate Detection and Idempotency Engine
 * Prevents duplicate action creation and tracks idempotency keys.
 */

// ─── Action Fingerprinting ───────────────────────────────────────────────────

/**
 * Generates a structural fingerprint for an action to detect duplicates
 * @param {Object} action - MicroAction or task payload
 * @returns {string}
 */
export function generateActionFingerprint(action) {
  const parts = [
    normalizeForFingerprint(action.title || action.fields?.title || ''),
    normalizeForFingerprint(action.assignee?.id || action.fields?.assigneeId || ''),
    normalizeForFingerprint(action.deadline || action.fields?.dueDate || ''),
    normalizeForFingerprint(action.type || 'CREATE_TASK'),
    normalizeForFingerprint(action.recurrenceFrequency || action.fields?.recurrenceFrequency || '')
  ];
  return parts.join('|');
}

function normalizeForFingerprint(str) {
  return String(str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Computes title similarity for fuzzy duplicate detection
 * @param {string} a
 * @param {string} b
 * @returns {number} similarity 0..1
 */
export function titleSimilarity(a, b) {
  if (!a || !b) return 0;
  const na = normalizeForFingerprint(a);
  const nb = normalizeForFingerprint(b);
  if (na === nb) return 1.0;

  const wordsA = new Set(na.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(nb.split(' ').filter(w => w.length > 2));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  return union === 0 ? 0 : Number((intersection / union).toFixed(2));
}

// ─── In-Session Duplicate Store ──────────────────────────────────────────────
class DuplicateDetector {
  constructor() {
    this._processedFingerprints = new Map();  // fingerprint → { actionId, timestamp }
    this._processingLocks = new Set();        // fingerprints currently in-flight
    this._submittedActions = [];              // full action history for fuzzy check
  }

  /**
   * Checks if an action is a potential duplicate of previously processed actions
   * @param {Object} action
   * @returns {{ isDuplicate: boolean, matchType: string, matchedAction: Object|null, similarity: number }}
   */
  checkDuplicate(action) {
    const fingerprint = generateActionFingerprint(action);

    // 1. Exact fingerprint match
    if (this._processedFingerprints.has(fingerprint)) {
      const existing = this._processedFingerprints.get(fingerprint);
      return {
        isDuplicate: true,
        matchType: 'EXACT',
        matchedAction: existing,
        similarity: 1.0,
        fingerprint
      };
    }

    // 2. Fuzzy title similarity check
    const actionTitle = action.title || action.fields?.title || '';
    for (const submitted of this._submittedActions) {
      const similarity = titleSimilarity(actionTitle, submitted.title);
      if (similarity >= 0.85) {
        // Check if same assignee too
        const sameAssignee = (
          (action.assignee?.id || action.fields?.assigneeId) ===
          (submitted.assignee?.id || submitted.assigneeId)
        );
        if (sameAssignee || similarity >= 0.95) {
          return {
            isDuplicate: true,
            matchType: 'FUZZY',
            matchedAction: submitted,
            similarity,
            fingerprint
          };
        }
      }
    }

    return {
      isDuplicate: false,
      matchType: 'NONE',
      matchedAction: null,
      similarity: 0,
      fingerprint
    };
  }

  /**
   * Acquires a processing lock to prevent concurrent duplicate submissions
   * @param {string} fingerprint
   * @returns {boolean} true if lock acquired, false if already processing
   */
  acquireLock(fingerprint) {
    if (this._processingLocks.has(fingerprint)) return false;
    this._processingLocks.add(fingerprint);
    return true;
  }

  releaseLock(fingerprint) {
    this._processingLocks.delete(fingerprint);
  }

  /**
   * Registers a successfully processed action
   * @param {Object} action
   */
  register(action) {
    const fingerprint = generateActionFingerprint(action);
    this._processedFingerprints.set(fingerprint, {
      actionId: action.id,
      title: action.title || action.fields?.title,
      timestamp: Date.now(),
      assignee: action.assignee || { id: action.fields?.assigneeId }
    });
    this._submittedActions.unshift({
      id: action.id,
      title: action.title || action.fields?.title,
      assigneeId: action.assignee?.id || action.fields?.assigneeId,
      timestamp: Date.now()
    });
    // Keep last 50 registered actions
    if (this._submittedActions.length > 50) {
      this._submittedActions.pop();
    }
    this.releaseLock(fingerprint);
  }

  reset() {
    this._processedFingerprints.clear();
    this._processingLocks.clear();
    this._submittedActions = [];
  }
}

export const duplicateDetector = new DuplicateDetector();

// Export the class for testing
export { DuplicateDetector };
