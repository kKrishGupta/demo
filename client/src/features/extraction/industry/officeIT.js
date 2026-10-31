/**
 * Offices, IT & Software Operations Industry Pack
 * Deployment, code review, server patching, security audit, report preparation, sprint planning.
 */

export const OFFICE_IT_ACTIONS = [
  {
    id: 'act_it_security_audit',
    canonical: 'Conduct infrastructure security audit',
    actionVerb: 'audit',
    object: 'infrastructure security',
    industry: 'office_it',
    category: 'compliance',
    keywords: [
      'security audit', 'conduct infrastructure security audit', 'internal security review',
      'audit internal security', 'security audit karna',
      'सुरक्षा ऑडिट'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_it_prepare_report',
    canonical: 'Prepare the report',
    actionVerb: 'prepare',
    object: 'report',
    industry: 'office_it',
    category: 'reporting',
    keywords: [
      'prepare the report', 'prepare report', 'draft weekly status report',
      'submit the report', 'submit report', 'submit monthly report', 'submit the project report',
      'report banao', 'status report prepare karo', 'report submit karo',
      'रिपोर्ट तैयार करना', 'रिपोर्ट सबमिट करना'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_it_prod_database_migration',
    canonical: 'Execute production database migration',
    actionVerb: 'migrate',
    object: 'production database',
    industry: 'office_it',
    category: 'engineering',
    keywords: [
      'migrate production database', 'execute schema migration prod', 'drop prod tables',
      'prod database migrate karo', 'production db migration',
      'डेटाबेस माइग्रेशन'
    ],
    isSafetyCritical: true,
    safetyWarning: 'PRODUCTION RESILIENCE ALERT: Direct production database changes require change-management approval and snapshot verification.',
    confidence: 0.98
  },
  {
    id: 'act_it_code_review',
    canonical: 'Complete pull request code review',
    actionVerb: 'review',
    object: 'pull request',
    industry: 'office_it',
    category: 'development',
    keywords: [
      'code review', 'review pull request', 'pr review', 'peer code check',
      'code check kar do', 'pr review karo',
      'कोड समीक्षा'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  }
];
