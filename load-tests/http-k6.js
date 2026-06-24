/**
 * HTTP load test — simulates customers browsing the app.
 *
 * Models a realistic "active user" session: open app -> fetch settings ->
 * fetch categories -> fetch products -> open a product. These are the public
 * GET endpoints the customer app hits on launch and while browsing.
 *
 * Run:
 *   k6 run -e BASE_URL=https://api.serveloco.app/api load-tests/http-k6.js
 *
 * Tune the load by editing `stages` below, or override VUs:
 *   k6 run -e BASE_URL=... --vus 200 --duration 2m load-tests/http-k6.js
 *
 * NOTE: point BASE_URL at a STAGING instance, not production, unless you
 * intend to load your real server. Cloudflare in front of prod may rate-limit
 * or challenge a burst of identical requests.
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
// When hitting the server directly by IP, nginx needs the Host header to route correctly.
// Override with -e HOST=api.serveloco.app if needed.
const HOST_HEADER = __ENV.HOST || null;
const defaultHeaders = HOST_HEADER ? { headers: { 'Host': HOST_HEADER } } : {};

// Custom metrics so the summary shows per-step latency clearly.
const browseLatency = new Trend('browse_latency_ms', true);
const errorRate = new Rate('errors');

export const options = {
  // Ramp profile: climb to 300 concurrent "users", hold, then ramp down.
  // Each VU loops the session below, so 300 VUs ≈ 300 users browsing at once.
  stages: [
    { duration: '30s', target: 50 },   // warm up
    { duration: '1m',  target: 150 },  // ramp
    { duration: '2m',  target: 300 },  // sustained peak
    { duration: '1m',  target: 0 },    // ramp down
  ],
  thresholds: {
    // Fail the test if the experience degrades past these limits.
    http_req_duration: ['p(95)<800', 'p(99)<2000'], // 95% under 800ms
    errors: ['rate<0.01'],                           // <1% errors
  },
};

export default function () {
  group('customer browse session', () => {
    // 1. App launch -> settings (force-update check, shop status, pricing)
    let res = http.get(`${BASE_URL}/settings`, { ...defaultHeaders, tags: { step: 'settings' } });
    browseLatency.add(res.timings.duration);
    errorRate.add(res.status !== 200);
    check(res, { 'settings 200': (r) => r.status === 200 });

    sleep(1); // user looks at the home screen

    // 2. Categories
    res = http.get(`${BASE_URL}/categories`, { ...defaultHeaders, tags: { step: 'categories' } });
    browseLatency.add(res.timings.duration);
    errorRate.add(res.status !== 200);
    check(res, { 'categories 200': (r) => r.status === 200 });

    // 3. Products list
    res = http.get(`${BASE_URL}/products`, { ...defaultHeaders, tags: { step: 'products' } });
    browseLatency.add(res.timings.duration);
    errorRate.add(res.status !== 200);
    check(res, { 'products 200': (r) => r.status === 200 });

    // 4. Open one product (pull an id from the list if available)
    let productId = null;
    try {
      const body = res.json();
      const list = body?.data || body?.products || body;
      if (Array.isArray(list) && list.length) productId = list[0].id;
    } catch (_e) { /* ignore parse issues under load */ }

    if (productId) {
      sleep(2); // user reads the list, taps a product
      res = http.get(`${BASE_URL}/products/${productId}`, { ...defaultHeaders, tags: { step: 'product_detail' } });
      browseLatency.add(res.timings.duration);
      errorRate.add(res.status !== 200);
      check(res, { 'product detail 200': (r) => r.status === 200 });
    }

    sleep(Math.random() * 3 + 2); // think time before next loop (2–5s)
  });
}
