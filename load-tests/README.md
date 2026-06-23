# Load Testing ServeLoco / VillKro

How to find out how many **real active users** your server can handle, and which
resource breaks first.

---

## 1. Understand what an "active user" means here

This is a **realtime app**, so an active user is two things at once:

1. **One persistent Socket.IO connection** (held the whole time the app is open —
   for order updates and notifications).
2. **Occasional HTTP requests** (launch → settings/categories/products, then a
   request every few seconds while browsing, plus order placement).

So "how many users can it handle" has **two separate ceilings**, and you must
test both:

| Test | Tool | What it answers |
|------|------|-----------------|
| HTTP throughput | k6 (`http-k6.js`) | How many browsing/ordering users before latency spikes |
| Concurrent sockets | artillery (`socket-artillery.yml`) | How many simultaneous open connections before it falls over |

---

## 2. Know your architecture's limits (before testing)

From the codebase, these are the ceilings you will likely hit, in order:

1. **Single Node process — no clustering.** `src/server.js` runs one
   `app.listen`. Node uses **one CPU core** for your JS. On a small Lightsail
   box (1–2 vCPU) **CPU is almost always the first wall.** To scale past it you
   need PM2 cluster mode or multiple containers + a load balancer.
2. **MySQL pool = 30 connections** (`MYSQL_POOL_SIZE`, default 30). Past ~30
   concurrent in-flight queries, requests **queue** and latency climbs.
3. **Socket.IO is single-node, in-memory** (no Redis adapter). Fine for one
   instance; but you **cannot** horizontally scale sockets across processes
   without adding `@socket.io/redis-adapter`.
4. **Rate limiters.** Auth endpoints allow **10 requests / 15 min / IP**
   (`authRoutes.js`). A load test from one IP will get `429`s almost immediately
   — that's why the HTTP test uses *public GET* endpoints, not `/login`.

---

## 3. Install the tools

```bash
# k6 (HTTP)
sudo gpg -k && \
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69 && \
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list && \
sudo apt-get update && sudo apt-get install k6

# artillery (Socket.IO)
npm install -g artillery
```

---

## 4. Run the HTTP test

> ⚠️ Point at a **staging** instance if you have one. Hitting production runs real
> load through Cloudflare and your live DB. If you must test prod, do it
> off-peak and start small.

```bash
# from repo root
k6 run -e BASE_URL=https://api.serveloco.app/api load-tests/http-k6.js
```

Edit the `stages` in `http-k6.js` to shape the load (the default ramps to 300
concurrent browsing users over ~4.5 min).

---

## 5. Run the Socket.IO test

Sockets require a valid JWT, so generate signed tokens first (reuses the API's
own signing util — always valid):

```bash
cd apps/api
node ../../load-tests/gen-tokens.js 1000 > ../../load-tests/tokens.csv
cd ../..

artillery run --target https://api.serveloco.app load-tests/socket-artillery.yml
```

This opens up to ~1000 concurrent connections that each stay alive ~60s.

---

## 6. Watch the server while testing

SSH into the Lightsail box and run, **during** the test:

```bash
MYSQL_ROOT_PASSWORD=yourpass bash load-tests/monitor.sh
```

It prints API container CPU/mem, MySQL active connections, and established TCP
connections every 2s — so you can see *which* resource saturates.

---

## 7. Read the results — the metrics that matter

**Client side (k6 / artillery):**

- **p95 / p99 latency** — the real user experience. Averages lie; watch the tail.
- **http_req_failed / errors rate** — anything >1% means you're past capacity.
- **requests/sec (RPS)** — sustained throughput at acceptable latency.
- **vus** — concurrent virtual users at the point latency/errors spike = your
  ceiling for that test.

**Server side (monitor.sh):**

- **api CPU %** hitting ~100% → CPU-bound (expected first; one Node core).
- **MySQL Threads_connected** near 30 → DB pool exhausted.
- **mem** climbing without release → leak or too many sockets.

---

## 8. Translate to "real active users"

1. Find the **knee**: the VU count where p95 latency crosses your comfort line
   (e.g. 800ms) or errors appear. That's your **concurrent-request ceiling**.
2. Estimate per-user request rate. From `http-k6.js`, one browsing user makes
   ~4 requests per ~8s ≈ **0.5 req/s**. If the server stays healthy at, say,
   **400 req/s**, that's ≈ **800 simultaneously-browsing users**.
3. The **socket test** gives the parallel ceiling: max concurrent open
   connections before failures. Your real active-user limit is the **lower** of
   the two.
4. Note: "active users" (app open, holding a socket) is usually a *much* larger
   number than "users actively making requests right now." Size for both.

---

## 9. If you hit the ceiling too early

- **CPU-bound at low load** → enable PM2 cluster mode or run multiple `api`
  containers behind nginx; add `@socket.io/redis-adapter` so sockets work across
  processes.
- **DB pool exhausted** → raise `MYSQL_POOL_SIZE`, add indexes, cache hot reads
  (settings is already cached 60s).
- **Memory climbing** → check for socket cleanup on disconnect; cap connections.
- **Bigger box** → Lightsail vertical scale is the quickest short-term lever.
