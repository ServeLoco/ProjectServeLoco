const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname);

// Metro's `resolver.blockList` accepts an array of RegExp directly. We pass the
// patterns inline instead of metro's `exclusionList` helper, whose internal
// path (metro-config/private/...) is not resolvable in the Expo SDK 54
// dependency tree and caused a MODULE_NOT_FOUND -> ESM import() crash on load.
config.resolver.blockList = [
  /node_modules\/.*\/android\/.*/,
  /node_modules\/.*\/ios\/.*/,
  /node_modules\/.*\/macos\/.*/,
  /node_modules\/.*\/windows\/.*/,
];

module.exports = config;
