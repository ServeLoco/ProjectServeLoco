# Load Test — Click-by-Click Steps

Follow these in order, top to bottom. Copy each command into your terminal and
press Enter. Don't skip the smoke test (Step 3) — it confirms everything works
before you put real load on the server.

> ⚠️ These tests hit your **production** server (`api.serveloco.app`). That means
> real load on your live database and Cloudflare. Always start small (Step 3),
> run during off-peak hours, and stop if real users report slowness.

---

## STEP 1 — Open a terminal in the project folder

```bash
cd /home/linux-server/Documents/GitHub/ProjectServeLoco
```

Confirm you're on the testing branch:

```bash
git branch --show-current
```

You should see: `testing`

---

## STEP 2 — Install k6 (one time only)

Paste these 4 lines one by one. It will ask for your password (sudo).

```bash
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
```
```bash
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
```
```bash
sudo apt-get update
```
```bash
sudo apt-get install -y k6
```

Verify it installed:

```bash
k6 version
```

You should see a version number. If you see "command not found", the install
failed — re-run the 4 lines above.

---

## STEP 3 — Smoke test (SMALL — 10 users for 30 seconds)

This is safe. It just checks the test works.

```bash
k6 run -e BASE_URL=https://api.serveloco.app/api --vus 10 --duration 30s load-tests/http-k6.js
```

- `--vus 10`  = 10 pretend users at the same time
- `--duration 30s` = run for 30 seconds

Wait for it to finish (~30s). Go to STEP 4 to read the result.

---

## STEP 4 — Read the result

In the summary at the bottom, find these 4 lines:

```
  http_req_duration..............: avg=...  p(95)=XXXms   <- 95% of requests were faster than this
  http_req_failed................: X.XX%                  <- % that failed
  http_reqs......................: NNN     NN/s            <- requests per second
  checks.........................: 100.00%                 <- % that returned 200 OK
```

**Healthy result:**
- `p(95)` under **800ms**
- `http_req_failed` under **1%**
- `checks` near **100%**

If all good → go to STEP 5 to increase the load.
If p(95) is already high or failures appear at just 10 users → your server is
struggling; stop and tell me the numbers.

---

## STEP 5 — Increase the load step by step

Run these ONE AT A TIME. After each, check the same 4 numbers from STEP 4.
Stop at the first level where p(95) goes above ~800ms OR failures appear —
that level is roughly your ceiling.

50 users for 1 minute:
```bash
k6 run -e BASE_URL=https://api.serveloco.app/api --vus 50 --duration 1m load-tests/http-k6.js
```

150 users for 1 minute:
```bash
k6 run -e BASE_URL=https://api.serveloco.app/api --vus 150 --duration 1m load-tests/http-k6.js
```

300 users for 2 minutes:
```bash
k6 run -e BASE_URL=https://api.serveloco.app/api --vus 300 --duration 2m load-tests/http-k6.js
```

Write down the p(95) and failure % at each level. The point where it gets bad
is your answer for "how many browsing users it can handle."

---

## STEP 6 — (Optional but recommended) Watch the server while testing

This shows you WHICH part runs out first (CPU, database, or memory).

1. Open a **SECOND terminal window**.
2. SSH into your Lightsail server (use your normal SSH command):
   ```bash
   ssh youruser@your-server-ip
   ```
3. Go to the project folder on the server:
   ```bash
   cd ~/ProjectServeLoco
   ```
4. Start the monitor (replace `yourpass` with your MySQL root password):
   ```bash
   MYSQL_ROOT_PASSWORD=yourpass bash load-tests/monitor.sh
   ```
5. Now go back to your first terminal and run a STEP 5 test. Watch the monitor
   numbers change.

**What the monitor columns mean:**
- `api_cpu%` near **100%** → the app's single CPU core is maxed (most likely
  first limit). Fix = run more app copies / bigger server.
- `mysql_threads_connected` near **30** → database connection pool is full.
- `api_mem` always climbing → possible memory leak or too many open connections.

Press `Ctrl+C` to stop the monitor when done.

---

## STEP 7 — Translate the numbers into "real active users"

1. One browsing user in this test makes about **0.5 requests per second**.
2. Take the highest `http_reqs /s` your server handled while still healthy
   (p95 < 800ms, errors < 1%).
3. Divide by 0.5.

Example: server stayed healthy at **400 req/s** → 400 ÷ 0.5 = **~800 users
browsing at the same time**.

Note: "people with the app open" (just holding a connection) is a much bigger
number — that's what the Socket.IO test measures (see SOCKET-STEPS below).

---

## SOCKET TEST (concurrent connections) — do this AFTER the HTTP test

This measures how many users can have the app OPEN at once (each holds one
realtime connection).

### S1 — Install artillery (one time)
```bash
npm install -g artillery
```

### S2 — Generate login tokens (sockets require a valid token)
```bash
cd /home/linux-server/Documents/GitHub/ProjectServeLoco/apps/api
node ../../load-tests/gen-tokens.js 1000 > ../../load-tests/tokens.csv
cd /home/linux-server/Documents/GitHub/ProjectServeLoco
```
This makes a `tokens.csv` with 1000 valid tokens (it's git-ignored).

### S3 — Run the socket test
```bash
artillery run --target https://api.serveloco.app load-tests/socket-artillery.yml
```

### S4 — Read it
Watch for:
- `socketio.emit` / connection counts climbing = connections being held.
- `errors` or `vusers.failed` = connections being refused → that's your socket
  ceiling.
- Run `monitor.sh` on the server at the same time (STEP 6) to see CPU/memory as
  connections pile up.

---

## If something looks wrong

Copy the summary numbers (p95, failed %, req/s) and tell me. I'll tell you
whether you've hit the CPU limit, the database pool, or something else — and
exactly what to change to handle more users.
