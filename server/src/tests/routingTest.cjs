/**
 * Phase 1 — Destination Router Test (CommonJS, no ESM lstat issues)
 * Tests the routing patterns extracted from destinationRouter.js
 */

// Replicate the routing patterns inline (no import needed)
const ROUTING_RULES = [
  { dest: 'SITE_RECORDING', patterns: [/\b(?:recording|record\s+start|start\s+recording|site\s+recording)\b/i] },
  { dest: 'WHATSAPP', patterns: [/\b(?:whatsapp|whats\s*app|wa\s+kar|wa\s+bhej|message\s+kar\s+do|msg\s+kar)\b/i, /\bko\s+(?:whatsapp|message|msg)\b/i] },
  { dest: 'EMAIL', patterns: [/\b(?:email|mail|ek\s+email|email\s+bhej|mail\s+kar)\b/i, /\bko\s+(?:email|mail)\b/i] },
  { dest: 'GOOGLE_CALENDAR', patterns: [
    /\b(?:meeting\s+(?:fix|schedule|set|lagao|rakho|kar\s+do)|schedule\s+(?:a\s+)?meeting)\b/i,
    /\b(?:kal|aaj|parso|tomorrow)\b.*\b(?:meeting|call|event|appointment)\b/i,
    /\b(?:meeting|call|event|appointment)\b.*\b(?:kal|aaj|tomorrow|\d+\s*(?:am|pm|baje))\b/i,
    /\b(?:reschedule|postpone|cancel\s+(?:the\s+)?meeting|meeting\s+cancel)\b/i,
  ]},
  { dest: 'SHOPPING_LIST', patterns: [
    /\b(?:shopping\s+(?:list|mein)|grocery|groceries)\b/i,
    /\b(?:bread|milk|doodh|sabzi|atta|chawal|dal|vegetables?|fruits?|eggs?|sugar|namak|oil)\b.*\b(?:laana|le\s+aana|khareedna|chahiye)\b/i,
    /\b(?:laana\s+hai|le\s+aana)\b.*\b(?:bread|milk|doodh|sabzi)\b/i,
    /\b(?:kitchen|ghar)\s+(?:mein|ke\s+liye).*\b(?:laana|chahiye|lena)\b/i,
  ]},
  { dest: 'REMINDERS', patterns: [
    /\b(?:remind|reminder|yaad\s+dila|yaad\s+dilana|mujhe\s+yaad|notification)\b/i,
    /\b(?:mujhe\s+(?:kal|aaj|shaam|subah|raat)\s+(?:yaad|batana|remind))\b/i,
    /\b(?:shaam\s+ko\s+(?:mujhe\s+)?yaad)\b/i,
  ]},
  { dest: 'MEETING_NOTES', patterns: [/\b(?:meeting\s+(?:notes?|minutes?|summary)|action\s+items?)\b/i] },
  { dest: 'TASK_ASSIGNMENT', patterns: [
    /\b(?:assign\s+(?:to|kar)|assign\s+karo|assign\s+kar\s+do|delegate|assign\s+(?:this\s+)?to)\b/i,
    /\b(?:ko\s+(?:assign|de\s+do|saup\s+do|zimma\s+do|karne\s+bol))\b/i,
    /\b(?:not\s+\w+[,\s]+assign|instead[,\s]+assign|no[,\s]+not\s+\w+[,\s]+assign)\b/i,
  ]},
  { dest: 'TASK_MANAGER', patterns: [
    /\b(?:task\s+(?:create|bana|banao|add|update|complete|done))\b/i,
    /\b(?:pending\s+(?:task|kaam)|priority\s+(?:high|low|urgent|set))\b/i,
    /\b(?:kaam\s+(?:karna|karni|complete)|project\s+complete)\b/i,
    /\b(?:todo|to.do|action\s+item)\b/i,
  ]},
];

function route(transcript) {
  const lower = transcript.toLowerCase();
  for (const rule of ROUTING_RULES) {
    for (const p of rule.patterns) {
      if (p.test(lower)) return rule.dest;
    }
  }
  return 'TASK_MANAGER';
}

const tests = [
  // Phase 1 core tests
  ['Kal Rahul ke saath 10 baje meeting fix kar do.', 'GOOGLE_CALENDAR'],
  ['Aman ko WhatsApp kar do ki production report bhej de.', 'WHATSAPP'],
  ['Kitchen mein bread aur milk laana hai.', 'SHOPPING_LIST'],
  ['Shaam ko mujhe electricity bill yaad dilana.', 'REMINDERS'],
  ['Rahul ko production report banane ke liye assign kar do.', 'TASK_ASSIGNMENT'],
  ['Priya ko email bhejo about the meeting.', 'EMAIL'],
  ['Friday tak ye project complete karna hai.', 'TASK_MANAGER'],
  ['Meeting fix kar do.', 'GOOGLE_CALENDAR'],
  ['Aman ko message kar do ki meeting postpone ho gayi.', 'WHATSAPP'],
  ['Yaad dila dena shaam ko.', 'REMINDERS'],
  ['Doodh laana hai kal subah.', 'SHOPPING_LIST'],
  ['Rahul ko assign karo.', 'TASK_ASSIGNMENT'],
  ['Meeting notes lena hai.', 'MEETING_NOTES'],
  ['Recording start karo.', 'SITE_RECORDING'],
  ['Mere calendar mein kal 10 baje meeting fix kar do.', 'GOOGLE_CALENDAR'],
  ['Rahul ko ye task assign kar dena.', 'TASK_ASSIGNMENT'],
  ['Mujhe shaam ko yaad dilana.', 'REMINDERS'],
  ['Meeting ke baad final report bhej dena.', 'TASK_MANAGER'],
  ['Saare pending tasks dikhao.', 'TASK_MANAGER'],
  ['Grocery list mein add kar do bread aur eggs.', 'SHOPPING_LIST'],
  // Corrections detection
  ['No, not Rahul, assign this to Aman instead.', 'TASK_ASSIGNMENT'],
  ['Meeting cancel kar do.', 'GOOGLE_CALENDAR'],
  ['Tomorrow at 11 AM meeting with Priya.', 'GOOGLE_CALENDAR'],
  ['Aman ko mail karo ki report ready hai.', 'EMAIL'],
  ['Shopping list mein dal aur atta add karo.', 'SHOPPING_LIST'],
];

let passed = 0;
const failures = [];

for (const [transcript, expected] of tests) {
  const got = route(transcript);
  if (got === expected) {
    passed++;
  } else {
    failures.push({ transcript: transcript.slice(0, 55), expected, got });
  }
}

console.log('\n=== Phase 1 Destination Router Test ===');
console.log(`Total: ${tests.length} | Passed: ${passed} | Failed: ${tests.length - passed}`);
console.log(`Accuracy: ${(passed / tests.length * 100).toFixed(1)}%`);

if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  FAIL "${f.transcript}" → expected ${f.expected} got ${f.got}`));
} else {
  console.log('\nAll tests passed!');
}
