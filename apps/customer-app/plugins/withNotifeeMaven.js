/**
 * Expo config plugin: expose Notifee's local Maven repo so Gradle can resolve
 * `app.notifee:core:+` from node_modules/@notifee/react-native/android/libs.
 *
 * Notifee's own build.gradle tries to register this via rootProject.allprojects,
 * but with modern RN/Expo Gradle setups that registration runs too late (or is
 * ignored), and the build fails with:
 *   Could not find any matches for app.notifee:core:+
 *
 * Mirrors the @rnmapbox/maps pattern of appending an allprojects { repositories }
 * block to android/build.gradle during prebuild.
 */
const {
  withProjectBuildGradle,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const PLUGIN_NAME = 'withNotifeeMaven';
const PLUGIN_VERSION = '1.0.0';
const TAG = '@notifee/react-native-maven';

const MAVEN_BLOCK = `
// @generated begin ${TAG} - expo prebuild (DO NOT MODIFY)
allprojects {
  repositories {
    // Local AAR for app.notifee:core (shipped inside @notifee/react-native)
    maven {
      url "\${rootDir}/../node_modules/@notifee/react-native/android/libs"
    }
  }
}
// @generated end ${TAG}
`;

function withNotifeeMaven(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        `[${PLUGIN_NAME}] Only groovy android/build.gradle is supported`
      );
    }
    const contents = cfg.modResults.contents;
    if (contents.includes(TAG)) {
      return cfg;
    }
    cfg.modResults.contents = `${contents.trimEnd()}\n${MAVEN_BLOCK}\n`;
    return cfg;
  });
}

module.exports = createRunOncePlugin(withNotifeeMaven, PLUGIN_NAME, PLUGIN_VERSION);
