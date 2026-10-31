import { processMultilingualTask, extractCleanTitle, extractTaskDescription as extractDesc } from './multilingualEngine.js';
import { extractPriorityFromText } from './dictionary/priorityDictionary.js';

export { extractCleanTitle as extractTaskTitle, extractDesc as extractTaskDescription };

/**
 * Extracts priority from transcript
 * @param {string} transcript 
 * @returns {'Low'|'Normal'|'High'|'Urgent'|''}
 */
export function extractPriority(transcript) {
  const result = extractPriorityFromText(transcript);
  return result.level || '';
}

/**
 * Extracts department from transcript
 * @param {string} transcript 
 * @param {Array} departments 
 * @returns {string}
 */
export function extractDepartment(transcript, departments = []) {
  if (transcript) {
    const lower = transcript.toLowerCase();
    for (const dept of departments) {
      if (lower.includes(dept.toLowerCase())) {
        return dept;
      }
    }
  }
  return '';
}

/**
 * Main Rule-Based and Multilingual Extraction Function
 * 
 * @param {Object} params
 * @param {string} params.transcript Spoken or pasted text
 * @param {Array} params.directory Sample directory people
 * @param {Array} params.projects Sample projects
 * @param {Array} params.departments Sample departments
 * @param {Date} [params.referenceDate] Reference date (default: now)
 * @returns {Object} Structured task draft with field values, statuses, and warnings
 */
export function extractTaskDraft(params) {
  return processMultilingualTask(params);
}
