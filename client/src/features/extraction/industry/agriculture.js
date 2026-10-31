/**
 * Agriculture & Farming Industry Pack
 * Irrigation schedules, harvesting, crop disease scouting, tractor maintenance, fertilizer application.
 */

export const AGRICULTURE_ACTIONS = [
  {
    id: 'act_agri_irrigation_schedule',
    canonical: 'Run field drip irrigation system',
    actionVerb: 'run',
    object: 'drip irrigation system',
    industry: 'agriculture',
    category: 'irrigation',
    keywords: [
      'run drip irrigation', 'field irrigation schedule', 'turn on tube well pump',
      'khet mein paani lagao', 'drip irrigation chalu karo', 'tubewell chalana',
      'सिंचाई चालू करो', 'खेत में पानी लगाना'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_agri_crop_inspection',
    canonical: 'Scout crops for pest infestation',
    actionVerb: 'scout',
    object: 'crops for pest infestation',
    industry: 'agriculture',
    category: 'scouting',
    keywords: [
      'scout crop pests', 'inspect crop disease', 'check crop health field',
      'fasal ki jaanch karo', 'keeda inspection', 'fasal bimari check',
      'फसल रोग निरीक्षण', 'कीट जांच'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_agri_fertilizer_application',
    canonical: 'Apply bio-fertilizer to sector',
    actionVerb: 'apply',
    object: 'fertilizer',
    industry: 'agriculture',
    category: 'agronomy',
    keywords: [
      'apply fertilizer', 'spread compost', 'spray pesticide',
      'khad daalo khet mein', 'keetnashak chhidkav', 'urea application',
      'खाद डालना', 'कीटनाशक छिड़काव'
    ],
    isSafetyCritical: false,
    confidence: 0.9
  }
];
