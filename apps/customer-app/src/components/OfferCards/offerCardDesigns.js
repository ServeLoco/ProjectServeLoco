import DealTabsCard, { cardStyleOf } from './DealTabsCard';

/**
 * Every offer card design (type) the app can draw, by the card's `design`.
 * All types share the same frame on Home — the scrolling row, the card
 * width, and the Common area taking the colour of the card in view — only
 * the content and layout inside the card differ. A new type is one entry:
 *
 *   Component  draws the card: ({ card, width, onViewAll })
 *   canDraw    whether this card has what it needs to draw
 *   colorOf    the card's main colour (the Common area gets a light shade)
 *   viewAll    where its "view all" goes: { name, params }, or null
 *
 * A card whose design is not listed here (from a newer admin) is skipped.
 */
export const OFFER_CARD_DESIGNS = {
  deal_tabs: {
    Component: DealTabsCard,
    canDraw: (card) => Boolean(card.deal?.tiers?.length),
    colorOf: (card) => cardStyleOf(card).tabColor,
    viewAll: (card) => ({ name: 'Deal', params: { couponId: card.dealId, card } }),
  },
};

export const offerCardDesignOf = (card) => OFFER_CARD_DESIGNS[card?.design] || null;

/** The cards of an offer cards section that this app can draw. */
export const drawableOfferCards = (section) =>
  (section?.items || []).filter((card) => {
    const design = offerCardDesignOf(card);
    return Boolean(design && design.canDraw(card));
  });

/** A card's main colour, or null. */
export const offerCardColorOf = (card) => offerCardDesignOf(card)?.colorOf(card) || null;
