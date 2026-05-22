import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme';

// Local fallback placeholder image — a simple colored rectangle
// Replace with actual asset: require('../../assets/images/placeholder_product.png')
const FALLBACK_SOURCE = null;

/**
 * ProductImage
 * Shows backend imageUrl when available, falls back to local placeholder.
 *
 * Props:
 *   uri          - backend image URL string
 *   fallback     - local require() image source (default: built-in placeholder)
 *   width        - image width
 *   height       - image height
 *   borderRadius - corner radius (default: radius.md)
 *   style        - container style
 *   resizeMode   - Image resizeMode (default: 'cover')
 */
function ProductImage({
  uri,
  fallback = FALLBACK_SOURCE,
  width = 100,
  height = 100,
  borderRadius = radius.md,
  style,
  resizeMode = 'cover',
}) {
  const [error, setError] = useState(false);

  const showFallback = !uri || error;

  return (
    <View
      style={[
        styles.container,
        { width, height, borderRadius },
        style,
      ]}
    >
      {showFallback || !fallback ? (
        // Built-in placeholder: colored rectangle with "no image" feel
        <View style={[styles.placeholder, { borderRadius }]}>
          <View style={styles.placeholderInner} />
        </View>
      ) : (
        <Image
          source={fallback}
          style={[styles.image, { width, height, borderRadius }]}
          resizeMode={resizeMode}
        />
      )}

      {!showFallback && uri ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          resizeMode={resizeMode}
          onError={() => setError(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.bgSkeletonBase,
  },
  placeholder: {
    flex: 1,
    backgroundColor: colors.bgSkeletonBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderInner: {
    width: '45%',
    height: '45%',
    backgroundColor: colors.bgSkeletonShimmer,
    borderRadius: radius.sm,
    opacity: 0.6,
  },
  image: {
    position: 'absolute',
  },
});

export default ProductImage;
