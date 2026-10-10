import { reportCount, reportMoney, reportNumber, reportRangeError, reportValue } from '../src/utils/adminReports';

it('validates calendar dates, date order, leap years and the server range limit', () => {
  expect(reportRangeError('2026-02-30', '2026-03-01')).toBeTruthy();
  expect(reportRangeError('2024-02-29', '2024-03-01')).toBeNull();
  expect(reportRangeError('2026-10-10', '2026-10-09')).toBeTruthy();
  expect(reportRangeError('2025-01-01', '2026-01-02')).toBeTruthy();
  expect(reportRangeError('2025-01-01', '2026-01-01')).toBeNull();
});
it('keeps missing report values distinct from real zero and supports dual casing', () => {
  expect(reportMoney(null)).toBe('—');
  expect(reportMoney('invalid')).toBe('—');
  expect(reportMoney(0)).toBe('₹0.00');
  expect(reportMoney('-25.5')).toBe('₹-25.50');
  expect(reportCount(null)).toBe('—');
  expect(reportNumber(null)).toBe('—');
  expect(reportNumber(0)).toBe('0.0');
  expect(reportValue({ shop_cost: 0 }, 'shopCost', 'shop_cost')).toBe(0);
});
