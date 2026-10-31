import { describe, it, expect } from 'vitest';
import { extractDates } from '../features/extraction/extractDates';
import { isDueBeforeStart } from '../utils/dateTime';

describe('Date & Time Interpretation', () => {
  // Use a fixed reference date for deterministic testing: Wednesday, Oct 28, 2026, 09:00:00
  const refDate = new Date(2026, 9, 28, 9, 0, 0);

  it('correctly separates start date and due date with explicit times', () => {
    const text = 'Start tomorrow at 10 AM, finish by Friday at 5 PM';
    const result = extractDates(text, refDate);

    expect(result.startDate.status).toBe('valid');
    expect(result.startDate.value).not.toBeNull();
    expect(result.startDate.value.getHours()).toBe(10);
    expect(result.startDate.value.getMinutes()).toBe(0);

    expect(result.dueDate.status).toBe('valid');
    expect(result.dueDate.value).not.toBeNull();
    expect(result.dueDate.value.getHours()).toBe(17);
    expect(result.dueDate.value.getMinutes()).toBe(0);
  });

  it('applies default business hours when time is omitted', () => {
    const text = 'Start tomorrow and finish Friday';
    const result = extractDates(text, refDate);

    expect(result.startDate.status).toBe('valid');
    expect(result.startDate.isTimeInferred).toBe(true);
    expect(result.startDate.value.getHours()).toBe(9); // Default 9 AM

    expect(result.dueDate.status).toBe('valid');
    expect(result.dueDate.isTimeInferred).toBe(true);
    expect(result.dueDate.value.getHours()).toBe(17); // Default 5 PM
  });

  it('rejects due dates that occur before start date', () => {
    // Start on Friday, finish by Thursday (previous day)
    const text = 'Start on Friday at 5 PM, finish by Thursday at 10 AM';
    const result = extractDates(text, refDate);

    expect(result.dueDate.status).toBe('invalid');
    expect(result.dueDate.message).toContain('cannot be earlier than start date');
  });

  it('detects isDueBeforeStart utility accurately', () => {
    const start = new Date(2026, 9, 29, 10, 0);
    const due = new Date(2026, 9, 28, 17, 0); // Before start
    expect(isDueBeforeStart(start, due)).toBe(true);

    const validDue = new Date(2026, 9, 30, 17, 0); // After start
    expect(isDueBeforeStart(start, validDue)).toBe(false);
  });
});
