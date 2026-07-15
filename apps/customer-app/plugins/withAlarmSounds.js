/**
 * Expo config plugin: copy custom alarm WAV files into android res/raw/ on
 * every `expo prebuild` so a future `--clean` does not silently drop them.
 *
 * Android notification channel `sound` names (without extension) must match
 * the basenames of these files under res/raw/.
 */
const {
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SOUND_FILES = ['order_alarm.wav', 'rider_alarm.wav'];
const PLUGIN_NAME = 'withAlarmSounds';
const PLUGIN_VERSION = '1.0.0';

function withAlarmSounds(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const srcDir = path.join(projectRoot, 'assets', 'sounds');
      const destDir = path.join(platformRoot, 'app', 'src', 'main', 'res', 'raw');

      fs.mkdirSync(destDir, { recursive: true });

      for (const file of SOUND_FILES) {
        const src = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        if (!fs.existsSync(src)) {
          throw new Error(
            `[${PLUGIN_NAME}] missing sound asset: ${src}. Place ${file} under assets/sounds/.`
          );
        }
        fs.copyFileSync(src, dest);
      }

      return cfg;
    },
  ]);
}

module.exports = createRunOncePlugin(withAlarmSounds, PLUGIN_NAME, PLUGIN_VERSION);
