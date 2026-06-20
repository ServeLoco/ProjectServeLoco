/**
 * Loads an image source (URL or data URI) into an HTMLImageElement.
 */
const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });

/**
 * Renders the cropped region of `imageSrc` into a canvas and returns a Blob.
 *
 * @param {string} imageSrc                Object URL, data URI, or remote URL
 * @param {{x:number,y:number,width:number,height:number}} pixelCrop
 *   Crop area in the image's natural pixel coordinates (from react-easy-crop).
 * @param {object} [opts]
 * @param {string} [opts.fillColor='#ffffff'] Background color for the output canvas
 * @param {'image/jpeg'|'image/png'|'image/webp'} [opts.outputType='image/jpeg']
 * @param {number} [opts.quality=0.95]        Quality for lossy formats (0..1)
 * @returns {Promise<Blob>}
 */
export const getCroppedBlob = async (
  imageSrc,
  pixelCrop,
  { fillColor = '#ffffff', outputType = 'image/jpeg', quality = 0.95 } = {}
) => {
  const image = await loadImage(imageSrc);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(pixelCrop.width));
  canvas.height = Math.max(1, Math.round(pixelCrop.height));
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Failed to encode cropped image'));
        else resolve(blob);
      },
      outputType,
      quality
    );
  });
};

/**
 * Wraps a Blob in a File with a generated filename (preserves extension).
 * Required because the API uses multer which expects a filename.
 */
export const blobToFile = (blob, originalName) => {
  const ext = blob.type.split('/')[1] || 'jpg';
  const base = (originalName || 'image').replace(/\.[^.]+$/, '');
  return new File([blob], `${base}-cropped.${ext}`, { type: blob.type });
};
