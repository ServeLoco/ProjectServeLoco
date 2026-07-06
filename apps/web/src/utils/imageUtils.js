const getApiBaseUrl = () => import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Inline SVG placeholder — bowl/steam food icon shown when a product/category has no image
export const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#F4EFE6"/><path d="M40 34c-2-5 1-10 1-10M50 32c-2-6 2-11 2-11M60 34c-2-5 1-10 1-10" stroke="#C9BFAE" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M24 56c0 15 11.6 26 26 26s26-11 26-26H24z" fill="#E2963F"/><rect x="20" y="53" width="60" height="7" rx="3.5" fill="#C97A2B"/></svg>`
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
