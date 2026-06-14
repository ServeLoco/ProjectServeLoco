export function formatEtaMinutes(mins) {
  const numeric = Number(mins);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  const total = Math.round(numeric);
  if (total < 60) return `${total} mins`;
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  if (remainder === 0) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  const hourLabel = hours === 1 ? '1 hour' : `${hours} hours`;
  return `${hourLabel} ${remainder} mins`;
}
