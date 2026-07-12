# Customer App — Fast Loading, Fresh Data & 10k-User Cost Plan

Spec for an implementing AI. Goal: make the customer app (apps/customer-app) feel instant when opening screens and switching content, always converge to the latest server data, and keep server/DB cost flat as the user base grows to ~10,000. Written 2026-07-12 after a code audit; every task cites the finding that motivates it.

---

## RULES — read first, follow literally

1. Do exactly what the task says. No extra refactors, no drive-by cleanups, no renaming.
2. Tasks run **in order** (TASK 0 first). Do not start a task until the previous one is committed.
3. One commit per task, message format: `perf: TASK <n> — <short title>`. Exception: a task that explicitly defines sub-commits (8a/8b, 9a/9b, 16a/16b) gets exactly those.
4. After every customer-app task: run `npm test` in `apps/customer-app` and `npx eslint` on every file you touched. After every API task: run `npm test` in `apps/api`. All must pass before committing.
5. Tick the task checkbox with a one-line note of what you actually did (not "done"). If a task tells you to STOP under a condition, tick with the reason and move on — never improvise an alternative.
6. **API response shape is a contract.** Many responses duplicate fields in camelCase AND snake_case. Never remove, rename, or stop sending either casing. New fields are additive only and must ship in BOTH casings.
7. **No new dependencies.** No react-query, no redux, no swr lib. Use plain refs, Zustand, and the cache util built in TASK 1. (Sole exception: TASK 9 may add `sharp` to apps/api.)
8. **In-memory cache only for API data.** Do not persist product/price/availability data to AsyncStorage or disk — stale prices shown from disk are a business bug. Image caching is expo-image's job and already handled.
9. Cached data may be shown instantly, but a background revalidation fetch MUST follow (subject to the TASK-16 freshness throttle). Never show cache without a path to fresh data.
10. Skeleton/loading spinners only when there is NO cached data to show. Never blank out already-visible content while refetching.

### DO NOT TOUCH

- HomeScreen's mode-switch cache (`sectionsCacheRef`, `prefetchedModesRef`, `prefetchSectionImages` in `apps/customer-app/src/screens/customer/HomeScreen/HomeScreen.js`) — already implemented and working. It stays on its own implementation; do NOT migrate it to the TASK-2 hook. Only TASK 16 touches HomeScreen, exactly where stated.
- `apps/api/src/utils/coupons.js` — coupon engine, out of scope.
- Order creation / status update code (`FOR UPDATE` locking, compare-and-set 409s) — out of scope.
- Cart stores and checkout flow — out of scope for this plan.
- Auth/session code.

---

## CURRENT STATE (audit findings — why each task exists)

