/**
 * Industry Pack 12: Office Work
 * Minutes circulation, compliance filing, client onboarding, deck preparation, reception management.
 */

export const OFFICE_ACTIONS = [
  {
    id: 'act_off_minutes',
    canonical: 'Circulate meeting minutes',
    actionVerb: 'circulate',
    object: 'meeting minutes',
    industry: 'office',
    category: 'administration',
    keywords: [
      'circulate meeting minutes', 'circulate minutes', 'send meeting minutes',
      'share minutes of meeting', 'mom bhejo', 'baithak ke notes share karo',
      'share mom', 'मीटिंग मिनट्स भेजना'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_off_compliance',
    canonical: 'File statutory compliance',
    actionVerb: 'file',
    object: 'statutory compliance',
    industry: 'office',
    category: 'compliance',
    keywords: [
      'file statutory compliance', 'submit compliance filing', 'statutory filing',
      'file gst compliance', 'compliance submit karo', 'statutory documents jama karo',
      'कंप्लायंस फाइलिंग'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_off_client_onboarding',
    canonical: 'Complete client onboarding documentation',
    actionVerb: 'onboard',
    object: 'client documentation',
    industry: 'office',
    category: 'operations',
    keywords: [
      'complete client onboarding', 'client kyc verification', 'client onboarding documentation',
      'client onboarding pura karo', 'kyc documents check karo',
      'क्लाइंट ऑनबोर्डिंग'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_off_deck',
    canonical: 'Prepare presentation deck',
    actionVerb: 'prepare',
    object: 'presentation deck',
    industry: 'office',
    category: 'planning',
    keywords: [
      'prepare presentation deck', 'draft presentation deck', 'client pitch deck',
      'presentation slide banao', 'deck ready karo', 'slides taiyar karo',
      'प्रेजेंटेशन तैयार करना'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_off_reception',
    canonical: 'Reconcile front desk visitor logs',
    actionVerb: 'reconcile',
    object: 'visitor logs',
    industry: 'office',
    category: 'security',
    keywords: [
      'reconcile visitor logs', 'front desk visitor reconciliation', 'visitor entry log tally',
      'visitor register check karo', 'entry log verify karo',
      'विज़िटर रजिस्टर चेक'
    ],
    isSafetyCritical: false,
    confidence: 0.92
  },
  {
    id: 'act_off_report',
    canonical: 'Prepare the report',
    actionVerb: 'prepare',
    object: 'report',
    industry: 'office',
    category: 'reporting',
    keywords: [
      'prepare the report', 'prepare report', 'draft weekly status report',
      'submit the report', 'submit report', 'submit monthly report', 'submit the project report',
      'report banao', 'status report prepare karo', 'report submit karo',
      'रिपोर्ट तैयार करना', 'रिपोर्ट सबमिट करना'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  }
];
