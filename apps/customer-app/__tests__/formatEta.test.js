import { formatEtaMinutes } from '../src/utils/formatEta';

describe('formatEtaMinutes', () => {
  test('formats minutes-only values', () => {
    expect(formatEtaMinutes(1)).toBe('1 mins');
    expect(formatEtaMinutes(30)).toBe('30 mins');
    expect(formatEtaMinutes(45)).toBe('45 mins');
    expect(formatEtaMinutes(59)).toBe('59 mins');
  });

  test('formats whole hours', () => {
    expect(formatEtaMinutes(60)).toBe('1 hour');
    expect(formatEtaMinutes(120)).toBe('2 hours');
    expect(formatEtaMinutes(180)).toBe('3 hours');
  });

  test('formats hours and minutes', () => {
    expect(formatEtaMinutes(75)).toBe('1 hour 15 mins');
    expect(formatEtaMinutes(90)).toBe('1 hour 30 mins');
    expect(formatEtaMinutes(150)).toBe('2 hours 30 mins');
    expect(formatEtaMinutes(125)).toBe('2 hours 5 mins');
  });

  test('handles non-integer input', () => {
    expect(formatEtaMinutes(59.4)).toBe('59 mins');
    expect(formatEtaMinutes(59.6)).toBe('1 hour');
    expect(formatEtaMinutes(60.4)).toBe('1 hour');
    expect(formatEtaMinutes(74.5)).toBe('1 hour 15 mins');
  });

  test('returns empty string for invalid input', () => {
    expect(formatEtaMinutes(0)).toBe('');
    expect(formatEtaMinutes(-5)).toBe('');
    expect(formatEtaMinutes(NaN)).toBe('');
    expect(formatEtaMinutes(Infinity)).toBe('');
    expect(formatEtaMinutes(null)).toBe('');
    expect(formatEtaMinutes(undefined)).toBe('');
    expect(formatEtaMinutes('not a number')).toBe('');
  });

  test('accepts numeric strings', () => {
    expect(formatEtaMinutes('45')).toBe('45 mins');
    expect(formatEtaMinutes('90')).toBe('1 hour 30 mins');
  });
});
