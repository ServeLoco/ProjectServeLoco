/**
 * Server-side image processing for uploads (disk + S3).
 *
 * On every admin upload we:
 *  1. Optimize the full image (max 1600px, efficient re-encode)
 *  2. Generate a list-card thumbnail (max 320px WebP)
 *
 * Thumb / optimize failures must never fail the parent upload — callers
 * fall back to the raw buffer when processing throws.
 */
const sharp = require('sharp');

const FULL_MAX_WIDTH = 1600;
const THUMB_MAX_WIDTH = 320;
const FULL_JPEG_QUALITY = 85;
const FULL_WEBP_QUALITY = 85;
const THUMB_WEBP_QUALITY = 75;

/**
 * Resize + re-encode the "detail / banner" full image.
 * @param {Buffer} buffer
 * @param {string} [sourceExt] - detected upload extension (jpg|png|webp|gif)
 * @returns {Promise<{ buffer: Buffer, mimeType: string, ext: string }>}
 */
async function optimizeFull(buffer, sourceExt = 'jpg') {
  const normalized = String(sourceExt || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  let pipeline = sharp(buffer, { failOn: 'none' }).rotate(); // honor EXIF orientation

  pipeline = pipeline.resize({
    width: FULL_MAX_WIDTH,
    withoutEnlargement: true,
  });

  // Prefer WebP for photos; keep PNG only when source was PNG with transparency
  // needs (we still use WebP — expo-image and modern browsers handle it).
  // GIF → still image as JPEG.
  if (normalized === 'png') {
    // PNG product photos are often huge; WebP is much smaller and fine for app.
    const out = await pipeline.webp({ quality: FULL_WEBP_QUALITY }).toBuffer();
    return { buffer: out, mimeType: 'image/webp', ext: 'webp' };
  }
  if (normalized === 'webp') {
    const out = await pipeline.webp({ quality: FULL_WEBP_QUALITY }).toBuffer();
    return { buffer: out, mimeType: 'image/webp', ext: 'webp' };
  }
  // jpg / gif / default → JPEG full (max compatibility for admin tooling)
  const out = await pipeline.jpeg({ quality: FULL_JPEG_QUALITY, mozjpeg: true }).toBuffer();
  return { buffer: out, mimeType: 'image/jpeg', ext: 'jpg' };
}

/**
 * List-card thumbnail: always WebP, max 320px wide.
 * @param {Buffer} buffer - preferably the original upload bytes
 * @returns {Promise<{ buffer: Buffer, mimeType: string, ext: string }>}
 */
async function generateThumb(buffer) {
  const out = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: THUMB_MAX_WIDTH,
      withoutEnlargement: true,
    })
    .webp({ quality: THUMB_WEBP_QUALITY })
    .toBuffer();
  return { buffer: out, mimeType: 'image/webp', ext: 'webp' };
}

/** thumb filename: image-123.jpg → image-123-thumb.webp */
function thumbFilenameFor(originalFilename, thumbExt = 'webp') {
  const base = String(originalFilename || 'image').replace(/\.[^.]+$/, '');
  return `${base}-thumb.${thumbExt}`;
}

/**
 * Process an upload into optimized full + thumb variants.
 * Never throws — on total failure returns full:null, thumb:null.
 *
 * @param {Buffer} inputBuffer
 * @param {string} sourceExt
 * @returns {Promise<{ full: {buffer,mimeType,ext}|null, thumb: {buffer,mimeType,ext}|null }>}
 */
async function processUploadedImage(inputBuffer, sourceExt = 'jpg') {
  let full = null;
  let thumb = null;

  try {
    full = await optimizeFull(inputBuffer, sourceExt);
  } catch (err) {
    console.error('[images] full optimize failed:', err.message);
  }

  try {
    // Thumb from original bytes when possible (sharper than from already-compressed full).
    thumb = await generateThumb(inputBuffer);
  } catch (err) {
    console.error('[images] thumb generation failed:', err.message);
    // Second chance: from optimized full if we have it
    if (full?.buffer) {
      try {
        thumb = await generateThumb(full.buffer);
      } catch (err2) {
        console.error('[images] thumb from full also failed:', err2.message);
      }
    }
  }

  return { full, thumb };
}

module.exports = {
  FULL_MAX_WIDTH,
  THUMB_MAX_WIDTH,
  optimizeFull,
  generateThumb,
  thumbFilenameFor,
  processUploadedImage,
};
