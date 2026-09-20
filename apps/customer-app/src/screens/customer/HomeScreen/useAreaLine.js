import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

// Coordinates rounded to ~100 m — the same spot never hits the geocoder twice
// in one session.
const cache = new Map();

const cacheKey = (coords) => `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`;

// "Village or city, State, Pin code" (at most three parts) for a coordinate.
async function lookupAreaLine({ lat, lng }) {
  const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
  const place = places?.[0];
  if (!place) return null;
  const parts = [place.city || place.district || place.subregion, place.region, place.postalCode]
    .filter(Boolean)
    .filter((part, index, all) => all.indexOf(part) === index);
  return parts.slice(0, 3).join(', ') || null;
}

// Short area line for the delivery pin, shown under the zone name for
// customers without a saved address. Best effort — null while loading or if
// the lookup fails, so the line simply stays hidden.
export default function useAreaLine(coords, enabled) {
  const lat = coords?.lat;
  const lng = coords?.lng;
  const [line, setLine] = useState(null);

  useEffect(() => {
    if (!enabled || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLine(null);
      return undefined;
    }
    const key = cacheKey({ lat, lng });
    if (cache.has(key)) {
      setLine(cache.get(key));
      return undefined;
    }
    let cancelled = false;
    lookupAreaLine({ lat, lng })
      .then((result) => {
        cache.set(key, result);
        if (!cancelled) setLine(result);
      })
      .catch(() => {
        if (!cancelled) setLine(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, lat, lng]);

  return line;
}
