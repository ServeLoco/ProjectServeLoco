# Bulk Product CRUD — Build Plan (Revised)

---

## Summary

Build bulk product CRUD around two flows:

1. **Checkbox-based table actions** — bulk availability, featured, category-move, and delete
   from the Products table. Replace the current per-ID `Promise.allSettled` loops with a
   single batch API call per action.

2. **Spreadsheet import** — move from all-or-nothing to partial-success. Bad rows are
   skipped with a reason; valid rows still import. Add human-friendly `category` name
   support and an optional `mode` column for validation only.

---

## Codebase Context (What Already Exists)

Read before implementing anything.

### Products Page (`adminManager-V1/src/pages/Products.jsx`)
- ✅ Checkboxes exist — header "select all" and per-row toggles
- ✅ Bulk toolbar exists — appears when `selectedIds.length > 0`
- ✅ Existing toolbar actions: **Mark In Stock**, **Mark Out of Stock**, **Delete**
- ❌ Existing actions use per-ID loops via `Promise.allSettled` — NOT a batch API
- ❌ No **Mark Featured / Unmark Featured** action
- ❌ No **Move to Category** action
- ❌ No confirmation step before bulk delete

### Bulk Import (`Backend-V1/src/controllers/bulkImportController.js`)
- ✅ CSV parse, ZIP extraction, image magic-byte validation, image cleanup on rollback
- ✅ Create vs update matching by `name + category_id`
- ❌ ALL-OR-NOTHING — rejects the entire file if any row has a validation error
- ❌ No `mode` column support — mode is derived from `category_id` → `categories.type`
- ❌ No `category` name lookup — only `category_id` accepted
- ❌ No `id` / `product_id` column support for explicit update targeting
- ❌ No partial image handling on update — image always required

### Backend Routes (`Backend-V1/src/routes/adminRoutes.js`)
- ✅ `POST /products/bulk-import` exists (preview + commit via `?preview=true`)
- ❌ `PATCH /products/bulk` — does NOT exist
- ❌ `DELETE /products/bulk` — does NOT exist

### Products Controller (`Backend-V1/src/controllers/productController.js`)
- ✅ `updateProduct` — full replacement PUT (requires all fields)
- ✅ `deleteProduct` — soft-delete (`deleted = 1`)
- ❌ No `bulkUpdate` or `bulkDelete` controller functions

### Database Schema
- **`products` table** — NO `store_type` or `mode` column. Mode is purely inherited
  from `categories.type` (values: `'packed'` or `'fast_food'`).
- **`categories` table** — `type` column (NOT `store_type`) holds `'packed'` or `'fast_food'`.
- Product mode = `JOIN categories ON products.category_id = categories.id` → `categories.type`

### API Client (`adminManager-V1/src/api/index.js`)
- ✅ Existing: `list`, `create`, `update`, `delete`, `updateAvailability`, `attachImage`,
  `bulkPreview`, `bulkImport`
- ❌ Missing: `bulkUpdate(ids, updates)`, `bulkDelete(ids)`

### BulkImport UI (`adminManager-V1/src/pages/BulkImport.jsx`)
- ✅ 3-step wizard: upload → preview → done
- Preview table shows: Row, Name, Price, Category ID, Unit, Image File, Action badge
- Required column hint: `name, price, category_id, unit, image_file`
- ❌ No `mode` column shown
- ❌ No `category` name column shown
- ❌ No `id`/`product_id` column shown
- ❌ No skipped rows display (only valid/error rows exist currently)

---

## Issues & Inconsistencies Found — Resolved

### Issue 1 — `mode` column is not a DB field; it's a category attribute

**Problem:** The plan proposed a `mode` column in the CSV as if products have their own
store type. They do not. The `products` table has no `store_type` or `mode` column.
Mode is derived from `categories.type`.

**Resolution:** The `mode` column in the CSV is **optional** and used only for validation.
When supplied, the import validates that the resolved category's `type` matches the mode
value. Mode is never written to the products table. The column is named `mode` in the
CSV but maps to `categories.type` in the DB.

Accepted `mode` values (normalize all to `packed` or `fast_food`):

| CSV value | Normalizes to |
|-----------|---------------|
| `packed` | `packed` |
| `packed items` | `packed` |
| `packed_items` | `packed` |
| `fast` | `fast_food` |
| `fast food` | `fast_food` |
| `fast_food` | `fast_food` |

If `mode` is supplied and doesn't match the resolved category's `type`, skip the row
with reason: `"mode 'fast' does not match category type 'packed'"`.

---

### Issue 2 — `category` name lookup can be ambiguous

