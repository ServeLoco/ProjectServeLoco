const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Tiny inline SVG placeholder — light grey card with image icon
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#EEF0F3"/><path d="M30 35h40v30H30z" fill="#DFE2E6"/><circle cx="40" cy="46" r="4" fill="#C7CCD4"/><path d="M30 60l12-12 10 10 8-6 10 8v5H30z" fill="#C7CCD4"/></svg>`
);

export const getResolvedImageUrl = (item) => {
  if (!item) return PLACEHOLDER;

  let url = item.imageUrl || item.image_url;

  if (!url && item.image_file) {
    url = `${API_BASE_URL.replace('/api', '')}/uploads/${item.image_file}`;
  }

  if (!url) return PLACEHOLDER;

  try {
    const urlObj = new URL(url);
    const apiObj = new URL(API_BASE_URL);
    
    // Force image host to match the API host so cross-device testing and local testing both work
    // regardless of what hardcoded PUBLIC_BASE_URL is in the backend's .env file.
    if (urlObj.hostname !== apiObj.hostname) {
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