| # | Finding | Where |
|---|---------|-------|
| A | HomeScreen already has per-mode section cache + background prefetch of other modes + image pre-warm. May be uncommitted — TASK 0 handles that. | HomeScreen.js |
| B | CategoriesScreen refetches categories from network on every mount, skeleton each time. | `src/screens/customer/CategoriesScreen/CategoriesScreen.js` (~line 76) |
| C | ProductListScreen refetches from network on EVERY filter change — including `sortBy`, whose sorting is done **client-side** anyway (lines 152–157). Search/availability/category are also re-filtered client-side after the fetch. | `src/screens/customer/ProductListScreen/ProductListScreen.js` (`fetchProducts`, effect at ~line 173) |
| D | ProductListScreen fetch has no `limit` — API returns the entire product table for the store type on every visit. API supports `LIMIT` (`productController.js` ~line 265) but has no `offset`, so no pagination exists end-to-end. | both apps |
| E | ProductDetailScreen fetches the product on every mount with a full-screen loader, even though the list screen that navigated here already holds the full product object. | `src/screens/customer/ProductDetailScreen/ProductDetailScreen.js` (~line 61) |
| F | No shared client-side cache utility; every screen hand-rolls fetch + isLoading. | `src/api/httpClient.js` has timeout/retry only |
| G | Product card images download the full-size original upload — no server-side thumbnails. Biggest bandwidth cost on slow connections AND the biggest server bandwidth bill at scale. | `apps/api` image upload/serving, `images` table |
| H | FlatList in ProductListScreen is already tuned (`removeClippedSubviews`, `initialNumToRender=6`, `windowSize=7`). Do not re-tune. | ProductListScreen.js ~line 374 |
| I | Freshness: Home silently revalidates on focus; ProductList and ProductDetail do NOT — stale availability/price if user sits on them after backgrounding. | see B/C/E files |
| J | `GET /api/dashboard` builds sections sequentially — one `await` chain per section in a for-loop. | `apps/api/src/controllers/dashboardController.js` ~line 430 |
| K | No server-side response caching on public hot GETs (dashboard/categories) — every app open recomputes identical JSON. | apps/api |
| L | `products` table has only a single-column `idx_category` index; hot list queries filter deleted+available+is_combo. | `apps/api/src/db/migrate.js` (products CREATE TABLE ~line 260) |
| M | `ProductImage` (expo-image) lacks `recyclingKey`; error state never resets on uri change in recycled cells. | `src/components/ProductImage/ProductImage.js` |
| N | Disk-mode uploaded images served with no Cache-Control — every client revalidates every image through Node. Filenames are collision-unique (`buildFilename`: `Date.now() + random`) so immutable caching is safe. | `apps/api/src/app.js` ~line 65, `imageController.js` |
| O | Rate limiters exist only on auth/upload/analytics routes; all public GETs unlimited. `app.set('trust proxy', 1)` is already set (app.js line 33), so per-IP limiting behind nginx works correctly. | `src/routes/*.js`, `src/app.js` |
| P | Unread notification count polled on every Home focus. The API emits `notification.unread_count.updated` — but ONLY from `src/realtime/orderEvents.js` (line ~115); other notification-creating paths (admin broadcast etc.) never emit it. | HomeScreen.js + `apps/api/src/realtime/orderEvents.js` |
| Q | Shop-status broadcasts go to ALL customers simultaneously (`customers` room) → synchronized refetch spike at scale. | `src/realtime/socket.js` |

**Already good — checked, do NOT "improve" these:** ProductCard is `React.memo`-wrapped; Hermes is the Expo default engine; expo-image default cache policy is memory-disk; only 7 `console.log`s exist (stripping not worth a babel plugin); FlatList virtualization tuned (H); API responses gzip-compressed (`compression`, threshold 1024); `trust proxy` set (O).

### Expected impact (for orientation — do not reorder tasks based on this)

| Tasks | Lever | Payoff |
|-------|-------|--------|
| 1–7 | client cache/SWR | every revisit instant; fewer requests |
| 8, 9, 14 | payload bytes | ~5–20× less image/list bandwidth = the server bill |
| 10–12 | server latency | Home API ~2–4× faster |
| 11, 15–17 | request volume at 10k users | shop-toggle spike: ~1 DB query instead of 10k |

---

## PHASE 0 — prerequisites

### [x] TASK 0 — commit pending work + capture baseline
> Committed HomeScreen mode cache + prefetch; baseline (c50/d15 local): dashboard 3240.8 rps / p99 38ms; products 14689.6 / 13ms; categories 14734.67 / 13ms.

1. `git status`. If HomeScreen.js (or other customer-app files) carry uncommitted mode-cache/prefetch work, commit it first: `perf: TASK 0 — home mode cache + prefetch (pre-plan work)`. Nothing in this plan may be built on an uncommitted tree.
2. Capture the BEFORE numbers while the code is still unoptimized (TASK 18 needs them):
   - Start the local dev API (`npm run dev` in apps/api, dev DB seeded with a few sections/products).
   - `npx autocannon -c 50 -d 15` on `GET /api/dashboard?storeType=fast_food`, `GET /api/products?type=fast_food`, `GET /api/categories?type=fast_food`. Local only — NEVER against production.
   - Record req/s and p99 per endpoint in the `## Measured results` table at the bottom of this file ("before" column), and commit that edit as part of this task.

---

## PHASE 1 — shared cache utility (customer-app)

### [x] TASK 1 — create `src/utils/apiCache.js` + tests
> Added in-memory Map cache (max 50, prefix invalidate, stableKey, isFresh) + 8 unit tests.

