const googleMaps = require('../services/googleMaps');

// A route has a start, an end and at most a few shops between them.
const MAX_ROUTE_STOPS = 6;
const SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{1,36}$/;
const PLACE_ID_RE = /^[A-Za-z0-9_-]{1,300}$/;

const badRequest = (res, message) => res.status(400).json({ code: 'VALIDATION_ERROR', message });

function parsePoint(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function parseSessionToken(value) {
  if (value === undefined || value === '') return undefined;
  return SESSION_TOKEN_RE.test(String(value)) ? String(value) : null;
}

// MapsError carries its own status/code. They're answered here rather than
// passed to the global handler, which would turn every 5xx into a generic
// SERVER_ERROR — the app needs MAPS_NOT_CONFIGURED / MAPS_DAILY_LIMIT to
// quietly fall back to a map without a route line.
async function answer(res, work) {
  try {
    const data = await work();
    return res.status(200).json({ data });
  } catch (error) {
    if (error instanceof googleMaps.MapsError) {
      return res.status(error.status).json({ code: error.code, message: error.message });
    }
    throw error;
  }
}

const getRoute = async (req, res) => {
  const rawStops = req.body?.stops;
  if (!Array.isArray(rawStops) || rawStops.length < 2 || rawStops.length > MAX_ROUTE_STOPS) {
    return badRequest(res, `stops must list 2 to ${MAX_ROUTE_STOPS} points`);
  }
  const stops = rawStops.map(parsePoint);
  if (stops.some((p) => !p)) return badRequest(res, 'Every stop needs a valid lat and lng');

  return answer(res, () => googleMaps.computeRoute({ stops, steps: req.body?.steps === true }));
};

const autocompletePlaces = async (req, res) => {
  const input = String(req.query.q || '').trim();
  if (input.length < 2 || input.length > 100) return badRequest(res, 'q must be 2 to 100 characters');

  const sessionToken = parseSessionToken(req.query.session);
  if (sessionToken === null) return badRequest(res, 'Invalid session');

  const hasNear = req.query.lat !== undefined || req.query.lng !== undefined;
  const near = hasNear ? parsePoint({ lat: req.query.lat, lng: req.query.lng }) : undefined;
  if (near === null) return badRequest(res, 'Invalid lat/lng');

  return answer(res, () => googleMaps.autocomplete({ input, sessionToken, near }));
};

const getPlace = async (req, res) => {
  const { placeId } = req.params;
  if (!PLACE_ID_RE.test(placeId)) return badRequest(res, 'Invalid place id');

  const sessionToken = parseSessionToken(req.query.session);
  if (sessionToken === null) return badRequest(res, 'Invalid session');

  return answer(res, () => googleMaps.placeDetails({ placeId, sessionToken }));
};

module.exports = {
  getRoute,
  autocompletePlaces,
  getPlace,
};
