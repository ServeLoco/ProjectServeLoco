const {
  scorePairs,
  borrowFromSimilar,
  feedbackFactors,
  applyFeedback,
  tokenize,
  nameSimilarity,
  TOP_PER_PRODUCT,
} = require('../src/services/suggestions/scorePairs');

describe('scorePairs', () => {
  // 100 orders. Burger (1) in 30, Coke (2) in 60, Fries (3) in 10,
  // Water (4) in 90 — water is everywhere, so it is not a real "goes with".
  const itemWeights = new Map([[1, 30], [2, 60], [3, 10], [4, 90]]);
  const totalWeight = 100;

  it('keeps a real pairing and drops an item that is merely popular', () => {
    const result = scorePairs({
      pairRows: [
        { productId: 1, pairedId: 3, coCount: 9, weighted: 9 },   // fries: 9 of 10 fries orders had a burger
        { productId: 1, pairedId: 4, coCount: 27, weighted: 27 }, // water: in 90% of ALL orders anyway
      ],
      itemWeights,
      totalWeight,
    });
    // Water came with burgers exactly as often as with anything (lift 1).
    expect(result.get(1).map((m) => m.pairedId)).toEqual([3]);
  });

  it('drops pairs seen together fewer than 2 times', () => {
    const result = scorePairs({
      pairRows: [{ productId: 1, pairedId: 2, coCount: 1, weighted: 1 }],
      itemWeights,
      totalWeight,
    });
    expect(result.has(1)).toBe(false);
  });

  it('keeps at most TOP_PER_PRODUCT matches per product', () => {
    const weights = new Map([[1, 50]]);
    const pairRows = [];
    for (let id = 2; id < 2 + TOP_PER_PRODUCT + 10; id += 1) {
      weights.set(id, 10);
      pairRows.push({ productId: 1, pairedId: id, coCount: 8, weighted: 8 + id / 100 });
    }
    const result = scorePairs({ pairRows, itemWeights: weights, totalWeight: 100 });
    expect(result.get(1)).toHaveLength(TOP_PER_PRODUCT);
    const scores = result.get(1).map((m) => m.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('returns nothing when there are no orders', () => {
    expect(scorePairs({ pairRows: [], itemWeights: new Map(), totalWeight: 0 }).size).toBe(0);
  });
});

describe('name similarity', () => {
  it('splits a product name into lowercase words', () => {
    expect([...tokenize('Veg Cheese-Burger (Large)')]).toEqual(['veg', 'cheese', 'burger', 'large']);
  });

  it('scores shared words', () => {
    expect(nameSimilarity(tokenize('Cheese Burger'), tokenize('Aloo Tikki Burger'))).toBeCloseTo(1 / 4);
    expect(nameSimilarity(tokenize('Cheese Burger'), tokenize('Masala Dosa'))).toBe(0);
  });
});

describe('borrowFromSimilar (new products)', () => {
  const learned = new Map([
    [10, [{ pairedId: 20, score: 1, coCount: 5 }, { pairedId: 11, score: 0.5, coCount: 3 }]], // Aloo Tikki Burger → Coke, Cheese Burger
    [30, [{ pairedId: 31, score: 1, coCount: 5 }]], // Matar Paneer → Tandoori Roti
  ]);
  const catalogue = [
    { id: 10, name: 'Aloo Tikki Burger', categoryId: 1 },
    { id: 11, name: 'Cheese Burger', categoryId: 1 },
    { id: 30, name: 'Matar Paneer', categoryId: 2 },
    { id: 40, name: 'Kadai Paneer', categoryId: 2 },
    { id: 50, name: 'Chef Special', categoryId: 3 },
  ];

  it('gives a new product the matches of the closest-named product', () => {
    const borrowed = borrowFromSimilar(catalogue, learned);
    // Cheese Burger borrows Aloo Tikki Burger's matches, minus itself.
    expect(borrowed.get(11).map((m) => m.pairedId)).toEqual([20]);
    expect(borrowed.get(40).map((m) => m.pairedId)).toEqual([31]);
    expect(borrowed.get(11)[0].score).toBeLessThan(1);
    expect(borrowed.get(11)[0].coCount).toBe(0);
  });

  it('borrows nothing when no name is close', () => {
    expect(borrowFromSimilar(catalogue, learned).has(50)).toBe(false);
  });

  it('never overwrites a product that has its own history', () => {
    const borrowed = borrowFromSimilar(catalogue, learned);
    expect(borrowed.has(10)).toBe(false);
    expect(borrowed.has(30)).toBe(false);
  });
});

describe('feedback from the cart row', () => {
  it('lifts products people add from the row and sinks ones they skip', () => {
    const factors = feedbackFactors(new Map([
      [1, { shown: 200, added: 40 }], // added 20% of the time
      [2, { shown: 200, added: 0 }],  // never added
      [3, { shown: 200, added: 10 }], // about average
    ]));
    expect(factors.get(1)).toBeGreaterThan(1.5);
    expect(factors.get(2)).toBe(0.5);
    expect(factors.get(3)).toBeCloseTo(1, 0);
  });

  it('barely moves a product that was shown only a few times', () => {
    const factors = feedbackFactors(new Map([
      [1, { shown: 500, added: 25 }],
      [2, { shown: 2, added: 0 }],
    ]));
    expect(factors.get(2)).toBeGreaterThan(0.85);
  });

  it('has no effect before anything was shown', () => {
    expect(feedbackFactors(new Map()).size).toBe(0);
  });

  it('re-ranks matches by the feedback factor', () => {
    const matches = new Map([[10, [
      { pairedId: 1, score: 1, coCount: 5 },
      { pairedId: 2, score: 0.8, coCount: 5 },
    ]]]);
    const adjusted = applyFeedback(matches, new Map([[1, 0.5], [2, 1.5]]));
    expect(adjusted.get(10).map((m) => m.pairedId)).toEqual([2, 1]);
  });
});
