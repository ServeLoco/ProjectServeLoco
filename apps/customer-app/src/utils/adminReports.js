export const REPORT_PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];
export const OVERVIEW_PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};

export function reportRangeError(from, to) {
  if (!validDate(from) || !validDate(to)) return 'Enter valid dates as YYYY-MM-DD.';
  if (from > to) return 'The end date must be on or after the start date.';
  if ((Date.parse(to) - Date.parse(from)) / 86400000 + 1 > 366) return 'Choose a range of 366 days or fewer.';
  return null;
}

export const reportValue = (row, camel, snake = camel) => row?.[camel] ?? row?.[snake];
export const reportMoney = value => {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? `₹${number.toFixed(2)}` : '—';
};
export const reportCount = value => value == null ? '—' : String(value);
export const reportNumber = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(1);
