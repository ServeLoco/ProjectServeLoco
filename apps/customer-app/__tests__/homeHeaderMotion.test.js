import { Animated } from 'react-native';
import {
  createHomeHeaderTranslateY,
  createHomeModesTranslateY,
  homeModesPinStart,
  homeModesTopPin,
  homeSearchPushed,
} from '../src/screens/customer/HomeScreen/homeHeaderMotion';

describe('Home shop modes push search out and pin in its place', () => {
  const header = { topRowHeight: 70, pinnedHeight: 60, shopModesY: 500 };

  function searchAt(offset, measurements = header) {
    const scrollY = new Animated.Value(offset);
    return createHomeHeaderTranslateY(scrollY, measurements, homeModesPinStart(measurements)).__getValue();
  }

  function modesAt(offset, measurements = header) {
    const scrollY = new Animated.Value(offset);
    const pinStart = homeModesPinStart(measurements);
    return createHomeModesTranslateY(scrollY, homeModesTopPin(pinStart, measurements.pinnedHeight)).__getValue();
  }

  it('scrolls the location away, then keeps search pinned until the modes reach it', () => {
    expect(searchAt(-30)).toBe(0);
    expect(searchAt(30)).toBe(-30);
    expect(searchAt(70)).toBe(-70);
    expect(searchAt(440)).toBe(-70);
  });

  it('lets the modes push search up and out, scroll for scroll', () => {
    expect(searchAt(470)).toBe(-100);
    expect(searchAt(500)).toBe(-130);
    expect(searchAt(5000)).toBe(-130);
  });

  it('keeps the modes touching the bottom of search while pushing, then pins them at the top', () => {
    expect(homeModesPinStart(header)).toBe(440);
    expect(homeModesTopPin(440, header.pinnedHeight)).toBe(500);
    expect(modesAt(0)).toBe(0);
    [440, 460, 500].forEach(offset => {
      const searchBottom = header.topRowHeight + header.pinnedHeight + searchAt(offset);
      const modesTop = header.shopModesY - offset + modesAt(offset);
      expect(modesTop).toBe(searchBottom);
    });
    [500, 900, 3000].forEach(offset => {
      expect(header.shopModesY - offset + modesAt(offset)).toBe(0);
    });
  });

  it('brings search back when scrolling back down', () => {
    const scrollY = new Animated.Value(900);
    const search = createHomeHeaderTranslateY(scrollY, header, 440);
    const modes = createHomeModesTranslateY(scrollY, homeModesTopPin(440, header.pinnedHeight));
    expect(search.__getValue()).toBe(-130);
    expect(modes.__getValue()).toBe(400);
    scrollY.setValue(470);
    expect(search.__getValue()).toBe(-100);
    expect(modes.__getValue()).toBe(0);
    scrollY.setValue(300);
    expect(search.__getValue()).toBe(-70);
    expect(modes.__getValue()).toBe(0);
  });

  it('works when the modes are already under search before the location row is gone', () => {
    const near = { ...header, shopModesY: 100 };
    expect(homeModesPinStart(near)).toBe(70);
    expect(searchAt(70, near)).toBe(-70);
    expect(searchAt(100, near)).toBe(-100);
    expect(searchAt(130, near)).toBe(-130);
    expect(modesAt(130, near)).toBe(0);
    expect(modesAt(200, near)).toBe(70);
  });

  it('says how far search is pushed, for taps on the moving row', () => {
    expect(homeSearchPushed(400, 440, 60)).toBe(0);
    expect(homeSearchPushed(470, 440, 60)).toBe(30);
    expect(homeSearchPushed(900, 440, 60)).toBe(60);
    expect(homeSearchPushed(900, null, 60)).toBe(0);
  });

  it('does not pin or push anything without measured shop modes', () => {
    const none = { ...header, shopModesY: null };
    expect(homeModesPinStart(none)).toBeNull();
    expect(homeModesTopPin(null, 60)).toBeNull();
    expect(modesAt(900, none)).toBe(0);
    expect(searchAt(900, none)).toBe(-70);
  });

  it('uses the measured search/dropdown height', () => {
    expect(homeModesPinStart({ ...header, pinnedHeight: 180 })).toBe(320);
  });
});
