const getApiBaseUrl = () => import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Tiny inline SVG placeholder — light grey card with image icon
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#EEF0F3"/><path d="M30 35h40v30H30z" fill="#DFE2E6"/><circle cx="40" cy="46" r="4" fill="#C7CCD4"/><path d="M30 60l12-12 10 10 8-6 10 8v5H30z" fill="#C7CCD4"/></svg>`
);

export const getResolvedImageUrl = (item) => {
  if (!item) return PLACEHOLDER;

  let url = item.imageUrl || item.image_url;

  if (!url && item.image_file) {
    url = `${getApiBaseUrl().replace('/api', '')}/uploads/${item.image_file}`;
  }

  if (!url) return PLACEHOLDER;

  try {
    const urlObj = new URL(url);
    const apiObj = new URL(getApiBaseUrl());

    // Only force the image host to match the API host when the URL points at
    // a relative-style upload path produced by the backend. Leave external
    // CDN URLs (with their own query strings, signed tokens, etc.) alone so
    // we don't 404 a perfectly valid https://cdn.example.com/img?token=... URL.
    const isUploadPath = urlObj.pathname.startsWith('/uploads/')
      || urlObj.pathname.startsWith('/images/');
    if (isUploadPath && urlObj.hostname !== apiObj.hostname) {
      urlObj.hostname = apiObj.hostname;
      urlObj.port = apiObj.port;
      urlObj.protocol = apiObj.protocol;
      return urlObj.toString();
    }
  } catch {
    // Ignore URL parsing errors, just return the raw string
  }

  return url;
};
