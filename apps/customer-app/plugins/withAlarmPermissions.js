/**
 * Expo config plugin: Android permissions + notifee FGS special-use wiring
 * for shop/rider full-screen order alarms.
 *
 * - Declares USE_FULL_SCREEN_INTENT + FOREGROUND_SERVICE(+_SPECIAL_USE)
 * - Overrides notifee's ForegroundService to specialUse with a Play-required
 *   PROPERTY_SPECIAL_USE_FGS_SUBTYPE justification string
 * - Removes notifee BOOT_COMPLETED / QUICKBOOT receivers so the alarm FGS
 *   cannot be started from a boot broadcast (Android 15+ crash class)
 */
const {
  withAndroidManifest,
  AndroidConfig,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const PLUGIN_NAME = 'withAlarmPermissions';
const PLUGIN_VERSION = '1.0.0';

const PERMISSIONS = [
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
];

const SPECIAL_USE_JUSTIFICATION =
  'Critical shop-owner and rider order/offer alerts that must ring over the lock screen until accepted, rejected, or timed out — time-sensitive delivery partner alerts equivalent to an incoming call.';

const NOTIFEE_BOOT_RECEIVERS = [
  'app.notifee.core.RebootBroadcastReceiver',
  'app.notifee.core.NotificationAlarmReceiver',
];

function ensureToolsNamespace(manifest) {
  if (!manifest.$) manifest.$ = {};
  if (!manifest.$['xmlns:tools']) {
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  }
}

function ensurePermission(androidManifest, name) {
  AndroidConfig.Permissions.ensurePermissions(androidManifest, [name]);
}

function withAlarmPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const androidManifest = cfg.modResults;
    ensureToolsNamespace(androidManifest.manifest);

    for (const perm of PERMISSIONS) {
      ensurePermission(androidManifest, perm);
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
    if (!app.service) app.service = [];
    if (!app.receiver) app.receiver = [];

    // Override notifee ForegroundService → specialUse + justification property.
    // tools:replace so our type wins over the AAR's shortService declaration.
    const existingIdx = app.service.findIndex(
      (s) => s.$?.['android:name'] === 'app.notifee.core.ForegroundService'
    );
    const fgsService = {
      $: {
        'android:name': 'app.notifee.core.ForegroundService',
        'android:exported': 'false',
        'android:foregroundServiceType': 'specialUse',
        'tools:replace': 'android:foregroundServiceType',
      },
      property: [
        {
          $: {
            'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
            'android:value': SPECIAL_USE_JUSTIFICATION,
          },
        },
      ],
    };
    if (existingIdx >= 0) {
      app.service[existingIdx] = fgsService;
    } else {
      app.service.push(fgsService);
    }

    // Strip notifee boot receivers (prevent FGS start from BOOT_COMPLETED).
    for (const name of NOTIFEE_BOOT_RECEIVERS) {
      // Remove any existing entry first, then add a tools:node="remove" marker
      // so the merge also drops the AAR-declared receiver.
      app.receiver = (app.receiver || []).filter(
        (r) => r.$?.['android:name'] !== name
      );
      app.receiver.push({
        $: {
          'android:name': name,
          'tools:node': 'remove',
        },
      });
    }

    return cfg;
  });
}

module.exports = createRunOncePlugin(
  withAlarmPermissions,
  PLUGIN_NAME,
  PLUGIN_VERSION
);
