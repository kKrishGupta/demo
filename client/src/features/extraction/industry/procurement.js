/**
 * Industry Pack 14: Procurement
 * Vendor RFQ, purchase order approval, invoice three-way match, contract renewal.
 */

export const PROCUREMENT_ACTIONS = [
  {
    id: 'act_proc_rfq',
    canonical: 'Issue vendor request for quotation',
    actionVerb: 'issue',
    object: 'request for quotation',
    industry: 'procurement',
    category: 'sourcing',
    keywords: [
      'issue request for quotation', 'vendor rfq', 'issue rfq', 'send quotation request',
      'rate comparison sheet', 'vendor se quotation maango', 'rfq issue karo',
      'कोटेशन रिक्वेस्ट'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_proc_po_approval',
    canonical: 'Approve vendor purchase order',
    actionVerb: 'approve',
    object: 'purchase order',
    industry: 'procurement',
    category: 'purchasing',
    keywords: [
      'approve purchase order', 'po approval', 'approve vendor po', 'release purchase order',
      'purchase order approve karo', 'po signoff karo',
      'परचेज ऑर्डर स्वीकृति'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_proc_three_way_match',
    canonical: 'Complete three-way invoice matching',
    actionVerb: 'match',
    object: 'invoice',
    industry: 'procurement',
    category: 'accounting',
    keywords: [
      'three-way invoice matching', 'reconcile grn and invoice', 'invoice matching',
      'po grn invoice match karo', 'bill verify karo', 'three way match',
      'इनवॉइस मिलान'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_proc_contract_renewal',
    canonical: 'Renew annual vendor contract',
    actionVerb: 'renew',
    object: 'vendor contract',
    industry: 'procurement',
    category: 'contracts',
    keywords: [
      'renew vendor contract', 'annual contract renewal', 'supplier sla renewal',
      'vendor agreement renew karo', 'contract renewal paperwork',
      'अनुबंध नवीनीकरण'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_proc_vendor_audit',
    canonical: 'Conduct vendor performance audit',
    actionVerb: 'audit',
    object: 'vendor performance',
    industry: 'procurement',
    category: 'quality',
    keywords: [
      'conduct vendor audit', 'vendor performance rating', 'supplier evaluation audit',
      'vendor rating check karo', 'supplier performance audit',
      'वेंडर ऑडिट'
    ],
    isSafetyCritical: false,
    confidence: 0.92
  }
];
