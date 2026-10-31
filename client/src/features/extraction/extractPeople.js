import { matchPersonRecord } from './entityMatching.js';
import { ASSIGNEE_MARKERS, REVIEWER_MARKERS } from './dictionary/responsibilityDictionary.js';
import { escapeRegExp } from '../../utils/security.js';

const STOP_WORDS = [
  'it', 'this', 'that', 'the', 'project', 'task', 'kitchen', 'milk', 'doodh', 'dudh',
  'hai', 'hain', 'de', 'kare', 'karo', 'do', 'ho', 'na', 'kar', 'ko', 'se', 'me', 'mein',
  'par', 'pe', 'roz', 'daily', 'har', 'din', 'aana', 'laana', 'lana', 'leke', 'le', 'aao',
  'site', 'office', 'kripya', 'please', 'bhai', 'yaar', 'rakh', 'subah', 'shaam', 'dopahar',
  'instead', 'actually', 'rather', 'than'
];

/**
 * Extracts assignee and reviewer from transcript with negation and repair awareness
 * 
 * @param {string} transcript 
 * @param {Array} directory 
 * @returns {{
 *   assignee: { status: 'valid'|'ambiguous'|'unknown'|'missing', value: Object|null, candidates: Array, rawText: string, message?: string, confidence: number },
 *   reviewer: { status: 'valid'|'ambiguous'|'unknown'|'missing', value: Object|null, candidates: Array, rawText: string, message?: string, confidence: number }
 * }}
 */