**Problem:** The plan says "prefer human-friendly `category` name." But two categories
can share the same name (e.g., two shops both have a "Snacks" category). A name-only
lookup returns multiple rows — ambiguous.

**Resolution:** When looking up by name:
```sql
SELECT id, name, type FROM categories WHERE name = ? AND deleted = 0
```
- If 0 results → skip row: `"category 'Snacks' not found"`
- If 2+ results → use `mode` to disambiguate: pick the row where `type` = normalized
  mode. If `mode` is absent and multiple categories match name, skip row with reason:
  `"multiple categories named 'Snacks' found — supply mode or category_id to disambiguate"`
- If exactly 1 result → use it (validate mode if supplied)

---

### Issue 3 — Partial-success conflicts with MySQL transaction approach

**Problem:** The current import uses `beginTransaction() / commit() / rollback()`. With
partial success, you cannot roll back only some rows — MySQL transactions are all-or-nothing.

**Resolution:** Two-phase approach:
1. **Phase 1 — Validate all rows** (no transaction, no writes). Categorize each row as
   `valid` (→ create/update) or `skipped` (→ reason stored).
2. **Phase 2 — Commit valid rows only** in a single MySQL transaction. If the transaction
   itself fails (DB error), roll back MySQL and run `cleanupFiles(savedFiles)` for all
   images written so far in this commit.

Skipped rows are never written. The commit will proceed if at least one row is valid.

---

### Issue 4 — Image cleanup with partial success

**Problem:** In all-or-nothing, one `cleanupFiles(savedFiles)` call on rollback is enough.
With partial success and per-row image saves inside the commit loop, a mid-loop failure
must clean up only the images saved so far in that run.

**Resolution:** `savedFiles` array is still populated in order as the commit loop runs.
On MySQL rollback (mid-loop failure), `cleanupFiles(savedFiles)` cleans up all images
written in the current transaction — same pattern as before. Also clean up the newly
inserted MongoDB image docs for those files:
```js
for (const imageId of savedMongoIds) {
  await db.collection('images').deleteOne({ _id: new ObjectId(imageId) });
}
```
Track `savedMongoIds` alongside `savedFiles`.

---

### Issue 5 — Route registration order: `/products/bulk` vs `/products/:id`

**Problem:** Express matches routes in registration order. If `DELETE /products/:id`
is registered before `DELETE /products/bulk`, Express matches `:id = "bulk"` and
the bulk route never fires.

**Resolution:** Register bulk action routes **before** parameterized routes in
`adminRoutes.js`:
```
PATCH  /products/bulk-import  ← already before /:id (correct)
PATCH  /products/bulk         ← register BEFORE /:id routes
DELETE /products/bulk         ← register BEFORE DELETE /:id
GET    /products/:id
POST   /products
PUT    /products/:id
DELETE /products/:id          ← AFTER bulk
```

---

### Issue 6 — Existing bulk delete has no confirmation step

**Problem:** The current `handleBulkDelete` in Products.jsx calls delete immediately
via `Promise.allSettled` with no confirmation dialog.

**Resolution:** Add a `confirmPending` state (same pattern as BulkImport.jsx) that shows
an inline amber confirmation bar before executing delete. Show the count of items to be
deleted in the bar.

---

### Issue 7 — ZIP file should be optional when all update rows have no image_file

**Problem:** The current API requires both `csvFile` and `imagesZip` via multer `.fields()`.
Partial success allows update rows with no `image_file` (keeps existing image). If every
row is an update with no new image, forcing a ZIP upload is bad UX.

**Resolution:** Make `imagesZip` optional in multer. Validate in the controller:
- If any row has a non-empty `image_file` value AND no ZIP was uploaded → skip those rows
  with reason `"image_file supplied but no ZIP was uploaded"`
- If no row has `image_file` → ZIP not needed

---

### Issue 8 — Mixed-mode selection in bulk category move

**Problem:** The plan says "Category dropdown shows only categories from current mode tab."
But the admin can select products from different mode tabs simultaneously (or use no filter).
The plan does not address what happens when selected products span both modes.

**Resolution:**
- UI: Category dropdown in toolbar always filters by the **currently active mode tab** in
  the Products page (Packed Items or Fast Food). If no mode tab is active (showing all),
  the dropdown shows all categories grouped by mode.
- Backend: `PATCH /products/bulk` does not enforce category-mode matching. It only checks
  that the target `category_id` exists and is not deleted. Cross-mode moves are allowed
  by design — the admin takes responsibility.
- Document this clearly in UI: a tooltip/note saying "Moving products across modes changes
  where they appear in the app."

