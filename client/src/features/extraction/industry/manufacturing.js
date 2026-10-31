/**
 * Manufacturing & Production Industry Pack
 * Production lines, machine setup, quality checks, batching, calibration, preventative maintenance.
 */

export const MANUFACTURING_ACTIONS = [
  {
    id: 'act_mfg_machine_calibration',
    canonical: 'Calibrate assembly machine',
    actionVerb: 'calibrate',
    object: 'assembly machine',
    industry: 'manufacturing',
    category: 'quality',
    keywords: [
      'calibrate machine', 'assembly machine calibration', 'calibrate assembly machine',
      'machine calibration', 'line machine calibrate karo', 'machine calibration karwana',
      'मशीन कैलिब्रेशन', 'मशीन जांच'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_mfg_batch_quality_check',
    canonical: 'Perform batch quality inspection',
    actionVerb: 'inspect',
    object: 'batch quality',
    industry: 'manufacturing',
    category: 'quality',
    keywords: [
      'batch quality check', 'quality inspection', 'inspect production batch',
      'batch check karna', 'production batch ki quality check', 'sample testing karo',
      'क्वालिटी चेक', 'बैच निरीक्षण'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_mfg_line_setup',
    canonical: 'Setup production line',
    actionVerb: 'setup',
    object: 'production line',
    industry: 'manufacturing',
    category: 'operations',
    keywords: [
      'setup production line', 'line setup', 'production line setup', 'tooling changeover',
      'production line lagao', 'line changeover karo',
      'प्रोडक्शन लाइन सेटअप'
    ],
    isSafetyCritical: false,
    confidence: 0.9
  },
  {
    id: 'act_mfg_emergency_stop_test',
    canonical: 'Test emergency stop interlocks',
    actionVerb: 'test',
    object: 'emergency stop interlocks',
    industry: 'manufacturing',
    category: 'safety',
    keywords: [
      'test emergency stop', 'e-stop inspection', 'check machine interlocks',
      'emergency stop test karna', 'e stop check karo',
      'इमरजेंसी स्टॉप टेस्ट'
    ],
    isSafetyCritical: true,
    safetyWarning: 'Interlock and E-stop verification requires physical trip procedure and designated safety officer sign-off.',
    confidence: 0.95
  }
];
