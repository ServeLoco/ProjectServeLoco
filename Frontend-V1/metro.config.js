const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/private/defaults/exclusionList').default;

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname);

config.resolver.blockList = exclusionList([
  /node_modules\/.*\/android\/.*/,
  /node_modules\/.*\/ios\/.*/,
  /node_modules\/.*\/macos\/.*/,
  /node_modules\/.*\/windows\/.*/,
]);

module.exports = config;
