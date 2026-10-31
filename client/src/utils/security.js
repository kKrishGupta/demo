/**
 * Security and Safe Evaluation Utilities
 * Guards against prototype pollution, ReDoS, invalid calendar dates, and unsafe inputs.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Escapes characters with special meaning in Regular Expressions
 * Prevents ReDoS and regex syntax injection from user input.
 * @param {string} str 
 * @returns {string}
 */
export function escapeRegExp(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Safely checks if an object possesses a direct property without prototype pollution risk
 * @param {Object} obj 
 * @param {string} key 
 * @returns {boolean}
 */
export function safeHas(obj, key) {
  if (!obj || typeof obj !== 'object') return false;
  if (FORBIDDEN_KEYS.has(key)) return false;
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Validates whether a year is a leap year in the Gregorian calendar
 * @param {number} year 
 * @returns {boolean}
 */
export function isLeapYear(year) {
  if (!year || typeof year !== 'number') return false;
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Validates real calendar days per month including leap years
 * Rejects impossible dates like Feb 29 on non-leap years, Feb 30, Apr 31, Nov 31, or month 13+.
 * @param {number} year 
 * @param {number} month 1-indexed (1 = January, 12 = December)
 * @param {number} day 1-indexed
 * @returns {boolean}
 */
export function isValidCalendarDate(year, month, day) {
  if (!year || !month || !day) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;

  const daysInMonths = [
    31, // January
    isLeapYear(year) ? 29 : 28, // February
    31, // March
    30, // April
    31, // May
    30, // June
    31, // July
    31, // August
    30, // September
    31, // October
    30, // November
    31  // December
  ];

  return day <= daysInMonths[month - 1];
}

/**
 * Checks if a string contains any prototype pollution vector keys
 * @param {string} key 
 * @returns {boolean}
 */
export function isPrototypePollutionKey(key) {
  return FORBIDDEN_KEYS.has(key);
}
