/**
 * Education & Campuses Industry Pack
 * Timetable scheduling, lab equipment audit, assignment collection, exam room readiness.
 */

export const EDUCATION_ACTIONS = [
  {
    id: 'act_edu_lab_equipment_audit',
    canonical: 'Audit physics and chemistry lab equipment',
    actionVerb: 'audit',
    object: 'lab equipment',
    industry: 'education',
    category: 'facilities',
    keywords: [
      'audit lab equipment', 'check chemistry lab', 'physics lab apparatus audit',
      'lab apparatus check karna', 'science lab ka audit',
      'प्रयोगशाला उपकरण जांच', 'लैब ऑडिट'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_edu_exam_hall_prep',
    canonical: 'Prepare examination hall seating plan',
    actionVerb: 'prepare',
    object: 'exam hall seating plan',
    industry: 'education',
    category: 'administration',
    keywords: [
      'prepare exam hall', 'exam seating plan setup', 'test room roll numbers',
      'exam hall arrange karo', 'seating plan lagao',
      'परीक्षा हॉल व्यवस्था'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_edu_assignment_collection',
    canonical: 'Collect semester project assignments',
    actionVerb: 'collect',
    object: 'project assignments',
    industry: 'education',
    category: 'academics',
    keywords: [
      'collect project assignments', 'submit student papers', 'gather semester files',
      'assignment jama karo', 'project files collect karna',
      'असाइनमेंट संग्रह'
    ],
    isSafetyCritical: false,
    confidence: 0.9
  }
];
