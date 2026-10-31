/**
 * ActionFlow AI — Intelligence Engine Public API
 * Central export point for all intelligence capabilities.
 */

export {
  ACTION_TYPES,
  ACTION_SOURCES,
  EXECUTION_STATES,
  DEPENDENCY_TYPES,
  CONFIDENCE_THRESHOLDS,
  REQUIRES_APPROVAL,
  createMicroAction,
  draftToMicroAction,
  detectActionType
} from './actionTypes.js';

export {
  buildDAG,
  topologicalSort,
  computeParallelGroups,
  detectDeadlineConflicts,
  buildExecutionPlan,
  generateRecommendations
} from './dagPlanner.js';

export {
  computeFieldConfidences,
  computeOverallConfidence,
  identifyLowConfidenceFields,
  buildConfidenceReport
} from './confidenceEngine.js';

export {
  sessionContext
} from './contextMemory.js';

export {
  generateActionFingerprint,
  titleSimilarity,
  duplicateDetector
} from './duplicateDetector.js';

export {
  analyzeTranscript,
  quickExtract,
  registerCompletedAction,
  recordCorrection
} from './intelligenceService.js';

export { runEvaluation } from './evaluationRunner.js';