export function extractPeople(transcript, directory = []) {
  const result = {
    assignee: { status: 'missing', value: null, candidates: [], rawText: '', confidence: 0 },
    reviewer: { status: 'missing', value: null, candidates: [], rawText: '', confidence: 0 }
  };

  if (!transcript || !directory || directory.length === 0) {
    return result;
  }

  // Pre-clean speech artifacts: replace dot followed by lowercase word
  const cleanTranscript = transcript.replace(/\.\s+(?=[a-z])/gi, ' ');

  // 1. Identify Negated People / Retracted Names (e.g. "not Rahul", "don't assign to Rahul", "Rahul ko mat dena", "Rina ko nahi dena", "Rahul se nahi")
  const negatedNames = new Set();

  const negationMatches = cleanTranscript.matchAll(
    /\b(?:not|do\s+not\s+assign\s+to|don't\s+assign\s+to|dont\s+assign\s+to|mat\s+do|mat\s+dena)\s+([A-Za-z\u0900-\u097F]+)/gi
  );
  for (const m of negationMatches) {
    if (m[1]) negatedNames.add(m[1].toLowerCase());
  }

  const postNegationMatches = cleanTranscript.matchAll(
    /\b([A-Za-z\u0900-\u097F]+)\s+(?:ko\s+(?:mat|nahi)\s*(?:dena|do|karna)?|se\s+nahi|nahi\s+karega|nahi\s+karegi)\b/gi
  );
  for (const m of postNegationMatches) {
    if (m[1]) negatedNames.add(m[1].toLowerCase());
  }

  // Expand negated names to cover all matching directory members and their aliases
  for (const person of directory) {
    const fn = person.name.split(' ')[0].toLowerCase();
    const full = person.name.toLowerCase();
    const hasNeg = negatedNames.has(fn) || negatedNames.has(full) || (person.aliases && person.aliases.some((a) => negatedNames.has(a.toLowerCase())));
    if (hasNeg) {
      negatedNames.add(fn);
      negatedNames.add(full);
      if (person.aliases) {
        person.aliases.forEach((a) => negatedNames.add(a.toLowerCase()));
      }
    }
  }

  const TEMPORAL_RECURRENCE_WORDS = new Set([
    'only', 'on', 'weekdays', 'daily', 'weekly', 'monthly', 'tomorrow', 'today', 'yesterday',
    'morning', 'evening', 'friday', 'monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday',
    'next', 'week', 'month', 'noon', 'am', 'pm'
  ]);

  // 2. Identify Conversational Self-Corrections (e.g. "Assign to Amit no wait assign to Neha", "Rahul Sharma no wait Neha")
  let positiveOverrideName = null;
  const selfCorrectionRegex = /([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+)?)[,;\s]+(?:no\s+wait|sorry|i\s+mean|actually|instead|matlab|nahi\s+balki|galat\s+bola)[,;\s]+(?:assign\s+(?:it\s+)?(?:to\s+)?|make\s+)?([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+)?)/i;
  const scMatch = cleanTranscript.match(selfCorrectionRegex);
  if (scMatch) {
    const retracted = scMatch[1].trim().toLowerCase();
    const corrected = scMatch[2].trim();
    const firstWord = corrected.split(/\s+/)[0].toLowerCase();
    if (!TEMPORAL_RECURRENCE_WORDS.has(firstWord)) {
      negatedNames.add(retracted);
      retracted.split(/\s+/).forEach((w) => negatedNames.add(w.toLowerCase()));
      positiveOverrideName = corrected;
    }
  }

  // 2b. Sentence-level conversational correction: e.g. "Ask Riya to bring milk. Actually, ask Priya instead." or "Ask Priya instead."
  const sentenceLevelCorrection = cleanTranscript.match(
    /(?:(?:actually|instead|sorry|no\s+wait)[,;\s]+(?:(?:ask|tell|assign(?:\s+(?:it|this)?\s+to)?|give\s+to)\s+)?([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+)?)|(?:(?:ask|tell|assign(?:\s+(?:it|this)?\s+to)?|give\s+to)\s+)?([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+)?)\s+instead\b)/i
  );
  if (sentenceLevelCorrection) {
    let corrected = (sentenceLevelCorrection[1] || sentenceLevelCorrection[2] || '').replace(/\s+instead$/i, '').trim();
    const firstWord = corrected.split(/\s+/)[0].toLowerCase();
    if (corrected && !STOP_WORDS.includes(corrected.toLowerCase()) && !TEMPORAL_RECURRENCE_WORDS.has(firstWord)) {
      const matchIndex = cleanTranscript.indexOf(sentenceLevelCorrection[0]);
      const beforeText = matchIndex >= 0 ? cleanTranscript.substring(0, matchIndex) : '';
      const prevWords = beforeText.match(/\b([A-Za-z\u0900-\u097F]+)\b/g) || [];
      for (const w of prevWords) {
        const lowerW = w.toLowerCase();
        if (!STOP_WORDS.includes(lowerW) && lowerW !== corrected.toLowerCase()) {
          negatedNames.add(lowerW);
        }
      }
      positiveOverrideName = corrected;
    }
  }

  // 3. Identify Reviewer First
  let reviewerRawName = null;

  for (const pattern of REVIEWER_MARKERS) {
    const match = cleanTranscript.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim().replace(/^(?:and|with|to)\s+/i, '');
      const lower = candidate.toLowerCase();
      if (!STOP_WORDS.includes(lower) && !negatedNames.has(lower)) {
        reviewerRawName = candidate;
        break;
      }
    }
  }

  if (reviewerRawName) {
    const matchRes = matchPersonRecord(reviewerRawName, directory);
    result.reviewer = {
      status: matchRes.status,
      value: matchRes.value,
      candidates: matchRes.candidates,
      rawText: reviewerRawName,
      confidence: matchRes.confidence,
      message: matchRes.message
    };
  }

  // Fallback for reviewer: Check if any directory person's name directly associates with review phrasing
  if (!result.reviewer.value) {
    for (const person of directory) {
      const fullName = person.name;
      const firstName = person.name.split(' ')[0];
      const fnLower = firstName.toLowerCase();
      if (negatedNames.has(fnLower) || negatedNames.has(fullName.toLowerCase())) continue;

      // Match explicit review phrasing: "Rahul Sharma to review", "Priya to review", "Priya review karegi"
      const reviewRegex = new RegExp(`\\b(${escapeRegExp(fullName)}|${escapeRegExp(firstName)})\\b\\s+(?:should|showed|will|can|must|to)?\\s*review\\b`, 'i');
      if (reviewRegex.test(cleanTranscript)) {
        result.reviewer = {
          status: 'valid',
          value: person,
          candidates: [person],
          rawText: fullName,
          confidence: 0.95
        };
        break;
      }

      // Match "review by Priya", "reviewer Priya", "reviewer is Priya"
      const reviewerPrefixRegex = new RegExp(`\\b(?:reviewer\\s+(?:is\\s+)?|reviewed\\s+by\\s+|review\\s+by\\s+)(${escapeRegExp(fullName)}|${escapeRegExp(firstName)})\\b`, 'i');
      if (reviewerPrefixRegex.test(cleanTranscript)) {
        result.reviewer = {
          status: 'valid',
          value: person,
          candidates: [person],
          rawText: fullName,
          confidence: 0.95
        };
        break;
      }
    }
  }

  // 4. Identify Assignee (Doer)
  let assigneeRawName = positiveOverrideName || null;

  if (!assigneeRawName) {
    for (const pattern of ASSIGNEE_MARKERS) {
      const match = cleanTranscript.match(pattern);
      if (match && match[1]) {
        let candidate = match[1].trim();
        candidate = candidate.replace(/^(?:the|a|an)\s+/i, '').trim();
        const lower = candidate.toLowerCase();

        // Skip common stopwords and explicitly negated/retracted names
        if (!STOP_WORDS.includes(lower) && !negatedNames.has(lower)) {
          // Ensure candidate doesn't match the reviewer if reviewer is already selected
          if (!result.reviewer.value || result.reviewer.value.name.toLowerCase() !== lower) {
            assigneeRawName = candidate;
            break;
          }
        }
      }
    }
  }

  // Scan directory people mentioned in transcript (excluding reviewer, negated names, and non-assignee roles)
  const directoryMatches = directory.filter((person) => {
    if (result.reviewer.value && result.reviewer.value.id === person.id) {
      return false;
    }

    const fullNameLower = person.name.toLowerCase();
    const firstNameLower = person.name.split(' ')[0].toLowerCase();
    if (negatedNames.has(fullNameLower) || negatedNames.has(firstNameLower)) {
      return false;
    }

    // Role-filtering: If person is clearly a meeting attendee (e.g. "Rahul ke saath meeting")
    // or a WhatsApp recipient (e.g. "Aman ko WhatsApp"), do not treat as task assignee
    const isMeetingAttendee = new RegExp(`\\b(?:${escapeRegExp(person.name)}|${escapeRegExp(firstNameLower)})\\s+(?:ke\\s+saath\\s+meeting|ke\\s+saath\\s+milna)|(?:meeting\\s+with|invite)\\s+(?:${escapeRegExp(person.name)}|${escapeRegExp(firstNameLower)})\\b`, 'i').test(cleanTranscript);
    const isMessageRecipient = new RegExp(`\\b(?:${escapeRegExp(person.name)}|${escapeRegExp(firstNameLower)})\\s+(?:ko\\s+)?(?:whatsapp|message|msg)\\b`, 'i').test(cleanTranscript);

    if (isMeetingAttendee || isMessageRecipient) {
      return false;
    }

    const fullNameRegex = new RegExp(`\\b${escapeRegExp(person.name)}\\b`, 'i');
    if (fullNameRegex.test(cleanTranscript)) return true;

    const firstName = person.name.split(' ')[0];
    const firstNameRegex = new RegExp(`\\b${escapeRegExp(firstName)}\\b`, 'i');
    if (firstNameRegex.test(cleanTranscript)) return true;

    if (person.aliases) {
      return person.aliases.some((alias) => new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i').test(cleanTranscript));
    }
    return false;
  });

  if (assigneeRawName) {
    const matchRes = matchPersonRecord(assigneeRawName, directory);
    if (matchRes.status === 'valid' || matchRes.status === 'ambiguous') {
      let resolvedRaw = assigneeRawName;
      if (matchRes.value) {
        const firstName = matchRes.value.name.split(' ')[0];
        const tokenMatch = cleanTranscript.match(new RegExp(`\\b${escapeRegExp(firstName)}\\b`, 'i'));
        if (tokenMatch) {
          resolvedRaw = tokenMatch[0];
        }
      }
      result.assignee = {
        status: matchRes.status,
        value: matchRes.value,
        candidates: matchRes.candidates,
        rawText: resolvedRaw,
        confidence: matchRes.confidence,
        message: matchRes.message
      };
    } else if (directoryMatches.length === 1) {
      result.assignee = {
        status: 'valid',
        value: directoryMatches[0],
        candidates: directoryMatches,
        rawText: directoryMatches[0].name,
        confidence: 0.95
      };
    } else if (directoryMatches.length > 1) {
      result.assignee = {
        status: 'ambiguous',
        value: null,
        candidates: directoryMatches,
        rawText: assigneeRawName,
        confidence: 0.5,
        message: `Multiple team members found. Which one should receive this task?`
      };
    } else {
      // Truly unknown person (e.g. "Assign the task to Vikram")
      result.assignee = {
        status: 'unknown',
        value: null,
        candidates: [],
        rawText: assigneeRawName,
        confidence: 0,
        message: `I couldn't find "${assigneeRawName}" in the directory. Can you select the correct person?`
      };
    }
  } else if (directoryMatches.length === 1) {
    result.assignee = {
      status: 'valid',
      value: directoryMatches[0],
      candidates: directoryMatches,
      rawText: directoryMatches[0].name,
      confidence: 0.9
    };
  } else if (directoryMatches.length > 1) {
    result.assignee = {
      status: 'ambiguous',
      value: null,
      candidates: directoryMatches,
      rawText: directoryMatches[0].name.split(' ')[0],
      confidence: 0.5,
      message: `Multiple team members found. Which one should receive this task?`
    };
  }

  return result;
}
