/**
 * Responsibility & Delegation Dictionary
 * Captures assignment markers, postpositions, and reviewer patterns in English and Hindi/Hinglish.
 */

export const ASSIGNEE_MARKERS = [
  // 1. English standard assignment & delegation
  // e.g. "Assign this to Rahul", "Assign task to Rahul", "Assign a task to Reena to bring milk", "Assign milk delivery to Reena", "Delegate the security audit to Jayant"
  /(?:assign(?:ed)?|delegate(?:d)?|give|handover)\s+(?:(?:it|this|that|task|a\s+task|the\s+task|(?:the\s+)?[a-zA-Z\s]+?)\s+)?to\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)(?=\s+to\b|\s+for|\s+on|\s+at|\s+by|\s+with|\s+start|\s+finish|\s+due|\s+repeat|\s+every|\s+set|[.,;]|$)/i,
  // "Bring milk, assigned to Priya", "prepare report, assigned to Reena"
  /(?:^|[.,;]|\s+)\b(?:assigned\s+to|delegated\s+to|given\s+to)\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)/i,
  // "Ask the Riya to bring milk", "Tell Rahul to inspect", "Get Rahul to inspect", "Please ask Priya to..."
  /(?:please\s+)?(?:ask|tell|instruct|get|have)\s+(?:the\s+)?(?:person\s+named\s+)?([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s+(?:to\s+|for\s+)/i,
  // "Assign Priya to prepare", "Assign Riya the task of preparing"
  /(?:please\s+)?(?:assign|delegate)\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s+(?:the\s+task\s+of|to\s+)/i,
  // "I need Rahul to review"
  /(?:i\s+need|we\s+need)\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s+to\s+/i,
  /make\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+){0,2})\s+responsible\s+(?:for)?/i,

  // 2. Hindi postposition "<Name> ko ..." (supporting Unicode without ASCII-only \b)
  // e.g. "Reena ko roz doodh leke aana hai", "रीना को रोज़ दूध लेकर आना है", "Reena ko doodh laane ka kaam do", "Riya ko roz subah doodh le aana bol do"
  /(?:^|[\s,;.])([a-zA-Z\u0900-\u097F]+)\s+ko\s+[^,;.]+?\s+(?:bol\s+do|kahe|kaho|bolna)\b/i,
  /(?:^|[\s,;.])([a-zA-Z\u0900-\u097F]+)\s+ko\s+(?:(?:ek\s+)?kaam|roz|har\s+din|doodh|milk|sabzi|safai|karne|laane|lana|leke)/i,
  /(?:^|[\s,;.])([a-zA-Z\u0900-\u097F]+)\s+ko\b/i,

  // 3. Hindi postposition "<Name> se ..."
  // e.g. "Reena se doodh laane ko bol do", "Reena se karwa do", "Reena se bolo"
  /(?:^|[\s,;.])([a-zA-Z\u0900-\u097F]+)\s+se\s+(?:(?:doodh|kaam|sabzi|safai)\s+)?(?:laane\s+ko\s+bol\s+do|karne\s+ko\s+bolo|bol\s+do|karwao|karwa\s+do)/i,

  // 4. Hindi future verb "<Name> karegi / karega / laayega"
  // e.g. "Milk lana hai, Reena karegi", "Rahul karega"
  /(?:^|[\s,;.])([a-zA-Z\u0900-\u097F]+)\s+(?:karegi|karega|kare|laayegi|laayega|laayenge|dekhega|dekhegi)\b/i,

  // 5. Direct address at start of sentence followed by comma or command
  // e.g. "Rina, milk le aana har din", "Reena, kitchen saaf karo"
  /^([a-zA-Z\u0900-\u097F]+),\s*/i,

  // 6. Direct command addressing with domestic location
  // e.g. "Reena kitchen mein doodh rakh de"
  /^([a-zA-Z\u0900-\u097F]+)\s+(?:kitchen|site|office|daftar|rasoi)\b/i,

  // 7. English should verb
  // e.g. "Reena should bring milk tomorrow morning", "Jayant should check the generator every Friday"
  /\b([a-zA-Z\u0900-\u097F]+)\s+should\s+(?:bring|clean|prepare|do|deliver|fetch|submit|audit|check|inspect)\b/i,

  // 7b. "<Name> is doing the work", "<Name> is responsible"
  /\b([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s+is\s+(?:doing\s+the\s+work|working\s+on\s+it|responsible)\b/i,

  // 8. Name after imperative verb at end of phrase
  // e.g. "Doodh le aao Reena, roz subah"
  /(?:le\s+aao|le\s+aana|laana|mangwa\s+do)\s+([a-zA-Z\u0900-\u097F]+)(?=\s*,|\s+roz|\s+daily|\s+subah|$|[.])/i
];

export const REVIEWER_MARKERS = [
  // English explicit
  /(?:^|[.,;]|\s+)\b([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s+is\s+(?:the\s+)?reviewer\b/i,
  /(?:^|[.,;]|\band\s+)?\s*(?:(?:a\s+)?review\s+by|reviewed\s+by|reviewer\s+(?:is|:|to\s+be)?)\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)(?=[.,;]|$|\s+start|\s+finish|\s+due|\s+repeat|\s+every|\s+set|\s+for|\s+under|\s+project|\s+and\b)/i,
  /(?:(?:send|forward|give)\s+(?:this|it)?\s+to\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s+for\s+review)/i,
  /(?:get|have|ask|tell)\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s+(?:to\s+review|review)(?:\s+(?:it|this|the\s+[\w]+))?\b/i,
  // "<Name> should review it", "<Name> will check it", "<Name> should review it weekly"
  /\b([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s+(?:should|will|can|must|to)\s+(?:review(?:\s+(?:it|this|the\s+task|the\s+work|the\s+website|weekly|daily))?|check\s+(?:it|this))\b/i,

  // Hindi / Hinglish reviewer patterns:
  // "Priya review karegi", "Ashok check karega", "Ashok se review karwao", "Review karne ke liye Ashok ko do"
  /(?:^|[\s,;.])([a-zA-Z\u0900-\u097F]+)\s+(?:review\s+karegi|review\s+karega|check\s+karegi|check\s+karega|verify\s+karegi|verify\s+karega)\b/i,
  /(?:^|[\s,;.])([a-zA-Z\u0900-\u097F]+)\s+se\s+review\s+(?:karwao|karwana|karwa\s+lena|karwa\s+do)\b/i,
  /(?:review|check)\s+karne\s+ke\s+liye\s+([a-zA-Z\u0900-\u097F]+)\s+ko\s+(?:do|de\s+do|saup\s+do)\b/i
];
