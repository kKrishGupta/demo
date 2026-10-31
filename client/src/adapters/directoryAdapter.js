/**
 * DirectoryAdapter
 * Pluggable adapter for resolving assignees, reviewers, and department records.
 * Uses configured directory store (sample data in demo; can be configured with enterprise LDAP / HRIS endpoints).
 */

import { SAMPLE_PEOPLE } from '../data/samplePeople';
import { SAMPLE_DEPARTMENTS } from '../data/sampleDepartments';
import { escapeRegExp } from '../utils/security';

export class DirectoryAdapter {
  constructor(people = SAMPLE_PEOPLE, departments = SAMPLE_DEPARTMENTS) {
    // Explicitly labeled as sample/seed data in demo configuration
    this._people = Array.isArray(people) ? [...people] : [];
    this._departments = Array.isArray(departments) ? [...departments] : [];
  }

  /**
   * Retrieves all authorized people records
   * @returns {Array<Object>}
   */
  getPeople() {
    return this._people;
  }

  /**
   * Retrieves all authorized departments
   * @returns {Array<string>}
   */
  getDepartments() {
    return this._departments;
  }

  /**
   * Finds a person by stable record ID
   * @param {string} id 
   * @returns {Object|null}
   */
  findPersonById(id) {
    if (!id) return null;
    return this._people.find((p) => p.id === id) || null;
  }

  /**
   * Searches people by case-insensitive name, email, or department
   * @param {string} query 
   * @returns {Array<Object>}
   */
  searchPeople(query) {
    if (!query || typeof query !== 'string') return [];
    const q = query.trim().toLowerCase();
    return this._people.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.department && p.department.toLowerCase().includes(q)) ||
      (p.aliases && p.aliases.some((a) => a.toLowerCase().includes(q)))
    );
  }

  /**
   * Strict Entity Resolution for spoken or typed person names
   * Enforces zero-guessing policy:
   * - 1 unique match -> status: 'valid', resolved ID
   * - >1 match collision -> status: 'ambiguous', resolved ID: null
   * - 0 match -> status: 'unknown', resolved ID: null
   * 
   * @param {string} rawName 
   * @param {Array<string>} [excludedIds=[]] IDs excluded due to negation or reassignment
   * @returns {{ status: 'valid'|'ambiguous'|'unknown', value: Object|null, candidates: Array<Object>, message?: string, confidence: number }}
   */
  resolvePerson(rawName, excludedIds = []) {
    if (!rawName || typeof rawName !== 'string') {
      return { status: 'unknown', value: null, candidates: [], confidence: 0 };
    }

    const cleanName = rawName.trim();
    const lower = cleanName.toLowerCase();
    const candidatePool = this._people.filter((p) => !excludedIds.includes(p.id));

    // 1. Exact Full Name Match
    const exactMatches = candidatePool.filter((p) => p.name.toLowerCase() === lower);
    if (exactMatches.length === 1) {
      return {
        status: 'valid',
        value: exactMatches[0],
        candidates: exactMatches,
        confidence: 0.98
      };
    }
    if (exactMatches.length > 1) {
      return {
        status: 'ambiguous',
        value: null,
        candidates: exactMatches,
        confidence: 0.5,
        message: `Multiple records found with exact name "${cleanName}". Please specify the intended individual.`
      };
    }

    // 2. Exact Nickname / Alias Match
    const aliasMatches = candidatePool.filter((p) =>
      p.aliases && p.aliases.some((a) => a.toLowerCase() === lower)
    );
    if (aliasMatches.length === 1) {
      return {
        status: 'valid',
        value: aliasMatches[0],
        candidates: aliasMatches,
        confidence: 0.92
      };
    }
    if (aliasMatches.length > 1) {
      return {
        status: 'ambiguous',
        value: null,
        candidates: aliasMatches,
        confidence: 0.5,
        message: `Multiple team members share alias "${cleanName}". Please clarify.`
      };
    }

    // 3. First Name Match (Conservative)
    const firstNameMatches = candidatePool.filter((p) => {
      const fn = p.name.split(' ')[0].toLowerCase();
      return fn === lower;
    });

    if (firstNameMatches.length === 1) {
      return {
        status: 'valid',
        value: firstNameMatches[0],
        candidates: firstNameMatches,
        confidence: 0.88
      };
    }
    if (firstNameMatches.length > 1) {
      return {
        status: 'ambiguous',
        value: null,
        candidates: firstNameMatches,
        confidence: 0.5,
        message: `Multiple team members named "${cleanName}" exist in the directory. Please select the correct record.`
      };
    }

    // 4. Word boundary match inside full transcript (e.g. transcript mentioned full name)
    const escaped = escapeRegExp(cleanName);
    const boundaryMatches = candidatePool.filter((p) =>
      new RegExp(`\\b${escapeRegExp(p.name)}\\b`, 'i').test(cleanName)
    );
    if (boundaryMatches.length === 1) {
      return {
        status: 'valid',
        value: boundaryMatches[0],
        candidates: boundaryMatches,
        confidence: 0.85
      };
    }

    // Zero match -> strict unknown record (never invent IDs)
    return {
      status: 'unknown',
      value: null,
      candidates: [],
      confidence: 0,
      message: `No authorized directory record found for "${cleanName}". Please select an authorized person.`
    };
  }
}

export const defaultDirectoryAdapter = new DirectoryAdapter();
