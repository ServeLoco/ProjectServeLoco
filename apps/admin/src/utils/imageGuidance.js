export const IMAGE_GUIDANCE = {
  offerBanner: {
    label: 'Recommended: 1200 × 600 px (2:1 ratio, matches the app\'s home banner exactly). Keep key content in the centre to avoid edge cropping.',
  },
  product: {
    label: 'Recommended: 780 × 1000 px (0.78:1 portrait, matches the app\'s product card exactly). Centred product, ≥ 10% padding on all sides, white/light-grey background.',
  },
  combo: {
    label: 'Recommended: 780 × 1000 px (0.78:1 portrait, matches the app\'s product card exactly). Bundle items centred, consistent padding on all sides.',
  },
  category: {
    label: 'Recommended: 720 × 800 px (0.9:1, matches the app\'s category card exactly). Icon or product photo, centred on a clean background.',
  },
  qr: {
    label: 'Recommended: 600 × 600 px (1:1 square). Sharp QR code, ≥ 10 px white quiet border around all sides.',
  },
  storeMode: {
    label: 'Recommended: 512 × 512 px (1:1 square). Icon is displayed inside a circle, so keep the subject centred with padding — corners get cropped off.',
  },
  library: {
    label: 'Sizes — product/combo: 780 × 1000 px (0.78:1) | category: 720 × 800 px (0.9:1) | QR: 600 × 600 px | offer banner: 1200 × 600 px (2:1). Formats: JPG, PNG, WebP (max 5 MB).',
  },
};

// Time-window preview helper used by the Products page so admins can see at
// a glance whether a product is currently visible to customers. The logic
// mirrors apps/api/src/utils/timeWindow.js exactly.
export const isWithinTimeWindow = (from, until, now = new Date()) => {
  if (!from || !until) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = String(from).split(':').map(Number);
  const [uh, um] = String(until).split(':').map(Number);
  const start = fh * 60 + (fm || 0);
  const end = uh * 60 + (um || 0);
  if (start === end) return true;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
};

export const formatTimeWindow = (from, until) => {
  if (!from && !until) return '';
  const f = String(from || '').slice(0, 5);
  const u = String(until || '').slice(0, 5);
  if (f && u) return `${f} – ${u}`;
  if (f) return `from ${f}`;
  if (u) return `until ${u}`;
  return '';
};

