/**
 * Multilingual Entity Matching Engine
 * Safely matches people and projects against real or sample directory records with controlled fuzzy distance.
 */

/**
 * Calculates Levenshtein distance between two strings
 * @param {string} a 
 * @param {string} b 
 * @returns {number}
 */
export function getLevenshteinDistance(a, b) {
  if (!a || !b) return (a || b || '').length;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Normalizes text for entity comparison
 * @param {string} str 
 * @returns {string}
 */
function cleanEntityString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches person against directory records
 * @param {string} query Spoken or typed name candidate
 * @param {Array} directory Directory records
 * @returns {{
 *   status: 'valid'|'ambiguous'|'unknown'|'missing',
 *   value: Object|null,
 *   candidates: Array,
 *   rawText: string,
 *   confidence: number,
 *   message?: string
 * }}
 */
export function matchPersonRecord(query, directory = []) {
  const normQuery = cleanEntityString(query);

  if (!normQuery || !directory || directory.length === 0) {
    return {
      status: 'missing',
      value: null,
      candidates: [],
      rawText: query || '',
      confidence: 0
    };
  }

  // 1. Exact Match on full name, first name, or configured aliases
  const exactMatches = directory.filter((person) => {
    const pFullName = cleanEntityString(person.name);
    const pFirstName = pFullName.split(' ')[0];

    if (pFullName === normQuery || pFirstName === normQuery) return true;
    if (person.aliases && person.aliases.some((a) => cleanEntityString(a) === normQuery)) {
      return true;
    }
    return false;
  });

  if (exactMatches.length === 1) {
    return {
      status: 'valid',
      value: exactMatches[0],
      candidates: exactMatches,
      rawText: query,
      confidence: 1.0
    };
  }

  if (exactMatches.length > 1) {
    return {
      status: 'ambiguous',
      value: null,
      candidates: exactMatches,
      rawText: query,
      confidence: 0.5,
      message: `Multiple team members match "${query}". Please select one.`
    };
  }

  // 2. Token Matching (Query contains person's first name as distinct word)
  // E.g., "Rahul" matching "Rahul Sharma" and "Rahul Verma"
  const tokenMatches = directory.filter((person) => {
    const parts = cleanEntityString(person.name).split(' ');
    const queryTokens = normQuery.split(' ');
    return queryTokens.some((qTok) => parts.includes(qTok));
  });

  if (tokenMatches.length === 1) {
    return {
      status: 'valid',
      value: tokenMatches[0],
      candidates: tokenMatches,
      rawText: query,
      confidence: 0.9
    };
  }

  if (tokenMatches.length > 1) {
    return {
      status: 'ambiguous',
      value: null,
      candidates: tokenMatches,
      rawText: query,
      confidence: 0.5,
      message: `Multiple team members named "${query}" found. Which one should receive this task?`
    };
  }

  // 3. Controlled Fuzzy / Spelling Distance
  // Strict rules:
  // - Minimum query length 4 characters
  // - Max distance 1 for length <= 5
  // - Max distance 2 for length >= 6
  const fuzzyCandidates = [];
  if (normQuery.length >= 4) {
    for (const person of directory) {
      const pFullName = cleanEntityString(person.name);
      const pFirstName = pFullName.split(' ')[0];

      const distFirst = getLevenshteinDistance(normQuery, pFirstName);
      const maxAllowed = pFirstName.length <= 5 ? 1 : 2;

      if (distFirst <= maxAllowed) {
        fuzzyCandidates.push({ person, distance: distFirst });
      }
    }
  }

  if (fuzzyCandidates.length === 1) {
    return {
      status: 'valid',
      value: fuzzyCandidates[0].person,
      candidates: [fuzzyCandidates[0].person],
      rawText: query,
      confidence: 0.85
    };
  }

  if (fuzzyCandidates.length > 1) {
    return {
      status: 'ambiguous',
      value: null,
      candidates: fuzzyCandidates.map((fc) => fc.person),
      rawText: query,
      confidence: 0.45,
      message: `Multiple potential matches for "${query}". Please select the person.`
    };
  }

  // 4. Unknown Person
  return {
    status: 'unknown',
    value: null,
    candidates: [],
    rawText: query,
    confidence: 0,
    message: `"${query}" is not recognized in the directory. Please select or add the member.`
  };
}

/**
 * Matches project against available projects
 * @param {string} query 
 * @param {Array} projects 
 * @returns {{
 *   status: 'valid'|'ambiguous'|'unknown'|'missing',
 *   value: Object|null,
 *   candidates: Array,
 *   rawText: string,
 *   confidence: number,
 *   message?: string
 * }}
 */
export function matchProjectRecord(query, projects = []) {
  const normQuery = cleanEntityString(query);

  if (!normQuery || !projects || projects.length === 0) {
    return {
      status: 'missing',
      value: null,
      candidates: [],
      rawText: query || '',
      confidence: 0
    };
  }

  // 1. Exact Match on name, code, or aliases
  const exactMatches = projects.filter((p) => {
    const pName = cleanEntityString(p.name);
    const pCode = cleanEntityString(p.code);

    if (pName === normQuery || pCode === normQuery) return true;
    if (p.aliases && p.aliases.some((a) => cleanEntityString(a) === normQuery)) return true;
    return false;
  });

  if (exactMatches.length === 1) {
    return {
      status: 'valid',
      value: exactMatches[0],
      candidates: exactMatches,
      rawText: query,
      confidence: 1.0
    };
  }

  if (exactMatches.length > 1) {
    return {
      status: 'ambiguous',
      value: null,
      candidates: exactMatches,
      rawText: query,
      confidence: 0.5,
      message: `Multiple projects match "${query}". Please select one.`
    };
  }

  // 2. Substring & Keyword Matching (excluding common words like 'project')
  const genericWords = ['project', 'the', 'for', 'and', 'under', 'new', 'task'];
  const meaningfulTokens = normQuery.split(' ').filter((t) => !genericWords.includes(t) && t.length > 2);

  if (meaningfulTokens.length > 0) {
    const candidateMatches = projects.filter((p) => {
      const pName = cleanEntityString(p.name);
      return meaningfulTokens.some((t) => pName.includes(t));
    });

    if (candidateMatches.length === 1) {
      return {
        status: 'valid',
        value: candidateMatches[0],
        candidates: candidateMatches,
        rawText: query,
        confidence: 0.85
      };
    }

    if (candidateMatches.length > 1) {
      return {
        status: 'ambiguous',
        value: null,
        candidates: candidateMatches,
        rawText: query,
        confidence: 0.5,
        message: `Multiple projects matched "${query}". Please select the correct project.`
      };
    }
  }

  return {
    status: 'unknown',
    value: null,
    candidates: [],
    rawText: query,
    confidence: 0,
    message: `Project "${query}" not found in project database.`
  };
}
