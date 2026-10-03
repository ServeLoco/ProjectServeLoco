import React, { memo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ProductImage from '../ProductImage';
import AppIcon from '../AppIcon';
import { useDealCart } from '../../hooks/useDealCart';

// Same defaults as the API (offerCardController DEFAULT_STYLE), so a card
// still draws if a key is missing.
export const DEFAULT_CARD_STYLE = {
  bgColor: '#EDE7FF',
  bgColorEnd: '#FFFFFF',
  accentColor: '#6C3BF5',
  titleColor: '#1F1147',
  subtitleColor: '#4B4470',
  tabColor: '#5B2FD6',
  tabActiveColor: '#FFFFFF',
  tabTextColor: '#FFFFFF',
  buttonColor: '#2F6BFF',
  buttonText: 'Select',
  footerText: 'View items at all prices',
  rowsPerTab: 3,
};

export const cardStyleOf = (card) => ({ ...DEFAULT_CARD_STYLE, ...(card?.style || {}) });

const formatPrice = (value) => {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

function DealRow({ item, look, selected, onSelect }) {
  const unavailable = !item.available || item.shopIsOpen === false || item.shop_is_open === 0;
  const label = item.dealVariantLabel || item.unit || '';
  return (
    <View style={[styles.row, unavailable && styles.rowUnavailable]}>
      <ProductImage uri={item.thumbUrl || item.imageUrl} width={52} height={52} borderRadius={10} resizeMode="contain" style={styles.rowImage} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
        {label ? <Text style={styles.rowUnit} numberOfLines={1}>{label}</Text> : null}
      </View>
      <Pressable
        onPress={() => onSelect(item)}
        disabled={unavailable}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Remove ${item.name}` : `${look.buttonText} ${item.name} for ₹${formatPrice(item.dealPrice)}`}
        style={[
          styles.selectBtn,
          { borderColor: look.buttonColor },
          selected && { backgroundColor: look.buttonColor },
        ]}
      >
        {selected ? (
          <View style={styles.selectedInner}>
            <AppIcon name="check" size={13} color="#FFFFFF" />
            <Text style={[styles.selectText, { color: '#FFFFFF' }]}>Added</Text>
          </View>
        ) : (
          <Text style={[styles.selectText, { color: look.buttonColor }]}>{unavailable ? 'Sold out' : look.buttonText}</Text>
        )}
      </Pressable>
      <View style={styles.priceCol}>
        <Text style={styles.strike}>₹{formatPrice(item.regularPrice)}</Text>
        <Text style={styles.dealPrice}>₹{formatPrice(item.dealPrice)}</Text>
      </View>
    </View>
  );
}

/**
 * The ₹9 / ₹29 / ₹49 card: a tab per deal price, a few products per tab
 * with Select, and a link to the full Deal page. Every colour and label
 * comes from the card's admin-set style.
 */
function DealTabsCard({ card, width, onViewAll }) {
  const look = cardStyleOf(card);
  const tiers = card?.deal?.tiers || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const { progress, isSelected, toggle } = useDealCart(card?.deal);
  if (tiers.length === 0) return null;
  const tier = tiers[Math.min(activeIndex, tiers.length - 1)];
  const rows = tier.items.slice(0, Number(look.rowsPerTab) || 3);
  const minOrder = Number(card.deal.minOrder) || 0;

  return (
    <LinearGradient
      colors={[look.bgColor, look.bgColorEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.card, { width }]}
    >
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={[styles.title, { color: look.titleColor }]} numberOfLines={2}>{card.title}</Text>
          {card.subtitle ? (
            <Text style={[styles.subtitle, { color: look.subtitleColor }]} numberOfLines={2}>{card.subtitle}</Text>
          ) : null}
        </View>
        {card.imageUrl ? (
          <ProductImage uri={card.imageUrl} width={60} height={60} borderRadius={0} resizeMode="contain" fallback={null} style={styles.art} />
        ) : null}
      </View>

      {minOrder > 0 ? (
        <View style={styles.progressWrap} accessibilityLiveRegion="polite">
          <View style={[styles.progressTrack, { backgroundColor: `${look.accentColor}22` }]}>
            <View style={[styles.progressFill, { backgroundColor: look.accentColor, width: `${Math.round(progress.ratio * 100)}%` }]} />
          </View>
          <Text style={[styles.progressText, { color: look.accentColor }]} numberOfLines={1}>
            {progress.unlocked ? 'Unlocked! Pick your deal item' : `Shop for ₹${progress.amountRemaining} more to claim`}
          </Text>
        </View>
      ) : null}

      <View style={[styles.tabs, { backgroundColor: look.tabColor }]}>
        {tiers.map((t, index) => {
          const active = index === activeIndex;
          return (
            <Pressable
              key={t.price}
              onPress={() => setActiveIndex(index)}
              style={[styles.tab, active && { backgroundColor: look.tabActiveColor }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`₹${formatPrice(t.price)} items`}
            >
              <View style={[styles.chip, { backgroundColor: look.accentColor }]}>
                <Text style={styles.chipText}>₹{formatPrice(t.price)}</Text>
              </View>
              <Text style={[styles.tabText, { color: active ? look.titleColor : look.tabTextColor }]} numberOfLines={1}>Items</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        {rows.map((item) => (
          <DealRow key={`${item.id}:${item.dealVariantId || ''}`} item={item} look={look} selected={isSelected(item)} onSelect={toggle} />
        ))}
        <Pressable onPress={onViewAll} style={styles.footer} accessibilityRole="link" hitSlop={6}>
          <Text style={[styles.footerText, { color: look.accentColor }]}>{look.footerText}</Text>
          <AppIcon name="chevronRight" size={16} color={look.accentColor} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

export default memo(DealTabsCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingTop: 14, gap: 8, minHeight: 60 },
  headText: { flex: 1 },
  title: { fontSize: 19, lineHeight: 23, fontWeight: '800', letterSpacing: -0.2 },
  subtitle: { fontSize: 12.5, lineHeight: 17, marginTop: 3, fontWeight: '500' },
  art: { backgroundColor: 'transparent' },
  progressWrap: { paddingHorizontal: 14, marginTop: 8, gap: 4 },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  progressText: { fontSize: 12, fontWeight: '700' },
  tabs: { flexDirection: 'row', marginTop: 10, paddingTop: 6, paddingHorizontal: 6, gap: 4, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  chip: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  chipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  tabText: { fontSize: 13, fontWeight: '700' },
  body: { backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECECEC',
  },
  rowUnavailable: { opacity: 0.5 },
  rowImage: { backgroundColor: '#F6F6F8' },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 13.5, lineHeight: 17, fontWeight: '700', color: '#1F1F1F' },
  rowUnit: { fontSize: 12, color: '#8A8A8A', marginTop: 2 },
  selectBtn: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F2F6FF',
    minWidth: 70,
    alignItems: 'center',
  },
  selectedInner: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  selectText: { fontSize: 13, fontWeight: '800' },
  priceCol: { alignItems: 'flex-end', minWidth: 38 },
  strike: { fontSize: 12, color: '#9A9A9A', textDecorationLine: 'line-through' },
  dealPrice: { fontSize: 15, fontWeight: '800', color: '#1F1F1F' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 11 },
  footerText: { fontSize: 14, fontWeight: '800' },
});
