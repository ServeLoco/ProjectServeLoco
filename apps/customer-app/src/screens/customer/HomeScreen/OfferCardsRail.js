import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useReducedMotion } from '../../../utils';

export const OFFER_CARD_GAP = 10;
// How long a card stays in front before the row moves on by itself.
const AUTO_MOVE_MS = 2000;

// Every offer card type has the same width: one card fills most of the
// width; with more, the next one peeks.
export const offerCardWidthFor = (count, contentWidth) => (count === 1 ? contentWidth : Math.floor(contentWidth * 0.75));

/**
 * Where the row is scrolled to with each card in front. The last cards
 * cannot reach the left edge, so they share the end of the row; those
 * repeats are dropped when `unique` is set.
 */
export const offerRailStops = ({ count, cardWidth, railWidth, gutter, unique = false }) => {
  const maxScroll = Math.max(0, gutter * 2 + count * (cardWidth + OFFER_CARD_GAP) - OFFER_CARD_GAP - railWidth);
  const stops = Array.from({ length: count }, (_, i) => Math.min(i * (cardWidth + OFFER_CARD_GAP), maxScroll));
  return unique ? stops.filter((x, i) => i === 0 || x > stops[i - 1]) : stops;
};

// Space between two offer cards in their rail.
function OfferCardGap() {
  return <View style={{ width: OFFER_CARD_GAP }} />;
}

/**
 * The row moves on by itself: every 2 seconds the next card slides in, to
 * the last card, then back the other way to the first. It waits while a
 * finger is on the row and carries on from wherever the customer leaves it.
 * It stands still with one card, with reduced motion, and when Home is not
 * on screen.
 */
function useAutoMove(listRef, stops) {
  const reducedMotion = useReducedMotion();
  const isFocused = useIsFocused();
  const [held, setHeld] = useState(false);
  const at = useRef(0); // the stop in front
  const step = useRef(1); // 1: moving right, -1: moving back

  const moving = stops.length > 1 && !reducedMotion && isFocused && !held;
  useEffect(() => {
    if (!moving) return undefined;
    const id = setInterval(() => {
      const from = Math.min(at.current, stops.length - 1);
      if (from + step.current < 0 || from + step.current >= stops.length) step.current = -step.current;
      at.current = from + step.current;
      listRef.current?.scrollToOffset({ offset: stops[at.current], animated: true });
    }, AUTO_MOVE_MS);
    return () => clearInterval(id);
  }, [moving, stops, listRef]);

  const hold = useCallback(() => setHeld(true), []);
  const release = useCallback(() => setHeld(false), []);
  // After a swipe, go on from the card the customer left in front.
  const settle = useCallback((e) => {
    const x = e.nativeEvent.contentOffset.x;
    at.current = stops.reduce((best, s, i) => (Math.abs(s - x) < Math.abs(stops[best] - x) ? i : best), 0);
    setHeld(false);
  }, [stops]);

  return { hold, release, settle };
}

/**
 * Home's row of offer cards, of any template. `onScroll` (an Animated
 * event) is set on the row that colours the Common area.
 */
export function OfferCardsRail({ cards, cardWidth, gutter, onScroll, renderCard }) {
  const { width: railWidth } = useWindowDimensions();
  const listRef = useRef(null);
  const stops = useMemo(
    () => offerRailStops({ count: cards.length, cardWidth, railWidth, gutter, unique: true }),
    [cards.length, cardWidth, railWidth, gutter],
  );
  const { hold, release, settle } = useAutoMove(listRef, stops);
  const Rail = onScroll ? Animated.FlatList : FlatList;

  return (
    <Rail
      ref={listRef}
      horizontal
      data={cards}
      keyExtractor={(card) => String(card.id)}
      showsHorizontalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={onScroll ? 16 : undefined}
      onTouchStart={hold}
      onTouchEnd={release}
      onTouchCancel={release}
      onScrollEndDrag={settle}
      onMomentumScrollEnd={settle}
      contentContainerStyle={[styles.rail, { paddingHorizontal: gutter }]}
      ItemSeparatorComponent={OfferCardGap}
      renderItem={({ item }) => renderCard(item)}
    />
  );
}

const styles = StyleSheet.create({
  // Every card in the row is as tall as the tallest one (each card fills
  // its cell), so cards of any template line up as one size.
  rail: { alignItems: 'stretch' },
});
