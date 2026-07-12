# Customer App Speed v2 — Load Reduction + Correctness Polish

Spec for implementing AI. Builds on `perf/customer-app-speed` (TASK 0–19). Goal: further cut server load and fix remaining list correctness issues **without** changing cart/checkout/order workflows.

Branch: `perf/customer-app-speed-v2`

---

## RULES

1. Do exactly what each task says. No drive-by refactors.
2. Tasks in order. One commit per task: `perf: v2 TASK <n> — <short title>`.
3. After customer-app changes: `npm test` in `apps/customer-app` + eslint on touched files.
4. After API changes: `npm test` in `apps/api`.
5. API response shape is a contract (camelCase + snake_case). Additive only.
6. No new dependencies.
7. In-memory cache only for API product data (no AsyncStorage for prices).
8. DO NOT TOUCH: coupons, order locking, cart stores, auth, Home mode-cache implementation (except if a task explicitly names a line).

---

## TASK list

### [x] TASK 1 — ProductList in-flight request guard
> fetchGenRef/loadMoreGenRef; stale responses ignored.
**Why:** Fast category/search changes can let an older fetch overwrite newer state → wrong list + wasted requests.

**Modify** `apps/customer-app/src/screens/customer/ProductListScreen/ProductListScreen.js`:
- Add `fetchGenerationRef` (or requestId) incremented at start of each non-loadMore fetch and each loadMore.
- When response returns, ignore if generation !== current for that request type (or compare cacheKey).
- Same for silent focus revalidate and pull-to-refresh.

**Test:** unit-style not required if hard; run full `npm test`. Manually reason: stale path cannot call setProducts.

### [x] TASK 2 — Focus revalidate must not drop loaded pages
> silent revalidate merges page-0 into list; keeps later pages + nextOffset.
**Why:** Silent revalidate currently replaces with page-0 only after user load-more'd.

**Modify** ProductListScreen:
- On silent revalidate (focus / cache revalidate of offset 0): update only the first `PAGE_SIZE` window of products in place OR merge page-0 results into `products.slice(0, PAGE_SIZE)` and keep `products.slice(PAGE_SIZE)`.
- Keep `hasMore` / `nextOffsetRef` based on existing nextOffset if pages already loaded (do not reset nextOffset to PAGE_SIZE if we already have more pages unless pull-to-refresh).
- Pull-to-refresh still resets to offset 0 and drops appended pages.

### [x] TASK 3 — Prefetch next product page (reduce scroll waits + smoother load)
> onEndReachedThreshold 0.6 + existing loadMoreInFlight guard (earlier page fetch while scrolling).
**Modify** ProductListScreen:
- When list is ~60% through visible content (`onEndReachedThreshold` already 0.4 — add proactive prefetch when `hasMore && !isLoadingMore` and products length >= PAGE_SIZE), call same load-more path (guarded by in-flight ref).
- Deduplicate: only one load-more in flight (already have `loadMoreInFlightRef`).

### [ ] TASK 4 — Prefetch product full image on card press-in
**Why:** Detail opens with full-size image already in expo-image cache.

**Modify** ProductCard and/or ProductListScreen/Home card handlers:
- On `onPressIn` (where ProductCard already has press handlers), if product has `imageUrl`/`imageUri`, `ExpoImage.prefetch([url])` fire-and-forget.
- Do not change add-to-cart behavior.

### [ ] TASK 5 — microCache bust on combo CRUD + bulk import
**Why:** Dashboard combo_block / product lists can stay stale ≤30s after admin combo edits or bulk import.

**Modify:**
- `apps/api/src/controllers/comboController.js` — after successful create/update/delete/availability mutations: `microCache.bust('dashboard')` (and categories if product counts change — dashboard only is enough for combos).
- `apps/api/src/controllers/bulkImportController.js` — after successful import commit: `bust('dashboard')` + `bust('categories')`.

**Test:** `npm test` in apps/api.

### [ ] TASK 6 — Verification
- `npm test` customer-app + api
- Tick all boxes with one-line notes
- Commit message summary in final note

---

## Out of scope
- Slim list API projection (needs careful client contract work — later)
- Redis/CDN
- Cart/checkout changes
- Web app
