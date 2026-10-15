const config = require('../config/env');
const logger = require('../utils/logger');
const { istDateKey } = require('../utils/businessTime');

// Google Maps Platform calls for the app (routes/mapsRoutes.js). They go
// through the server rather than straight from the phone so the key never
// ships in the app, and so one place can cap the daily spend.
//
// Billing (India pricing, Oct 2026): a two-wheeler route is Compute Routes
// Enterprise, 7,000 free a month. Places Autocomplete with a session token
// that ends in a Place Details call is free; the details call is Place
// Details Essentials (70,000 free) as long as the field mask stays on
// Essentials fields — `displayName` would make it Pro, so the name shown to
// the customer comes from the autocomplete suggestion instead.

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places/';

const REQUEST_TIMEOUT_MS = 8000;
// Same bias the Mapbox search used: India only, nearby matches first.
const AUTOCOMPLETE_BIAS_RADIUS_M = 50000;

const ROUTE_FIELDS = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.geoJsonLinestring',
];
const STEP_FIELDS = [
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.navigationInstruction',
];

class MapsError extends Error {
  constructor(message, { status, code }) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Calls made today, per kind, keyed by IST date. In memory: one API process,
// and a restart resetting the count early is harmless next to a monthly bill.
const usage = { day: null, route: 0, places: 0 };

const DAILY_CAPS = {
  route: () => config.GOOGLE_MAPS_DAILY_ROUTE_CAP,
  places: () => config.GOOGLE_MAPS_DAILY_PLACES_CAP,
};

function takeQuota(kind) {
  const today = istDateKey();
  if (usage.day !== today) {
    usage.day = today;
    usage.route = 0;
    usage.places = 0;
  }
  const cap = DAILY_CAPS[kind]();
  if (usage[kind] >= cap) {
    if (usage[kind] === cap) {
      logger.warn(`Google Maps daily ${kind} cap (${cap}) reached; refusing until IST midnight`);
      usage[kind] += 1; // log once, not on every refused call
    }
    throw new MapsError('Map service is busy. Try again later.', { status: 429, code: 'MAPS_DAILY_LIMIT' });
  }
  usage[kind] += 1;
}

function requireKey() {
  if (!config.GOOGLE_MAPS_SERVER_KEY) {
    throw new MapsError('Maps are not configured.', { status: 503, code: 'MAPS_NOT_CONFIGURED' });
  }
  return config.GOOGLE_MAPS_SERVER_KEY;
}

async function callGoogle(url, { method = 'GET', fieldMask, body }) {
  const headers = { 'X-Goog-Api-Key': requireKey() };
  if (fieldMask) headers['X-Goog-FieldMask'] = fieldMask;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logger.warn(`Google Maps request failed: ${error.message}`);
    throw new MapsError('Map service is not reachable.', { status: 502, code: 'MAPS_UPSTREAM' });
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    logger.warn(`Google Maps ${res.status}: ${payload?.error?.message || 'no body'}`);
    throw new MapsError('Map service returned an error.', { status: 502, code: 'MAPS_UPSTREAM' });
  }
  return payload || {};
}

const toLatLng = ({ lat, lng }) => ({ location: { latLng: { latitude: lat, longitude: lng } } });
const pointOf = (latLng) => [Number(latLng?.longitude), Number(latLng?.latitude)];

/** "123s" → 123 */
function parseDurationSeconds(value) {
  const n = parseFloat(String(value || '').replace(/s$/, ''));
  return Number.isFinite(n) ? n : null;
}

