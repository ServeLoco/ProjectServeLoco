// MySQL TIME columns can come back as either a 'HH:MM:SS' string or a Date object
// depending on driver config. Normalize to 'HH:MM' for display.
export const fmtTime = (v) => {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    const hh = String(v.getHours()).padStart(2, '0');
    const mm = String(v.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return String(v).slice(0, 5);
};
