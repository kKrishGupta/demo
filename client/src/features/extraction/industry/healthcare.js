/**
 * Healthcare Administration & Facility Operations Industry Pack
 * Supplies inventory, equipment maintenance, appointment coordination, shift handover, sterilization logging.
 * STRICT POLICY: Ordinary task extraction never authorizes clinical decisions, prescriptions, or medical procedures.
 */

export const HEALTHCARE_ACTIONS = [
  {
    id: 'act_health_autoclave_log',
    canonical: 'Log autoclave sterilization cycle',
    actionVerb: 'log',
    object: 'autoclave sterilization cycle',
    industry: 'healthcare',
    category: 'compliance',
    keywords: [
      'log autoclave cycle', 'autoclave sterilization check', 'check sterilizer temperature',
      'autoclave ka log bharna', 'sterilizer check karo',
      'ऑटोक्लेव लॉग', 'नसबंदी जांच'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_health_oxygen_inventory',
    canonical: 'Verify oxygen cylinder manifold levels',
    actionVerb: 'verify',
    object: 'oxygen cylinder manifold levels',
    industry: 'healthcare',
    category: 'facility_safety',
    keywords: [
      'verify oxygen cylinders', 'check oxygen manifold pressure', 'oxygen cylinder stock count',
      'oxygen cylinder check karna', 'manifold pressure jaanch',
      'ऑक्सीजन सिलेंडर जांच'
    ],
    isSafetyCritical: true,
    safetyWarning: 'Medical gas manifold inspection requires biomedical engineering supervisor sign-off.',
    confidence: 0.95
  },
  {
    id: 'act_health_ambulance_readiness',
    canonical: 'Inspect ambulance emergency equipment',
    actionVerb: 'inspect',
    object: 'ambulance emergency kit',
    industry: 'healthcare',
    category: 'equipment',
    keywords: [
      'inspect ambulance equipment', 'check ambulance readiness', 'ambulance kit inspection',
      'ambulance equipment check karo', 'gadi ka medical kit check',
      'एम्बुलेंस उपकरण जांच'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_health_clinic_roster',
    canonical: 'Update nursing shift duty roster',
    actionVerb: 'update',
    object: 'nursing shift roster',
    industry: 'healthcare',
    category: 'administration',
    keywords: [
      'update nursing roster', 'duty roster shift handover', 'clinic staff schedule',
      'duty roster update karo', 'nurse shift schedule banana',
      'ड्यूटी रोस्टर'
    ],
    isSafetyCritical: false,
    confidence: 0.9
  },
  {
    id: 'act_health_clinical_procedure_alert',
    canonical: 'Clinical medical treatment order',
    actionVerb: 'prescribe',
    object: 'clinical treatment',
    industry: 'healthcare',
    category: 'clinical_prohibited',
    keywords: [
      'administer medication', 'prescribe dosage', 'give iv injection',
      'dawa de do patient ko', 'injection lagao', 'dosage change karo',
      'दवा देना', 'इंजेक्शन लगाना'
    ],
    isSafetyCritical: true,
    safetyWarning: 'CLINICAL SAFETY HOLD: Task extraction engine cannot authorize or delegate medical treatments or drug administrations. Requires licensed physician directive.',
    confidence: 0.98
  }
];
