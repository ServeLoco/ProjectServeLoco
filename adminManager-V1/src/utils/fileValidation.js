export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_BULK_CSV_BYTES = 10 * 1024 * 1024;
export const MAX_BULK_ZIP_BYTES = 50 * 1024 * 1024;

export function formatFileSize(bytes) {
  const numeric = Number(bytes);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(numeric) / Math.log(1024)), units.length - 1);
  return `${(numeric / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function getFileSizeError(file, maxBytes, label = 'File') {
  if (!file) return null;
  if (file.size <= maxBytes) return null;
  return `${label} must be ${formatFileSize(maxBytes)} or smaller. Selected file is ${formatFileSize(file.size)}.`;
}

export function getImageUploadError(file) {
  return getFileSizeError(file, MAX_IMAGE_UPLOAD_BYTES, 'Image');
}
