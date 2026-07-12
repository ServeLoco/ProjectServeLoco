/**
 * Image optimize + thumb pipeline (sharp).
 */
const sharp = require('sharp');
const {
  processUploadedImage,
  generateThumb,
  optimizeFull,
  THUMB_MAX_WIDTH,
  FULL_MAX_WIDTH,
} = require('../src/utils/imageThumbs');

async function solidJpeg(width, height) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 80, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('imageThumbs processUploadedImage', () => {
  it('optimizes a large full image down to FULL_MAX_WIDTH and makes a WebP thumb', async () => {
    const input = await solidJpeg(2400, 1600);
    const { full, thumb } = await processUploadedImage(input, 'jpg');

    expect(full).not.toBeNull();
    expect(thumb).not.toBeNull();
    expect(full.ext).toMatch(/jpg|webp/);
    expect(thumb.ext).toBe('webp');
    expect(thumb.mimeType).toBe('image/webp');

    const fullMeta = await sharp(full.buffer).metadata();
    expect(fullMeta.width).toBeLessThanOrEqual(FULL_MAX_WIDTH);

    const thumbMeta = await sharp(thumb.buffer).metadata();
    expect(thumbMeta.width).toBeLessThanOrEqual(THUMB_MAX_WIDTH);
    expect(thumbMeta.format).toBe('webp');

    // Optimized should be smaller than a raw 2400px jpeg solid (usually).
    expect(full.buffer.length).toBeLessThan(input.length * 2);
  });

  it('generateThumb always returns webp', async () => {
    const input = await solidJpeg(800, 600);
    const thumb = await generateThumb(input);
    expect(thumb.mimeType).toBe('image/webp');
    const meta = await sharp(thumb.buffer).metadata();
    expect(meta.width).toBeLessThanOrEqual(THUMB_MAX_WIDTH);
  });

  it('optimizeFull does not enlarge small images', async () => {
    const input = await solidJpeg(200, 150);
    const full = await optimizeFull(input, 'jpg');
    const meta = await sharp(full.buffer).metadata();
    expect(meta.width).toBe(200);
  });
});
