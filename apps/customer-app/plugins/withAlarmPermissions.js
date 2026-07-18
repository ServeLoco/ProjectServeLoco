/**
 * Expo config plugin: Android permissions + notifee FGS special-use wiring
 * for shop/rider full-screen order alarms.
 *
 * - Declares USE_FULL_SCREEN_INTENT + FOREGROUND_SERVICE(+_SPECIAL_USE)
 * - Overrides notifee's ForegroundService to specialUse with a Play-required
 *   PROPERTY_SPECIAL_USE_FGS_SUBTYPE justification string
 * - Removes notifee BOOT_COMPLETED / QUICKBOOT receivers so the alarm FGS
 *   cannot be started from a boot broadcast (Android 15+ crash class)
 * - Strips expo-audio's AudioControlsService/AudioRecordingService (restricted
 *   mediaPlayback/microphone FGS types) and their permissions — this app only
 *   plays short static alarm clips via createAudioPlayer, never background
 *   media-session controls or recording, so the services are dead weight that
 *   Play's Android-15 scanner flags as BOOT_COMPLETED-reachable restricted FGS
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

// Unused expo-audio background services — restricted FGS types (mediaPlayback,
// microphone) under Android 15. Not started anywhere in this app's JS.
const EXPO_AUDIO_SERVICES = [
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
];

// Permissions expo-audio declares unconditionally for the services above.
const EXPO_AUDIO_UNUSED_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
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
    if (!app['meta-data']) app['meta-data'] = [];

    // @react-native-firebase/messaging ships default_notification_color=@color/white;
    // our app uses brand notification_icon_color. Prefer app values on merge.
    const FCM_META_REPLACE = [
      'com.google.firebase.messaging.default_notification_color',
      'com.google.firebase.messaging.default_notification_icon',
    ];
    for (const name of FCM_META_REPLACE) {
      const meta = (app['meta-data'] || []).find((m) => m.$?.['android:name'] === name);
      if (meta?.$) {
        meta.$['tools:replace'] = 'android:resource';
      }
    }

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

    // Strip expo-audio's restricted-FGS-type services (unused by this app).
    for (const name of EXPO_AUDIO_SERVICES) {
      app.service = (app.service || []).filter(
        (s) => s.$?.['android:name'] !== name
      );
      app.service.push({
        $: {
          'android:name': name,
          'tools:node': 'remove',
        },
      });
    }

    // Strip the permissions those services pulled in unconditionally.
    if (!androidManifest.manifest['uses-permission']) {
      androidManifest.manifest['uses-permission'] = [];
    }
    for (const name of EXPO_AUDIO_UNUSED_PERMISSIONS) {
      androidManifest.manifest['uses-permission'] =
        androidManifest.manifest['uses-permission'].filter(
          (p) => p.$?.['android:name'] !== name
        );
      androidManifest.manifest['uses-permission'].push({
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
