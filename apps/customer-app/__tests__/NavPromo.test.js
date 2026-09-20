import { normalizeSettings } from '../src/utils/apiMappers';

const fs = require('fs');
const path = require('path');

const navSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'navigation', 'CustomerNavigator.js'), 'utf8');

describe('nav-bar image from the admin', () => {
  it('reads the image URL and link from the settings response, either casing', () => {
    const snake = normalizeSettings({ nav_promo_image_url: 'https://cdn.example.com/a.webp', nav_promo_link: 'https://example.com/x' });
    expect(snake.navPromoImageUrl).toBe('https://cdn.example.com/a.webp');
    expect(snake.navPromoLink).toBe('https://example.com/x');

    const camel = normalizeSettings({ navPromoImageUrl: 'https://cdn.example.com/b.webp', navPromoLink: 'https://example.com/y' });
    expect(camel.navPromoImageUrl).toBe('https://cdn.example.com/b.webp');
    expect(camel.navPromoLink).toBe('https://example.com/y');
  });

  it('is empty (nothing shown) when the server sends no image or link', () => {
    const empty = normalizeSettings({});
    expect(empty.navPromoImageUrl).toBeNull();
    expect(empty.navPromoLink).toBeNull();
    expect(normalizeSettings({ nav_promo_image_url: null, nav_promo_link: '' }).navPromoLink).toBeNull();
  });

  it('shows nothing without an image, has no background, and opens only http(s) links', () => {
    expect(navSource).toMatch(/if \(!imageUrl\) return null;/);
    expect(navSource).toMatch(/\/\^https\?:\\\/\\\//);
    expect(navSource).toMatch(/Linking\.openURL\(link\)/);
    const navPromoStyle = navSource.slice(navSource.indexOf('navPromo: {'), navSource.indexOf('navPromoImage: {'));
    expect(navPromoStyle).toMatch(/height: TAB_CONTENT_HEIGHT/);
    expect(navPromoStyle).not.toMatch(/backgroundColor/);
  });

  it('sits in the space right of the nav pill, fitted (never cropped) into it', () => {
    expect(navSource).toMatch(/<NavPromo \/>/);
    expect(navSource).toMatch(/contentFit="contain"/);
    expect(navSource).toMatch(/flexDirection: 'row'/);
  });
});
