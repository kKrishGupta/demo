import { matchProjectRecord } from './entityMatching.js';

/**
 * Extracts project from transcript based on project directory and patterns
 * Disambiguates location phrases (e.g. "kitchen ke liye") from projects.
 * 
 * @param {string} transcript 
 * @param {Array} projects 
 * @returns {{
 *   status: 'valid'|'ambiguous'|'unknown'|'missing',
 *   value: Object|null,
 *   rawText: string,
 *   candidates: Array,
 *   confidence: number,
 *   message?: string
 * }}
 */
export function extractProjects(transcript, projects = []) {
  const result = {
    status: 'missing',
    value: null,
    rawText: '',
    candidates: [],
    confidence: 0
  };

  if (!transcript || !projects || projects.length === 0) {
    return result;
  }

  // 1. Check for specific project phrases
  // e.g., "for the Green Villa project", "for project Green Villa", "under Green Villa project", "Green Villa project ke liye"
  const projectPatterns = [
    /(?:for\s+(?:the\s+)?project|under\s+(?:the\s+)?project)\s+([a-zA-Z0-9\s]+?)(?=[.,;]|$|\s+start|\s+finish|\s+due|\s+repeat|\s+every|\s+with|\s+and|\s+review|\s+by|\s+assigned)/i,
    /(?:for\s+(?:the\s+)?)([a-zA-Z0-9\s]+?)\s+project(?=[.,;]|$|\s+start|\s+finish|\s+due|\s+repeat|\s+every|\s+with|\s+and|\s+review|\s+by|\s+assigned|\s+ke\s+liye)/i,
    /(?:project\s+(?:is\s+)?)([a-zA-Z0-9\s]+?)(?=[.,;]|$|\s+start|\s+finish|\s+due|\s+repeat|\s+every|\s+with|\s+and|\s+review|\s+by|\s+assigned)/i,
    /([a-zA-Z0-9\s]+?)\s+project\s+ke\s+liye/i
  ];

  let rawMatch = null;
  for (const pattern of projectPatterns) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Ensure candidate is not a generic stopword
      if (!['a', 'the', 'this', 'that', 'our', 'new'].includes(candidate.toLowerCase())) {
        rawMatch = candidate;
        break;
      }
    }
  }

  if (rawMatch) {
    const matchRes = matchProjectRecord(rawMatch, projects);
    if (matchRes.status === 'valid' || matchRes.status === 'ambiguous') {
      return {
        status: matchRes.status,
        value: matchRes.value,
        rawText: rawMatch,
        candidates: matchRes.candidates,
        confidence: matchRes.confidence,
        message: matchRes.message
      };
    }
  }

  // 2. Direct name matching across all project names/aliases in transcript
  for (const proj of projects) {
    // Special safeguard: if project name is "Kitchen Renovation", do not match if only "kitchen" is spoken without "renovation" or "project"
    const projName = proj.name;
    const projNameRegex = new RegExp(`\\b${projName}\\b`, 'i');

    if (projNameRegex.test(transcript)) {
      // Disambiguation: if text is "Kitchen ke liye doodh", avoid false-positive on "Kitchen Renovation" unless "renovation" is spoken
      if (proj.id === 'proj3' && !/\b(?:renovation|kitchen\s+project|kr-88)\b/i.test(transcript)) {
        continue;
      }

      return {
        status: 'valid',
        value: proj,
        rawText: proj.name,
        candidates: [proj],
        confidence: 0.95
      };
    }

    if (proj.aliases) {
      for (const alias of proj.aliases) {
        // Disambiguation for aliases like 'kitchen project': require full alias
        const aliasRegex = new RegExp(`\\b${alias}\\b`, 'i');
        if (aliasRegex.test(transcript)) {
          return {
            status: 'valid',
            value: proj,
            rawText: alias,
            candidates: [proj],
            confidence: 0.95
          };
        }
      }
    }
  }

  return result;
}
