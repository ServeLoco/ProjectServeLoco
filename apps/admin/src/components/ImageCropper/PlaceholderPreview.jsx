import React from 'react';
import { normalizeImageUrl } from '../../utils/imageUrl';

/**
 * Live preview mockups — show how the cropped image will look inside the
 * actual customer-facing UI. The user can see the fit in real time as they
 * crop. All sizes are scaled down versions of the real component dimensions.
 */

const styles = {
  product: {
    width: 160,
    background: 'var(--bg-surface, #fff)',
    borderRadius: 10,
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    border: '1px solid rgba(0,0,0,0.04)',
  },
  productImg: {
    width: '100%',
    aspectRatio: '1 / 1',
    objectFit: 'cover',
    display: 'block',
    background: 'var(--bg-app, #f4f4f4)',
  },
  productBody: { padding: 8 },
  productName: { fontSize: 11, fontWeight: 600, color: '#222', marginBottom: 2 },
  productPrice: { fontSize: 12, fontWeight: 700, color: '#111' },

  category: { width: 90, textAlign: 'center' },
  categoryImg: {
    width: 56,
    height: 56,
    borderRadius: 14,
    margin: '0 auto',
    background: 'var(--bg-surface, #fff)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  categoryImgInner: { width: '100%', height: '100%', objectFit: 'contain' },
  categoryName: { fontSize: 10, color: '#333', marginTop: 6, fontWeight: 500 },

  combo: {
    width: 160,
    background: 'var(--bg-surface, #fff)',
    borderRadius: 10,
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    border: '1px solid rgba(0,0,0,0.04)',
  },
  comboImg: {
    width: '100%',
    aspectRatio: '1 / 1',
    objectFit: 'cover',
    display: 'block',
    background: 'var(--bg-app, #f4f4f4)',
  },

  offer: {
    width: 280,
    borderRadius: 12,
    overflow: 'hidden',
    background: 'var(--bg-surface, #fff)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  offerImg: {
    width: '100%',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    display: 'block',
    background: 'var(--bg-app, #f4f4f4)',
  },

  qr: {
    width: 160,
    padding: 16,
    background: 'var(--bg-surface, #fff)',
    borderRadius: 10,
    textAlign: 'center',
  },
  qrImg: {
    width: 128,
    height: 128,
    objectFit: 'contain',
    background: '#fff',
    border: '1px solid #eee',
  },
  qrLabel: { fontSize: 11, color: '#666', marginTop: 8 },

  library: {
    width: 140,
    height: 140,
    borderRadius: 8,
    overflow: 'hidden',
    background: 'var(--bg-surface, #f6f6f6)',
  },
  libraryImg: { width: '100%', height: '100%', objectFit: 'cover' },
};

/**
 * Public component. Pass an `imageSrc` (object URL of the CROPPED result, or
 * the original during editing) and a `type` to render the right preview.
 */
export default function PlaceholderPreview({ imageSrc, type = 'product' }) {
  const src = imageSrc ? normalizeImageUrl(imageSrc) : null;

  switch (type) {
    case 'product':
      return (
        <div style={styles.product}>
          {src
            ? <img src={src} alt="" style={styles.productImg} />
            : <div style={styles.productImg} />}
          <div style={styles.productBody}>
            <div style={styles.productName}>Product name</div>
            <div style={styles.productPrice}>₹99</div>
          </div>
        </div>
      );

    case 'category':
      return (
        <div style={styles.category}>
          <div style={styles.categoryImg}>
            {src
              ? <img src={src} alt="" style={styles.categoryImgInner} />
              : null}
          </div>
          <div style={styles.categoryName}>Category</div>
        </div>
      );

    case 'combo':
      return (
        <div style={styles.combo}>
          {src
            ? <img src={src} alt="" style={styles.comboImg} />
            : <div style={styles.comboImg} />}
          <div style={styles.productBody}>
            <div style={styles.productName}>Combo name</div>
            <div style={styles.productPrice}>₹199</div>
          </div>
        </div>
      );

    case 'offer':
      return (
        <div style={styles.offer}>
          {src
            ? <img src={src} alt="" style={styles.offerImg} />
            : <div style={styles.offerImg} />}
        </div>
      );

    case 'qr':
      return (
        <div style={styles.qr}>
          {src
            ? <img src={src} alt="" style={styles.qrImg} />
            : <div style={styles.qrImg} />}
          <div style={styles.qrLabel}>UPI QR Code</div>
        </div>
      );

    case 'library':
    default:
      return (
        <div style={styles.library}>
          {src
            ? <img src={src} alt="" style={styles.libraryImg} />
            : <div style={styles.libraryImg} />}
        </div>
      );
  }
}
