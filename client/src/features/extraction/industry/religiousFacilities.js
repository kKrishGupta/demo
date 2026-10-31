/**
 * Temples, Religious Facilities & Event Venues Industry Pack
 * Premises cleaning, event setup, crowd management, daily offerings, festival logistics, volunteer coordination.
 */

export const RELIGIOUS_FACILITY_ACTIONS = [
  {
    id: 'act_rel_premises_cleaning',
    canonical: 'Clean temple sanctum and premises',
    actionVerb: 'clean',
    object: 'temple premises',
    industry: 'religious_facilities',
    category: 'maintenance',
    keywords: [
      'clean temple premises', 'sanctum cleaning', 'mandir ki safai', 'temple courtyard cleaning',
      'mandir saaf karo', 'parisar ki safai', 'mandir safai karwana',
      'मंदिर परिसर की सफाई', 'गर्भगृह सफाई'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_rel_crowd_barricade_setup',
    canonical: 'Arrange crowd control barricades',
    actionVerb: 'arrange',
    object: 'crowd barricades',
    industry: 'religious_facilities',
    category: 'safety',
    keywords: [
      'arrange crowd barricades', 'setup darshan queue', 'crowd control setup', 'festival barricades',
      'line ke barricade lagao', 'bheed control vyavastha', 'darshan line arrangement',
      'भीड़ नियंत्रण बैरिकेड'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_rel_prasad_ration_procurement',
    canonical: 'Procure prasad and langar rations',
    actionVerb: 'procure',
    object: 'prasad and langar rations',
    industry: 'religious_facilities',
    category: 'procurement',
    keywords: [
      'procure prasad rations', 'langar ration delivery', 'temple kitchen grain order',
      'prasad ka rashan mangwana', 'langar samagri laana', 'bhandara ration order',
      'प्रसाद राशन सामग्री', 'लंगर राशन'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_rel_volunteer_briefing',
    canonical: 'Conduct volunteer seva briefing',
    actionVerb: 'brief',
    object: 'volunteer seva team',
    industry: 'religious_facilities',
    category: 'coordination',
    keywords: [
      'volunteer briefing', 'seva team meeting', 'festival volunteer coordination',
      'sevak briefing karo', 'volunteers ko coordinate karo',
      'स्वयंसेवक बैठक'
    ],
    isSafetyCritical: false,
    confidence: 0.9
  }
];
