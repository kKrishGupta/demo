/**
 * Action & Verb Dictionary
 * Maps actions and tasks across Household, Office, Procurement, and Maintenance domains.
 * Supports English, Hindi (Devanagari), and Hinglish (Latin).
 */

import { ALL_INDUSTRY_ACTIONS } from '../industry/index.js';

export const ACTION_CATEGORIES = {
  HOUSEHOLD: 'household',
  OFFICE: 'office',
  PROCUREMENT: 'procurement',
  MAINTENANCE: 'maintenance',
  ERRANDS: 'errands'
};

export const BASE_ACTION_ENTRIES = [
  // 1. Bringing / Fetching / Delivering Milk & Groceries
  {
    id: 'act_bring_milk',
    canonical: 'Bring milk',
    actionVerb: 'bring',
    object: 'milk',
    category: ACTION_CATEGORIES.HOUSEHOLD,
    keywords: [
      'bring milk', 'bringing milk', 'fetch milk', 'get milk', 'pick up milk', 'milk delivery',
      'milk lana', 'milk laana', 'milk lana hai', 'milk le aana', 'milk le aao', 'milk leke aana',
      'doodh lana', 'doodh laana', 'doodh le aao', 'doodh le aana', 'doodh leke aana',
      'doodh mangwa do', 'doodh rakh de', 'doodh laane',
      'dudh lana', 'dudh laana', 'dudh le aana', 'dudh leke aana',
      'दूध लाना', 'दूध लेकर आना', 'दूध लेके आना', 'दूध ले आना', 'दूध ले आओ', 'दूध मंगवा दो', 'दूध लाओ'
    ],
    confidence: 0.95
  },
  {
    id: 'act_bring_groceries',
    canonical: 'Bring groceries',
    actionVerb: 'bring',
    object: 'groceries',
    category: ACTION_CATEGORIES.HOUSEHOLD,
    keywords: [
      'bring groceries', 'fetch groceries', 'get groceries', 'buy vegetables',
      'sabzi lana', 'sabji laana', 'rashan lana', 'rashan le aana', 'kirana lana',
      'सब्जी लाना', 'राशन लाना'
    ],
    confidence: 0.9
  },

  // 2. Cleaning & Maintenance
  {
    id: 'act_clean_kitchen',
    canonical: 'Clean kitchen',
    actionVerb: 'clean',
    object: 'kitchen',
    category: ACTION_CATEGORIES.MAINTENANCE,
    keywords: [
      'clean kitchen', 'clean the kitchen', 'kitchen cleaning', 'wipe kitchen',
      'kitchen saaf karo', 'kitchen saaf karna', 'kitchen saaf karegi', 'kitchen saaf kar do',
      'rasoi saaf karo', 'rasoi saaf karna', 'kitchen ki safai',
      'किचन साफ करो', 'किचन साफ करना', 'रसोई साफ करो'
    ],
    confidence: 0.95
  },
  {
    id: 'act_clean_general',
    canonical: 'Clean and tidy up',
    actionVerb: 'clean',
    object: 'premises',
    category: ACTION_CATEGORIES.MAINTENANCE,
    keywords: [
      'clean', 'tidy up', 'sweep', 'mop', 'sanitize', 'dusting',
      'saaf karo', 'safai karo', 'saaf karna', 'pocha lagao', 'jhadu lagao',
      'साफ करो', 'सफाई करो', 'पोछा लगाओ'
    ],
    confidence: 0.85
  },
  {
    id: 'act_repair_inspection',
    canonical: 'Inspect and repair',
    actionVerb: 'repair',
    object: 'equipment',
    category: ACTION_CATEGORIES.MAINTENANCE,
    keywords: [
      'inspect and repair', 'inspect & repair', 'inspection and repair',
      'repair equipment', 'fix equipment', 'equipment maintenance', 'machine repair',
      'theek karo', 'marammat karo', 'sudhar karo',
      'ठीक करो', 'मरम्मत करो'
    ],
    confidence: 0.9
  },

  // 3. Office & Project Management
  {
    id: 'act_material_selection',
    canonical: 'Kitchen material selection',
    actionVerb: 'select',
    object: 'kitchen material',
    category: ACTION_CATEGORIES.OFFICE,
    keywords: [
      'kitchen material selection', 'material selection', 'kitchen material',
      'vendor alignment', 'sample selection', 'material choose karo'
    ],
    confidence: 0.95
  },
  {
    id: 'act_prepare_report',
    canonical: 'Prepare the report',
    actionVerb: 'prepare',
    object: 'report',
    category: ACTION_CATEGORIES.OFFICE,
    keywords: [
      'prepare the report', 'prepare report', 'write the report', 'report preparation',
      'report banao', 'draft the report'
    ],
    confidence: 0.95
  },
  {
    id: 'act_salary_report',
    canonical: 'Prepare the monthly salary report',
    actionVerb: 'prepare',
    object: 'monthly salary report',
    category: ACTION_CATEGORIES.OFFICE,
    keywords: [
      'prepare the monthly salary report', 'monthly salary report', 'salary report',
      'payroll report', 'salary sheet', 'vetan report'
    ],
    confidence: 0.95
  },
  {
    id: 'act_security_audit',
    canonical: 'Security audit',
    actionVerb: 'audit',
    object: 'security',
    category: ACTION_CATEGORIES.OFFICE,
    keywords: [
      'security audit', 'system audit', 'compliance audit', 'safety audit'
    ],
    confidence: 0.95
  },
  {
    id: 'act_inventory_check',
    canonical: 'Office inventory check',
    actionVerb: 'check',
    object: 'office inventory',
    category: ACTION_CATEGORIES.OFFICE,
    keywords: [
      'office inventory check', 'inventory check', 'stock check', 'goods count',
      'inventory verify karo', 'stock ginti karo'
    ],
    confidence: 0.95
  },

  // 4. Procurement & Ordering
  {
    id: 'act_order_procure',
    canonical: 'Order items',
    actionVerb: 'order',
    object: 'items',
    category: ACTION_CATEGORIES.PROCUREMENT,
    keywords: [
      'order', 'procure', 'purchase', 'buy', 'place order',
      'mangwa do', 'mangwana', 'khareed lo', 'order kar do', 'bhejo',
      'मंगवा दो', 'खरीद लो', 'ऑर्डर करो'
    ],
    confidence: 0.85
  }
];

