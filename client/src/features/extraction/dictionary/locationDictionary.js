/**
 * Location Dictionary
 * Maps physical premises, work areas, and domestic rooms.
 * Supports English, Hindi, and Hinglish.
 */

export const LOCATION_ENTRIES = [
  {
    id: 'loc_kitchen',
    canonical: 'Kitchen',
    keywords: [
      'kitchen', 'kitchen location', 'kitchen area', 'pantry',
      'rasoi', 'rasoighar', 'rasoi ghar', 'kitchen mein', 'kitchen me',
      'kitchen ke liye', 'rasoi ke liye',
      'किचन', 'रसोई', 'रसोईघर'
    ],
    confidence: 0.95
  },
  {
    id: 'loc_office',
    canonical: 'Office',
    keywords: [
      'office', 'main office', 'headquarters', 'hq', 'workplace',
      'daftar', 'office mein', 'office me',
      'दफ्तर', 'ऑफिस'
    ],
    confidence: 0.9
  },
  {
    id: 'loc_site',
    canonical: 'Construction Site',
    keywords: [
      'site', 'construction site', 'job site', 'field location',
      'site par', 'site pe', 'site mein',
      'साइट'
    ],
    confidence: 0.9
  },
  {
    id: 'loc_warehouse',
    canonical: 'Warehouse / Storage',
    keywords: [
      'warehouse', 'storage', 'inventory room', 'depot',
      'godown', 'godam', 'store room', 'godown mein',
      'गोदाम', 'स्टोर रूम'
    ],
    confidence: 0.9
  },
  {
    id: 'loc_reception',
    canonical: 'Reception / Front Desk',
    keywords: [
      'reception', 'front desk', 'lobby', 'entrance',
      'reception par', 'reception pe',
      'रिसेप्शन'
    ],
    confidence: 0.95
  },
  {
    id: 'loc_conference',
    canonical: 'Conference Room',
    keywords: [
      'conference room', 'meeting room', 'board room',
      'meeting hall', 'boardroom'
    ],
    confidence: 0.95
  },
  {
    id: 'loc_market',
    canonical: 'Market',
    keywords: [
      'market', 'from the market', 'from market', 'local market', 'supermarket',
      'bazaar', 'bazar', 'mandi', 'market se', 'bazaar se',
      'मार्केट', 'बाजार', 'मंडी'
    ],
    confidence: 0.95
  }
];

/**
 * Extracts location from text
 * @param {string} text 
 * @returns {{ value: string|null, canonical: string|null, rawText: string, confidence: number }}
 */
export function extractLocation(text) {
  if (!text) return { value: null, canonical: null, rawText: '', confidence: 0 };
  const lower = text.toLowerCase();

  // Explicit location patterns first
  // e.g. "Kitchen location", "at Kitchen", "location is Kitchen", "in Pit 4", "at Bay 3"
  const explicitPattern = /(?:location\s+(?:is|:)|at\s+(?:the\s+)?|in\s+(?:the\s+)?)([a-zA-Z0-9\s]+?)(?:\s+location|[.,;]|$)/i;
  const expMatch = text.match(explicitPattern);

  for (const entry of LOCATION_ENTRIES) {
    for (const kw of entry.keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(lower)) {
        return {
          value: entry.canonical,
          canonical: entry.canonical,
          rawText: kw,
          confidence: entry.confidence
        };
      }
    }
  }

  if (expMatch && expMatch[1]) {
    const candidate = expMatch[1].trim();
    const words = candidate.split(/\s+/);
    if (words.length <= 4 && !['the', 'this', 'that', 'project', 'task', 'a', 'an', 'bring', 'doing', 'making'].includes(candidate.toLowerCase())) {
      return {
        value: candidate.charAt(0).toUpperCase() + candidate.slice(1),
        canonical: candidate.charAt(0).toUpperCase() + candidate.slice(1),
        rawText: candidate,
        confidence: 0.75
      };
    }
  }

  return { value: null, canonical: null, rawText: '', confidence: 0 };
}