**Create** `apps/customer-app/src/utils/apiCache.js`. Small module, no dependencies:

- `getCached(key)` → `{ data, ageMs }` or `null`.
- `setCached(key, data)` — stores with timestamp.
- `isFresh(key, maxAgeMs)` → boolean (false when absent). Used by the TASK-16 throttle; build it now so the API is stable.
- `invalidate(keyPrefix)` — deletes all keys starting with prefix.
- `clearAll()`.
- `stableKey(obj)` — serializes a params object with sorted keys (for TASK 5 cache keys).
- Max 50 entries, evict oldest (insertion-order Map).
- Key convention (document in file header): `"<domain>:<param>"` e.g. `"categories:fast_food"`, `"products:<stableKey>"`, `"product:42"`.

**Create** `apps/customer-app/__tests__/apiCache.test.js`: set/get roundtrip, isFresh true/false/missing, invalidate-by-prefix, stableKey key-order independence, eviction at 50, clearAll.

Do NOT wire it into any screen yet.

### [x] TASK 2 — SWR hook `src/hooks/useCachedFetch.js`
> Added useCachedFetch (cache-hit paint + bg revalidate, refresh, stale-key guard) + 7 tests; exported from hooks barrel.

**Create** hook wrapping the TASK-1 util:

```
const { data, isLoading, isRefreshing, error, refresh } = useCachedFetch(cacheKey, fetcherFn, { enabled });
```

Behavior (this is the contract — implement exactly):
- Cache hit → return cached `data` immediately, `isLoading=false`, and fire `fetcherFn` in background; on success update cache + state.
- Cache miss → `isLoading=true`, fetch, cache, return.
- Background fetch failure with cache present → keep cached data, do not surface error state.
- Fetch failure with no cache → `error` set.
- `refresh()` → forced network fetch, sets `isRefreshing` (for pull-to-refresh), updates cache.
- Refetch when `cacheKey` changes (new params = new entry, same rules).
- Ignore stale responses: a fetch that resolves after `cacheKey` changed must not overwrite the newer key's state (track the in-flight key).

**Register** in `src/hooks/index.js` (existing barrel — match its export style).

