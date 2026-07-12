/**
 * Server-side thumbnail generation (max-width 480px).
 * Thumb failure must never fail the parent upload — callers wrap in try/catch.
 */
const sharp = require('sharp');

const THUMB_MAX_WIDTH = 480;

/**
 * @param {Buffer} buffer - original image bytes
 * @param {string} ext - jpg|jpeg|png|webp|gif
 * @returns {Promise<{ buffer: Buffer, mimeType: string, ext: string }|null>}
 */
async function generateThumb(buffer, ext = 'jpg') {
  const normalized = String(ext || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  let pipeline = sharp(buffer).resize({
    width: THUMB_MAX_WIDTH,
    withoutEnlargement: true,
  });

  let mimeType = 'image/jpeg';
  let outExt = 'jpg';

  if (normalized === 'png') {
    pipeline = pipeline.png({ compressionLevel: 8 });
    mimeType = 'image/png';
    outExt = 'png';
  } else if (normalized === 'webp') {
    pipeline = pipeline.webp({ quality: 80 });
    mimeType = 'image/webp';
    outExt = 'webp';
  } else if (normalized === 'gif') {
    // GIF → JPEG thumb (animated thumbs not needed for product cards).
    pipeline = pipeline.jpeg({ quality: 80 });
    mimeType = 'image/jpeg';
    outExt = 'jpg';
  } else {
    pipeline = pipeline.jpeg({ quality: 80 });
    mimeType = 'image/jpeg';
    outExt = 'jpg';
  }

  const out = await pipeline.toBuffer();
  return { buffer: out, mimeType, ext: outExt };
}

/** thumb filename alongside original: image-123.jpg → image-123-thumb.jpg */
function thumbFilenameFor(originalFilename, thumbExt) {
  const base = String(originalFilename || 'image').replace(/\.[^.]+$/, '');
  return `${base}-thumb.${thumbExt}`;
}

module.exports = {
  THUMB_MAX_WIDTH,
  generateThumb,
  thumbFilenameFor,
};
