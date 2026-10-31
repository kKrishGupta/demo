/**
 * Name and Entity matching utilities
 */

/**
 * Normalizes text for clean comparison: lowercased, extra spaces collapsed, punctuation stripped
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Searches directory people against a spoken query token or full phrase.
 * Distinguishes between:
 * - exact / single match
 * - ambiguous matches (multiple matching records)
 * - no match
 * 
 * @param {string} query
 * @param {Array} directory
 * @returns {{ matches: Array, isAmbiguous: boolean, exact: Object|null }}
 */
export function matchPeople(query, directory) {
  const normQuery = normalizeText(query);
  if (!normQuery) {
    return { matches: [], isAmbiguous: false, exact: null };
  }

  // 1. Check exact match on full name or exact alias
  const exactMatches = directory.filter((person) => {
    const personNorm = normalizeText(person.name);
    if (personNorm === normQuery) return true;
    if (person.aliases && person.aliases.some((a) => normalizeText(a) === normQuery)) {
      return true;
    }
    return false;
  });

  if (exactMatches.length === 1) {
    return { matches: exactMatches, isAmbiguous: false, exact: exactMatches[0] };
  }
  if (exactMatches.length > 1) {
    return { matches: exactMatches, isAmbiguous: true, exact: null };
  }

  // 2. Check token / first name / partial name matching
  // e.g. query "Rahul" matching "Rahul Sharma" and "Rahul Verma"
  const candidateMatches = directory.filter((person) => {
    const personNorm = normalizeText(person.name);
    const parts = personNorm.split(' ');
    // Match first name or last name
    if (parts.includes(normQuery)) return true;
    // Query contains person's first name as a distinct word
    if (normQuery.split(' ').some((token) => parts.includes(token))) return true;
    // Check aliases
    if (person.aliases && person.aliases.some((a) => {
      const aliasNorm = normalizeText(a);
      return aliasNorm.includes(normQuery) || normQuery.includes(aliasNorm);
    })) {
      return true;
    }
    return false;
  });

  if (candidateMatches.length === 1) {
    return { matches: candidateMatches, isAmbiguous: false, exact: candidateMatches[0] };
  }
  if (candidateMatches.length > 1) {
    return { matches: candidateMatches, isAmbiguous: true, exact: null };
  }

  return { matches: [], isAmbiguous: false, exact: null };
}

/**
 * Matches project against sample projects
 * @param {string} query
 * @param {Array} projects
 * @returns {{ matches: Array, isAmbiguous: boolean, exact: Object|null }}
 */
export function matchProject(query, projects) {
  const normQuery = normalizeText(query);
  if (!normQuery) {
    return { matches: [], isAmbiguous: false, exact: null };
  }

  // Exact match first
  const exact = projects.find((p) => {
    const pNorm = normalizeText(p.name);
    if (pNorm === normQuery) return true;
    if (p.aliases && p.aliases.some((a) => normalizeText(a) === normQuery)) return true;
    return false;
  });

  if (exact) {
    return { matches: [exact], isAmbiguous: false, exact };
  }

  // Substring or keyword match
  const candidates = projects.filter((p) => {
    const pNorm = normalizeText(p.name);
    if (normQuery.includes(pNorm) || pNorm.includes(normQuery)) return true;
    if (p.aliases && p.aliases.some((a) => normQuery.includes(normalizeText(a)))) return true;
    return false;
  });

  if (candidates.length === 1) {
    return { matches: candidates, isAmbiguous: false, exact: candidates[0] };
  }
  if (candidates.length > 1) {
    return { matches: candidates, isAmbiguous: true, exact: null };
  }

  return { matches: [], isAmbiguous: false, exact: null };
}
