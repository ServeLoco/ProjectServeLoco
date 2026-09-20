const fs = require('fs');
const path = require('path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', 'src', ...parts), 'utf8');

describe('images reload themselves after a dropped connection', () => {
  it('retries with growing waits before giving up', () => {
    const src = read('components', 'ProductImage', 'RetryingImage.js');
    expect(src).toMatch(/RETRY_DELAYS_MS = \[1000, 2000, 4000, 8000, 15000, 15000\]/);
    expect(src).toMatch(/key=\{attempt\}/);
    expect(src).toMatch(/giveUpRef\.current\?\.\(\)/);
  });

  it('product and category images show the fallback right after a failure and swap in the real picture when a retry loads', () => {
    const src = read('components', 'ProductImage', 'ProductImage.js');
    expect(src).toMatch(/useImageRetry\(uri\)/);
    expect(src).toMatch(/const showFallback = !uri \|\| hadError \|\| failed;/);
    expect(src).toMatch(/const showImage = Boolean\(uri\) && !failed;/);
    expect(src).not.toMatch(/onError=\{\(\) => setError\(true\)\}/);
  });

  it('offer banners and mode icons use the retrying image too', () => {
    expect(read('screens', 'customer', 'HomeScreen', 'HomeScreen.js')).toMatch(/<RetryingImage[\s\S]{0,400}onGiveUp=/);
    expect(read('components', 'SegmentedControl', 'SegmentedControl.js')).toMatch(/<RetryingImage/);
  });
});
