/**
 * Retail & Commerce Industry Pack
 * Shelf replenishment, cash drawer reconciliation, expiry audits, display resets, customer pickups.
 */

export const RETAIL_ACTIONS = [
  {
    id: 'act_retail_shelf_restock',
    canonical: 'Restock retail shelves and displays',
    actionVerb: 'restock',
    object: 'retail shelves',
    industry: 'retail',
    category: 'inventory',
    keywords: [
      'restock shelves', 'replenish retail stock', 'aisle restocking', 'shelf refill',
      'shelves pe stock lagao', 'dukaan ka maal lagao', 'shelf bharna',
      'शेल्फ रीस्टॉक', 'दुकान का सामान लगाना'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_retail_cash_reconciliation',
    canonical: 'Reconcile register cash drawer',
    actionVerb: 'reconcile',
    object: 'register cash drawer',
    industry: 'retail',
    category: 'finance',
    keywords: [
      'reconcile cash drawer', 'register count eod', 'cash tally closing',
      'galle ka hisab milao', 'cash count karo', 'till balance check',
      'गल्ले का हिसाब', 'कैश टैली'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_retail_expiry_audit',
    canonical: 'Audit product expiration dates',
    actionVerb: 'audit',
    object: 'product expiration dates',
    industry: 'retail',
    category: 'compliance',
    keywords: [
      'audit expiration dates', 'check expiry dates', 'fmcg expiry check',
      'expiry date check karo', 'kharab maal alag karo',
      'एक्सपायरी डेट जांच'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  }
];
