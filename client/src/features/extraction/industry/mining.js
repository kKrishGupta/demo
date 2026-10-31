/**
 * Mining & Extraction Industry Pack
 * Coal, minerals, conveyor belts, haul trucks, drilling, ventilation, dewatering, inspection, shift handover.
 */

export const MINING_ACTIONS = [
  {
    id: 'act_mining_conveyor_inspection',
    canonical: 'Inspect coal conveyor belt',
    actionVerb: 'inspect',
    object: 'coal conveyor',
    industry: 'mining',
    category: 'inspection',
    keywords: [
      'inspect coal conveyor', 'coal conveyor inspection', 'check conveyor belt',
      'coal conveyor ka inspection', 'conveyor belt check karna', 'conveyor inspection',
      'कोयला कन्वेयर निरीक्षण', 'कन्वेयर बेल्ट चेक करना'
    ],
    isSafetyCritical: true,
    safetyWarning: 'Critical conveyor equipment inspection requires tag-out compliance and shift sign-off.',
    confidence: 0.95
  },
  {
    id: 'act_mining_ventilation_check',
    canonical: 'Check mine ventilation fan',
    actionVerb: 'check',
    object: 'ventilation fan',
    industry: 'mining',
    category: 'safety',
    keywords: [
      'check ventilation', 'inspect mine ventilation', 'ventilation fan check',
      'hawa ka flow check karo', 'ventilation inspection', 'ventilation check karna',
      'वेंटिलेशन चेक करना', 'खदान वेंटिलेशन निरीक्षण'
    ],
    isSafetyCritical: true,
    safetyWarning: 'Ventilation system adjustments affect underground atmosphere; requires safety engineer authorization.',
    confidence: 0.95
  },
  {
    id: 'act_mining_haul_truck_servicing',
    canonical: 'Service haul truck',
    actionVerb: 'service',
    object: 'haul truck',
    industry: 'mining',
    category: 'maintenance',
    keywords: [
      'service haul truck', 'haul truck maintenance', 'check dumper', 'dump truck service',
      'haul truck ka service', 'dumper check karwao',
      'डंपर सर्विस', 'हॉल ट्रक मेंटेनेंस'
    ],
    isSafetyCritical: false,
    confidence: 0.9
  },
  {
    id: 'act_mining_dewatering_pump',
    canonical: 'Inspect pit dewatering pump',
    actionVerb: 'inspect',
    object: 'dewatering pump',
    industry: 'mining',
    category: 'maintenance',
    keywords: [
      'inspect dewatering pump', 'check pit pump', 'dewatering pump service',
      'pit ka pump check karo', 'dewatering pump ki jaanch',
      'पंप की जांच', 'पानी निकालने का पंप'
    ],
    isSafetyCritical: false,
    confidence: 0.9
  },
  {
    id: 'act_mining_shift_handover',
    canonical: 'Complete shift handover log',
    actionVerb: 'complete',
    object: 'shift handover log',
    industry: 'mining',
    category: 'operations',
    keywords: [
      'shift handover log', 'complete shift handover', 'mine shift handover',
      'shift handover report', 'shift badli ka log', 'handover sign off',
      'शिफ्ट हैंडओवर'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  }
];
