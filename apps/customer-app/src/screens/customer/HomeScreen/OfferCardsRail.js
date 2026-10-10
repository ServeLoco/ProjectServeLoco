import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useReducedMotion } from '../../../utils';

export const OFFER_CARD_GAP = 10;
// How long a card stays in front before the row moves on by itself.
const AUTO_MOVE_MS = 2000;

// Every offer card type has the same width: one card fills most of the
// width; with more, the next one peeks.
export const offerCardWidthFor = (count, contentWidth) => (count === 1 ? contentWidth : Math.floor(contentWidth * 0.72));

/**
 * Where the row is scrolled to with each card in front: the first card at
 * the start, the last at the end, and every card between them in the middle
 * of the screen. Cards that cannot get there share the start or the end;
 * those repeats are dropped when `unique` is set.
 */
export const offerRailStops = ({ count, cardWidth, railWidth, gutter, unique = false }) => {
  const maxScroll = Math.max(0, gutter * 2 + count * (cardWidth + OFFER_CARD_GAP) - OFFER_CARD_GAP - railWidth);
  const centred = (i) => gutter + i * (cardWidth + OFFER_CARD_GAP) + cardWidth / 2 - railWidth / 2;
  const stops = Array.from({ length: count }, (_, i) => {
    if (i === 0) return 0;
    if (i === count - 1) return maxScroll;
    return Math.round(Math.min(Math.max(centred(i), 0), maxScroll));
  });
  return unique ? stops.filter((x, i) => i === 0 || x > stops[i - 1]) : stops;
};

// Space between two offer cards in their rail.
function OfferCardGap() {
  return <View style={{ width: OFFER_CARD_GAP }} />;
}

/**
 * The row moves on by itself: every 2 seconds the next card slides in, to
 * the last card, then back the other way to the first. The first touch stops
 * automatic movement for this rail's lifetime; Home remounts it on reload.
 * It stands still with one card, with reduced motion, and when Home is not
 * on screen.
 */
function useAutoMove(listRef, stops) {
  const reducedMotion = useReducedMotion();
  const isFocused = useIsFocused();
  const [touched, setTouched] = useState(false);
  const touchedRef = useRef(false);
  const timerRef = useRef(null);
  const offsetRef = useRef(0);
  const at = useRef(0); // the stop in front
  const step = useRef(1); // 1: moving right, -1: moving back

  const moving = stops.length > 1 && !reducedMotion && isFocused && !touched;
  useEffect(() => {
    if (!moving) return undefined;
    const id = setInterval(() => {
      if (touchedRef.current) return;
      const from = Math.min(at.current, stops.length - 1);
      if (from + step.current < 0 || from + step.current >= stops.length) step.current = -step.current;
      at.current = from + step.current;
      listRef.current?.scrollToOffset({ offset: stops[at.current], animated: true });
    }, AUTO_MOVE_MS);
    timerRef.current = id;
    return () => {
      clearInterval(id);
      timerRef.current = null;
    };
  }, [moving, stops, listRef]);

  const stop = useCallback(() => {
    if (touchedRef.current) return;
    touchedRef.current = true;
    clearInterval(timerRef.current);
    setTouched(true);
    // Cancel an automatic slide already in flight, including touches on buttons.
    listRef.current?.scrollToOffset({ offset: offsetRef.current, animated: false });
  }, [listRef]);
  const trackScroll = useCallback((e) => {
    offsetRef.current = e.nativeEvent.contentOffset.x;
  }, []);
  const settle = useCallback((e) => {
    const x = e.nativeEvent.contentOffset.x;
    offsetRef.current = x;
    at.current = stops.reduce((best, s, i) => (Math.abs(s - x) < Math.abs(stops[best] - x) ? i : best), 0);
  }, [stops]);

  return { stop, trackScroll, settle };
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
  const { stop, trackScroll, settle } = useAutoMove(listRef, stops);
  // Preserve the native animated backdrop while observing the current offset.
  useEffect(() => {
    if (!onScroll) return undefined;
    Animated.forkEvent(onScroll, trackScroll);
    return () => Animated.unforkEvent(onScroll, trackScroll);
  }, [onScroll, trackScroll]);
  const Rail = onScroll ? Animated.FlatList : FlatList;

  return (
    <Rail
      ref={listRef}
      horizontal
      data={cards}
      keyExtractor={(card) => String(card.id)}
      showsHorizontalScrollIndicator={false}
      onScroll={onScroll || trackScroll}
      scrollEventThrottle={16}
      onTouchStart={stop}
      onScrollBeginDrag={stop}
      onMomentumScrollEnd={settle}
      snapToOffsets={stops}
      snapToStart
      snapToEnd
      decelerationRate="fast"
      disableIntervalMomentum
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
