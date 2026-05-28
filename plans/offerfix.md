# Offer Banner Image-Only Fix Plan

## Goal

Fix offer banners so the customer mobile dashboard shows only the uploaded banner image, with no manually drawn text, no overlay, and no CTA button on top of the image.

Admin must be able to create offer banners separately for both modes:

- Packed Items
- Fast Food

Admin must also decide whether an offer banner is clickable. If it is clickable, tapping the banner should open a product list containing only the products attached to that offer.

## Current Problem

- `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js` currently renders offer banners using `ImageBackground`.
- The app manually writes text on top of the banner:
  - `Limited offer`
  - offer title
  - offer description
  - `Shop Offer` button
- Every offer banner is currently pressable.
- The public product list does not truly load products attached to an offer. It only sends `offerId` and then filters products by `discountLabel`, which can show wrong products.
- The `offers` table does not currently store whether an offer is clickable.
- The database does not currently have a direct offer-to-products relation.

## Required Final Behavior

- Offer banner section on Home must render as a simple picture banner.
- If the offer has no uploaded image, do not show a customer-facing fake text banner.
- If `is_clickable` is false, the banner must not be pressable.
- If `is_clickable` is true, tapping the banner opens `ProductList`.
- `ProductList` must show only active, available, non-deleted products attached to that offer.
- Packed mode must only show packed offer banners and packed offer products.
- Fast Food mode must only show fast food offer banners and fast food offer products.
- Old or accidentally shared `all` dashboard offer sections must not leak banners across modes.
- Admin must be able to:
  - upload/change banner image
  - set mode: packed or fast food
  - set active/inactive
  - set clickable on/off
  - attach products to clickable offers
  - remove products from an offer

## Checklist

### 1. Backend database migration

- [ ] Update `Backend-V1/src/db/migrate.js`.
- [ ] Add a boolean column to `offers`:
  - column name: `is_clickable`
  - type: `BOOLEAN`
  - default: `FALSE`
  - placement: after `store_type` if possible