function mapRoute(route, withSteps) {
  const coordinates = route?.polyline?.geoJsonLinestring?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const result = {
    coordinates,
    distanceMeters: Number.isFinite(route.distanceMeters) ? route.distanceMeters : null,
    durationSeconds: parseDurationSeconds(route.duration),
  };
  if (withSteps) {
    result.steps = (route.legs || []).flatMap((leg) => (leg?.steps || [])
      .filter((step) => step?.startLocation?.latLng)
      .map((step) => ({
        instruction: step.navigationInstruction?.instructions || 'Continue',
        maneuver: step.navigationInstruction?.maneuver || null,
        distanceMeters: Number.isFinite(step.distanceMeters) ? step.distanceMeters : 0,
        location: pointOf(step.startLocation.latLng),
      })));
  }
  return result;
}

/**
 * A two-wheeler route through `stops` in order (first = start, last = end).
 * Coordinates come back GeoJSON-ordered ([lng, lat]), the shape the app's
 * route-drawing code already uses.
 *
 * @param {{ stops: Array<{lat:number,lng:number}>, steps?: boolean }} opts
 */
async function computeRoute({ stops, steps = false }) {
  requireKey();

  const fields = steps ? [...ROUTE_FIELDS, ...STEP_FIELDS] : ROUTE_FIELDS;
  // Two-wheeler first (riders are on bikes). Google marks it beta and can
  // come back empty where it has no two-wheeler data; a car route then is
  // better than no line at all.
  for (const travelMode of ['TWO_WHEELER', 'DRIVE']) {
    takeQuota('route');
    const payload = await callGoogle(ROUTES_URL, {
      method: 'POST',
      fieldMask: fields.join(','),
      body: {
        origin: toLatLng(stops[0]),
        destination: toLatLng(stops[stops.length - 1]),
        intermediates: stops.slice(1, -1).map(toLatLng),
        travelMode,
        polylineEncoding: 'GEO_JSON_LINESTRING',
        languageCode: 'en-IN',
        units: 'METRIC',
      },
    });
    const route = mapRoute(payload.routes?.[0], steps);
    if (route) return route;
  }
  throw new MapsError('No route found.', { status: 404, code: 'MAPS_NO_ROUTE' });
}

/**
 * Place suggestions for a typed village/town/area name, India only, biased
 * toward `near`. No coordinates — the app fetches them with placeDetails()
 * once the customer picks one, under the same session token.
 */
async function autocomplete({ input, sessionToken, near }) {
  requireKey();
  takeQuota('places');

  const body = {
    input,
    sessionToken,
    includedRegionCodes: ['in'],
    languageCode: 'en',
  };
  if (near) {
    body.locationBias = {
      circle: {
        center: { latitude: near.lat, longitude: near.lng },
        radius: AUTOCOMPLETE_BIAS_RADIUS_M,
      },
    };
  }

  const payload = await callGoogle(AUTOCOMPLETE_URL, { method: 'POST', body });
  return (payload.suggestions || [])
    .map((s) => s?.placePrediction)
    .filter((p) => p?.placeId)
    .map((p) => ({
      id: p.placeId,
      name: p.structuredFormat?.mainText?.text || p.text?.text || '',
      placeName: p.text?.text || '',
    }));
}

/** Coordinates + full address for a place picked from autocomplete(). */
async function placeDetails({ placeId, sessionToken }) {
  requireKey();
  takeQuota('places');

  const params = new URLSearchParams({ languageCode: 'en' });
  if (sessionToken) params.set('sessionToken', sessionToken);
  const payload = await callGoogle(
    `${PLACE_DETAILS_URL}${encodeURIComponent(placeId)}?${params.toString()}`,
    { fieldMask: 'id,location,formattedAddress' },
  );

  const lat = Number(payload.location?.latitude);
  const lng = Number(payload.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new MapsError('Place not found.', { status: 404, code: 'MAPS_NO_PLACE' });
  }
  return { id: payload.id || placeId, lat, lng, placeName: payload.formattedAddress || '' };
}

function _resetUsageForTests() {
  usage.day = null;
  usage.route = 0;
  usage.places = 0;
}

module.exports = {
  MapsError,
  computeRoute,
  autocomplete,
  placeDetails,
  _resetUsageForTests,
};
