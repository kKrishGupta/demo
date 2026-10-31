/**
 * Industry Pack 13: IT & Operations
 * Server patching, deployment, backup verification, firewall audit, incident ticket resolution.
 */

export const IT_OPERATIONS_ACTIONS = [
  {
    id: 'act_it_server_patching',
    canonical: 'Apply server security patches',
    actionVerb: 'patch',
    object: 'server vulnerabilities',
    industry: 'it_operations',
    category: 'infrastructure',
    keywords: [
      'apply server security patches', 'server security patching', 'patch os vulnerabilities',
      'server patch update', 'production server patch karo', 'security update lagao',
      'सर्वर पैचिंग'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_it_deployment',
    canonical: 'Deploy production release build',
    actionVerb: 'deploy',
    object: 'release build',
    industry: 'it_operations',
    category: 'devops',
    keywords: [
      'deploy production release', 'deploy release build', 'production build deployment',
      'container release deploy karo', 'prod release push karo',
      'प्रोडक्शन डिप्लॉयमेंट'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_it_backup_verification',
    canonical: 'Verify database backup and snapshot restoration',
    actionVerb: 'verify',
    object: 'database backup',
    industry: 'it_operations',
    category: 'resilience',
    keywords: [
      'verify database backup', 'database backup test', 'verify snapshot restoration',
      'backup restore test karo', 'db backup check karo',
      'डेटाबेस बैकअप सत्यापन'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_it_firewall_audit',
    canonical: 'Conduct network firewall security audit',
    actionVerb: 'audit',
    object: 'network firewall',
    industry: 'it_operations',
    category: 'security',
    keywords: [
      'conduct firewall audit', 'network firewall security audit', 'inspect open ports firewall',
      'firewall rules audit karo', 'port security check karo',
      'फ़ायरवॉल ऑडिट'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_it_incident_resolution',
    canonical: 'Resolve high-priority incident ticket',
    actionVerb: 'resolve',
    object: 'incident ticket',
    industry: 'it_operations',
    category: 'support',
    keywords: [
      'resolve incident ticket', 'resolve p1 incident', 'resolve sev1 ticket',
      'incident ticket close karo', 'sev1 issue solve karo',
      'इंसिडेंट टिकट समाधान'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_it_security_audit',
    canonical: 'Conduct infrastructure security audit',
    actionVerb: 'audit',
    object: 'infrastructure security',
    industry: 'it_operations',
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
    id: 'act_it_prod_database_migration',
    canonical: 'Execute production database migration',
    actionVerb: 'migrate',
    object: 'production database',
    industry: 'it_operations',
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
    industry: 'it_operations',
    category: 'development',
    keywords: [
      'complete code review', 'review pull request', 'pr review karo', 'code review karna',
      'कोड रिव्यू'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  }
];
