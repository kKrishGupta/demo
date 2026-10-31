/**
 * Hospitality Industry Pack (Restaurants, Hotels, Commercial Kitchens)
 * Kitchen pantry, dining area, food safety, inventory, housekeeping, closing checklist.
 */

export const HOSPITALITY_ACTIONS = [
  {
    id: 'act_hosp_kitchen_deep_clean',
    canonical: 'Deep clean kitchen and pantry',
    actionVerb: 'clean',
    object: 'kitchen and pantry',
    industry: 'hospitality',
    category: 'cleaning',
    keywords: [
      'deep clean kitchen', 'clean pantry', 'kitchen deep clean', 'kitchen sanitization',
      'kitchen saaf karo', 'pantry ki safai', 'kitchen safai karwana',
      'किचन साफ करो', 'रसोई की सफाई'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_hosp_food_temp_log',
    canonical: 'Audit refrigerator temperature logs',
    actionVerb: 'audit',
    object: 'refrigerator temperature log',
    industry: 'hospitality',
    category: 'compliance',
    keywords: [
      'audit temperature log', 'fridge temperature check', 'cold storage temp log',
      'fridge ka taapman check karo', 'freezer temp reading',
      'फ्रिज तापमान लॉग'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_hosp_table_service_prep',
    canonical: 'Prepare dining room table setup',
    actionVerb: 'prepare',
    object: 'dining room table setup',
    industry: 'hospitality',
    category: 'service',
    keywords: [
      'prepare dining setup', 'table service prep', 'set dining tables', 'banquet table setup',
      'table lagao', 'dining room set karo',
      'डाइनिंग सेटअप'
    ],
    isSafetyCritical: false,
    confidence: 0.9
  },
  {
    id: 'act_hosp_linen_inventory',
    canonical: 'Reconcile hotel linen inventory',
    actionVerb: 'reconcile',
    object: 'linen inventory',
    industry: 'hospitality',
    category: 'inventory',
    keywords: [
      'linen inventory count', 'reconcile hotel linen', 'check laundry sheets',
      'linen ka hisab', 'chadar towel check karo',
      'होटल लिनन गिनती'
    ],
    isSafetyCritical: false,
    confidence: 0.9
  }
];
