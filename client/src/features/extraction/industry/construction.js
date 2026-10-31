/**
 * Construction & Infrastructure Industry Pack
 * Concrete pours, curing, scaffolding, material delivery, punch lists, machinery, permits.
 */

export const CONSTRUCTION_ACTIONS = [
  {
    id: 'act_const_concrete_pour_inspection',
    canonical: 'Inspect concrete pour and curing',
    actionVerb: 'inspect',
    object: 'concrete pour',
    industry: 'construction',
    category: 'quality',
    keywords: [
      'inspect concrete pour', 'check concrete curing', 'concrete slump test',
      'concrete pour inspection', 'dhalai ki jaanch', 'curing check karo', 'concrete dhalai',
      'कंक्रीट ढलाई', 'कंक्रीट टेस्ट'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_const_scaffolding_safety',
    canonical: 'Audit scaffolding safety tags',
    actionVerb: 'audit',
    object: 'scaffolding safety',
    industry: 'construction',
    category: 'safety',
    keywords: [
      'audit scaffolding', 'inspect scaffolding', 'check scaffold green tags',
      'scaffolding check karna', 'paad ki jaanch', 'scaffolding safety audit',
      'मचान सुरक्षा', 'स्कैफोल्डिंग चेक'
    ],
    isSafetyCritical: true,
    safetyWarning: 'Working-at-height structures require certified scaffolder inspection prior to worker access.',
    confidence: 0.95
  },
  {
    id: 'act_const_cement_delivery',
    canonical: 'Receive cement and rebar delivery',
    actionVerb: 'receive',
    object: 'cement delivery',
    industry: 'construction',
    category: 'logistics',
    keywords: [
      'cement delivery', 'receive rebar', 'check steel delivery', 'material delivery site',
      'cement ki delivery', 'rebar check karna', 'site pe cement aana',
      'सीमेंट डिलीवरी', 'सरिया अनलोडिंग'
    ],
    isSafetyCritical: false,
    confidence: 0.9
  },
  {
    id: 'act_const_punch_list',
    canonical: 'Review site punch list defects',
    actionVerb: 'review',
    object: 'site punch list',
    industry: 'construction',
    category: 'handover',
    keywords: [
      'punch list review', 'inspect snag list', 'check site defects',
      'punch list complete karo', 'snagging check',
      'पंच लिस्ट'
    ],
    isSafetyCritical: false,
    confidence: 0.9
  }
];
