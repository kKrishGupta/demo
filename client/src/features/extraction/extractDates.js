import * as chrono from 'chrono-node';
import { isDueBeforeStart } from '../../utils/dateTime.js';
import { translateDateTimePhrases } from './dictionary/dateTimeDictionary.js';
import { isValidCalendarDate } from '../../utils/security.js';

const MONTH_NAME_MAP = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12
};

/**
 * Validates text for impossible calendar dates like Feb 30, Feb 29 on non-leap, Apr 31, etc.
 * @param {string} text 
 * @param {number} fallbackYear 
 * @returns {{ isValid: boolean, invalidPhrase?: string, reason?: string }}
 */
function checkExplicitCalendarDates(text, fallbackYear = 2026) {
  if (!text) return { isValid: true };

  // 1. Invalid time format check (e.g. 24:00, 25:30)
  const invalidTimeMatch = text.match(/\b(2[4-9]|[3-9]\d):([0-5]\d)\b/);
  if (invalidTimeMatch) {
    return {
      isValid: false,
      invalidPhrase: invalidTimeMatch[0],
      reason: `Invalid time "${invalidTimeMatch[0]}": hours must be between 00 and 23.`
    };
  }

  // 2. Pattern: "Month Day" (e.g. "February 30", "Feb 29 2025", "April 31")
  const monthDayRegex = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/gi;
  let match;
  while ((match = monthDayRegex.exec(text)) !== null) {
    const monthStr = match[1].toLowerCase();
    const monthNum = MONTH_NAME_MAP[monthStr];
    const day = parseInt(match[2], 10);
    const year = match[3] ? parseInt(match[3], 10) : fallbackYear;

    if (monthNum && !isValidCalendarDate(year, monthNum, day)) {
      return {
        isValid: false,
        invalidPhrase: match[0],
        reason: `Invalid calendar date: "${match[0]}" does not exist on the calendar.`
      };
    }
  }

  // 3. Pattern: "Day of Month" (e.g. "30th of February", "31st April")
  const dayMonthRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/gi;
  while ((match = dayMonthRegex.exec(text)) !== null) {
    const day = parseInt(match[1], 10);
    const monthStr = match[2].toLowerCase();
    const monthNum = MONTH_NAME_MAP[monthStr];
    const year = match[3] ? parseInt(match[3], 10) : fallbackYear;

    if (monthNum && !isValidCalendarDate(year, monthNum, day)) {
      return {
        isValid: false,
        invalidPhrase: match[0],
        reason: `Invalid calendar date: "${match[0]}" does not exist on the calendar.`
      };
    }
  }

  // 4. ISO or slash pattern: YYYY-MM-DD or DD/MM/YYYY
  const isoMatch = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (!isValidCalendarDate(y, m, d)) {
      return {
        isValid: false,
        invalidPhrase: isoMatch[0],
        reason: `Invalid calendar date: "${isoMatch[0]}" is not a valid calendar date.`
      };
    }
  }

  return { isValid: true };
}

/**
 * Resolves smart business hour defaults based on contextual keywords like morning, evening, noon, EOD
 * @param {Date} date 
 * @param {string} text 
 * @param {boolean} isStart 
 * @returns {string} Explanatory label
 */
function resolveInferredTime(date, text, isStart) {
  const lower = (text || '').toLowerCase();
  if (lower.includes('morning') || lower.includes('subah') || lower.includes('सुबह')) {
    date.setHours(9, 0, 0, 0);
    return 'Resolved to 9:00 AM (morning)';
  }
  if (lower.includes('noon') || lower.includes('dopahar') || lower.includes('दोपहर')) {
    date.setHours(12, 0, 0, 0);
    return 'Resolved to 12:00 PM (noon)';
  }
  if (lower.includes('afternoon')) {
    date.setHours(14, 0, 0, 0);
    return 'Resolved to 2:00 PM (afternoon)';
  }
  if (lower.includes('evening') || lower.includes('shaam') || lower.includes('शाम')) {
    date.setHours(18, 0, 0, 0);
    return 'Resolved to 6:00 PM (evening)';
  }
  if (lower.includes('night') || lower.includes('raat') || lower.includes('रात')) {
    date.setHours(20, 0, 0, 0);
    return 'Resolved to 8:00 PM (night)';
  }
  if (lower.includes('eod') || lower.includes('end of day') || lower.includes('cob')) {
    date.setHours(17, 0, 0, 0);
    return 'Resolved to 5:00 PM (end of day)';
  }

  if (isStart) {
    date.setHours(9, 0, 0, 0);
    return 'Time defaulted to 9:00 AM (business start)';
  } else {
    date.setHours(17, 0, 0, 0);
    return 'Time defaulted to 5:00 PM (business close)';
  }
}