---

### Issue 9 — `product_id` column name normalization

**Problem:** The plan supports both `id` and `product_id` as update-matching columns.
Parsing must normalize these before checking.

**Resolution:** In the row parser: `const rowId = raw.id || raw.product_id || null`.
If `rowId` is present, strip non-numeric characters and parse as integer. Reject non-numeric
with skip reason: `"id '${raw.id}' is not a valid product ID"`.

---

### Issue 10 — DB column naming: `categories.type` not `categories.store_type`

**Problem:** The plan and several tasks use the term "store_type" which implies a DB column
called `store_type`. The actual column is named `type` in the `categories` table.

**Resolution:** All code and this plan use `categories.type` when referring to the DB column.
"Mode" is the human-readable term used in the UI, CSV, and plan prose. "categories.type"
is the DB term.

---

## Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Bulk update fields (v1) | `available`, `featured`, `category_id` only | Keeps API surface small; name/price changes are intentional single-product edits |
| Partial-success import | Yes — skip bad rows, commit valid | Better for large imports; bad rows are fixable without re-uploading everything |
| Mode enforcement in bulk move | UI filter only; backend allows cross-mode | Admin intent should not be over-constrained |
| Image on update | Optional — omit to keep existing | Saves upload time; forced re-upload on every update is wasteful |
| ZIP requirement | Optional when no image_file in any row | Better UX for update-only imports |
| Route path for bulk actions | `/products/bulk` | Consistent with existing `/products/bulk-import` naming |

---

## Tasks

### 1. Backend — Bulk Product Update / Delete APIs

- [ ] Add `bulkUpdateProducts` controller in `productController.js`.
  - [ ] Accept `{ ids: number[], updates: { available?, featured?, category_id? } }`.
  - [ ] Validate `ids` is non-empty array of integers.
  - [ ] Validate `updates` contains at least one of: `available`, `featured`, `category_id`.
  - [ ] Reject any other field in `updates` with 400.
  - [ ] If `category_id` present: `SELECT id FROM categories WHERE id = ? AND deleted = 0`
        — reject if not found.
  - [ ] `SELECT id FROM products WHERE id IN (?) AND deleted = 0` to find valid targets.
  - [ ] IDs not in the result are `skipped` (missing or already deleted).
  - [ ] Build dynamic UPDATE SET clause from present fields only.
  - [ ] Return `{ updated, skipped, errors: [] }`.

- [ ] Add `bulkDeleteProducts` controller in `productController.js`.
  - [ ] Accept `{ ids: number[] }`.
  - [ ] Validate `ids` is non-empty array of integers.
  - [ ] `UPDATE products SET deleted = 1 WHERE id IN (?) AND deleted = 0`.
  - [ ] Compute `skipped = ids.length - affected rows`.
  - [ ] Return `{ deleted, skipped, errors: [] }`.
  - [ ] Do NOT delete product_combo_items — combos are managed separately.

- [ ] Register new routes in `adminRoutes.js`.
  - [ ] Register `PATCH /products/bulk` **before** `PATCH /products/:id/...` routes.
  - [ ] Register `DELETE /products/bulk` **before** `DELETE /products/:id` route.
  - [ ] Both routes: `requireAdmin` + `auditLog`.
  - [ ] Add validators for bulk update body (non-empty ids array, valid updates object).
  - [ ] Add validator for bulk delete body (non-empty ids array).

---

### 2. Admin UI — Products Table Bulk Toolbar

- [ ] Keep existing checkbox behavior (select-all header + per-row toggle).
  - [ ] Clear `selectedIds` after: filter change, page change, successful bulk action.

- [ ] Extend existing bulk toolbar with new actions.
  - [ ] Add **Mark Featured** button.
  - [ ] Add **Remove Featured** button.
  - [ ] Add **Move to Category** dropdown.
    - [ ] Populate from `CategoriesApi.list()` (already fetched on mount).
    - [ ] Filter dropdown options by current active mode tab when a mode tab is selected.
    - [ ] When no mode tab active, show all categories grouped by mode label.
    - [ ] Disable "Move" button until a category is selected from dropdown.
    - [ ] Show note: "Moving products across modes changes their storefront section."
  - [ ] Add confirmation bar before **Delete** (amber inline bar like BulkImport.jsx).
    - [ ] Show: "⚠️ Delete X selected products? This cannot be undone." + Cancel / Confirm.

