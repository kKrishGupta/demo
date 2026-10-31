/**
 * Industry Pack 15: Maintenance & Facilities
 * HVAC servicing, generator load test, plumbing repair, elevator inspection, preventive maintenance.
 */

export const MAINTENANCE_FACILITIES_ACTIONS = [
  {
    id: 'act_maint_hvac_servicing',
    canonical: 'Service central HVAC chiller filters',
    actionVerb: 'service',
    object: 'HVAC chiller filters',
    industry: 'maintenance_facilities',
    category: 'facilities',
    keywords: [
      'service central hvac', 'hvac chiller filter servicing', 'clean ac duct filters',
      'cooling tower servicing', 'ac maintenance karo', 'hvac service karwana',
      'एचवीएसी मेंटेनेंस'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_maint_generator_load_test',
    canonical: 'Conduct generator load test',
    actionVerb: 'test',
    object: 'generator load',
    industry: 'maintenance_facilities',
    category: 'electrical',
    keywords: [
      'generator load test', 'dg set load test', 'diesel generator test run',
      'generator battery check', 'generator check karna', 'dg test run karo',
      'जनरेटर लोड टेस्ट'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_maint_plumbing_repair',
    canonical: 'Repair main plumbing pipeline leakage',
    actionVerb: 'repair',
    object: 'plumbing pipeline',
    industry: 'maintenance_facilities',
    category: 'plumbing',
    keywords: [
      'repair plumbing pipeline', 'water line leakage repair', 'overhead tank valve replacement',
      'plumbing repair karwana', 'pipe leakage theek karo', 'nal theek karo',
      'प्लंबिंग रिपेयर'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_maint_elevator_inspection',
    canonical: 'Complete statutory elevator safety inspection',
    actionVerb: 'inspect',
    object: 'elevator safety',
    industry: 'maintenance_facilities',
    category: 'safety',
    keywords: [
      'elevator safety inspection', 'statutory elevator check', 'passenger lift safety audit',
      'lift rope inspection', 'elevator check karwana', 'lift inspection karo',
      'लिफ्ट सुरक्षा निरीक्षण'
    ],
    isSafetyCritical: false,
    confidence: 0.96
  },
  {
    id: 'act_maint_preventive_checklist',
    canonical: 'Execute facility preventive maintenance checklist',
    actionVerb: 'execute',
    object: 'preventive maintenance checklist',
    industry: 'maintenance_facilities',
    category: 'preventive',
    keywords: [
      'preventive maintenance checklist', 'facility pm checklist', 'scheduled equipment maintenance',
      'preventive maintenance karwana', 'pm checklist pura karo', 'marmmat checklist',
      'निवारक रखरखाव'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  }
];
