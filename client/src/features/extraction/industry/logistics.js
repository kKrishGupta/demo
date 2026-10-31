/**
 * Logistics & Warehousing Industry Pack
 * Inbound shipments, dock dispatch, forklift pre-check, pallet picking, fleet logs, stock counts.
 */

export const LOGISTICS_ACTIONS = [
  {
    id: 'act_logistics_inbound_dock',
    canonical: 'Unload and inspect inbound container',
    actionVerb: 'unload',
    object: 'inbound container',
    industry: 'logistics',
    category: 'operations',
    keywords: [
      'unload inbound container', 'dock container unloading', 'receive freight shipment',
      'container khali karwao', 'inbound truck unload karo', 'dock receiving check',
      'कंटेनर अनलोडिंग', 'माल प्राप्ति'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_logistics_forklift_inspection',
    canonical: 'Complete forklift pre-shift safety checklist',
    actionVerb: 'inspect',
    object: 'forklift pre-shift checklist',
    industry: 'logistics',
    category: 'safety',
    keywords: [
      'complete forklift pre-shift safety checklist', 'forklift pre-shift safety checklist',
      'forklift inspection', 'forklift pre-shift checklist', 'check forklift battery and brakes',
      'forklift check karna', 'forklift inspection checklist',
      'फोर्कलिफ्ट निरीक्षण'
    ],
    isSafetyCritical: true,
    safetyWarning: 'MHE / Forklift operation requires documented pre-operation inspection checklist per warehouse safety standards.',
    confidence: 0.95
  },
  {
    id: 'act_logistics_cycle_count',
    canonical: 'Conduct warehouse bin cycle count',
    actionVerb: 'count',
    object: 'warehouse bin cycle count',
    industry: 'logistics',
    category: 'inventory',
    keywords: [
      'warehouse cycle count', 'bin location count', 'inventory physical audit',
      'cycle count karo', 'godown ka stock gina',
      'गोदाम स्टॉक गणना', 'साइकिल काउंट'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  }
];
