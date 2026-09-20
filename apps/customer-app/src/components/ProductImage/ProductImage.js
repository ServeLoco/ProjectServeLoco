import React from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme';
import { fallbackProductImage } from '../../assets';
import { useImageRetry } from './RetryingImage';

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
  // A failed load is retried on its own (the connection may have dipped for a
  // second). The fallback picture shows straight away after the first failure
  // (so a card is never an empty box) and the real picture replaces it as soon
  // as a retry loads; after the last retry fails the fallback stays. The hook
  // resets when uri changes, so recycled cells never keep a stale failure.
  const { attempt, failed, hadError, onError, onLoad } = useImageRetry(uri);

  const showFallback = !uri || hadError || failed;
  const showImage = Boolean(uri) && !failed;
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

      {showImage ? (
        <Image
          key={attempt}
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          contentFit={resizeMode}
          priority={priority}
          transition={200}
          onError={onError}
          onLoad={onLoad}
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
