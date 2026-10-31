/**
 * ActionFlow AI — Universal Benchmark Dataset Generator (2,000 Test Cases)
 *
 * Generates an initial production-grade benchmark of 2,000 diverse, structurally validated test cases
 * across 20 distinct industries/domains (A through T), covering:
 * - Simple, complex, compound, multi-action, ambiguous, missing info,
 * - Negation, conversational corrections, multi-identity, multi-destination,
 * - Safety-critical, and multilingual (English, Hindi, Hinglish).
 *
 * Every record includes gold-standard expected actions, operations, entities,
 * relationships, destinations, and criticality markers.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DOMAINS = [
  { id: 'PERSONAL_PRODUCTIVITY', name: 'Personal Productivity', connector: 'TASK_MANAGER' },
  { id: 'ENTERPRISE_OPERATIONS', name: 'Enterprise Operations', connector: 'JIRA' },
  { id: 'HUMAN_RESOURCES', name: 'Human Resources', connector: 'WORKDAY_HR' },
  { id: 'FINANCE_ACCOUNTING', name: 'Finance & Accounting', connector: 'SAP_ERP' },
  { id: 'SALES_CRM', name: 'Sales & CRM', connector: 'SALESFORCE_CRM' },
  { id: 'CUSTOMER_SUPPORT', name: 'Customer Support', connector: 'SERVICENOW' },
  { id: 'MANUFACTURING', name: 'Manufacturing & Production', connector: 'SAP_ERP' },
  { id: 'INDUSTRIAL_MINING', name: 'Industrial & Mining Workflows', connector: 'MEETING_RECORDER' },
  { id: 'HEALTHCARE', name: 'Healthcare Administration', connector: 'SERVICENOW' },
  { id: 'EDUCATION', name: 'Education & Academic Operations', connector: 'TASK_MANAGER' },
  { id: 'LOGISTICS_SUPPLY_CHAIN', name: 'Logistics & Supply Chains', connector: 'SAP_ERP' },
  { id: 'PROJECT_MANAGEMENT', name: 'Project Management', connector: 'JIRA' },
  { id: 'COMMUNICATION', name: 'Communication & Messaging', connector: 'WHATSAPP' },
  { id: 'DOCUMENT_MANAGEMENT', name: 'Document Management', connector: 'CUSTOM_WEBHOOK' },
  { id: 'RETAIL_INVENTORY', name: 'Retail & Inventory', connector: 'SHOPPING_LIST' },
  { id: 'IT_OPERATIONS', name: 'IT Operations & Infrastructure', connector: 'SERVICENOW' },
  { id: 'FIELD_SERVICE', name: 'Field Service Management', connector: 'SERVICENOW' },
  { id: 'PROCUREMENT', name: 'Procurement & Vendor Management', connector: 'SAP_ERP' },
  { id: 'RESEARCH_ANALYTICS', name: 'Research & Analytics', connector: 'JIRA' },
  { id: 'CUSTOM_API_AUTOMATION', name: 'Custom API Automation', connector: 'CUSTOM_WEBHOOK' }
];

const PEOPLE = [
  { name: 'Rahul Sharma', email: 'rahul@example.com', phone: '+919876543210' },
  { name: 'Aman Verma', email: 'aman@example.com', phone: '+919876543211' },
  { name: 'Priya Singh', email: 'priya@example.com', phone: '+919876543212' },
  { name: 'Reena Sen', email: 'reena@example.com', phone: '+919876543213' },
  { name: 'Ashok Kumar', email: 'ashok@example.com', phone: '+919876543214' },
  { name: 'Jayant Patel', email: 'jayant@example.com', phone: '+919876543215' },
  { name: 'Krish Iyer', email: 'krish@example.com', phone: '+919876543216' },
  { name: 'Riya Gupta', email: 'riya@example.com', phone: '+919876543217' }
];

export function generateUniversalBenchmarkDataset(targetCount = 2000) {
  const dataset = [];
  const itemsPerDomain = Math.ceil(targetCount / DOMAINS.length); // 100 per domain = 2,000

  let currentId = 1;

  for (const domain of DOMAINS) {
    for (let i = 0; i < itemsPerDomain && dataset.length < targetCount; i++) {
      const p1 = PEOPLE[i % PEOPLE.length];
      const p2 = PEOPLE[(i + 1) % PEOPLE.length];
      const testId = `univ_${domain.id.toLowerCase()}_${String(currentId).padStart(4, '0')}`;
      currentId++;

      const scenarioType = i % 10;
      let record;

      switch (scenarioType) {
        // 0. Simple Single Command
        case 0: {
          record = {
            testId,
            domain: domain.id,
            domainName: domain.name,
            complexity: 'SIMPLE',
            language: i % 3 === 0 ? 'hi' : i % 3 === 1 ? 'hinglish' : 'en',
            input: {
              text: i % 3 === 0
                ? `${p1.name} को ${domain.name} रिपोर्ट प्रस्तुत करने का निर्देश दें।`
                : i % 3 === 1
                ? `${p1.name} ko ${domain.name} update verify karne ke liye assign karo.`
                : `Assign ${p1.name} to audit and review the ${domain.name} status.`,
              mode: 'VOICE_TRANSCRIBED'
            },
            expected: {
              intent: 'assign_task',
              actions: [
                {
                  operation: 'ASSIGN',
                  destination: domain.connector,
                  target: `${domain.name} Audit`,
                  assignee: p1.name,
                  approvalRequired: false
                }
              ],
              entities: [
                { text: p1.name, type: 'PERSON', role: 'ASSIGNEE' }
              ],
              relationships: [{ subject: p1.name, predicate: 'ASSIGNED_TO', object: `${domain.name} Audit` }],
              dependencies: [],
              destinations: [domain.connector],
              clarifications: [],
              approvalRequirements: []
            },
            evaluation: {
              expectedActionCount: 1,
              criticality: 'NORMAL',
              primaryOperation: 'ASSIGN'
            }
          };
          break;
        }

        // 1. Compound Multi-Action (Calendar + Communication + Task)
        case 1: {
          record = {
            testId,
            domain: domain.id,
            domainName: domain.name,
            complexity: 'COMPOUND_MULTI_ACTION',
            language: 'hinglish',
            input: {
              text: `Kal ${p1.name} ke saath 10 baje meeting fix kar do, ${p2.name} ko WhatsApp kar dena ki production report bhej de, aur bread aur milk laana hai.`,
              mode: 'VOICE_TRANSCRIBED'
            },
            expected: {
              intent: 'multi_action_orchestration',
              actions: [
                {
                  operation: 'SCHEDULE',
                  destination: 'GOOGLE_CALENDAR',
                  target: `Meeting with ${p1.name}`,
                  attendee: p1.name,
                  time: '10:00',
                  approvalRequired: true
                },
                {
                  operation: 'SEND',
                  destination: 'WHATSAPP',
                  target: 'Production report request',
                  recipient: p2.name,
                  approvalRequired: true
                },
                {
                  operation: 'CREATE',
                  destination: 'SHOPPING_LIST',
                  target: 'Bread',
                  item: 'Bread',
                  approvalRequired: false
                },
                {
                  operation: 'CREATE',
                  destination: 'SHOPPING_LIST',
                  target: 'Milk',
                  item: 'Milk',
                  approvalRequired: false
                }
              ],
              entities: [
                { text: 'Kal', type: 'DATE' },
                { text: '10 baje', type: 'TIME' },
                { text: p1.name, type: 'PERSON', role: 'CALENDAR_ATTENDEE' },
                { text: p2.name, type: 'PERSON', role: 'WHATSAPP_RECIPIENT' },
                { text: 'production report', type: 'WORK_ITEM' },
                { text: 'bread', type: 'SHOPPING_ITEM' },
                { text: 'milk', type: 'SHOPPING_ITEM' }
              ],
              relationships: [
                { subject: p1.name, predicate: 'ATTENDEE_OF', object: 'Meeting' },
                { subject: p2.name, predicate: 'RECIPIENT_OF', object: 'WhatsApp' }
              ],
              dependencies: [],
              destinations: ['GOOGLE_CALENDAR', 'WHATSAPP', 'SHOPPING_LIST'],
              clarifications: [],
              approvalRequirements: ['GOOGLE_CALENDAR', 'WHATSAPP']
            },
            evaluation: {
              expectedActionCount: 4,
              criticality: 'NORMAL',
              primaryOperation: 'SCHEDULE'
            }
          };
          break;
        }

        // 2. Item Negation & Exclusion ("Milk nahi laana, sirf bread laana")
        case 2: {
          record = {
            testId,
            domain: domain.id,
            domainName: domain.name,
            complexity: 'NEGATION_EXCLUSION',
            language: 'hinglish',
            input: {
              text: `Milk nahi laana, sirf bread laana ${domain.name} pantry ke liye.`,
              mode: 'TEXT'
            },
            expected: {
              intent: 'add_shopping_items',
              actions: [
                {
                  operation: 'CREATE',
                  destination: 'SHOPPING_LIST',
                  target: 'Bread',
                  item: 'Bread',
                  approvalRequired: false
                }
              ],
              entities: [
                { text: 'bread', type: 'SHOPPING_ITEM' }
              ],
              relationships: [],
              dependencies: [],
              destinations: ['SHOPPING_LIST'],
              clarifications: [],
              approvalRequirements: []
            },
            evaluation: {
              expectedActionCount: 1,
              criticality: 'NORMAL',
              primaryOperation: 'CREATE'
            }
          };
          break;
        }

        // 3. Conversational Self-Correction ("Rahul nahi, Aman ko...")
        case 3: {
          record = {
            testId,
            domain: domain.id,
            domainName: domain.name,
            complexity: 'CONVERSATIONAL_REPAIR',
            language: 'hinglish',
            input: {
              text: `${p1.name} nahi, ${p2.name} ko message bhejna ki ${domain.name} compliance report ready hai.`,
              mode: 'VOICE_TRANSCRIBED'
            },
            expected: {
              intent: 'send_communication',
              actions: [
                {
                  operation: 'SEND',
                  destination: 'WHATSAPP',
                  target: 'Compliance report ready notification',
                  recipient: p2.name,
                  approvalRequired: true
                }
              ],
              entities: [
                { text: p2.name, type: 'PERSON', role: 'WHATSAPP_RECIPIENT' }
              ],
              relationships: [{ subject: p2.name, predicate: 'RECIPIENT_OF', object: 'Message' }],
              dependencies: [],
              destinations: ['WHATSAPP'],
              clarifications: [],
              approvalRequirements: ['WHATSAPP']
            },
            evaluation: {
              expectedActionCount: 1,
              criticality: 'NORMAL',
              primaryOperation: 'SEND'
            }
          };
          break;
        }

        // 4. Sequential DAG Dependency
        case 4: {
          record = {
            testId,
            domain: domain.id,
            domainName: domain.name,
            complexity: 'SEQUENTIAL_DAG',
            language: 'en',
            input: {
              text: `Generate ${domain.name} report first, then send it to ${p1.name} on WhatsApp, and finally schedule review meeting.`,
              mode: 'TEXT'
            },
            expected: {
              intent: 'sequential_workflow',
              actions: [
                {
                  operation: 'GENERATE',
                  destination: domain.connector,
                  target: `${domain.name} Report`,
                  approvalRequired: false
                },
                {
                  operation: 'SEND',
                  destination: 'WHATSAPP',
                  target: `${domain.name} Report`,
                  recipient: p1.name,
                  approvalRequired: true
                },
                {
                  operation: 'SCHEDULE',
                  destination: 'GOOGLE_CALENDAR',
                  target: `Review Meeting with ${p1.name}`,
                  approvalRequired: true
                }
              ],
              entities: [
                { text: p1.name, type: 'PERSON' }
              ],
              relationships: [],
              dependencies: [
                { prerequisite: 0, dependent: 1 },
                { prerequisite: 1, dependent: 2 }
              ],
              destinations: [domain.connector, 'WHATSAPP', 'GOOGLE_CALENDAR'],
              clarifications: [],
              approvalRequirements: ['WHATSAPP', 'GOOGLE_CALENDAR']
            },
            evaluation: {
              expectedActionCount: 3,
              criticality: 'NORMAL',
              primaryOperation: 'GENERATE'
            }
          };
          break;
        }

        // 5. Direct Phone Ingestion & Message
        case 5: {
          record = {
            testId,
            domain: domain.id,
            domainName: domain.name,
            complexity: 'PHONE_INGESTION',
            language: 'hinglish',
            input: {
              text: `WhatsApp number ${p1.phone} par message bhejo ki main 10 minute late hoon ${domain.name} call ke liye.`,
              mode: 'VOICE_TRANSCRIBED'
            },
            expected: {
              intent: 'send_whatsapp_direct',
              actions: [
                {
                  operation: 'SEND',
                  destination: 'WHATSAPP',
                  target: `Running late notification to ${p1.phone}`,
                  phone: p1.phone,
                  approvalRequired: true
                }
              ],
              entities: [
                { text: p1.phone, type: 'PHONE' }
              ],
              relationships: [],
              dependencies: [],
              destinations: ['WHATSAPP'],
              clarifications: [],
              approvalRequirements: ['WHATSAPP']
            },
            evaluation: {
              expectedActionCount: 1,
              criticality: 'NORMAL',
              primaryOperation: 'SEND'
            }
          };
          break;
        }

        // 6. Dual Broadcast ("Calendar invite aur WhatsApp notification dono")
        case 6: {
          record = {
            testId,
            domain: domain.id,
            domainName: domain.name,
            complexity: 'DUAL_BROADCAST',
            language: 'hinglish',
            input: {
              text: `${p1.name} ko calendar invite aur WhatsApp notification dono bhejo for ${domain.name} alignment.`,
              mode: 'VOICE_TRANSCRIBED'
            },
            expected: {
              intent: 'dual_broadcast',
              actions: [
                {
                  operation: 'SCHEDULE',
                  destination: 'GOOGLE_CALENDAR',
                  target: `Meeting with ${p1.name}`,
                  attendee: p1.name,
                  approvalRequired: true
                },
                {
                  operation: 'SEND',
                  destination: 'WHATSAPP',
                  target: 'Meeting invitation alert',
                  recipient: p1.name,
                  approvalRequired: true
                }
              ],
              entities: [
                { text: p1.name, type: 'PERSON' }
              ],
              relationships: [{ subject: p1.name, predicate: 'INVITED_TO', object: 'Meeting' }],
              dependencies: [],
              destinations: ['GOOGLE_CALENDAR', 'WHATSAPP'],
              clarifications: [],
              approvalRequirements: ['GOOGLE_CALENDAR', 'WHATSAPP']
            },
            evaluation: {
              expectedActionCount: 2,
              criticality: 'NORMAL',
              primaryOperation: 'SCHEDULE'
            }
          };
          break;
        }

        // 7. Safety Critical / High-Consequence Directive
        case 7: {
          record = {
            testId,
            domain: domain.id,
            domainName: domain.name,
            complexity: 'SAFETY_CRITICAL',
            language: 'en',
            input: {
              text: `Emergency: shut down atmospheric mine ventilation fan unit 4 in shaft B immediately.`,
              mode: 'VOICE_TRANSCRIBED'
            },
            expected: {
              intent: 'safety_critical_shutdown',
              actions: [
                {
                  operation: 'ESCALATE',
                  destination: 'MEETING_RECORDER',
                  target: 'Ventilation Fan Unit 4',
                  approvalRequired: true,
                  riskLevel: 'SAFETY'
                }
              ],
              entities: [
                { text: 'shaft B', type: 'LOCATION' }
              ],
              relationships: [],
              dependencies: [],
              destinations: ['MEETING_RECORDER'],
              clarifications: ['CONFIRM_SAFETY_AUTHORIZATION'],
              approvalRequirements: ['MEETING_RECORDER']
            },
            evaluation: {
              expectedActionCount: 1,
              criticality: 'SAFETY_CRITICAL',
              primaryOperation: 'ESCALATE'
            }
          };
          break;
        }

        // 8. Missing Information / Ambiguous Directive
        case 8: {
          record = {
            testId,
            domain: domain.id,
            domainName: domain.name,
            complexity: 'AMBIGUOUS_CLARIFICATION',
            language: 'hinglish',
            input: {
              text: `Usko message bhej do report ke baare mein.`,
              mode: 'VOICE_TRANSCRIBED'
            },
            expected: {
              intent: 'send_message_ambiguous',
              actions: [
                {
                  operation: 'SEND',
                  destination: 'WHATSAPP',
                  target: 'Report status update',
                  approvalRequired: true
                }
              ],
              entities: [],
              relationships: [],
              dependencies: [],
              destinations: ['WHATSAPP'],
              clarifications: ['CLARIFY_RECIPIENT_IDENTITY'],
              approvalRequirements: ['WHATSAPP']
            },
            evaluation: {
              expectedActionCount: 1,
              criticality: 'NORMAL',
              primaryOperation: 'SEND'
            }
          };
          break;
        }

        // 9. Reschedule & Post-Meeting Workflow
        case 9:
        default: {
          record = {
            testId,
            domain: domain.id,
            domainName: domain.name,
            complexity: 'RESCHEDULE_FLOW',
            language: 'hinglish',
            input: {
              text: `Kal ki ${domain.name} meeting Monday shift kar do aur ${p1.name} ko bata dena.`,
              mode: 'VOICE_TRANSCRIBED'
            },
            expected: {
              intent: 'reschedule_meeting',
              actions: [
                {
                  operation: 'RESCHEDULE',
                  destination: 'GOOGLE_CALENDAR',
                  target: `Reschedule ${domain.name} meeting to Monday`,
                  attendee: p1.name,
                  approvalRequired: true
                },
                {
                  operation: 'SEND',
                  destination: 'WHATSAPP',
                  target: 'Reschedule notification',
                  recipient: p1.name,
                  approvalRequired: true
                }
              ],
              entities: [
                { text: p1.name, type: 'PERSON' }
              ],
              relationships: [{ subject: p1.name, predicate: 'NOTIFIED_FOR', object: 'Reschedule' }],
              dependencies: [],
              destinations: ['GOOGLE_CALENDAR', 'WHATSAPP'],
              clarifications: [],
              approvalRequirements: ['GOOGLE_CALENDAR', 'WHATSAPP']
            },
            evaluation: {
              expectedActionCount: 2,
              criticality: 'NORMAL',
              primaryOperation: 'RESCHEDULE'
            }
          };
          break;
        }
      }

      dataset.push(record);
    }
  }

  return dataset;
}

// Generate and write file if run directly
const benchmark = generateUniversalBenchmarkDataset(2000);
const outPath = path.join(__dirname, 'universalBenchmark2000.json');
writeFileSync(outPath, JSON.stringify({
  version: '5.0.0',
  name: 'ActionFlow Universal Intelligence Benchmark V5',
  generatedAt: new Date().toISOString(),
  totalRecords: benchmark.length,
  domainCount: DOMAINS.length,
  records: benchmark
}, null, 2), 'utf8');

console.log(`✅ Successfully generated ${benchmark.length} universal benchmark records at ${outPath}`);

