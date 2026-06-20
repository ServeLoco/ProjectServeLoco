export const IMAGE_GUIDANCE = {
  offerBanner: {
    label: 'Recommended: 1200 × 675 px (16:9 ratio). Keep key content in the centre to avoid edge cropping.',
  },
  product: {
    label: 'Recommended: 800 × 800 px (1:1 square). Centred product, ≥ 10% padding on all sides, white/light-grey background.',
  },
  combo: {
    label: 'Recommended: 800 × 800 px (1:1 square). Bundle items centred, consistent padding on all sides.',
  },
  category: {
    label: 'Recommended: 600 × 600 px (1:1 square). Icon or product photo, centred on a clean background.',
  },
  qr: {
    label: 'Recommended: 600 × 600 px (1:1 square). Sharp QR code, ≥ 10 px white quiet border around all sides.',
  },
  library: {
    label: 'Sizes — product/combo: 800 × 800 px | category: 600 × 600 px | QR: 600 × 600 px | offer banner: 1200 × 675 px. Formats: JPG, PNG, WebP (max 5 MB).',
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

