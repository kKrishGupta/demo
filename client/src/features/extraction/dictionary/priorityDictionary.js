/**
 * Priority & Urgency Dictionary
 * Maps urgency tokens across English, Hindi, and Hinglish with negation and self-correction awareness.
 */

import { escapeRegExp } from '../../../utils/security.js';

export const PRIORITY_NEGATIONS = [
  'not urgent', 'urgent nahi hai', 'urgent nahi', 'no rush', 'not high priority',
  'not a priority', 'not important', 'zaroori nahi hai', 'zaroori nahi', 'zaruri nahi',
  'koi jaldi nahi', 'koi rush nahi', 'जरूरी नहीं', 'अर्जेंट नहीं है', 'जल्दी नहीं है'
];

const EXPLICIT_NEGATION_REGEX = /\b(?:do\s+not|don't|dont|never)\s+(?:mark|set|make)\s+(?:this|the|it)?\s*(?:task)?\s*(?:as\s+)?(urgent|high\s+priority)\b/i;

export const PRIORITY_ENTRIES = [
  {
    level: 'Urgent',
    keywords: [
      'very urgent', 'extremely urgent', 'bahut urgent',
      'urgent', 'critical', 'asap', 'as soon as possible', 'top priority',
      'turant', 'fauran', 'fatafat', 'abhi ke abhi', 'foran', 'turant karo',
      'तुरंत', 'फ़ौरन', 'अभी के अभी'
    ],
    confidence: 0.95
  },
  {
    level: 'High',
    keywords: [
      'high priority', 'highest priority', 'important', 'crucial', 'must do',
      'zaroori', 'zaruri', 'bahut zaroori', 'priority high', 'priority is high',
      'priority set to high', 'priority to high',
      'ज़रूरी', 'महत्वपूर्ण'
    ],
    confidence: 0.9
  },
  {
    level: 'Normal',
    keywords: [
      'normal priority', 'medium priority', 'regular priority', 'standard',
      'samanya', 'theek hai',
      'सामान्य'
    ],
    confidence: 0.85
  },
  {
    level: 'Low',
    keywords: [
      'low priority', 'lowest priority', 'when free', 'leisure', 'no rush',
      'aaram se', 'aram se', 'fursat mein', 'jab time mile', 'not urgent',
      'कम प्राथमिकता', 'आराम से'
    ],
    confidence: 0.85
  }
];

/**
 * Extracts priority from text with negation and repair awareness
 * @param {string} text 
 * @returns {{ level: string, confidence: number }}
 */
export function extractPriorityFromText(text) {
  if (!text || typeof text !== 'string') return { level: '', confidence: 0 };
  const lower = text.toLowerCase();

  // 1. Handle conversational repair / self-correction (take part after repair cue)
  const repairMatch = lower.match(/\b(?:no wait|sorry|i mean|actually|instead|matlab|nahi balki|galat bola)\s+(.+)$/i);
  const textToEvaluate = repairMatch ? repairMatch[1] : lower;

  // 2. Explicit negation detection: "do not mark this task urgent", "not urgent", "urgent nahi hai"
  const isRegexNegated = EXPLICIT_NEGATION_REGEX.test(textToEvaluate);
  const isKeywordNegated = PRIORITY_NEGATIONS.some((neg) => {
    const reg = new RegExp(`\\b${escapeRegExp(neg)}\\b`, 'i');
    return reg.test(textToEvaluate);
  });
  const isNegated = isRegexNegated || isKeywordNegated;

  if (isNegated) {
    // Explicitly do NOT set Urgent or High; preserve negation
    return {
      level: '',
      confidence: 0.95,
      isNegated: true,
      negatedLevel: 'urgent'
    };
  }

  // 3. Positive priority matching
  for (const entry of PRIORITY_ENTRIES) {
    // Skip checking 'Low' here to let explicit High/Urgent/Normal take precedence when not negated
    if (entry.level === 'Low') continue;

    for (const kw of entry.keywords) {
      const regex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
      if (regex.test(textToEvaluate)) {
        return {
          level: entry.level,
          confidence: entry.confidence
        };
      }
    }
  }

  // Check Low keywords
  const lowEntry = PRIORITY_ENTRIES.find((e) => e.level === 'Low');
  if (lowEntry) {
    for (const kw of lowEntry.keywords) {
      const regex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
      if (regex.test(textToEvaluate)) {
        return {
          level: 'Low',
          confidence: lowEntry.confidence
        };
      }
    }
  }

  return { level: '', confidence: 0 };
}
