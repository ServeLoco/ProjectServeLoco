import React, { useState, useEffect } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme';
import { fallbackProductImage } from '../../assets';

const FALLBACK_SOURCE = fallbackProductImage;

/**
 * ProductImage
 * Shows backend imageUrl when available, falls back to local placeholder.
 * Uses expo-image for built-in disk + memory caching across app sessions.
 *
 * Props (unchanged from previous react-native Image version):
 *   uri          - backend image URL string
 *   fallback     - local require() image source (default: built-in placeholder)
 *   width        - image width
 *   height       - image height
 *   borderRadius - corner radius (default: radius.md)
 *   style        - container style
 *   resizeMode   - 'cover' | 'contain' | 'fill' | 'none' | 'scale-down' (default: 'cover')
 *   priority     - 'low' | 'normal' | 'high' (default: 'normal'; use 'high' for hero images)
 *   filter       - optional React Native filter array forwarded to the image
 *   recyclingKey - optional key for FlatList cell recycling (forwarded to expo-image)
 */
function ProductImage({
  uri,
  fallback = FALLBACK_SOURCE,
  width = 100,
  height = 100,
  borderRadius = radius.md,
  style,
  resizeMode = 'cover',
  priority = 'normal',
  recyclingKey,
  filter,
}) {
  const [error, setError] = useState(false);

  // Reset error when uri changes (recycled cells must not keep fallback).
  useEffect(() => {
    setError(false);
  }, [uri]);

  const showFallback = !uri || error;
  const hasFallbackImage = Boolean(fallback);

  return (
    <View
      style={[
        styles.container,
        { width, height, borderRadius },
        style,
      ]}
    >
      {showFallback && hasFallbackImage ? (
        <Image
          source={fallback}
          style={[styles.image, { width, height, borderRadius }]}
          contentFit={resizeMode}
          priority={priority}
          transition={200}
          filter={filter}
          recyclingKey={recyclingKey}
        />
      ) : showFallback ? (
        <View style={[styles.placeholder, { borderRadius }]}>
          <View style={styles.placeholderInner} />
        </View>
      ) : null}

      {!showFallback && uri ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          contentFit={resizeMode}
          priority={priority}
          transition={200}
          onError={() => setError(true)}
          filter={filter}
          recyclingKey={recyclingKey}
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
