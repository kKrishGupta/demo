import {
  RECURRENCE_ENTRIES,
  hasRecurrenceNegation,
  UNCLEAR_RECURRENCE_KEYWORDS
} from './dictionary/recurrenceDictionary.js';
import * as chrono from 'chrono-node';

/**
 * Extracts recurrence settings, intervals, weekdays, and recurrence end date from transcript
 * 
 * @param {string} transcript 
 * @param {Date} [referenceDate] 
 * @returns {{
 *   isRecurring: boolean,
 *   frequency: 'Daily'|'Weekly'|'Monthly'|'',
 *   interval: number,
 *   daysOfWeek: string[],
 *   detail: string,
 *   recurrenceEndDate: Date|null,
 *   recurrenceEndRawText: string,
 *   rawText: string,
 *   status: 'none'|'valid'|'unresolved'|'missing_frequency'|'negated',
 *   confidence: number,
 *   message?: string
 * }}
 */
export function extractRecurrence(transcript, referenceDate = new Date()) {
  const result = {
    isRecurring: false,
    frequency: '',
    interval: 1,
    daysOfWeek: [],
    detail: '',
    recurrenceEndDate: null,
    recurrenceEndRawText: '',
    rawText: '',
    status: 'none',
    confidence: 0
  };

  if (!transcript) return result;
  const lower = transcript.toLowerCase();

  // 1. Check for conflicting recurrence cues in the same sentence (e.g. "daily one time only")
  const oneTimeMatch = lower.match(/\b(?:one\s+time\s+only|once\s+only|single\s+time|just\s+once|sirf\s+ek\s+baar|ek\s+hi\s+baar)\b/i);
  const positiveEntry = RECURRENCE_ENTRIES.find((entry) =>
    entry.keywords.some((kw) => {
      // Avoid matching if keyword is directly preceded by a negation like "not", "never", "roz nahi"
      const safeKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?<!(?:not|never|nahi|mat)\\s+)\\b${safeKw}\\b`, 'i');
      return pattern.test(lower);
    })
  );

  if (oneTimeMatch && positiveEntry) {
    return {
      isRecurring: false,
      frequency: '',
      interval: 1,
      daysOfWeek: [],
      detail: 'Conflicting recurrence cues detected',
      recurrenceEndDate: null,
      recurrenceEndRawText: '',
      rawText: `${positiveEntry.frequency} + ${oneTimeMatch[0]}`,
      status: 'conflict',
      confidence: 0.4,
      message: `Conflicting recurrence cues detected: both "${positiveEntry.frequency}" and "${oneTimeMatch[0]}" were specified. Please clarify whether this task is recurring or one-time.`
    };
  }

  // 2. Check for unclear recurrence phrases like "frequently", "regularly", "often"
  const matchedUnclearKw = UNCLEAR_RECURRENCE_KEYWORDS.find((kw) => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(lower);
  });

  const isNegated = hasRecurrenceNegation(lower);

  // If both unclear recurrence AND negation are present (e.g. "regularly, but don't make it daily"):
  if (matchedUnclearKw && isNegated) {
    return {
      isRecurring: false,
      frequency: '',
      interval: 1,
      daysOfWeek: [],
      detail: `Recurrence requested (${matchedUnclearKw}) but daily excluded`,
      recurrenceEndDate: null,
      recurrenceEndRawText: '',
      rawText: matchedUnclearKw,
      status: 'unresolved',
      confidence: 0.7,
      message: `"${matchedUnclearKw}" requested (excluding daily): How often should this repeat: weekly or monthly?`
    };
  }

  // 3. Negation handling
  // Case A: If negation negates a specific frequency but a different positive frequency is specified
  // e.g. "Make it weekly, not daily" → keep weekly, negate daily
  // Case B: Pure negation with no positive recurrence intent → return negated
  if (isNegated) {
    // Check if negation is SPECIFIC (targets daily) but a different positive frequency is specified
    const negatesOnlyDaily = /\bnot\s+daily\b|\bnever\s+daily\b|\broz\s+nahi\b|\bdaily\s+nahi\b|\bdon'?t\s+make\s+it\s+daily\b/i.test(lower);
    const hasNonDailyPositive = positiveEntry && positiveEntry.frequency !== 'Daily';

    // If positiveEntry is weekly/monthly AND negation is specifically anti-daily → trust positiveEntry
    if (hasNonDailyPositive && negatesOnlyDaily) {
      // Fall through to process positiveEntry below (skip early return, let positive weekly/monthly win)
    } else {
      // Pure negation OR negation matches the same frequency as the positive keyword
      let negText = 'no repeat';
      const negMatch = lower.match(/\b(?:no\s+recurring(?:\s+schedule)?|not\s+recurring|non-recurring|no\s+recurrence|not\s+daily|never\s+daily|roz\s+nahi|daily\s+nahi|no\s+repeat|never\s+repeat|no\s+need\s+to\s+repeat(?:\s+this\s+task)?|never\s+repeat\s+the\s+task|don't\s+make\s+it\s+daily|dont\s+make\s+it\s+daily|one\s+time\s+only|one-time|once\s+only|sirf\s+ek\s+baar|ek\s+hi\s+baar)\b/i);
      if (negMatch) {
        negText = negMatch[0];
      }
      return {
        isRecurring: false,
        frequency: '',
        interval: 1,
        daysOfWeek: [],
        detail: 'Explicitly marked as one-time task (no repeat)',
        recurrenceEndDate: null,
        recurrenceEndRawText: '',
        rawText: negText,
        status: 'negated',
        confidence: 1.0
      };
    }
  }

  // 4. Unclear recurrence phrase alone ("frequently", "regularly", "often", "check it regularly")
  if (matchedUnclearKw && !positiveEntry) {
    return {
      isRecurring: true,  // Intent to recur is detected, but frequency needs clarification
      frequency: '',
      interval: 1,
      daysOfWeek: [],
      detail: `Recurrence frequency unclear (${matchedUnclearKw})`,
      recurrenceEndDate: null,
      recurrenceEndRawText: '',
      rawText: matchedUnclearKw,
      status: 'unresolved',
      confidence: 0.7,
      message: `How often should the check repeat: daily, weekly, or monthly?`
    };
  }

  // 3. Check multilingual recurrence dictionary entries
  let matchedEntry = null;
  let matchedKeyword = '';

  for (const entry of RECURRENCE_ENTRIES) {
    for (const kw of entry.keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(lower)) {
        matchedEntry = entry;
        matchedKeyword = kw;
        break;
      }
    }
    if (matchedEntry) break;
  }

  if (matchedEntry) {
    result.isRecurring = true;
    result.frequency = matchedEntry.frequency;
    result.interval = matchedEntry.interval || 1;
    result.daysOfWeek = matchedEntry.daysOfWeek || [];
    result.detail = matchedEntry.frequency === 'Daily' && matchedEntry.interval === 2 ? 'Alternate Days' : matchedEntry.frequency;
    result.rawText = matchedKeyword;
    result.status = 'valid';
    result.confidence = matchedEntry.confidence || 0.95;

    // Check for recurrence end date (e.g. "until the 28th of next month", "until the 28th", "till after the month with only days 28")
    const untilMatch = transcript.match(/(?:until|till)\s+(?:the\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+of\s+[a-zA-Z\s]+|\d{1,2}(?:st|nd|rd|th)?|next\s+month|\w+\s+\d{1,2})/i);
    if (untilMatch && untilMatch[0]) {
      result.recurrenceEndRawText = untilMatch[0];
      const parsedEnd = chrono.parse(untilMatch[0], referenceDate);
      if (parsedEnd && parsedEnd.length > 0) {
        result.recurrenceEndDate = parsedEnd[0].start.date();
      }
    }

    return result;
  }

  // 4. Fallback: Check if generic "repeat" or "recurring" keyword exists without frequency
  const hasGenericRecurrence =
    lower.includes('repeat') ||
    lower.includes('recurring') ||
    lower.includes('recurrence') ||
    lower.includes('har bar') ||
    lower.includes('baar baar') ||
    lower.includes('दौहराना');

  if (hasGenericRecurrence) {
    result.isRecurring = true;
    result.status = 'missing_frequency';
    result.rawText = 'repeat';
    result.confidence = 0.8;
    result.message = 'Recurrence requested, but frequency was not specified. Please select Daily, Weekly, or Monthly.';
    return result;
  }

  return result;
}
