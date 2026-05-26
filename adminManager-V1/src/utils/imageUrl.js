import { API_ORIGIN } from '../api/client';

const LOCAL_IMAGE_HOSTS = new Set(['10.0.2.2', 'localhost', '127.0.0.1']);

export const normalizeImageUrl = (url) => {
  if (!url) return '';
  if (typeof url !== 'string') return '';

  if (url.startsWith('/')) {
    return `${API_ORIGIN}${url}`;
  }

  try {
    const parsed = new URL(url);
    if (LOCAL_IMAGE_HOSTS.has(parsed.hostname)) {
      return `${API_ORIGIN}${parsed.pathname}${parsed.search}`;
    }
    return url;
  } catch {
    return url;
  }
};

export const getUploadedImage = (response) => {
  const image = response?.image || response?.data || response;
  const id = image?.id || image?._id || image?.image_id || '';
  const url = normalizeImageUrl(image?.imageUrl || image?.image_url || image?.url || '');

  if (!id || !url) {
    throw new Error('Upload succeeded but image data was incomplete.');
  }

  return { id, url };
};
