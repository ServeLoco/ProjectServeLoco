function loadSurface({ platform = 'ios', hasModule = true, hasAPI = true, usesGlass = true } = {}) {
  jest.resetModules();
  const checkModule = jest.fn(() => hasModule ? {} : null);
  const loadGlass = jest.fn();
  jest.doMock('react-native', () => ({
    Platform: { OS: platform },
    View: 'FallbackView',
    StyleSheet: { create: (styles) => styles, absoluteFillObject: {}, hairlineWidth: 0.5 },
  }));
  jest.doMock('expo', () => ({ requireOptionalNativeModule: checkModule }));
  jest.doMock('expo-linear-gradient', () => ({ LinearGradient: 'Gradient' }));
  jest.doMock('expo-glass-effect', () => {
    loadGlass();
    return {
      GlassView: 'NativeGlass',
      isGlassEffectAPIAvailable: () => hasAPI,
      isLiquidGlassAvailable: () => usesGlass,
    };
  });
  const Surface = require('../src/components/navigation/TabBarGlass').default;
  return { Surface, checkModule, loadGlass };
}

describe('customer tab bar glass availability', () => {
  it('uses native Liquid Glass on supported iOS builds and keeps the tab children', () => {
    const { Surface } = loadSurface();
    const style = { height: 62, borderRadius: 31 };
    const element = Surface({ style, children: 'tabs' });
    expect(element.type).toBe('NativeGlass');
    expect(element.props).toMatchObject({
      glassEffectStyle: 'regular', colorScheme: 'light', isInteractive: true,
      style, children: 'tabs',
    });
  });

  it('does not load native view managers in an installed iOS binary without the new module', () => {
    const { Surface, loadGlass } = loadSurface({ hasModule: false });
    expect(Surface({ children: 'tabs' }).type).toBe('FallbackView');
    expect(loadGlass).not.toHaveBeenCalled();
  });

  it.each([
    { hasAPI: false },
    { usesGlass: false },
  ])('falls back when the runtime or compiled app cannot use Liquid Glass: %j', (capability) => {
    const { Surface } = loadSurface(capability);
    expect(Surface({ children: 'tabs' }).type).toBe('FallbackView');
  });

  it('does not request an iOS native module on Android', () => {
    const { Surface, checkModule, loadGlass } = loadSurface({ platform: 'android' });
    expect(Surface({ children: 'tabs' }).type).toBe('FallbackView');
    expect(checkModule).not.toHaveBeenCalled();
    expect(loadGlass).not.toHaveBeenCalled();
  });
});
