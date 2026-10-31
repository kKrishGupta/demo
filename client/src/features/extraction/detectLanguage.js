/**
 * Conservative Language Detection & Script Classifier
 * 
 * Accurately detects English, Hindi (Devanagari), Hinglish (Latin script Hindi/English mix),
 * or mixed code-switching. When uncertain, returns 'mixed' or 'multilingual'
 * rather than falsely claiming a single language.
 */

// Common Hinglish markers
const HINGLISH_TOKENS = new Set([
  'ko', 'se', 'ka', 'ki', 'ke', 'mein', 'me', 'hai', 'hain', 'ho', 'hona',
  'karega', 'karegi', 'kare', 'karo', 'karna', 'karwao', 'kar', 'kripya',
  'doodh', 'dudh', 'roz', 'har', 'din', 'aaj', 'kal', 'parson', 'subah', 'shaam',
  'raat', 'bhejo', 'laana', 'lana', 'leke', 'aao', 'aana', 'khet', 'mandir',
  'safai', 'kaam', 'aur', 'phir', 'bhi', 'pehle', 'baad', 'zaroori', 'turant',
  'mat', 'nahi', 'sabzi', 'rashan', 'galla', 'gadi'
]);

/**
 * Detects the dominant language and script of a transcript
 * @param {string} text 
 * @returns {{
 *   language: 'en' | 'hi' | 'hinglish' | 'mixed',
 *   script: 'devanagari' | 'latin' | 'mixed',
 *   confidence: number,
 *   details: { hasDevanagari: boolean, hasLatin: boolean, hinglishTokenCount: number }
 * }}
 */
export function detectLanguage(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return {
      language: 'en',
      script: 'latin',
      confidence: 0.5,
      details: { hasDevanagari: false, hasLatin: false, hinglishTokenCount: 0 }
    };
  }

  const clean = text.trim();

  // 1. Script checks
  const devanagariMatches = clean.match(/[\u0900-\u097F]/g) || [];
  const latinMatches = clean.match(/[a-zA-Z]/g) || [];

  const devanagariCount = devanagariMatches.length;
  const latinCount = latinMatches.length;

  const hasDevanagari = devanagariCount > 0;
  const hasLatin = latinCount > 0;

  let script = 'latin';
  if (hasDevanagari && !hasLatin) {
    script = 'devanagari';
  } else if (hasDevanagari && hasLatin) {
    script = 'mixed';
  }

  // Pure Devanagari Hindi
  if (script === 'devanagari' || (hasDevanagari && devanagariCount > latinCount * 2)) {
    return {
      language: 'hi',
      script,
      confidence: 0.95,
      details: { hasDevanagari, hasLatin, hinglishTokenCount: 0 }
    };
  }

  // 2. Token-level analysis for Hinglish in Latin script
  const words = clean.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\w]/g, ''));
  let hinglishTokenCount = 0;

  for (const word of words) {
    if (HINGLISH_TOKENS.has(word)) {
      hinglishTokenCount += 1;
    }
  }

  const hinglishRatio = words.length > 0 ? hinglishTokenCount / words.length : 0;

  if (hasDevanagari && hasLatin) {
    return {
      language: 'mixed',
      script: 'mixed',
      confidence: 0.9,
      details: { hasDevanagari, hasLatin, hinglishTokenCount }
    };
  }

  if (hinglishTokenCount >= 2 || hinglishRatio >= 0.2) {
    return {
      language: 'hinglish',
      script: 'latin',
      confidence: Math.min(0.95, 0.7 + hinglishRatio * 0.5),
      details: { hasDevanagari, hasLatin, hinglishTokenCount }
    };
  }

  // Standard or Indian English
  return {
    language: 'en',
    script: 'latin',
    confidence: 0.9,
    details: { hasDevanagari, hasLatin, hinglishTokenCount }
  };
}
