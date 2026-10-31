/**
 * Date and Time Dictionary
 * Multilingual date/time representations in English, Hindi, and Hinglish.
 */

export const DATE_TIME_MAPPINGS = [
  // Days
  {
    type: 'relative_day',
    offsetDays: 0,
    keywords: ['today', 'aaj', 'aaj hi', 'आज', 'आज ही'],
    englishEquivalent: 'today'
  },
  {
    type: 'relative_day',
    offsetDays: 1,
    keywords: ['tomorrow', 'kal', 'aane wale kal', 'कल', 'अगले दिन'],
    englishEquivalent: 'tomorrow'
  },
  {
    type: 'relative_day',
    offsetDays: 2,
    keywords: ['day after tomorrow', 'parson', 'parso', 'parson ko', 'परसों'],
    englishEquivalent: 'in 2 days'
  },
  {
    type: 'relative_day',
    offsetDays: 7,
    keywords: ['next week', 'agle hafte', 'agle saptah', 'अगले हफ्ते', 'अगले सप्ताह'],
    englishEquivalent: 'next week'
  },

  // Time of Day
  {
    type: 'time_of_day',
    hours: 9,
    minutes: 0,
    label: '9:00 AM (morning)',
    keywords: ['morning', 'subah', 'saverey', 'early morning', 'सुबह', 'सवेरे'],
    englishEquivalent: '9:00 AM'
  },
  {
    type: 'time_of_day',
    hours: 12,
    minutes: 0,
    label: '12:00 PM (noon)',
    keywords: ['noon', 'midday', 'dopahar', 'दोपहर'],
    englishEquivalent: '12:00 PM'
  },
  {
    type: 'time_of_day',
    hours: 14,
    minutes: 0,
    label: '2:00 PM (afternoon)',
    keywords: ['afternoon', 'dopahar baad', 'दोपहर बाद'],
    englishEquivalent: '2:00 PM'
  },
  {
    type: 'time_of_day',
    hours: 18,
    minutes: 0,
    label: '6:00 PM (evening)',
    keywords: ['evening', 'shaam', 'shyam', 'sham', 'शाम'],
    englishEquivalent: '6:00 PM'
  },
  {
    type: 'time_of_day',
    hours: 20,
    minutes: 0,
    label: '8:00 PM (night)',
    keywords: ['night', 'raat', 'raat ko', 'रात'],
    englishEquivalent: '8:00 PM'
  },
  {
    type: 'time_of_day',
    hours: 17,
    minutes: 0,
    label: '5:00 PM (end of day)',
    keywords: ['eod', 'end of day', 'cob', 'close of business', 'din ke aakhir tak'],
    englishEquivalent: '5:00 PM'
  }
];

/**
 * Translates Hindi/Hinglish date and time expressions to English equivalents
 * so Chrono-node or native parser can parse them reliably.
 * @param {string} text 
 * @returns {string} Text with translated date phrases
 */
export function translateDateTimePhrases(text) {
  if (!text) return '';
  let transformed = text;

  // Composite phrases first: e.g. "kal subah" -> "tomorrow morning", "kal shaam" -> "tomorrow evening"
  transformed = transformed
    .replace(/(?<![^\s,.;])(?:kal\s+subah|kal\s+saverey|कल\s+सुबह)(?![^\s,.;])/gi, 'tomorrow morning at 9:00 AM')
    .replace(/(?<![^\s,.;])(?:kal\s+dopahar|कल\s+दोपहर)(?![^\s,.;])/gi, 'tomorrow at 12:00 PM')
    .replace(/(?<![^\s,.;])(?:kal\s+shaam|kal\s+sham|कल\s+शाम)(?![^\s,.;])/gi, 'tomorrow evening at 6:00 PM')
    .replace(/(?<![^\s,.;])(?:kal\s+raat|कल\s+रात)(?![^\s,.;])/gi, 'tomorrow night at 8:00 PM')
    .replace(/(?<![^\s,.;])(?:aaj\s+subah|आज\s+सुबह)(?![^\s,.;])/gi, 'today morning at 9:00 AM')
    .replace(/(?<![^\s,.;])(?:aaj\s+shaam|aaj\s+sham|आज\s+शाम)(?![^\s,.;])/gi, 'today evening at 6:00 PM')
    .replace(/(?<![^\s,.;])(?:parson\s+subah|parso\s+subah|परसों\s+सुबह)(?![^\s,.;])/gi, 'in 2 days at 9:00 AM')
    .replace(/(?<![^\s,.;])(?:parson\s+shaam|parso\s+shaam|परसों\s+शाम)(?![^\s,.;])/gi, 'in 2 days at 6:00 PM')
    .replace(/(?<![^\s,.;])(?:agle\s+somvaar|agle\s+somwar|अगले\s+सोमवार)(?![^\s,.;])/gi, 'next Monday')
    .replace(/(?<![^\s,.;])(?:agle\s+shukravaar|agle\s+shukrawar|अगले\s+शुक्रवार)(?![^\s,.;])/gi, 'next Friday');

  // Single terms (supporting both Latin \b and Devanagari script boundaries)
  transformed = transformed
    .replace(/(?<![^\s,.;])(?:parson|parso|परसों)(?![^\s,.;])/gi, 'in 2 days')
    .replace(/(?<![^\s,.;])(?:kal|कल)(?![^\s,.;])/gi, 'tomorrow')
    .replace(/(?<![^\s,.;])(?:aaj|आज)(?![^\s,.;])/gi, 'today')
    .replace(/(?<![^\s,.;])(?:agle\s+hafte|अगले\s+हफ्ते)(?![^\s,.;])/gi, 'next week')
    .replace(/(?<![^\s,.;])(?:subah|saverey|सुबह)(?![^\s,.;])/gi, 'morning')
    .replace(/(?<![^\s,.;])(?:dopahar|दोपहर)(?![^\s,.;])/gi, 'noon')
    .replace(/(?<![^\s,.;])(?:shaam|sham|shyam|शाम)(?![^\s,.;])/gi, 'evening')
    .replace(/(?<![^\s,.;])(?:raat|रात)(?![^\s,.;])/gi, 'night');

  return transformed;
}
