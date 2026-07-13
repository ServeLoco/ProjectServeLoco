import Mapbox from '@rnmapbox/maps';

/** Fatehabad, Haryana 125047 centroid (locked §4.5). */
export const DEFAULT_MAP_CENTER = {
  latitude: 29.5152,
  longitude: 75.4548,
};

const token =
  typeof process !== 'undefined' && process.env
    ? process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN
    : '';

export const mapboxAvailable = Boolean(token && String(token).trim());

if (mapboxAvailable) {
  Mapbox.setAccessToken(String(token).trim());
}

export { Mapbox };
export default Mapbox;