- [ ] Replace per-ID loops with single batch API calls.
  - [ ] `handleBulkAvailability(true/false)` → `ProductsApi.bulkUpdate(ids, { available })`
  - [ ] `handleBulkFeatured(true/false)` → `ProductsApi.bulkUpdate(ids, { featured })`
  - [ ] `handleBulkMoveCategory(categoryId)` → `ProductsApi.bulkUpdate(ids, { category_id })`
  - [ ] `handleBulkDelete()` → `ProductsApi.bulkDelete(ids)` (after confirmation)

- [ ] Add API client methods in `api/index.js` under `ProductsApi`.
  - [ ] `bulkUpdate: (ids, updates) => apiClient('/admin/products/bulk', { method: 'PATCH', body: { ids, updates } })`
  - [ ] `bulkDelete: (ids) => apiClient('/admin/products/bulk', { method: 'DELETE', body: { ids } })`

- [ ] Handle results in toolbar.
  - [ ] Show success toast/banner: "X products updated."
  - [ ] If `skipped > 0`: "X updated, Y skipped (already deleted)."
  - [ ] On error: generic "Something went wrong. Please try again later." + `console.error`.
  - [ ] Refresh product list after every successful action.
  - [ ] Clear `selectedIds` after action.

---

### 3. Backend — Bulk Import: Partial-Success & Extended Columns

- [ ] Add new column parsing in `parseAndValidate` / `validateRows`.
  - [ ] Read `id` or `product_id` column → `rowId` (normalize: `raw.id || raw.product_id`).
  - [ ] Read `mode` column → normalize to `packed` or `fast_food` using alias table.
    Invalid/unrecognized mode → skip row with reason.
  - [ ] Read `category` column (name-based lookup) in addition to existing `category_id`.
  - [ ] Resolve category in this order:
    1. `category_id` present → validate it exists in DB.
    2. `category` name present → lookup `categories` by name.
       - 0 results → skip row.
       - 2+ results, `mode` supplied → pick match where `type` = normalized mode.
       - 2+ results, no `mode` → skip row with disambiguation reason.
       - 1 result → use it.
    3. Neither supplied → skip row: "category or category_id is required".
  - [ ] If `mode` supplied, validate resolved category's `type` matches normalized mode.
    Mismatch → skip row with reason.

- [ ] Update update-matching logic.
  - [ ] If `rowId` present: `SELECT id, image_id FROM products WHERE id = ? AND deleted = 0`.
    - Not found → skip row: `"product ID ${rowId} not found"`.
    - Found → `_action = 'update'`.
  - [ ] If no `rowId`: existing name+category_id match logic.
    - Found → `_action = 'update'`.
    - Not found → `_action = 'create'`.

- [ ] Make image handling conditional on action.
  - [ ] `_action = 'create'` + no `image_file` → skip row: "image_file required for new products".
  - [ ] `_action = 'update'` + no `image_file` → mark `_keepExistingImage = true`, do not
    require ZIP entry.
  - [ ] `_action = 'update'` + `image_file` present → require ZIP entry (same as create).
  - [ ] If any row needs a ZIP entry but no ZIP was uploaded → skip those rows with reason.

- [ ] Change validation from all-or-nothing to row-level.
  - [ ] `validateRows` returns `{ validRows: [], skippedRows: [{ row, reason }] }`.
  - [ ] `previewBulkImport` returns both `validRows` and `skippedRows` in response.
  - [ ] `commitBulkImport` proceeds if `validRows.length > 0` (even if skipped exist).
  - [ ] Commit loop processes only `validRows`.
  - [ ] On MySQL rollback: `cleanupFiles(savedFiles)` + delete inserted MongoDB docs from
    `savedMongoIds`.

- [ ] Handle partial updates (missing optional columns keep existing values).
  - [ ] For update rows, build UPDATE SET only from columns present in the CSV row.
  - [ ] Missing `available` on update → omit from UPDATE SET.
  - [ ] Missing `featured` on update → omit from UPDATE SET.
  - [ ] Missing `description`, `price`, `unit`, etc. on update → omit (keep existing).
  - [ ] `name` and `category_id` are always required even on updates (used for matching).

- [ ] Update `previewBulkImport` response shape.
  ```json
  {
    "preview": true,
    "summary": {
      "total": 10,
      "valid": 7,
      "will_create": 4,
      "will_update": 3,
      "skipped": 3,
      "error_count": 0
    },
    "rows": [...valid rows...],
    "skipped": [{ "row": 3, "name": "Chips", "reason": "image_file required for new products" }],
    "errors": []
  }
  ```

- [ ] Make `imagesZip` optional in multer config.
  - [ ] Change `.fields()` to allow `imagesZip` maxCount 1 but not required.
  - [ ] Add controller guard: if any `image_file` value present but ZIP absent, skip those
    rows (not a 400 error).

