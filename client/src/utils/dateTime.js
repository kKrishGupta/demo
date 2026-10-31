/**
 * Date and Time utility functions
 */

/**
 * Returns the user's current local timezone name
 */
export function getLocalTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Formats a Date object or valid date string into HTML datetime-local input format (YYYY-MM-DDTHH:mm)
 * @param {Date|string|null} date
 * @returns {string}
 */
export function toDateTimeLocalString(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Formats a Date for friendly enterprise display
 * @param {Date|string|null} date
 * @returns {string}
 */
export function formatFriendlyDateTime(date) {
  if (!date) return 'Not set';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return 'Invalid date';

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(d);
}

/**
 * Validates that due date is not before start date
 * @param {Date|string|null} startDate
 * @param {Date|string|null} dueDate
 * @returns {boolean} true if due date is strictly before start date (invalid)
 */
export function isDueBeforeStart(startDate, dueDate) {
  if (!startDate || !dueDate) return false;
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(due.getTime())) return false;
  return due.getTime() < start.getTime();
}
