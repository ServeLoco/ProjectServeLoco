// Pure scoring for cart "Add more" suggestions — no DB, no I/O, so the
// nightly build (buildPairs.js) stays a thin shell of queries around this.
//
// Inputs are recency-WEIGHTED counts (an order from today counts 1, one from
// two months ago about 0.37), so habits that faded stop dominating.

// Pairs seen together fewer times than this are noise, not a habit.
const MIN_CO_COUNT = 2;
// Matches kept per product. The cart reads a handful per cart line, so 20
// leaves room for filtering (in cart, unavailable, closed shop) to still
// return 5.
const TOP_PER_PRODUCT = 20;
// Shrinks confidence for rarely-ordered products: 2-of-2 orders is weaker
// evidence than 40-of-60.
const CONFIDENCE_PRIOR = 5;
// Lift beyond this adds nothing — one freak pair of two rare items must not
// outrank a real everyday habit.
const LIFT_CAP = 10;
// A borrowed ("similar") match counts for less than a product's own history.
const SIMILAR_DISCOUNT = 0.8;
// Name similarity below this is too loose to borrow matches from.
const MIN_NAME_SIMILARITY = 0.2;

/**
 * Score every (A → B) pair.
 *
 * confidence = how often B comes with A          ≈ P(B | A)
 * lift       = how much more than B's usual rate ≈ P(B | A) / P(B)
 * score      = confidence × log2(lift), only when lift > 1
 *
 * Confidence alone makes the most popular item (say, water) the top match
 * for everything; lift alone rewards two rare items bought together once.
 * The product ranks real "goes with" habits first, and a pair bought
 * together no more often than chance (lift ≤ 1) is not a pairing at all —
 * plain popularity is the read path's top-sellers fallback, not this.
 *
 * @param {object} args
 * @param {Array<{productId:number, pairedId:number, coCount:number, weighted:number}>} args.pairRows
 * @param {Map<number, number>} args.itemWeights  weighted order count per item
 * @param {number} args.totalWeight               weighted count of all orders
 * @returns {Map<number, Array<{pairedId:number, score:number, coCount:number}>>}
 *          top matches per item, best first
 */
const scorePairs = ({ pairRows, itemWeights, totalWeight }) => {
  const byItem = new Map();
  if (!(totalWeight > 0)) return byItem;

  for (const row of pairRows) {
    if (row.coCount < MIN_CO_COUNT) continue;
    const weightA = itemWeights.get(row.productId);
    const weightB = itemWeights.get(row.pairedId);
    if (!(weightA > 0) || !(weightB > 0)) continue;

    const confidence = row.weighted / (weightA + CONFIDENCE_PRIOR);
    const lift = Math.min((row.weighted / weightA) / (weightB / totalWeight), LIFT_CAP);
    const score = confidence * Math.log2(lift);
    if (!(score > 0)) continue;

    if (!byItem.has(row.productId)) byItem.set(row.productId, []);
    byItem.get(row.productId).push({ pairedId: row.pairedId, score, coCount: row.coCount });
  }

  for (const [id, list] of byItem) {
    list.sort((a, b) => b.score - a.score || a.pairedId - b.pairedId);
    byItem.set(id, list.slice(0, TOP_PER_PRODUCT));
  }
  return byItem;
};

/** "Veg Cheese Burger (Large)" → Set{veg, cheese, burger, large} */
const tokenize = (name) => new Set(
  String(name || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2)
);

/** Shared words ÷ all words (Jaccard). 0 = nothing in common, 1 = same words. */
const nameSimilarity = (tokensA, tokensB) => {
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const token of tokensA) if (tokensB.has(token)) shared += 1;
  return shared / (tokensA.size + tokensB.size - shared);
};

/**
 * Cold start: a product with no order history borrows the matches of the
 * most similar-named product that has some. "Cheese Burger" borrows from
 * "Aloo Tikki Burger". Same category breaks ties (and adds a small bonus),
 * so "Paneer Tikka" (starter) prefers another starter over "Paneer Butter
 * Masala". Learned from the catalogue itself — no word list.
 *
 * @param {Array<{id:number, name:string, categoryId:number}>} products  area catalogue
 * @param {Map<number, Array<{pairedId:number, score:number, coCount:number}>>} learned
 * @returns {Map<number, Array<{pairedId:number, score:number, coCount:number}>>}
 *          borrowed matches for products that had none
 */
const borrowFromSimilar = (products, learned) => {
  const borrowed = new Map();
  const donors = products
    .filter((p) => learned.has(p.id))
    .map((p) => ({ ...p, tokens: tokenize(p.name) }));
  if (donors.length === 0) return borrowed;

  for (const product of products) {
    if (learned.has(product.id)) continue;
    const tokens = tokenize(product.name);
    let best = null;
    let bestSimilarity = 0;
    for (const donor of donors) {
      let similarity = nameSimilarity(tokens, donor.tokens);
      if (similarity === 0) continue;
      if (donor.categoryId === product.categoryId) similarity += 0.1;
      if (similarity > bestSimilarity) {
        best = donor;
        bestSimilarity = similarity;
      }
    }
    if (!best || bestSimilarity < MIN_NAME_SIMILARITY) continue;

    const matches = learned.get(best.id)
      .filter((match) => match.pairedId !== product.id)
      .map((match) => ({
        pairedId: match.pairedId,
        score: match.score * Math.min(bestSimilarity, 1) * SIMILAR_DISCOUNT,
        coCount: 0,
      }));
    if (matches.length > 0) borrowed.set(product.id, matches);
  }
  return borrowed;
};

// Feedback from the cart row itself. A product added from the row more often
// than the area's average gets lifted, one shown a lot and never added sinks.
// FEEDBACK_PRIOR pseudo-impressions at the average rate keep a product seen
// only a few times near 1×, and the factor stays within [MIN, MAX] so
// feedback reorders matches but never erases what orders taught.
const FEEDBACK_PRIOR = 20;
const FEEDBACK_MIN = 0.5;
const FEEDBACK_MAX = 2;

/**
 * @param {Map<number, {shown:number, added:number}>} stats  per suggested product
 * @returns {Map<number, number>} score multiplier per product (absent = 1)
 */
const feedbackFactors = (stats) => {
  const factors = new Map();
  let shown = 0;
  let added = 0;
  for (const s of stats.values()) {
    shown += s.shown;
    added += s.added;
  }
  if (shown === 0) return factors;
  const baseRate = (added + 1) / (shown + 10);

  for (const [productId, s] of stats) {
    if (s.shown === 0) continue;
    const rate = (s.added + baseRate * FEEDBACK_PRIOR) / (s.shown + FEEDBACK_PRIOR);
    factors.set(productId, Math.min(Math.max(rate / baseRate, FEEDBACK_MIN), FEEDBACK_MAX));
  }
  return factors;
};

/** Multiply each match by its product's feedback factor and re-rank. */
const applyFeedback = (matchesByItem, factors) => {
  if (factors.size === 0) return matchesByItem;
  const adjusted = new Map();
  for (const [itemId, matches] of matchesByItem) {
    adjusted.set(itemId, matches
      .map((match) => ({ ...match, score: match.score * (factors.get(match.pairedId) || 1) }))
      .sort((a, b) => b.score - a.score || a.pairedId - b.pairedId));
  }
  return adjusted;
};

module.exports = {
  scorePairs,
  borrowFromSimilar,
  feedbackFactors,
  applyFeedback,
  tokenize,
  nameSimilarity,
  MIN_CO_COUNT,
  TOP_PER_PRODUCT,
};
