const request = require('supertest');
const express = require('express');

jest.mock('../src/db/mysql', () => ({ pool: { query: jest.fn() } }));

const config = require('../src/config/env');
const mapsRoutes = require('../src/routes/mapsRoutes');
const googleMaps = require('../src/services/googleMaps');
const { signCustomerToken } = require('../src/utils/auth');

const app = express();
app.use(express.json());
app.use('/api/maps', mapsRoutes);

const auth = () => ({ Authorization: `Bearer ${signCustomerToken(77)}` });

const googleReply = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const ROUTE = {
  distanceMeters: 2400,
  duration: '410s',
  polyline: { geoJsonLinestring: { type: 'LineString', coordinates: [[75.67, 29.45], [75.68, 29.46]] } },
  legs: [{
    steps: [
      {
        distanceMeters: 300,
        startLocation: { latLng: { latitude: 29.45, longitude: 75.67 } },
        navigationInstruction: { maneuver: 'DEPART', instructions: 'Head north' },
      },
      {
        distanceMeters: 2100,
        startLocation: { latLng: { latitude: 29.452, longitude: 75.671 } },
        navigationInstruction: { maneuver: 'TURN_LEFT', instructions: 'Turn left onto NH 9' },
      },
    ],
  }],
};

const STOPS = [{ lat: 29.45, lng: 75.67 }, { lat: 29.46, lng: 75.68 }];

