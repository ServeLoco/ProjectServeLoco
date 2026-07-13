const { get, set, bust, clearAll } = require('../src/utils/microCache');

describe('microCache', () => {
  beforeEach(() => {
    clearAll();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('set/get roundtrip', () => {
    set('dashboard:a', { ok: 1 }, 30_000);
    expect(get('dashboard:a')).toEqual({ ok: 1 });
  });

  it('ttl expiry', () => {
    set('dashboard:a', 1, 1000);
    expect(get('dashboard:a')).toBe(1);
    jest.advanceTimersByTime(1001);
    expect(get('dashboard:a')).toBeUndefined();
  });

  it('bust-by-prefix', () => {
    set('dashboard:a', 1, 30_000);
    set('dashboard:b', 2, 30_000);
    set('categories:x', 3, 30_000);
    bust('dashboard');
    expect(get('dashboard:a')).toBeUndefined();
    expect(get('dashboard:b')).toBeUndefined();
    expect(get('categories:x')).toBe(3);
  });

  it('evicts oldest when exceeding 100', () => {
    for (let i = 0; i < 100; i += 1) {
      set(`k:${i}`, i, 60_000);
    }
    expect(get('k:0')).toBe(0);
    set('k:100', 100, 60_000);
    expect(get('k:0')).toBeUndefined();
    expect(get('k:100')).toBe(100);
  });
});

describe('microCache mutation bust (integration-style)', () => {
  beforeEach(() => {
    clearAll();
    jest.useRealTimers();
  });

  it('category create path busts categories prefix', () => {
    // Simulate what controllers do after a mutation.
    set('categories:public:fast_food', { data: [] }, 30_000);
    set('dashboard:fast_food:closed=1', { data: { sections: [] } }, 30_000);
    bust('categories');
    bust('dashboard');
    expect(get('categories:public:fast_food')).toBeUndefined();
    expect(get('dashboard:fast_food:closed=1')).toBeUndefined();
  });
});