/**
 * Extracts start date and due date from transcript using multilingual rules and Chrono-node
 * 
 * @param {string} transcript 
 * @param {Date} [referenceDate] Optional reference date for deterministic testing (defaults to now)
 * @returns {{
 *   startDate: { value: Date|null, rawText: string, status: 'valid'|'missing'|'invalid'|'ambiguous', isTimeInferred: boolean, message?: string },
 *   dueDate: { value: Date|null, rawText: string, status: 'valid'|'missing'|'invalid'|'ambiguous', isTimeInferred: boolean, message?: string },
 *   unresolvedDatePhrase?: string
 * }}
 */
export function extractDates(transcript, referenceDate = new Date()) {
  const result = {
    startDate: { value: null, rawText: '', status: 'missing', isTimeInferred: false },
    dueDate: { value: null, rawText: '', status: 'missing', isTimeInferred: false },
    unresolvedDatePhrase: ''
  };

  if (!transcript) return result;

  // 1. Detect impossible calendar dates (e.g. Feb 30, Feb 29 non-leap, Apr 31, Nov 31, 25:00)
  const calendarCheck = checkExplicitCalendarDates(transcript, referenceDate.getFullYear());
  if (!calendarCheck.isValid) {
    const isStartContext = /(?:start|begin|from|shuru)\s+[^,.;]*?/i.test(transcript) &&
      transcript.toLowerCase().indexOf('start') < transcript.toLowerCase().indexOf(calendarCheck.invalidPhrase.toLowerCase());
    
    result.unresolvedDatePhrase = calendarCheck.invalidPhrase;
    if (isStartContext) {
      result.startDate = {
        value: null,
        rawText: calendarCheck.invalidPhrase,
        status: 'invalid',
        isTimeInferred: false,
        message: calendarCheck.reason
      };
    } else {
      result.dueDate = {
        value: null,
        rawText: calendarCheck.invalidPhrase,
        status: 'invalid',
        isTimeInferred: false,
        message: calendarCheck.reason
      };
    }
  }

  // 1b. Detect ambiguous, garbled, or unclear date phrases first (e.g. "after the month with only days 28")
  const garbledDateRegex = /\b(?:after\s+the\s+month\s+with\s+only\s+days\s+\d+|month\s+with\s+only\s+days|\bwith\s+only\s+days\s+\d+)\b/i;
  const garbledMatch = transcript.match(garbledDateRegex);
  if (garbledMatch && !result.unresolvedDatePhrase) {
    result.unresolvedDatePhrase = garbledMatch[0];
    result.dueDate = {
      value: null,
      rawText: garbledMatch[0],
      status: 'ambiguous',
      isTimeInferred: false,
      message: `Could not determine deadline from "${garbledMatch[0]}". Please clarify the due date.`
    };
  }

  // 2. First translate Hindi/Hinglish date expressions (e.g. "kal subah" -> "tomorrow morning at 9:00 AM")
  const translated = translateDateTimePhrases(transcript);

  // 3. Clean recurrence phrases so "every Friday", "daily", "roz" are not mistaken for a one-time deadline
  const cleanedForDates = translated
    .replace(/\b(?:repeat\s+this\s+every\s+week|repeat\s+weekly|repeat\s+every\s+day|repeat\s+daily|repeat\s+every\s+month|repeat\s+monthly)\b/gi, ' ')
    .replace(/\b(?:every\s+day|every\s+week|every\s+month|daily|roz|har\s+din|har\s+hafte|frequently|regularly)\b/gi, ' ')
    // Exclude garbled phrase from chrono parsing so it doesn't invent fake dates
    .replace(garbledDateRegex, ' ');

  // 4. Identify explicit Start segments
  const startSegmentRegex = /(?:start(?:ing|s)?(?:\s+it)?|begin(?:ning|s)?|from|shuru\s+karo|shuru\s+karna)\s+([^,.;]+?)(?=\s+(?:finish|due|by|deadline|complete|khatam|until|till|to\s+[a-zA-Z]+\s+project|reviewed|repeat)|[.,;]|$)/i;
  const startMatch = cleanedForDates.match(startSegmentRegex);

  if (startMatch && startMatch[1]) {
    const startPhrase = startMatch[1].trim();
    const parsedStart = chrono.parse(startPhrase, referenceDate);
    if (parsedStart && parsedStart.length > 0) {
      const parsed = parsedStart[0];
      const date = parsed.start.date();
      const hasExplicitTime = parsed.start.isCertain('hour');
      let msg = undefined;

      if (!hasExplicitTime) {
        msg = resolveInferredTime(date, startPhrase, true);
      }

      result.startDate = {
        value: date,
        rawText: parsed.text,
        status: 'valid',
        isTimeInferred: !hasExplicitTime,
        message: msg
      };
    }
  }

  // 5. Identify explicit Due / Finish segments (only if not already flagged as garbled/unresolved)
  if (!result.unresolvedDatePhrase) {
    const dueSegmentRegex = /(?:finish(?:ing|es)?(?:\s+by|\s+on)?|due(?:\s+by|\s+on|\s+at)?|deadline(?:\s+is)?|complete(?:\s+it)?(?:\s+by|\s+on|\s+at)?|complete\s+by|khatam\s+karo|tak\s+complete\s+karo|by)\s+([^,.;]+?)(?=\s+(?:start|begin|shuru|reviewed|reviewer|repeat|every)|[.,;]|$)/i;
    const dueMatch = cleanedForDates.match(dueSegmentRegex);

    if (dueMatch && dueMatch[1]) {
      const duePhrase = dueMatch[1].trim();
      const parsedDue = chrono.parse(duePhrase, referenceDate);
      if (parsedDue && parsedDue.length > 0) {
        const parsed = parsedDue[0];
        const date = parsed.start.date();
        const hasExplicitTime = parsed.start.isCertain('hour');
        let msg = undefined;

        if (!hasExplicitTime) {
          msg = resolveInferredTime(date, duePhrase, false);
        }

        result.dueDate = {
          value: date,
          rawText: parsed.text,
          status: 'valid',
          isTimeInferred: !hasExplicitTime,
          message: msg
        };
      }
    }
  }

  // 6. Fallback: if no explicit markers and no unresolved date, parse remaining text for general dates
  if (!result.startDate.value && !result.dueDate.value && !result.unresolvedDatePhrase) {
    // Avoid parsing recurrence end dates (like "until the 28th of next month") as one-time due dates
    const withoutRecurrenceEnd = cleanedForDates.replace(/(?:until|till)\s+(?:the\s+)?(?:\d{1,2}(?:st|nd|rd|th)?\s+of\s+[a-zA-Z\s]+|\d{1,2}(?:st|nd|rd|th)?|next\s+month)/gi, ' ');
    const generalParsed = chrono.parse(withoutRecurrenceEnd, referenceDate);

    if (generalParsed.length === 1) {
      const parsed = generalParsed[0];
      const date = parsed.start.date();
      const hasExplicitTime = parsed.start.isCertain('hour');
      let msg = undefined;
      if (!hasExplicitTime) {
        msg = resolveInferredTime(date, parsed.text, false);
      }

      result.dueDate = {
        value: date,
        rawText: parsed.text,
        status: 'valid',
        isTimeInferred: !hasExplicitTime,
        message: msg || 'Interpreted as deadline'
      };
    } else if (generalParsed.length >= 2) {
      const startParsed = generalParsed[0];
      const dueParsed = generalParsed[1];

      const sDate = startParsed.start.date();
      if (!startParsed.start.isCertain('hour')) {
        resolveInferredTime(sDate, startParsed.text, true);
      }

      const dDate = dueParsed.start.date();
      if (!dueParsed.start.isCertain('hour')) {
        resolveInferredTime(dDate, dueParsed.text, false);
      }

      result.startDate = {
        value: sDate,
        rawText: startParsed.text,
        status: 'valid',
        isTimeInferred: !startParsed.start.isCertain('hour')
      };
      result.dueDate = {
        value: dDate,
        rawText: dueParsed.text,
        status: 'valid',
        isTimeInferred: !dueParsed.start.isCertain('hour')
      };
    }
  }

  // 7. Validate date order: due date cannot be earlier than start date
  if (result.startDate.value && result.dueDate.value) {
    if (isDueBeforeStart(result.startDate.value, result.dueDate.value)) {
      result.dueDate.status = 'invalid';
      result.dueDate.message = 'Due date and time cannot be earlier than start date and time.';
    }
  }

  return result;
}
