import { Linking, Platform } from 'react-native';

const coordStr = (p) => `${p.latitude},${p.longitude}`;

/**
 * Open Google Maps navigation to `destination`, routed through `waypoints`
 * in order. No origin is passed — Google Maps uses the device's live
 * location, so it tracks/recenters the rider itself as they move. No Google
 * Maps API key involved: these are the public deep-link URL/intent forms.
 *
 * Deliberately skips Linking.canOpenURL() — on Android 11+ it needs the
 * target package declared under <queries> in AndroidManifest.xml or it
 * always reports false for a scheme this app never had allowlisted, which
 * silently no-ops the whole button. openURL() itself doesn't need that.
 *
 * Google's free deep links don't offer "auto-start turn-by-turn" AND
 * "multiple waypoint stops" together — that combo needs the paid Directions
 * API plus a custom nav UI. So: a single stop (no waypoints) uses Android's
 * google.navigation: intent, which drops straight into live guidance with
 * no preview tap; two or more stops falls back to the maps/dir/ URL, which
 * supports waypoints but always opens on Maps' route-preview screen (the
 * rider taps Start once inside Maps itself — that tap belongs to Google's
 * app, not something this link controls). iOS has no navigation: equivalent
 * at all, so it always gets the dir/ URL regardless of stop count.
 */
export async function openGoogleMapsDirections({ destination, waypoints = [] }) {
  if (!destination) return false;
  const stops = waypoints.filter(Boolean);

  if (Platform.OS === 'android' && stops.length === 0) {
    try {
      await Linking.openURL(`google.navigation:q=${coordStr(destination)}&mode=d`);
      return true;
    } catch (_) {
      // No Google Maps app to handle it — fall through to the web URL.
    }
  }

  const params = [`api=1`, `destination=${coordStr(destination)}`, `travelmode=driving`];
  if (stops.length > 0) {
    params.push(`waypoints=${stops.map(coordStr).join('|')}`);
  }
  const url = `https://www.google.com/maps/dir/?${params.join('&')}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch (err) {
    return false;
  }
}
