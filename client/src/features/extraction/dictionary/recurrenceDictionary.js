/**
 * Recurrence & Frequency Dictionary
 * Handles recurring schedules, intervals, and explicit negations in English, Hindi, and Hinglish.
 */

export const RECURRENCE_FREQUENCIES = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  ALTERNATE: 'Alternate Days'
};

export const RECURRENCE_NEGATIONS = [
  'not daily', 'never daily', 'roz nahi', 'daily nahi', 'kabhi nahi',
  'not weekly', 'not monthly', 'not recurring', 'no repeat', 'never repeat',
  'no need to repeat this task', 'no need to repeat', 'never repeat the task',
  'no recurring schedule', 'no recurring', 'no recurrence', 'not a recurring schedule',
  'non-recurring', 'do not repeat', 'don\'t repeat', 'dont repeat', 'one time only', 'one time task',
  'one-time', 'once only', 'single time', 'just once',
  'don\'t make it daily', 'dont make it daily', 'not every day',
  'sirf ek baar', 'ek hi baar', 'repeat mat karna', 'repeat mat karo', 'baar baar nahi',
  'roz mat karna', 'daily mat karna',
  'सिर्फ एक बार', 'एक बार ही', 'रिपीट मत करना', 'रोज नहीं', 'डेली नहीं'
];

// Phrases indicating recurrence intent without specifying a concrete frequency
export const UNCLEAR_RECURRENCE_KEYWORDS = [
  'on a regular basis',
  'check it regularly',
  'inspect it regularly',
  'review it regularly',
  'regular check karna',
  'baar-baar check karna',
  'baar baar check karna',
  'niyamit roop se',
  'regularly',
  'frequently',
  'often',
  'routinely',
  'sometimes',
  'baar baar',
  'kabhi kabhi',
  'akshar',
  'hamesha',
  'bar bar',
  'kabhi-kabhi',
  'बार बार',
  'कभी कभी',
  'अक्सर',
  'हमेशा',
  'नियमित रूप से'
];

export const RECURRENCE_ENTRIES = [
  // 1. Daily
  {
    frequency: RECURRENCE_FREQUENCIES.DAILY,
    interval: 1,
    keywords: [
      'daily', 'every day', 'each day', 'everyday', 'every morning', 'every night',
      'twice a day', '2 times a day', 'twice daily',
      'roz', 'roj', 'har din', 'har roz', 'pratidin', 'roz subah', 'roz shaam',
      'har roj', 'dino din',
      'रोज़', 'रोज', 'हर दिन', 'प्रतिदिन', 'रोज सुबह', 'रोज शाम'
    ],
    confidence: 0.95
  },

  // 2. Weekly
  {
    frequency: RECURRENCE_FREQUENCIES.WEEKLY,
    interval: 1,
    keywords: [
      'weekly', 'every week', 'each week', 'repeat weekly', 'once a week',
      'har hafte', 'har saptah', 'har week', 'hafte mein ek baar',
      'हर हफ्ते', 'हर सप्ताह'
    ],
    confidence: 0.95
  },

  // 3. Weekdays specific
  {
    frequency: RECURRENCE_FREQUENCIES.WEEKLY,
    interval: 1,
    subType: 'weekdays',
    daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    keywords: ['every weekday', 'weekdays', 'each weekday', 'har weekday', 'only on weekdays'],
    confidence: 0.95
  },
  {
    frequency: RECURRENCE_FREQUENCIES.WEEKLY,
    interval: 1,
    daysOfWeek: ['Monday'],
    keywords: ['every monday', 'each monday', 'har monday', 'har somvaar', 'har somwar', 'हर सोमवार'],
    confidence: 0.95
  },
  {
    frequency: RECURRENCE_FREQUENCIES.WEEKLY,
    interval: 1,
    daysOfWeek: ['Tuesday'],
    keywords: ['every tuesday', 'each tuesday', 'har tuesday', 'har mangalvaar', 'हर मंगलवार'],
    confidence: 0.95
  },
  {
    frequency: RECURRENCE_FREQUENCIES.WEEKLY,
    interval: 1,
    daysOfWeek: ['Wednesday'],
    keywords: ['every wednesday', 'each wednesday', 'har wednesday', 'har budhvaar', 'हर बुधवार'],
    confidence: 0.95
  },
  {
    frequency: RECURRENCE_FREQUENCIES.WEEKLY,
    interval: 1,
    daysOfWeek: ['Thursday'],
    keywords: ['every thursday', 'each thursday', 'har thursday', 'har guruvaar', 'हर गुरुवार'],
    confidence: 0.95
  },
  {
    frequency: RECURRENCE_FREQUENCIES.WEEKLY,
    interval: 1,
    daysOfWeek: ['Friday'],
    keywords: ['every friday', 'each friday', 'har friday', 'har shukravaar', 'har shukrawar', 'हर शुक्रवार'],
    confidence: 0.95
  },
  {
    frequency: RECURRENCE_FREQUENCIES.WEEKLY,
    interval: 1,
    daysOfWeek: ['Saturday'],
    keywords: ['every saturday', 'each saturday', 'har saturday', 'har shanivaar', 'हर शनिवार'],
    confidence: 0.95
  },
  {
    frequency: RECURRENCE_FREQUENCIES.WEEKLY,
    interval: 1,
    daysOfWeek: ['Sunday'],
    keywords: ['every sunday', 'each sunday', 'har sunday', 'har ravivaar', 'हर रविवार'],
    confidence: 0.95
  },

  // 4. Monthly
  {
    frequency: RECURRENCE_FREQUENCIES.MONTHLY,
    interval: 1,
    keywords: [
      'monthly', 'every month', 'each month', 'once a month',
      'har mahine', 'har maheene', 'mahine mein ek baar',
      'हर महीने'
    ],
    confidence: 0.95
  },

  // 5. Alternate Days / Every Two Days
  {
    frequency: RECURRENCE_FREQUENCIES.DAILY,
    interval: 2,
    subType: 'alternate_days',
    keywords: [
      'alternate days', 'every two days', 'every other day', 'every 2 days',
      'har dusre din', 'har doosre din',
      'ek din chhod kar', 'ek din chhodke', 'har do din mein',
      'एक दिन छोड़ कर', 'हर दो दिन'
    ],
    confidence: 0.95
  }
];

/**
 * Checks for explicit negation of recurrence
 * @param {string} text 
 * @returns {boolean}
 */
export function hasRecurrenceNegation(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return RECURRENCE_NEGATIONS.some((neg) => lower.includes(neg));
}
