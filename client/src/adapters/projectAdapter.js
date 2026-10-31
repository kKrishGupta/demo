/**
 * ProjectAdapter
 * Pluggable adapter for resolving authorized projects with zero-guessing policy.
 */

import { SAMPLE_PROJECTS } from '../data/sampleProjects';
import { escapeRegExp } from '../utils/security';

export class ProjectAdapter {
  constructor(projects = SAMPLE_PROJECTS) {
    // Explicitly labeled as sample/seed data in demo configuration
    this._projects = Array.isArray(projects) ? [...projects] : [];
  }

  /**
   * Retrieves all authorized project records
   * @returns {Array<Object>}
   */
  getProjects() {
    return this._projects;
  }

  /**
   * Finds a project by its stable ID
   * @param {string} id 
   * @returns {Object|null}
   */
  findProjectById(id) {
    if (!id) return null;
    return this._projects.find((p) => p.id === id) || null;
  }

  /**
   * Strictly matches a project name or project code
   * @param {string} rawProject 
   * @returns {{ status: 'valid'|'ambiguous'|'unknown', value: Object|null, candidates: Array<Object>, message?: string, confidence: number }}
   */
  resolveProject(rawProject) {
    if (!rawProject || typeof rawProject !== 'string') {
      return { status: 'unknown', value: null, candidates: [], confidence: 0 };
    }

    const clean = rawProject.trim().toLowerCase();

    // 1. Exact match on name or code
    const exact = this._projects.filter(
      (p) => p.name.toLowerCase() === clean || (p.code && p.code.toLowerCase() === clean)
    );
    if (exact.length === 1) {
      return { status: 'valid', value: exact[0], candidates: exact, confidence: 0.98 };
    }
    if (exact.length > 1) {
      return {
        status: 'ambiguous',
        value: null,
        candidates: exact,
        confidence: 0.5,
        message: `Multiple projects match "${rawProject}". Please choose the correct project.`
      };
    }

    // 2. Mention within string (e.g. "for Green Villa project")
    const matched = this._projects.filter((p) => {
      const reg = new RegExp(`\\b${escapeRegExp(p.name)}\\b`, 'i');
      return reg.test(rawProject);
    });

    if (matched.length === 1) {
      return { status: 'valid', value: matched[0], candidates: matched, confidence: 0.9 };
    }
    if (matched.length > 1) {
      return {
        status: 'ambiguous',
        value: null,
        candidates: matched,
        confidence: 0.5,
        message: `Multiple project names detected in instruction. Please select one.`
      };
    }

    return {
      status: 'unknown',
      value: null,
      candidates: [],
      confidence: 0,
      message: `Unknown project "${rawProject}". Please select an authorized project.`
    };
  }
}

export const defaultProjectAdapter = new ProjectAdapter();
