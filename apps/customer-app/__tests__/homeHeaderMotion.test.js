import { Animated } from 'react-native';
import {
  createHomeHeaderTranslateY,
  createHomeModesTranslateY,
  homeModesPinStart,
} from '../src/screens/customer/HomeScreen/homeHeaderMotion';

describe('Home pins search with the shop modes under it', () => {
  const header = { topRowHeight: 70, pinnedHeight: 60, shopModesY: 500 };

  function searchAt(offset, measurements = header) {
    const scrollY = new Animated.Value(offset);
    return createHomeHeaderTranslateY(scrollY, measurements).__getValue();
  }

  function modesAt(offset, measurements = header) {
    const scrollY = new Animated.Value(offset);
    return createHomeModesTranslateY(scrollY, homeModesPinStart(measurements)).__getValue();
  }

  it('scrolls the location away, then keeps search pinned for good', () => {
    expect(searchAt(-30)).toBe(0);
    expect(searchAt(30)).toBe(-30);
    expect(searchAt(70)).toBe(-70);
    expect(searchAt(440)).toBe(-70);
    expect(searchAt(5000)).toBe(-70);
  });

  it('pins the modes right under search once they reach it', () => {
    expect(homeModesPinStart(header)).toBe(440);
    expect(modesAt(0)).toBe(0);
    expect(modesAt(440)).toBe(0);
    [440, 500, 900, 3000].forEach(offset => {
      const searchBottom = header.topRowHeight + header.pinnedHeight + searchAt(offset);
      const modesTop = header.shopModesY - offset + modesAt(offset);
      expect(modesTop).toBe(searchBottom);
    });
  });

  it('lets the modes go back to their place when scrolling back down', () => {
    const scrollY = new Animated.Value(900);
    const translateY = createHomeModesTranslateY(scrollY, homeModesPinStart(header));
    expect(translateY.__getValue()).toBe(460);
    scrollY.setValue(470);
    expect(translateY.__getValue()).toBe(30);
    scrollY.setValue(300);
    expect(translateY.__getValue()).toBe(0);
  });

  it('does not pin anything without measured shop modes', () => {
    expect(homeModesPinStart({ ...header, shopModesY: null })).toBeNull();
    expect(modesAt(900, { ...header, shopModesY: null })).toBe(0);
  });

  it('uses the measured search/dropdown height and also works without offers', () => {
    expect(homeModesPinStart({ ...header, pinnedHeight: 180 })).toBe(320);
    expect(homeModesPinStart({ ...header, shopModesY: 100 })).toBe(70);
  });
});