---

### 4. Admin UI — Bulk Import Preview Improvements

- [ ] Update upload guide / column reference panel.
  - [ ] **Required for create:** `mode` (optional but recommended), `category` OR `category_id`,
    `name`, `price`, `unit`, `image_file`
  - [ ] **Optional for update:** `id` or `product_id` (explicit match), `description`,
    `available`, `featured`, `display_order`, `original_price`, `discount_label`
  - [ ] Add accepted `mode` values: `packed / packed items / fast / fast food`
  - [ ] Explain: "For updates, omit `image_file` to keep the existing product image."

- [ ] Update preview table columns.
  - [ ] Add: **Mode** (resolved from category or CSV column)
  - [ ] Add: **Category** (resolved name)
  - [ ] Add: **Status** badge — `valid` (green) or `skipped` (amber)
  - [ ] Add: **Reason** column — shown only for skipped rows
  - [ ] Visually separate skipped rows (muted/amber row background) from valid rows

- [ ] Show skipped rows section in step 2.
  - [ ] If `skipped > 0`, add a collapsible "Skipped Rows" section below the valid rows table.
  - [ ] Each skipped row shows: row number, name (if parsed), reason.

- [ ] Update preview summary stat cards.
  - [ ] Total | Will Create | Will Update | Skipped | Errors
  - [ ] Show "Skipped" card in amber.

- [ ] Update commit behavior.
  - [ ] Enable import button when `valid > 0` (even if `skipped > 0`).
  - [ ] Disable only when `valid === 0`.
  - [ ] Confirmation bar text: "Import X products (Y create, Z update)? X rows will be skipped."

- [ ] Improve error/skipped report download.
  - [ ] Include columns: `row`, `name`, `category`, `mode`, `action`, `status`, `reason`
  - [ ] Filename: `bulk-import-skipped-${Date.now()}.csv`

---

### 5. CSV Template

- [ ] Update `docs/bulk-import-template.csv`.
  - [ ] Add `mode` column (first column for visibility).
  - [ ] Add `category` column (human-friendly name).
  - [ ] Keep `category_id` as optional fallback column.
  - [ ] Add `id` / `product_id` column for update targeting example.
  - [ ] Include 3 packed-items example rows.
  - [ ] Include 2 fast-food example rows.
  - [ ] Include 1 update row with `product_id` and no `image_file` (demonstrating keep-existing-image).

- [ ] Add "Download CSV Template" button to BulkImport.jsx step 1.
  - [ ] Generate template in-browser from a static column list (no server request needed).
  - [ ] Filename: `bulk-import-template.csv`

---

### 6. Acceptance Criteria

- [ ] Admin can bulk mark many products in/out of stock in one API call.
- [ ] Admin can bulk mark/unmark many products as featured in one API call.
- [ ] Admin can move many selected products to a different category in one API call.
- [ ] Admin can delete many selected products after an inline confirmation step.
- [ ] All bulk table actions use batch APIs (`PATCH /bulk`, `DELETE /bulk`) — no per-ID loops.
- [ ] Bulk import supports category lookup by name and optional `mode` validation.
- [ ] Update rows can omit `image_file` to keep the existing product image.
- [ ] Invalid/incomplete CSV rows are skipped with a human-readable reason.
- [ ] Valid rows import successfully even when other rows in the same file are skipped.
- [ ] Import preview clearly separates valid, create, update, and skipped rows.
- [ ] Route registration order prevents `/products/bulk` from being matched as `/:id = "bulk"`.
- [ ] Existing single-product create / edit / delete behavior is unchanged.

---

## Key Implementation Notes

> **Route order in `adminRoutes.js`:** Register `PATCH /products/bulk` and
> `DELETE /products/bulk` before any `/:id` parameterized routes to prevent
> Express from matching `"bulk"` as an ID.

> **`categories.type` not `store_type`:** The DB column is named `type`. Always
> use `categories.type` in SQL. Use "mode" only in user-facing text and CSV columns.

> **Partial commit transaction:** Phase 1 = validate all rows (no DB writes).
> Phase 2 = single MySQL transaction for valid rows only. On failure: rollback MySQL,
> `cleanupFiles(savedFiles)`, delete from MongoDB by `savedMongoIds`.

> **`product_combo_items` side effect:** The existing `updateProduct` (PUT) deletes
> combo items as a side effect. The new `bulkUpdateProducts` only modifies
> `available`, `featured`, `category_id` — it must NOT delete combo items.
