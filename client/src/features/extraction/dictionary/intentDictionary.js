/**
 * Intent & Delegation Dictionary
 * Recognizes task creation, assignment, questions, cancellations, and corrections
 * across English, Hindi (Devanagari), and Hinglish (Latin).
 */

export const INTENT_TYPES = {
  TASK_CREATE: 'task_create',
  TASK_DELEGATE: 'task_delegate',
  TASK_REQUEST: 'task_request',
  TASK_QUESTION: 'task_question',
  TASK_CANCEL: 'task_cancel',
  TASK_CORRECTION: 'task_correction',
  QUOTED_TEXT: 'quoted_text',
  UNTRUSTED_INSTRUCTION: 'untrusted_instruction',
  INFORMATIONAL: 'informational'
};

export const INTENT_PATTERNS = [
  // 0. Adversarial / Prompt Injection & Untrusted Instructions (highest priority)
  {
    regex: /\b(?:ignore\s+all\s+rules|ignore\s+(?:previous|all)\s+instructions|system\s+prompt|bypass\s+rules|untrusted\s+instruction)\b/i,
    intent: INTENT_TYPES.UNTRUSTED_INSTRUCTION,
    confidence: 1.0
  },

  // 0b. Meta-speech / Quoted Text / Examples (not real instructions)
  {
    regex: /\b(?:i\s+was\s+only\s+quoting|quoting\s+this|is\s+an\s+example,?\s+not\s+an\s+instruction|this\s+is\s+(?:only|just)\s+an\s+example|example\s+only)\b/i,
    intent: INTENT_TYPES.QUOTED_TEXT,
    confidence: 1.0
  },

  // 1. Cancellation & Abort Patterns / Action Negations
  // e.g. "Don't create that task; I was only asking a question", "Do not ask Riya to bring milk", "cancel this task", "task mat banao", "Assign Rahul to not inspect the machine"
  {
    regex: /(?:do\s+not\s+(?:ask|create|assign)|don't\s+(?:ask|create|assign)|dont\s+(?:ask|create|assign)|cancel\s+(?:this|that|the)?\s+task|cancel\s+it|cancel\s+karo|task\s+mat\s+banao|rehne\s+do|mat\s+karna\s+assign|task\s+radd\s+karo|\bto\s+not\s+[a-zA-Z]+|\bnot\s+to\s+[a-zA-Z]+)/i,
    intent: INTENT_TYPES.TASK_CANCEL,
    confidence: 0.98
  },

  // 2. Question / Inquiry Patterns (should NOT create a confirmed task without user confirmation!)
  // e.g. "Ask Riya if she can bring milk", "Should I assign this to Rahul?", "Can Priya take care of this?", "Did anyone update the report?", "Can Riya bring milk tomorrow, or is she busy?"
  {
    regex: /(?:^(?:ask\s+[a-zA-Z\u0900-\u097F]+\s+if\s+(?:she|he|they|i)\s+can|check\s+if\s+[a-zA-Z\u0900-\u097F]+\s+can)|^(?:should\s+i|should\s+we|can\s+i|can\s+we|can\s+[a-zA-Z\u0900-\u097F]+|did\s+anyone|could\s+you|would\s+it\s+be\s+better|kya\s+mujhe|kya\s+humein|kya\s+[a-zA-Z\u0900-\u097F]+\s+(?:karega|karegi|kare))|\bor\s+is\s+(?:she|he)\s+busy)\b/i,
    intent: INTENT_TYPES.TASK_QUESTION,
    confidence: 0.95
  },
  {
    regex: /\?\s*$/,
    intent: INTENT_TYPES.TASK_QUESTION,
    confidence: 0.85
  },

  // 3. Correction & Reassignment Patterns
  // e.g. "Not Rahul, assign it to Rohit instead", "Actually, make it weekly, not daily"
  {
    regex: /(?:not\s+[a-zA-Z\u0900-\u097F]+,\s*(?:assign|give|make|instead)|instead\s+of\s+[a-zA-Z\u0900-\u097F]+|actually,\s*make\s+it|iske\s+bajaye|uski\s+jagah)\b/i,
    intent: INTENT_TYPES.TASK_CORRECTION,
    confidence: 0.95
  },

  // 4. English command prefixes
  {
    regex: /^(?:please\s+)?(?:create|assign|schedule|add|ask|set\s+up|make|draft)\s+(?:a\s+task\s+(?:to|for)?|the\s+task\s+(?:to|for)?|task\s+(?:to|for|do)?|an\s+action\s+item\s+for)?\s*/i,
    intent: INTENT_TYPES.TASK_CREATE,
    confidence: 0.95
  },
  {
    regex: /^(?:delegate|assign|hand\s+over|entrust)\s+(?:this|it|the\s+task)?\s*(?:to)?/i,
    intent: INTENT_TYPES.TASK_DELEGATE,
    confidence: 0.95
  },
  {
    regex: /^make\s+([a-zA-Z\s]+?)\s+responsible\s+for/i,
    intent: INTENT_TYPES.TASK_DELEGATE,
    confidence: 0.95
  },

  // 5. Hindi / Hinglish delegation & request patterns
  // e.g. "Reena ko doodh laane ka kaam do", "kaam de do", "zimmedari do"
  {
    regex: /(?:kaam\s+(?:do|de\s+do|saup\s+do)|zimmedari\s+do|zimma\s+do)/i,
    intent: INTENT_TYPES.TASK_DELEGATE,
    confidence: 0.95
  },
  // e.g. "Reena karegi", "Rahul karega", "Reena se karwa do", "Reena ko karne bolo"
  {
    regex: /(?:karegi|karega|karna\s+hai|karein|karne\s+bolo|ko\s+bolo|se\s+bolo|se\s+karwao)/i,
    intent: INTENT_TYPES.TASK_DELEGATE,
    confidence: 0.9
  },
  // e.g. "mangwa do", "le aao", "le aana", "rakh de"
  {
    regex: /(?:mangwa\s+do|le\s+aao|le\s+aana|leke\s+aana|laana\s+hai|rakh\s+de|bhejo)/i,
    intent: INTENT_TYPES.TASK_REQUEST,
    confidence: 0.9
  },

  // 6. Devanagari Hindi patterns
  {
    regex: /(?:काम\s+दो|जिम्मेदारी\s+दो|करेगी|करेगा|करना\s+है|बोलो|लाओ|ले\s+आओ)/i,
    intent: INTENT_TYPES.TASK_DELEGATE,
    confidence: 0.95
  }
];

/**
 * Detects overall intent and returns confidence
 * @param {string} text 
 * @returns {{ intent: string, confidence: number, isActionable: boolean, questionPrompt?: string }}
 */
export function detectIntent(text) {
  if (!text || !text.trim()) {
    return {
      intent: INTENT_TYPES.INFORMATIONAL,
      confidence: 0.0,
      isActionable: false
    };
  }

  const clean = text.trim();

  for (const entry of INTENT_PATTERNS) {
    if (entry.regex.test(clean)) {
      const isActionable =
        entry.intent !== INTENT_TYPES.TASK_QUESTION &&
        entry.intent !== INTENT_TYPES.TASK_CANCEL &&
        entry.intent !== INTENT_TYPES.QUOTED_TEXT &&
        entry.intent !== INTENT_TYPES.UNTRUSTED_INSTRUCTION &&
        entry.intent !== INTENT_TYPES.INFORMATIONAL;

      let questionPrompt = '';
      if (entry.intent === INTENT_TYPES.TASK_QUESTION) {
        questionPrompt = 'Inquiry detected: This instruction was formulated as a question. Would you like to create this task?';
      } else if (entry.intent === INTENT_TYPES.TASK_CANCEL) {
        questionPrompt = 'Cancellation detected: Spoken command requested not to create or assign this task.';
      }

      return {
        intent: entry.intent,
        confidence: entry.confidence,
        isActionable,
        questionPrompt
      };
    }
  }

  // Default assumption for imperative notes
  return {
    intent: INTENT_TYPES.TASK_CREATE,
    confidence: 0.75,
    isActionable: true
  };
}
