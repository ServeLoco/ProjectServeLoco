import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Avoid loading native view managers in installed binaries that predate glass.
let NativeGlassView = null;
if (Platform.OS === 'ios' && requireOptionalNativeModule('ExpoGlassEffect')) {
  const { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } = require('expo-glass-effect');
  if (isGlassEffectAPIAvailable() && isLiquidGlassAvailable()) NativeGlassView = GlassView;
}

export default NativeGlassView;
