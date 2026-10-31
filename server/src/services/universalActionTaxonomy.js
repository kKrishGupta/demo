/**
 * ActionFlow AI — Universal Action Taxonomy & Ontology (V5 Master)
 *
 * Industry-agnostic, connector-independent canonical action definitions.
 * Every instruction decomposes into generic action structures:
 * CREATE, READ, UPDATE, DELETE, SEND, RECEIVE, ASSIGN, TRANSFER, APPROVE,
 * REJECT, SCHEDULE, RESCHEDULE, CANCEL, COMPLETE, REMIND, SEARCH, ANALYZE,
 * GENERATE, UPLOAD, DOWNLOAD, SHARE, RECORD, MONITOR, NOTIFY, ESCALATE, VALIDATE, CUSTOM.
 */

export const UNIVERSAL_OPERATIONS = Object.freeze({
  CREATE:     'CREATE',
  READ:       'READ',
  UPDATE:     'UPDATE',
  DELETE:     'DELETE',
  SEND:       'SEND',
  RECEIVE:    'RECEIVE',
  ASSIGN:     'ASSIGN',
  TRANSFER:   'TRANSFER',
  APPROVE:    'APPROVE',
  REJECT:     'REJECT',
  SCHEDULE:   'SCHEDULE',
  RESCHEDULE: 'RESCHEDULE',
  CANCEL:     'CANCEL',
  COMPLETE:   'COMPLETE',
  REMIND:     'REMIND',
  SEARCH:     'SEARCH',
  ANALYZE:    'ANALYZE',
  GENERATE:   'GENERATE',
  UPLOAD:     'UPLOAD',
  DOWNLOAD:   'DOWNLOAD',
  SHARE:      'SHARE',
  RECORD:     'RECORD',
  MONITOR:    'MONITOR',
  NOTIFY:     'NOTIFY',
  ESCALATE:   'ESCALATE',
  VALIDATE:   'VALIDATE',
  CUSTOM:     'CUSTOM'
});

export const EXECUTION_RISK_LEVELS = Object.freeze({
  SAFE:       'SAFE',       // Internal mutation, no external broadcast, safe to auto-execute
  REVERSIBLE: 'REVERSIBLE', // External write that can be undone (e.g. create draft, temporary block)
  CRITICAL:   'CRITICAL',   // Irreversible external mutation, broadcast, financial, or industrial safety
  SAFETY:     'SAFETY'      // Consequential physical, life-safety, mine ventilation, or machinery control
});

/**
 * Universal Action Schema Builder
 */
export function createUniversalAction(data = {}) {
  const baseId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  return {
    actionId: data.actionId || baseId,
    id: data.actionId || baseId,
    intent: data.intent || 'generic_instruction',
    operation: data.operation || UNIVERSAL_OPERATIONS.CUSTOM,
    target: data.target || 'entity',
    title: data.title || `${data.operation || 'ACTION'} ${data.target || 'Entity'}`,
    destination: data.destination || 'system_internal',
    destinationLabel: data.destinationLabel || data.destination || 'Internal Service',
    parameters: data.parameters || {},
    entities: data.entities || [],
    relationships: data.relationships || [],
    dependencies: data.dependencies || [],
    confidence: {
      overall: data.confidence?.overall ?? 0.95,
      operation: data.confidence?.operation ?? 0.96,
      destination: data.confidence?.destination ?? 0.94,
      parameters: data.confidence?.parameters ?? 0.92
    },
    approval: {
      required: data.approval?.required ?? (
        [UNIVERSAL_OPERATIONS.SEND, UNIVERSAL_OPERATIONS.DELETE, UNIVERSAL_OPERATIONS.SCHEDULE, 
         UNIVERSAL_OPERATIONS.RESCHEDULE, UNIVERSAL_OPERATIONS.TRANSFER, UNIVERSAL_OPERATIONS.ESCALATE]
        .includes(data.operation)
      ),
      status: data.approval?.status || 'PENDING',
      policy: data.approval?.policy || 'EXPLICIT_CONFIRMATION',
      riskLevel: data.approval?.riskLevel || EXECUTION_RISK_LEVELS.REVERSIBLE
    },
    execution: {
      status: data.execution?.status || 'DRAFT',
      retries: data.execution?.retries || 0,
      idempotencyKey: data.execution?.idempotencyKey || `idem_${baseId}`,
      lastRunAt: null,
      error: null
    },
    source: {
      rawText: data.source?.rawText || '',
      startIndex: data.source?.startIndex ?? 0,
      endIndex: data.source?.endIndex ?? 0,
      language: data.source?.language || 'en'
    }
  };
}

/**
 * Registry of dynamic custom action types and company-specific ontologies
 */
class UniversalTaxonomyRegistry {
  constructor() {
    this._customOperations = new Map();
    this._domainMappings = new Map();
  }

  registerCustomOperation(name, schema) {
    if (!name) throw new Error('Operation name required');
    const upper = name.toUpperCase();
    this._customOperations.set(upper, {
      name: upper,
      description: schema?.description || '',
      riskLevel: schema?.riskLevel || EXECUTION_RISK_LEVELS.REVERSIBLE,
      requiredParameters: schema?.requiredParameters || [],
      validate: schema?.validate || (() => ({ valid: true }))
    });
    return upper;
  }

  isOperationSupported(op) {
    if (!op) return false;
    const upper = String(op).toUpperCase();
    return Boolean(UNIVERSAL_OPERATIONS[upper] || this._customOperations.has(upper));
  }

  getOperationMeta(op) {
    if (!op) return null;
    const upper = String(op).toUpperCase();
    if (UNIVERSAL_OPERATIONS[upper]) {
      return {
        name: upper,
        isStandard: true,
        riskLevel: [UNIVERSAL_OPERATIONS.DELETE, UNIVERSAL_OPERATIONS.TRANSFER, UNIVERSAL_OPERATIONS.ESCALATE].includes(upper) 
          ? EXECUTION_RISK_LEVELS.CRITICAL 
          : EXECUTION_RISK_LEVELS.SAFE
      };
    }
    return this._customOperations.get(upper) || null;
  }
}

export const taxonomyRegistry = new UniversalTaxonomyRegistry();

