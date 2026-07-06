import { API_ORIGIN } from '../api/client';

const LOCAL_IMAGE_HOSTS = new Set(['10.0.2.2', 'localhost', '127.0.0.1']);

// Inline SVG placeholder — bowl/steam food icon shown when an image is missing or fails to load
export const FALLBACK_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#F4EFE6"/><path d="M40 34c-2-5 1-10 1-10M50 32c-2-6 2-11 2-11M60 34c-2-5 1-10 1-10" stroke="#C9BFAE" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M24 56c0 15 11.6 26 26 26s26-11 26-26H24z" fill="#E2963F"/><rect x="20" y="53" width="60" height="7" rx="3.5" fill="#C97A2B"/></svg>`
);

export const handleImageError = (e) => {
  e.target.onerror = null;
  e.target.src = FALLBACK_IMAGE;
};

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