- [ ] Create a new table named `offer_products`.
- [ ] `offer_products` columns:
  - `id INT AUTO_INCREMENT PRIMARY KEY`
  - `offer_id INT NOT NULL`
  - `product_id INT NOT NULL`
  - `display_order INT NOT NULL DEFAULT 0`
  - `active BOOLEAN DEFAULT TRUE`
  - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  - `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
- [ ] Add a unique key on `(offer_id, product_id)`.
- [ ] Add indexes on:
  - `offer_id`
  - `product_id`
  - `active`
- [ ] Add foreign keys:
  - `offer_id` references `offers(id)` with cascade delete
  - `product_id` references `products(id)` with restrict delete
- [ ] Keep migration idempotent using existing migration style.
- [ ] Do not remove existing offer title/description fields, because admin may still need internal labels.
- [ ] Add a migration cleanup step for existing dashboard offer sections:
  - convert or duplicate old `store_type = 'all'` offer banner sections into explicit `packed` and `fast_food` sections
  - remove or deactivate cross-mode offer items that do not match the section mode
  - never leave a public offer banner section with `store_type = 'all'`

### 2. Backend offer payload support

- [ ] Update `Backend-V1/src/controllers/settingsController.js`.
- [ ] In `createOffer`, accept both:
  - `is_clickable`
  - `isClickable`
- [ ] Save clickable value as `1` only when input is true, `"true"`, `1`, or `"1"`.
- [ ] Default new offers to `is_clickable = 0`.
- [ ] In `updateOffer`, allow updating `is_clickable`.
- [ ] Return `is_clickable` and `isClickable` in admin and public offer responses.
- [ ] Keep active-offer-per-mode behavior unchanged.
- [ ] Keep `store_type` validation unchanged: only `packed` and `fast_food`.
- [ ] When activating an offer, validate that it has a valid uploaded image ID or resolved image URL.
- [ ] If `is_clickable = 1` and the offer is active but has no attached products, allow save only with a clear admin warning; the customer app must show an empty offer list instead of wrong products.
- [ ] If an uploaded image is deleted or missing from MongoDB later, public responses must treat that offer as having no image and hide it from the dashboard banner.

### 3. Backend offer-products APIs

- [ ] Add admin APIs for managing offer products.
- [ ] Recommended routes in `Backend-V1/src/routes/adminRoutes.js`:
  - `GET /api/admin/offers/:id/products`
  - `POST /api/admin/offers/:id/products`
  - `DELETE /api/admin/offers/:id/products/:productId`
  - `PATCH /api/admin/offers/:id/products/reorder`
- [ ] Implement controller helpers in `settingsController.js` or a new offer controller.
- [ ] `GET /api/admin/offers/:id/products` must return attached products with image URLs.
- [ ] `POST /api/admin/offers/:id/products` must accept:
  - `product_id` or `productId`
  - optional `display_order`
- [ ] When attaching a product, validate:
  - offer exists
  - offer is not deleted
  - product exists
  - product is not deleted
  - product is available
  - product is not a combo
  - product category type matches offer `store_type`
- [ ] If product mode does not match offer mode, return `400 VALIDATION_ERROR`.
- [ ] If product is already attached, return success without creating duplicate, or return a clear validation error. Prefer success/idempotent behavior.
- [ ] `DELETE` should remove the product from the offer.
- [ ] Reorder API should update `display_order` for the given ordered product IDs.
- [ ] If an offer is deleted, hard-delete or cascade-delete its `offer_products` rows through the foreign key.
- [ ] If a product is later marked unavailable or deleted, keep the relation row but exclude it from public offer product results.
- [ ] If a product category mode changes after being attached to an offer, exclude it from public results and show it as invalid in admin until removed.

### 4. Backend public product filtering

- [ ] Update `Backend-V1/src/controllers/productController.js`.
- [ ] In `getProducts`, accept:
  - `offerId`
  - `offer_id`
- [ ] If an offer ID is provided, join through `offer_products`.
- [ ] Before returning offer products, validate the offer:
  - offer exists
  - offer is not deleted
  - offer is active
  - offer is clickable
  - offer mode matches requested `storeType` when provided
- [ ] If the offer fails validation, return `200` with an empty products array so the app shows a normal empty state.
- [ ] Only return products where:
  - `offer_products.offer_id = ?`
  - `offer_products.active = 1`
  - product is available
  - product is not deleted
  - product is not combo
  - product category type matches requested `storeType` when provided
- [ ] Sort offer products by:
  - `offer_products.display_order ASC`
  - product display order ASC
  - product id ASC
- [ ] Remove reliance on frontend `discountLabel` filtering for offer pages.
- [ ] Ignore category filters, combo filters, and featured filters when `offerId` is present; the attached offer products are the source of truth.

### 5. Backend dashboard offer banner response

- [ ] Update `Backend-V1/src/controllers/dashboardController.js`.
- [ ] For `offer_banner` section items, include:
  - `id`
  - `sectionItemId`
  - `title`
  - `description`
  - `imageUrl`
  - `image_id`
  - `active`
  - `storeType`
  - `store_type`
  - `isClickable`
  - `is_clickable`
- [ ] Filter out offers with no image from public dashboard banner response.
- [ ] Filter out deleted, inactive, expired, missing-image, and cross-mode offer banners.
- [ ] Do not filter out non-clickable offers; they should still appear as image-only banners.
- [ ] Keep dashboard section mode filtering:
  - packed dashboard returns packed offers only
  - fast food dashboard returns fast food offers only
- [ ] Keep multiple banners support because current Home uses carousel.
- [ ] If a dashboard section has only invalid/hidden offer items, hide that offer banner section entirely.

### 6. Admin API client updates

- [ ] Update `adminManager-V1/src/api/index.js`.
- [ ] Add methods under `OffersApi`:
  - `listProducts(id)`
  - `addProduct(id, productId)`
  - `removeProduct(id, productId)`
  - `reorderProducts(id, productIds)`
- [ ] Use existing `apiClient` and `withQuery` style.

### 7. Admin Offers UI updates

- [ ] Update `adminManager-V1/src/pages/Offers.jsx`.
- [ ] In offer create/edit drawer, add a checkbox:
  - label: `Banner is clickable`
  - field: `is_clickable`
- [ ] Include `is_clickable` and `isClickable` in create/update payload.
- [ ] Keep title and description as admin/internal fields.
- [ ] Make clear in UI that mobile banner displays only the uploaded image.
- [ ] Require an uploaded image before activating an offer, or show a blocking validation error if admin tries to activate without image.
- [ ] Show clickable status on offer cards:
  - `Clickable`
  - `Image only`
- [ ] When editing an offer and clickable is enabled, show product assignment panel.
- [ ] Product assignment panel requirements:
  - load candidate products using `ProductsApi.list({ limit: 100, is_combo: '0', available: '1', type: offer.store_type })`
  - show product image, name, price, category/mode
  - exclude already attached products from candidates
  - allow search by name
  - add product to offer
  - remove attached product
  - reorder attached products
- [ ] If clickable is off, hide product assignment or show it disabled with message `Enable clickable banner to attach products`.
- [ ] When offer mode changes, clear attached products only after confirmation, or block changing mode until products are removed. Prefer blocking mode change while products are attached.
- [ ] If an attached product later becomes unavailable, deleted, or mode-mismatched, show it in the attached list with an `Invalid` badge and a remove action.
- [ ] If a clickable offer has zero attached valid products, show a warning on the offer card and edit drawer.
- [ ] If admin turns clickable off, keep attached products in the database but do not navigate from the customer banner.

### 8. Admin Mobile Dashboard compatibility

- [ ] Check `adminManager-V1/src/pages/MobileDashboard.jsx`.
- [ ] Offer banner section candidate list should still load offers by current mode.
- [ ] Candidate row should show:
  - image thumbnail
  - title
  - active status
  - clickable status
  - mode
- [ ] Do not require dashboard editor to manage offer products; product targeting belongs in Offers page.
- [ ] Make sure packed layout can assign packed offers only.
- [ ] Make sure fast food layout can assign fast food offers only.
- [ ] Hide or disable offer candidates without uploaded images, because customer dashboard will not render them.
- [ ] If an old `all` offer banner section appears in admin, prompt admin to convert it to packed or fast food before saving.

### 9. Customer Home banner UI

- [ ] Update `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`.
- [ ] Replace text-overlay `OfferBannerCarousel` UI with image-only rendering.
- [ ] Remove these visible elements from banner:
  - `Limited offer`
  - title text
  - description text
  - `Shop Offer` button
  - dark overlay
- [ ] Use normal `Image` instead of `ImageBackground` unless a background wrapper is still needed.
- [ ] Maintain banner carousel scroll/dots behavior.
- [ ] Banner dimensions:
  - width: `windowWidth - spacing.md * 2`
  - height: about `150`
  - border radius: same as existing banner radius
  - resize mode: `cover`
- [ ] Filter out offers without image before rendering.
- [ ] If an offer is not clickable, render it as a plain `View`.
- [ ] If an offer is clickable, render it as `TouchableOpacity`.
- [ ] If an image fails to load, hide that banner item after the image error and keep the carousel stable.
- [ ] If all banner images fail or are filtered out, render no banner area instead of a blank box.
- [ ] Accessibility:
  - clickable banner: `accessibilityRole="button"`
  - non-clickable banner: no button role
  - label can use offer title internally, but do not display it visually

### 10. Customer offer click flow

- [ ] Update the `onOfferPress` logic in Home.
- [ ] Only navigate when `offer.isClickable` or `offer.is_clickable` is true.
- [ ] Navigate to `ProductList` with:
  - `mode: 'offer'`
  - `offerId: offer.id`
  - `offerTitle: offer.title`
  - `storeType: currentApiStoreType`
- [ ] Update `Frontend-V1/src/screens/customer/ProductListScreen/ProductListScreen.js`.
- [ ] Treat `mode === 'offer'` as an offer-product listing.
- [ ] Send `offerId` to `productsApi.getProducts`.
- [ ] Do not filter offer products by `discountLabel`.
- [ ] Product list title should use:
  - `offerTitle` if available
  - fallback: `Offer Products`
- [ ] Empty state should say no products are currently available for this offer.
- [ ] If a user opens an old offer screen after the offer is deactivated, deleted, changed to non-clickable, or switched to the other mode, show the empty state.
- [ ] Do not navigate to offer products from a non-clickable banner even if the offer has attached products.

### 11. Frontend API mapping

- [ ] Update `Frontend-V1/src/utils/apiMappers.js` only if needed.
- [ ] Ensure normalized offer data preserves:
  - `isClickable`
  - `is_clickable`
  - `imageUrl`
  - `image_url`
- [ ] Do not convert missing image offers into fallback visual banners.

### 12. Tests

- [ ] Backend tests.
- [ ] Add or update offer tests in `Backend-V1/tests/settingsOffers.test.js`:
  - create offer defaults to non-clickable
  - create offer can save clickable
  - update offer can toggle clickable
  - active offer response includes clickable fields
- [ ] Add product filtering tests in `Backend-V1/tests/productCategory.test.js` or a new offer-products test:
  - `GET /api/products?offerId=1&storeType=packed` returns only products attached to offer
  - products from wrong mode are excluded
  - deleted/unavailable products are excluded
- [ ] Add dashboard tests in `Backend-V1/tests/dashboard.test.js`:
  - offer banner items include `isClickable`
  - offer banners without image are not returned
  - packed dashboard does not return fast food offer banners
  - fast food dashboard does not return packed offer banners
- [ ] Frontend tests if practical:
  - image-only banner does not render manual offer text
  - non-clickable banner does not navigate
  - clickable banner navigates to ProductList with `mode: 'offer'`
  - missing or failed banner image hides the banner item
  - offer mode switch does not show products from the other mode

### 13. Edge Cases and Guardrails

- [ ] Missing image:
  - admin can save draft/inactive offer without image
  - admin cannot activate image-less offer without a blocking error
  - public dashboard hides image-less offers
- [ ] Clickable with no products:
  - admin shows warning
  - customer can open the offer only if banner is clickable
  - product list shows empty state, never fallback products
- [ ] Non-clickable with products:
  - products may remain attached for later reuse
  - banner stays non-pressable
  - no navigation happens from Home
- [ ] Mode mismatch:
  - admin cannot attach wrong-mode products
  - backend excludes wrong-mode products even if old data exists
  - public dashboard never mixes packed and fast food banners
- [ ] Stale dashboard section item:
  - if dashboard item points to deleted/inactive/missing-image offer, hide it publicly
  - admin should still be able to see and remove stale item from layout editor
- [ ] Direct API/manual URL access:
  - inactive, deleted, non-clickable, or wrong-mode `offerId` returns an empty product list
  - no private/admin-only data is exposed
- [ ] Multiple banners:
  - carousel must not break if some offers are filtered out
  - dots count must match only visible image banners
- [ ] Image sizing:
  - uploaded image should cover the banner without text overlay
  - important text inside the image should be centered by the admin/designer, because the app will not draw text on top

### 14. Manual QA

- [ ] Run backend migration.
- [ ] Create one packed offer with image and clickable off.
- [ ] Confirm packed Home dashboard shows only the image and tapping does nothing.
- [ ] Create one packed offer with clickable on and attach two packed products.
- [ ] Confirm tapping banner opens only those two products.
- [ ] Create one fast food offer with image and clickable off.
- [ ] Confirm fast food Home dashboard shows only the image and tapping does nothing.
- [ ] Create one fast food offer with clickable on and attach fast food products.
- [ ] Confirm tapping banner opens only those fast food products.
- [ ] Confirm admin cannot attach packed products to fast food offers.
- [ ] Confirm admin cannot attach fast food products to packed offers.
- [ ] Confirm no banner text or CTA is visible on customer Home.
- [ ] Delete or deactivate an attached product and confirm it disappears from the customer offer list.
- [ ] Remove an offer image and confirm the banner disappears from customer Home.
- [ ] Switch between Packed Items and Fast Food repeatedly and confirm banners/products never cross modes.

## Implementation Notes

- Keep the public banner visual simple: image only.
- Keep offer title and description in data/admin because they are useful for management and accessibility.
- Use uploaded image as the only visible customer banner content.
- Do not make non-clickable banners pressable.
- Do not use discount labels to decide which products belong to an offer.
- Product targeting must come from the new `offer_products` table.
- For the first implementation, attach normal products only, not combos.
