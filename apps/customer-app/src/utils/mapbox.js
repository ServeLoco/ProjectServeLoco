import Mapbox, { Logger as MapboxLogger } from '@rnmapbox/maps';

/** Default checkout map center (updated 2026-07-13). */
export const DEFAULT_MAP_CENTER = {
  latitude: 29.452142,
  longitude: 75.671967,
};

const token =
  typeof process !== 'undefined' && process.env
    ? process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN
    : '';

export const mapboxAvailable = Boolean(token && String(token).trim());
export const mapboxAccessToken = mapboxAvailable ? String(token).trim() : '';

if (mapboxAvailable) {
  Mapbox.setAccessToken(String(token).trim());
}

// Swallow one specific piece of teardown noise.
//
// Every child of a MapView (camera, shape sources, line layers, markers) is
// addressed natively by view tag. When a map unmounts — a rider offer sheet
// closing, a screen popping — the children's pending native commands can
// outlive the view they point at, and rnmapbox logs
// "ViewTagResolver | view: N but is null (timeout or resolve)" once per child.
// It fires at error level, so in dev it raises a LogBox over the app for what
// is an unmount that already happened and that nothing can act on. Anything
// else Mapbox reports still goes through untouched.
MapboxLogger.setLogCallback((log) => (
  typeof log?.message === 'string' && log.message.includes('ViewTagResolver')
));

export { Mapbox };
export default Mapbox;
