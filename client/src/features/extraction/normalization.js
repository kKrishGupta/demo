/**
 * Multilingual Normalization Pipeline
 * Normalizes speech artifacts, fillers, Hinglish transliterations, and Devanagari scripts
 * while preserving the raw transcript for correction and display.
 */

// Common filler words across English, Hindi, and Hinglish speech (excluding conversational correction markers like 'actually' and 'instead')
const FILLER_WORDS_REGEX = /\b(?:uh|um|umm|er|ah|you know|basically|alright|okay|please|kripya|bhai|yaar|zara|haan|theek hai)\b/gi;

// Conservative speech recognition error corrections and stutter deduplication
const SPEECH_CORRECTIONS = [
  { pattern: /\bshowed(?:\s*\.\s*|\s+)review\b/gi, replacement: 'should review' },
  { pattern: /\bto\s+the\s+([A-Z][a-z]+)\b/g, replacement: 'to $1' },
  { pattern: /\bpriority\s+to\s+i\b/gi, replacement: 'priority to high' },
  { pattern: /\bpriority\s+i\b/gi, replacement: 'priority high' },
  { pattern: /\bset\s+the\s+priority\s+to\s+i\b/gi, replacement: 'set the priority to high' },
  { pattern: /\bbrinq\b/gi, replacement: 'bring' },
  // Deduplicate hyphenated or space-separated stutter words (e.g. "tell tell", "check-check", "kal kal", "milk milk")
  { pattern: /\b([a-zA-Z\u0900-\u097F]+)(?:-|\s+)\1\b/gi, replacement: '$1' },
  { pattern: /\b([a-zA-Z\u0900-\u097F]+)(?:-|\s+)\1\b/gi, replacement: '$1' }
];

// Devanagari to Latin phonetic term mappings for core task entities
const DEVANAGARI_MAP = [
  { dev: /रीना/g, lat: 'Reena' },
  { dev: /राहुल/g, lat: 'Rahul' },
  { dev: /प्रिया/g, lat: 'Priya' },
  { dev: /कृष/g, lat: 'Krish' },
  { dev: /जयंत/g, lat: 'Jayant' },
  { dev: /दूध/g, lat: 'doodh' },
  { dev: /सब्जी/g, lat: 'sabzi' },
  { dev: /किचन/g, lat: 'kitchen' },
  { dev: /रसोई/g, lat: 'kitchen' },
  { dev: /साफ/g, lat: 'saaf' },
  { dev: /पानी\s+की\s+मोटर|पानी\s+का\s+पंप/g, lat: 'pani ki motor' },
  { dev: /मोटर\s+जाँचना|मोटर\s+जांचना/g, lat: 'motor check' },
  { dev: /जाँचना|जांचना|जाँचने/g, lat: 'jaanchna' },
  { dev: /रिपोर्ट/g, lat: 'report' },
  { dev: /जमा\s+करना|जमा\s+करनी/g, lat: 'jama karna' },
  { dev: /शुक्रवार/g, lat: 'friday' },
  { dev: /मंगलवार/g, lat: 'tuesday' },
  { dev: /बुधवार/g, lat: 'wednesday' },
  { dev: /गुरुवार/g, lat: 'thursday' },
  { dev: /शनिवार/g, lat: 'saturday' },
  { dev: /रविवार/g, lat: 'sunday' },
  { dev: /सोमवार/g, lat: 'monday' },
  { dev: /मोहन/g, lat: 'Mohan' },
  { dev: /अमित/g, lat: 'Amit' },
  { dev: /जयंत/g, lat: 'Jayant' },
  { dev: /नेहा/g, lat: 'Neha' },
  { dev: /तक\b/g, lat: 'tak' },
  { dev: /है।\s*$/g, lat: 'hai' },
  { dev: /रोज़|रोज|प्रतिदिन/g, lat: 'roz' },
  { dev: /हर\s+दिन/g, lat: 'har din' },
  { dev: /हर\s+हफ्ते|हर\s+सप्ताह/g, lat: 'har hafte' },
  { dev: /कल/g, lat: 'kal' },
  { dev: /परसों/g, lat: 'parson' },
  { dev: /आज/g, lat: 'aaj' },
  { dev: /सुबह/g, lat: 'subah' },
  { dev: /शाम/g, lat: 'shaam' },
  { dev: /दोपहर/g, lat: 'dopahar' },
  { dev: /रात/g, lat: 'raat' },
  { dev: /लेकर\s+आना|लेके\s+आना|ले\s+आना|ले\s+आओ|लाना|लाओ/g, lat: 'le aao' },
  { dev: /मंगवा\s+दो|मंगवाना/g, lat: 'mangwa do' },
  { dev: /करेगी|करेगा/g, lat: 'karegi' },
  { dev: /काम\s+दो/g, lat: 'kaam do' },
  { dev: /तुरंत|फ़ौरन/g, lat: 'turant' },
  { dev: /ज़रूरी|जरूरी/g, lat: 'zaroori' },
  { dev: /को/g, lat: 'ko' },
  { dev: /है।|है/g, lat: 'hai' }
];

// Hinglish spelling normalization to canonical forms
const HINGLISH_SPELLINGS = [
  { pattern: /\b(?:dudh|dood)\b/gi, replacement: 'doodh' },
  { pattern: /\b(?:roj)\b/gi, replacement: 'roz' },
  { pattern: /\b(?:parso)\b/gi, replacement: 'parson' },
  { pattern: /\b(?:safai|saf)\b/gi, replacement: 'saaf' },
  { pattern: /\b(?:sham|shyam)\b/gi, replacement: 'shaam' },
  { pattern: /\b(?:savare|savere)\b/gi, replacement: 'subah' },
  { pattern: /\b(?:zaruri|jaruri)\b/gi, replacement: 'zaroori' },
  { pattern: /\b(?:har\s+roj)\b/gi, replacement: 'har roz' }
];

/**
 * Normalizes text while maintaining semantic integrity
 * @param {string} rawTranscript 
 * @returns {{
 *   raw: string,
 *   cleaned: string,
 *   normalized: string,
 *   tokens: string[]
 * }}
 */
export function normalizeTranscript(rawTranscript) {
  if (!rawTranscript || typeof rawTranscript !== 'string') {
    return { raw: '', cleaned: '', normalized: '', tokens: [] };
  }

  const raw = rawTranscript;

  // 1. Clean extra whitespace
  let text = raw.replace(/\s+/g, ' ').trim();

  // 2. Apply speech recognition corrections
  for (const corr of SPEECH_CORRECTIONS) {
    text = text.replace(corr.pattern, corr.replacement);
  }

  // 3. Map Devanagari core terms to Latin equivalents
  let devNormalized = text;
  for (const dm of DEVANAGARI_MAP) {
    devNormalized = devNormalized.replace(dm.dev, dm.lat);
  }

  // 4. Map Hinglish variant spellings
  let hinglishNormalized = devNormalized;
  for (const hs of HINGLISH_SPELLINGS) {
    hinglishNormalized = hinglishNormalized.replace(hs.pattern, hs.replacement);
  }

  // 5. Remove non-essential filler words (preserving negation like 'not', 'no', 'nahi', 'mat')
  const withoutFillers = hinglishNormalized
    .replace(FILLER_WORDS_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 6. Tokenize for fuzzy / keyword scanning
  const tokens = withoutFillers
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  return {
    raw,
    cleaned: text,
    normalized: withoutFillers,
    tokens
  };
}