// Combine base actions with all industry packs without duplicates
const existingIds = new Set(BASE_ACTION_ENTRIES.map((a) => a.id));
export const ACTION_ENTRIES = [
  ...BASE_ACTION_ENTRIES,
  ...ALL_INDUSTRY_ACTIONS.filter((a) => !existingIds.has(a.id))
];

/**
 * Searches the action dictionary for matched operations,
 * sorting candidates by keyword length (descending) so specific multi-word phrases match before generic words.
 * @param {string} normalizedText 
 * @param {string} [industryKey='all']
 * @returns {Object|null}
 */
export function matchActionEntry(normalizedText, industryKey = 'all') {
  if (!normalizedText) return null;
  const lower = normalizedText.toLowerCase();

  const pool =
    industryKey && industryKey !== 'all'
      ? ACTION_ENTRIES.filter((e) => {
          if (!e.industry) return true;
          if (e.industry === industryKey) return true;
          if (industryKey === 'office_it' && (e.industry === 'office' || e.industry === 'it_operations')) return true;
          return false;
        })
      : ACTION_ENTRIES;

  // Flatten and sort by keyword length descending
  const candidates = [];
  for (const entry of pool) {
    for (const kw of entry.keywords) {
      candidates.push({ entry, kw, length: kw.length });
    }
  }
  candidates.sort((a, b) => b.length - a.length);

  for (const item of candidates) {
    const kwRegex = new RegExp(`\\b${item.kw}\\b`, 'i');
    if (kwRegex.test(lower) || lower.includes(item.kw.toLowerCase())) {
      return {
        ...item.entry,
        matchedKeyword: item.kw
      };
    }

    // Flexible match with optional articles between words: e.g. "bring the milk" matches "bring milk"
    if (item.kw.includes(' ')) {
      const flexiblePattern = item.kw.replace(/\s+/g, '\\s+(?:the\\s+|a\\s+|an\\s+)?');
      const flexRegex = new RegExp(`\\b${flexiblePattern}\\b`, 'i');
      if (flexRegex.test(lower)) {
        return {
          ...item.entry,
          matchedKeyword: item.kw
        };
      }
    }
  }

  return null;
}
