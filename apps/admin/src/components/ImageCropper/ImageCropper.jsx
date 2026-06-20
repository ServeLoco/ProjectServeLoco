import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import { getCroppedBlob, blobToFile } from './cropImage';
import PlaceholderPreview from './PlaceholderPreview';
import './ImageCropper.css';

const ASPECT_PRESETS = [
  { label: '1:1 (Square)', value: 1 },
  { label: '16:9 (Banner)', value: 16 / 9 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: 'Free', value: undefined },
];

const FILL_PRESETS = ['#ffffff', '#000000', '#f4f4f4', '#e8f5e9', '#fff3e0', '#e3f2fd', '#fce4ec'];

const ASPECT_LABELS = {
  product: '1:1 (square product card)',
  category: '1:1 (square category icon)',
  combo: '1:1 (square combo card)',
  offer: '16:9 (wide banner)',
  qr: '1:1 (square QR code)',
  library: '1:1 (library thumbnail)',
};

export default function ImageCropper({
  open,
  file,                       // File selected by user (kept for filename)
  imageSrc,                   // Object URL created from file
  type = 'product',           // 'product' | 'category' | 'combo' | 'offer' | 'qr' | 'library'
  defaultAspect,              // number, e.g. 1 or 16/9
  onCancel,
  onApply,                    // (croppedFile: File) => void
  onSkip,                     // () => void — user chose to upload the original
}) {
  const initialAspect = defaultAspect ?? (type === 'offer' ? 16 / 9 : 1);
  const [aspect, setAspect] = useState(initialAspect);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [fillColor, setFillColor] = useState('#ffffff');
  const [outputType, setOutputType] = useState('image/jpeg');
  const [quality, setQuality] = useState(0.92);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const previewSrcRef = useRef(null);
  const [previewSrc, setPreviewSrc] = useState(null);

  // Re-render the placeholder preview whenever the crop changes. This is the
  // "live preview over the placeholder" feature: the right pane mirrors what
  // the cropped output will look like in the actual UI.
  const recomputePreview = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    if (previewSrcRef.current) URL.revokeObjectURL(previewSrcRef.current);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, {
        fillColor,
        outputType: 'image/jpeg',
        quality: 0.7, // small preview is fine
      });
      const url = URL.createObjectURL(blob);
      previewSrcRef.current = url;
      setPreviewSrc(url);
    } catch (e) {
      // preview is best-effort, don't block the user
    }
  }, [imageSrc, croppedAreaPixels, fillColor]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(recomputePreview, 30);
    return () => clearTimeout(t);
  }, [open, recomputePreview]);

  useEffect(() => {
    return () => {
      if (previewSrcRef.current) URL.revokeObjectURL(previewSrcRef.current);
    };
  }, []);

  // Lock aspect back to the recommended ratio whenever it differs from the
  // image type's default, so the user always lands on the right shape.
  useEffect(() => {
    if (open) setAspect(initialAspect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleApply = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, {
        fillColor,
        outputType,
        quality,
      });
      const croppedFile = blobToFile(blob, file?.name);
      onApply(croppedFile);
    } catch (e) {
      setError(e.message || 'Failed to crop image');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  // Render into document.body so clicks inside the cropper don't bubble up to
  // any parent drawer-overlay that has an onClick handler (which would
  // close the drawer mid-crop). Also avoids z-index conflicts.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="image-cropper-overlay" role="dialog" aria-modal="true" aria-label="Crop image">
      <div
        className="image-cropper-modal"
        // Stop click propagation so accidental clicks on the modal padding
        // never bubble to anything else (defence-in-depth alongside portal).
        onClick={(e) => e.stopPropagation()}
      >
        <header className="image-cropper-header">
          <h2>Crop image</h2>
          <button className="image-cropper-close" onClick={onCancel} aria-label="Close">×</button>
        </header>

        <div className="image-cropper-body">
          <section className="image-cropper-stage">
            <div className="image-cropper-canvas-wrap">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={onCropComplete}
                objectFit="contain"
                showGrid={true}
                restrictPosition
              />
            </div>
          </section>

          <aside className="image-cropper-preview">
            <div className="image-cropper-preview-label">Live preview · {ASPECT_LABELS[type] || 'preview'}</div>
            <div className="image-cropper-preview-frame">
              <PlaceholderPreview imageSrc={previewSrc} type={type} />
            </div>
          </aside>
        </div>

        <div className="image-cropper-controls">
          <div className="image-cropper-row">
            <label className="image-cropper-field">
              <span>Zoom</span>
              <input
                type="range" min="1" max="5" step="0.05"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
              <span className="image-cropper-value">{zoom.toFixed(2)}×</span>
            </label>
            <label className="image-cropper-field">
              <span>Rotation</span>
              <input
                type="range" min="-45" max="45" step="1"
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
              />
              <span className="image-cropper-value">{rotation}°</span>
            </label>
          </div>

          <div className="image-cropper-row">
            <label className="image-cropper-field">
              <span>Aspect</span>
              <select value={String(aspect)} onChange={(e) => {
                const v = e.target.value;
                setAspect(v === 'undefined' ? undefined : Number(v));
              }}>
                {ASPECT_PRESETS.map((p) => (
                  <option key={p.label} value={String(p.value)}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="image-cropper-field">
              <span>Fill</span>
              <div className="image-cropper-swatches">
                {FILL_PRESETS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`image-cropper-swatch${c === fillColor ? ' selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setFillColor(c)}
                    aria-label={`Fill ${c}`}
                  />
                ))}
                <input
                  type="color"
                  value={fillColor}
                  onChange={(e) => setFillColor(e.target.value)}
                  className="image-cropper-swatch-input"
                  title="Custom fill color"
                />
              </div>
            </label>
          </div>

          <div className="image-cropper-row">
            <label className="image-cropper-field">
              <span>Format</span>
              <select value={outputType} onChange={(e) => setOutputType(e.target.value)}>
                <option value="image/jpeg">JPEG (smaller)</option>
                <option value="image/png">PNG (lossless)</option>
                <option value="image/webp">WebP</option>
              </select>
            </label>
            {outputType !== 'image/png' && (
              <label className="image-cropper-field">
                <span>Quality</span>
                <input
                  type="range" min="0.5" max="1" step="0.01"
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                />
                <span className="image-cropper-value">{Math.round(quality * 100)}%</span>
              </label>
            )}
          </div>
        </div>

        {error && <div className="image-cropper-error">{error}</div>}

        <footer className="image-cropper-footer">
          <button className="image-cropper-btn image-cropper-btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          {onSkip && (
            <button
              className="image-cropper-btn image-cropper-btn-secondary"
              onClick={onSkip}
              disabled={busy}
              title="Upload the original file without cropping"
            >
              Use original
            </button>
          )}
          <button
            className="image-cropper-btn image-cropper-btn-primary"
            onClick={handleApply}
            disabled={busy || !croppedAreaPixels}
          >
            {busy ? 'Cropping…' : 'Apply crop & upload'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