**Create** `apps/customer-app/__tests__/useCachedFetch.test.js` using `@testing-library/react-native` renderHook (verify it's a devDep in package.json first; if absent, test through a tiny probe component instead — do NOT add the dep).

HomeScreen is NOT migrated to this hook (see DO NOT TOUCH).

---

## PHASE 2 — wire screens to cache (customer-app)

### [x] TASK 3 — CategoriesScreen instant load
> Wired CategoriesScreen to useCachedFetch('categories:'+storeType); skeleton only on cold miss; pull-to-refresh → refresh().

**Modify** `CategoriesScreen.js`: replace the manual `useEffect` + `isLoading` fetch of `productsApi.getCategories({ type: storeType })` with `useCachedFetch('categories:' + storeType, ...)`.

- Revisit of a mode already seen → grid renders instantly from cache, revalidates silently.
- Keep pull-to-refresh (if present) calling `refresh()`.
- Skeleton only on true first visit per mode.

### [x] TASK 4 — ProductListScreen: stop pointless refetches
> sortBy + showAvailableOnly now client-only via displayProducts useMemo; removed from fetch params and effect deps.

**Modify** `ProductListScreen.js`, `fetchProducts` effect (~line 173):

- Remove `sortBy` from the refetch effect deps. Sorting is already applied client-side (lines 152–157) — move it into a `useMemo` over `products` so tapping a sort option never hits the network.
- `showAvailableOnly` is both a query param AND a client-side filter (lines 148–150). Make it client-side only: remove from request params and effect deps; keep the filter in the same `useMemo`.
- Search in `mode === 'search'` stays debounced-server-side as is.
- Everything else (category, offerId, sectionSlug, mode changes) still refetches.

### [x] TASK 5 — ProductListScreen: cached lists (SWR)
> fetchProducts uses products:stableKey(params); cache hit paints instantly + silent revalidate; pull-to-refresh forces network.

**Modify** `ProductListScreen.js`: route `fetchProducts`'s network call through the cache.

- Cache key: `'products:' + stableKey(requestParams)` (TASK-1 helper).
- Back-navigation or re-entering the same category/section → instant list from cache + silent revalidate.
- Pull-to-refresh → forced network.
- The TASK-4 client-side filter/sort `useMemo` sits on top, untouched by caching.

### [x] TASK 6 — ProductDetailScreen: render instantly from navigation params
> Home already passes product; detail paints from nav/cache immediately, revalidates via getProduct, caches under product:id. normalizeProduct at boundary.

Two parts:

1. **Modify every `ProductDetail` navigate call site in customer screens** (grep for the route name; expect HomeScreen, ProductListScreen, search overlay, possibly OrderDetail) to also pass the already-loaded product object: `{ productId, product }` — only where a full product object is in hand. Do not construct partial ones.
2. **Modify** `ProductDetailScreen.js`: if `route.params.product` exists, render it immediately (no loader) and revalidate via `productsApi.getProduct(productId, ...)` in background. If absent (deep links), current fetch path with loader, cached under `'product:' + productId` so revisits are instant.

**Shape caution**: list screens hold products passed through `normalizeProduct` — it lives in `src/utils/apiMappers.js` (~line 145), exported via the `src/utils` barrel. `getProduct` returns the raw API shape. The passed object is ONLY the initial paint — the background fetch result always replaces it wholesale. Before wiring, read `normalizeProduct` and confirm the detail screen renders correctly from its output (variants, price fields); if any field mismatch would render wrongly, normalize at the detail-screen boundary the same way the list does.

Related-products block keeps its own existing logic.

### [x] TASK 7 — freshness: revalidate on focus + realtime invalidation
> ProductList + ProductDetail useFocusEffect silent revalidate (skip first focus). realtimeClient busts products:/product:/categories: on shop events.

1. **Modify** `ProductListScreen.js` and `ProductDetailScreen.js`: add `useFocusEffect` silent revalidation (mirror HomeScreen's `hasFocusedOnceRef` skip-first-focus pattern exactly — read it before writing). No skeleton, only silent state swap. (TASK 16 adds a freshness throttle on top; don't build one here.)
2. **Modify** the realtime layer in ONE place (the realtime client or a small module-level subscriber — find shop open/close events via `subscribeShopEvents` / `realtimeClient.js`): on any shop-status event, call `invalidate('products:')`, `invalidate('product:')`, `invalidate('categories:')`. Invalidation also defeats the TASK-16 throttle by design (no entry = not fresh), so event-driven changes always win over the 15s window.

---

## PHASE 3 — payload size (apps/api + customer-app)

### [x] TASK 8 — products pagination end-to-end
> 8a: API offset + limit+1 hasMore (both casings/wrapper levels) + tests. 8b: app limit 30 + onEndReached append.

Verified facts to build on: the main list is ONE SQL query with a deterministic `ORDER BY cat_display_order, item_display_order, id` (stable pagination is safe), the response wrapper duplicates the list at TWO levels (`{ data: { products }, products }`), and rows are filtered AFTER the query by `isWithinTimeWindow(available_from_time, available_until_time)` — so a SQL page can shrink before it reaches the client.

1. **API** `productController.js` list endpoint: add `offset` query param (integer ≥ 0, applied only when `limit` present). Compute `hasMore` with the limit+1 trick — query `LIMIT ?+1`, if you get limit+1 SQL rows then `hasMore=true` and drop the extra row. NEVER derive hasMore from the post-filter length (the time-window filter shrinks pages). Add the flag additively at BOTH wrapper levels and BOTH casings: `data.hasMore`, `data.has_more`, top-level `hasMore`, `has_more`. Callers sending no limit get today's exact response plus the new fields (`hasMore: false`).
2. **API tests**: extend the products endpoint test file: limit+offset windows, hasMore true/false, a time-window-filtered row still advancing pagination correctly, no-limit unchanged.
3. **Customer app** `ProductListScreen.js`: request `limit: 30`; `onEndReached` fetches the next page and appends. **Offset advances by the SQL page size (30), NOT by the number of rows received** — the time-window filter means a page can arrive with fewer than 30 rows while `hasMore` is still true; keep fetching on `hasMore`, never on `received < limit`. Footer spinner for loading-more, never full-screen. Pull-to-refresh resets to offset 0 and drops appended pages. Cache key (TASK 5) includes the offset — each page is its own cache entry.
4. **Grep `getProducts(` across customer-app** — other callers pass no limit and must be byte-identical in behavior.

Two commits: `perf: TASK 8a — API products offset+hasMore` (with tests), then `perf: TASK 8b — product list incremental loading`.

### [x] TASK 9 — image thumbnails (server-generated)
> 9a: sharp thumbs on upload + thumb_url + resolveImageUrls + backfill. 9b: ProductCard/category cards use thumbUrl||imageUrl; detail keeps full-size.

Audit first, then implement:

1. Read `imageController.js` upload flow and how `images.url` is built/served (S3 vs disk — both exist per `storage_type`).
2. On upload, generate ONE extra variant: max-width 480px, same format family (JPEG/WebP), stored alongside the original. Add `thumbUrl` + `thumb_url` additively to image-bearing responses — original `url`/`imageUrl` fields unchanged.
3. Old images have no thumb: `thumbUrl` null/absent, never a broken URL. **Create** `apps/api/scripts/backfillThumbs.js` (manual run, NOT in migrate.js) generating thumbs for existing images in batches with progress logging.
4. Customer app `ProductCard` + category cards: `thumbUrl || imageUrl` fallback chain. Detail screens and the banner carousel keep full-size.
5. `sharp` allowed (Rule 7 exception). Thumb generation wrapped in try/catch — a thumb failure must never fail the upload.

Two commits: `perf: TASK 9a — API image thumbnails + backfill script`, `perf: TASK 9b — app uses thumbs in cards`.

STOP condition: if uploads bypass the server (e.g. presigned direct-to-S3), tick the box explaining exactly why and move on.

---

## PHASE 4 — server latency (apps/api)

### [ ] TASK 10 — parallelize dashboard section loading

`dashboardController.js` `GET /api/dashboard` (~line 430) awaits each section's item query + `resolveImageUrls` + `attachVariants` + `attachComboItems` serially in a for-loop. 4 sections ≈ 4× serial DB round-trip chains — the biggest server-side latency on Home.

**Modify**: build each section's items in an async helper, run all sections through `Promise.all`, assemble `resultSections` in the original order (`Promise.all` preserves input order — rely on that, do not sort after).

Constraints:
- Byte-identical response JSON for the same data (Rule 6).
- Per-section behavior identical (store-type filters, maxVisible, empty-section hiding).
- If a dashboard test file exists, extend it with a 2+ section ordering assertion.

### [ ] TASK 11 — API micro-cache for hot public GETs

`GET /api/dashboard` and `GET /api/categories` are public, hot, and identical for all users per (storeType, include_closed_shops) combo.

**Create** `apps/api/src/utils/microCache.js`:
- `get(key)` / `set(key, value, ttlMs)` / `bust(prefix)`; plain Map, max 100 entries, evict oldest.
- TTL 30 seconds — the staleness ceiling. Known acceptable side effect: sections with `starts_at`/`ends_at` time windows can appear/disappear up to 30s late.

**Modify** dashboard + categories GET controllers: key = route + normalized query params; hit → cached body; miss → compute, cache, return.

**Invalidation (required, not optional)**:
- Every mutating controller action touching what these GETs serve (dashboard sections/items CRUD, offers CRUD, categories CRUD, products CRUD, shop open/close toggle, settings update) calls `bust('dashboard')` / `bust('categories')` as appropriate. Grep each controller's mutation exports; list every bust site in the commit message.
- A missed site degrades to ≤30s staleness (TTL floor) — acceptable fallback, but the sweep is the task.

**Tests**: `apps/api/tests/microCache.test.js` (ttl expiry, bust-by-prefix, eviction) + one integration-style test asserting a mutation busts the dashboard cache.

Do NOT cache auth-scoped endpoints. Do NOT cache mutations. Do NOT add redis.

### [ ] TASK 12 — DB index audit for hot product queries

1. Run `EXPLAIN` on: the main `GET /products` query with a category filter, the dashboard `product_block` item query, and the `offer_banner` item query. Use a throwaway script against the dev DB (`APP_ENV=development`) — keep it OUT of the commit. Record full-table scans in the commit message.
2. For each scan, add a composite index via the existing `ensureIndex` helper (`migrate.js` ~line 455; follow the `idx_orders_*` examples at 466–468). Candidates — confirm with EXPLAIN first, never add blindly: `products (deleted, available, category_id)`, `dashboard_section_items (section_id, item_type, active)`.
3. Additive and idempotent only. Do not drop or modify existing indexes.
4. Re-run the EXPLAINs; commit message states before/after access type per query.

---

## PHASE 5 — client micro-optimizations (customer-app)

### [ ] TASK 13 — list image recycling hints

**Modify** `ProductImage.js`: accept optional `recyclingKey`, forward to both `<Image>` instances (prevents recycled cells flashing the previous cell's image). **Modify** `ProductCard` to pass `recyclingKey={String(product.id)}`.

Also reset the internal `error` state when `uri` changes (today a failed image in a recycled cell keeps the fallback for the next product) — `useEffect` on `uri`.

No other prop changes — do not set `cachePolicy` (default is already memory-disk).

---

## PHASE 6 — scale & cost (10,000 users without server/DB bill growth)

Cost at scale = (requests reaching Node) × (queries reaching MySQL/Mongo) × (bytes leaving the server). Phases 3–4 cut queries and bytes; this phase cuts request volume and makes image bytes cacheable outside Node.

### [ ] TASK 14 — long-lived HTTP caching for uploaded images

Filenames are collision-unique (finding N) → a URL's content never changes → immutable caching is safe.

1. **Modify** `app.js`: `express.static` for `STATIC_UPLOAD_PATH` (~line 65) gets `{ maxAge: '30d', immutable: true }`.
2. **Modify** `deploy/nginx-serveloco.conf`: read the API server block first. If it proxies the uploads path to Node, do NOT add a second Cache-Control (duplicate headers) — Node's header passes through; optionally add `proxy_cache` for offload. If nginx serves uploads directly from disk, add a `location` with `expires 6M; add_header Cache-Control "public, max-age=15552000, immutable";` mirroring the existing `/assets/` block style. State which case applied in the commit message.
3. S3 mode: check `s3.uploadBuffer` sets `CacheControl`; if not, add the same immutable header for NEW uploads (do not rewrite existing objects).
4. Verify: `curl -sI` one disk image → `Cache-Control` with `immutable` present, exactly once.

### [ ] TASK 15 — general API rate limiter (abuse cost cap)

Route-specific limiters exist (auth/upload/analytics); everything else is unbounded — one buggy loop or scraper = unbounded DB cost. `trust proxy` is already set (finding O), so per-IP limiting behind nginx is correct.

**Modify** `app.js`: ONE `express-rate-limit` instance on `/api` — generous per-IP, 300 req/min, `standardHeaders: true`. Mount AFTER the health route (health must never 429) and BEFORE the API routers. Existing stricter limiters stay.

**Test**: extend an app-level test file: 429 after limit, health exempt.

### [ ] TASK 16 — client request diet (multiplies across 10k installs)

Two sub-commits — API first, then app.

**16a (apps/api)** — `notification.unread_count.updated` is emitted ONLY from `src/realtime/orderEvents.js` (~line 115). Grep every code path that creates customer notifications or changes read state (notification controller, admin broadcast path, mark-read endpoints). Each must emit the same event with the fresh count to that customer's room. Reuse the existing emit helper; follow the orderEvents payload shape exactly. Extend an API test if the realtime layer has test coverage; otherwise document manual verification in the commit message.

**16b (apps/customer-app)**:
1. **Focus-revalidation throttle**: revalidate-on-focus (TASK 7 screens + Home's existing one) fires on every focus — tab-hoppers cause request storms. Use `isFresh(key, 15000)` from TASK 1: skip the background revalidate when the entry is <15s old. Pull-to-refresh always bypasses. Realtime invalidation (TASK 7.2) deletes entries, so event-driven changes bypass the throttle automatically.
2. **Drop the per-focus unread poll** — and ONLY that. Verified current state: HomeScreen ALREADY subscribes to `notification.unread_count.updated` (badge set directly from `payload.unreadCount`), to `notification.created` (debounced `queueUnreadRefresh`), and to lifecycle `reconnected`/`foreground` events as a catch-up backstop. All of that stays untouched. Delete exactly two polls: the `getUnreadCount()` call inside the `useFocusEffect` (~line 236) and nothing else — the `getUnreadCount()` inside `loadHomeData` remains as the cold-start baseline. Safe only because 16a made the socket event fire from every notification path.
3. Grep customer-app for `setInterval` that hits the network; list findings in the commit message (fix only if trivially redundant — otherwise just document).

### [ ] TASK 17 — broadcast thundering herd jitter

Shop open/close broadcasts hit ALL customers at once (`customers` room, finding Q); every connected client refetching in the same second is a self-inflicted spike. TASK 11's micro-cache makes the DB safe; this spreads the network spike.

**Modify** the customer-app handler that refetches on shop-status events (find via `subscribeShopEvents` usage): wrap the refetch in `setTimeout(refetch, Math.random() * 3000)`. Clear the pending timer on unmount and when a newer event supersedes it. Keep it that small.

### [ ] TASK 18 — post-optimization measurement

1. Repeat TASK 0's exact autocannon runs against the local dev API (same seeds, same flags).
2. Fill the "after" column of `## Measured results`; add a change column.
3. If any endpoint's p99 exceeds 500ms at 50 connections, add a note describing the bottleneck found (EXPLAIN, logs) — do NOT fix it in this task.
4. No new dependencies (`npx autocannon` ad hoc), no deploy/docker changes.

---

## PHASE 7 — verification sweep

### [ ] TASK 19 — end-to-end pass + notes

1. `npm test` + `npm run lint` (if script exists) in `apps/customer-app`; `npm test` in `apps/api`. All green.
2. Grep touched screens for any `setIsLoading(true)` that can fire while cached data exists — Rule 10 violations. Fix any found.
3. Manual test list (run in Expo, note results in the checkbox):
   - Cold start → Home skeleton once → switch mode → instant → switch back → instant.
   - Categories → back → Categories again → instant.
   - Open category product list → back → same list → instant, no skeleton.
   - Scroll product list to bottom → next page appends with footer spinner (TASK 8).
   - Tap product from list → detail renders with zero loader (TASK 6).
   - Change sort on product list → no network request (verify via logging).
   - Product cards load thumbnail URLs, detail screen loads full-size (TASK 9 — verify via request log).
   - Airplane mode after content cached → screens still show content, no crash, no error flash.
   - Pull-to-refresh forces fresh data everywhere, including <15s-old cache (TASK 16 bypass).
   - Admin edit (e.g. deactivate an offer) → visible in app within seconds (micro-cache bust) — admin panel + app side by side.
   - Order status change → unread badge updates from socket without focus change (TASK 16).
4. `curl -w '%{time_total}'` ×5 on `GET /api/dashboard` (cold + warm cache), note medians in the checkbox.

---

## Out of scope (do NOT do, even if tempting)

- Persisting API data to disk/AsyncStorage.
- Hermes/bundle/startup optimizations, navigation lib changes.
- Rewriting screens to react-query or any data library.
- Server-side response-shape slimming (violates casing contract).
- Redis/memcached/CDN provisioning — infra stays as is; nginx config edits in TASK 14 only.
- Web app (apps/web) — separate effort.
- Admin/shop-owner/rider screens.

---

## Measured results

| Endpoint | Before (req/s / p99) | After (req/s / p99) | Change |
|----------|----------------------|---------------------|--------|
| GET /api/dashboard?storeType=fast_food | 3240.8 / 38ms | _TASK 18_ | |
| GET /api/products?type=fast_food | 14689.6 / 13ms | _TASK 18_ | |
| GET /api/categories?type=fast_food | 14734.67 / 13ms | _TASK 18_ | |