describe('/api/maps (Google Routes + Places through the server)', () => {
  const originalKey = config.GOOGLE_MAPS_SERVER_KEY;
  const originalRouteCap = config.GOOGLE_MAPS_DAILY_ROUTE_CAP;

  beforeEach(() => {
    config.GOOGLE_MAPS_SERVER_KEY = 'server-key';
    config.GOOGLE_MAPS_DAILY_ROUTE_CAP = 500;
    googleMaps._resetUsageForTests();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    config.GOOGLE_MAPS_SERVER_KEY = originalKey;
    config.GOOGLE_MAPS_DAILY_ROUTE_CAP = originalRouteCap;
    delete global.fetch;
  });

  it('needs a logged-in user', async () => {
    const res = await request(app).post('/api/maps/route').send({ stops: STOPS });
    expect(res.statusCode).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('asks Google for a two-wheeler route and returns GeoJSON coordinates', async () => {
    global.fetch.mockResolvedValueOnce(googleReply({ routes: [ROUTE] }));

    const res = await request(app).post('/api/maps/route').set(auth()).send({ stops: STOPS });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({
      coordinates: [[75.67, 29.45], [75.68, 29.46]],
      distanceMeters: 2400,
      durationSeconds: 410,
    });

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(init.headers['X-Goog-Api-Key']).toBe('server-key');
    expect(init.headers['X-Goog-FieldMask']).not.toContain('steps');
    const body = JSON.parse(init.body);
    expect(body.travelMode).toBe('TWO_WHEELER');
    expect(body.polylineEncoding).toBe('GEO_JSON_LINESTRING');
    expect(body.origin.location.latLng).toEqual({ latitude: 29.45, longitude: 75.67 });
    expect(body.destination.location.latLng).toEqual({ latitude: 29.46, longitude: 75.68 });
    expect(body.intermediates).toEqual([]);
  });

  it('passes shops in between as intermediates and returns turn-by-turn steps when asked', async () => {
    global.fetch.mockResolvedValueOnce(googleReply({ routes: [ROUTE] }));
    const shop = { lat: 29.455, lng: 75.675 };

    const res = await request(app).post('/api/maps/route').set(auth())
      .send({ stops: [STOPS[0], shop, STOPS[1]], steps: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.steps).toEqual([
      { instruction: 'Head north', maneuver: 'DEPART', distanceMeters: 300, location: [75.67, 29.45] },
      { instruction: 'Turn left onto NH 9', maneuver: 'TURN_LEFT', distanceMeters: 2100, location: [75.671, 29.452] },
    ]);
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers['X-Goog-FieldMask']).toContain('routes.legs.steps.navigationInstruction');
    expect(JSON.parse(init.body).intermediates).toEqual([
      { location: { latLng: { latitude: 29.455, longitude: 75.675 } } },
    ]);
  });

  it('falls back to a car route when Google has no two-wheeler route', async () => {
    global.fetch
      .mockResolvedValueOnce(googleReply({}))
      .mockResolvedValueOnce(googleReply({ routes: [ROUTE] }));

    const res = await request(app).post('/api/maps/route').set(auth()).send({ stops: STOPS });

    expect(res.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).travelMode).toBe('DRIVE');
  });

  it('rejects bad stops without calling Google', async () => {
    const one = await request(app).post('/api/maps/route').set(auth()).send({ stops: [STOPS[0]] });
    const bad = await request(app).post('/api/maps/route').set(auth())
      .send({ stops: [STOPS[0], { lat: 'x', lng: 75 }] });

    expect(one.statusCode).toBe(400);
    expect(bad.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('answers 503 MAPS_NOT_CONFIGURED when the server has no key', async () => {
    config.GOOGLE_MAPS_SERVER_KEY = undefined;

    const res = await request(app).post('/api/maps/route').set(auth()).send({ stops: STOPS });

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('MAPS_NOT_CONFIGURED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('stops calling Google once the daily route cap is used up', async () => {
    config.GOOGLE_MAPS_DAILY_ROUTE_CAP = 2;
    global.fetch.mockResolvedValue(googleReply({ routes: [ROUTE] }));

    const first = await request(app).post('/api/maps/route').set(auth()).send({ stops: STOPS });
    const second = await request(app).post('/api/maps/route').set(auth()).send({ stops: STOPS });
    const third = await request(app).post('/api/maps/route').set(auth()).send({ stops: STOPS });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(third.body.code).toBe('MAPS_DAILY_LIMIT');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('turns a Google error into 502 MAPS_UPSTREAM', async () => {
    global.fetch.mockResolvedValueOnce(googleReply({ error: { message: 'API key not valid' } }, 403));

    const res = await request(app).post('/api/maps/route').set(auth()).send({ stops: STOPS });

    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('MAPS_UPSTREAM');
  });

  it('returns India-only place suggestions near the customer', async () => {
    global.fetch.mockResolvedValueOnce(googleReply({
      suggestions: [
        {
          placePrediction: {
            placeId: 'ChIJ_abc',
            text: { text: 'Agroha, Haryana, India' },
            structuredFormat: { mainText: { text: 'Agroha' }, secondaryText: { text: 'Haryana, India' } },
          },
        },
        { queryPrediction: { text: { text: 'agroha dham' } } },
      ],
    }));

    const res = await request(app).get('/api/maps/places/autocomplete')
      .query({ q: 'agro', session: 'sess-1', lat: 29.45, lng: 75.67 })
      .set(auth());

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([{ id: 'ChIJ_abc', name: 'Agroha', placeName: 'Agroha, Haryana, India' }]);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      input: 'agro',
      sessionToken: 'sess-1',
      includedRegionCodes: ['in'],
      locationBias: { circle: { center: { latitude: 29.45, longitude: 75.67 } } },
    });
  });

  it('rejects a too-short search or a bad session token', async () => {
    const short = await request(app).get('/api/maps/places/autocomplete').query({ q: 'a' }).set(auth());
    const badSession = await request(app).get('/api/maps/places/autocomplete')
      .query({ q: 'agroha', session: 'has spaces' }).set(auth());

    expect(short.statusCode).toBe(400);
    expect(badSession.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('gets coordinates for a picked place with an Essentials-only field mask', async () => {
    global.fetch.mockResolvedValueOnce(googleReply({
      id: 'ChIJ_abc',
      location: { latitude: 29.28, longitude: 75.62 },
      formattedAddress: 'Agroha, Haryana 125047, India',
    }));

    const res = await request(app).get('/api/maps/places/ChIJ_abc').query({ session: 'sess-1' }).set(auth());

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({
      id: 'ChIJ_abc', lat: 29.28, lng: 75.62, placeName: 'Agroha, Haryana 125047, India',
    });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toContain('/v1/places/ChIJ_abc?');
    expect(url).toContain('sessionToken=sess-1');
    expect(init.headers['X-Goog-FieldMask']).toBe('id,location,formattedAddress');
  });
});
