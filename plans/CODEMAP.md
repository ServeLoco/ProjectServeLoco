# CODEMAP — quick reference (avoid re-exploring repo each session)

Read this before grepping/exploring. Update when structure changes materially (new route file, new page/screen dir).
Generated 2026-07-11 against branch `feat/store-modes`.

## apps/api (Express + MySQL + MongoDB)

Layering: `routes/ -> middleware/ -> controllers/ -> utils/` (no repositories/ dir exists — logic lives in controllers + utils). `validators/index.js` holds request validation. Analytics has its own `services/analytics/` (collections.js, eventStore.js, rollup.js, sessionStore.js).

**Routes → controllers** (`apps/api/src/routes/*.js`):
- `authRoutes.js` → authController — `/me` GET/PATCH/PUT profile, `firebase-verify`, `logout`, `me/push-token`, `me/request-deletion`, `me/cancel-deletion`
- `adminRoutes.js` → adminController (+ shopAdminController, couponController, comboController, notificationTemplateController) — biggest route file: categories, combos, coupons, customers, dashboard-sections, inbox, notifications, notification-templates, offers, orders, products (+bulk, +bulk-import), reports (sales/customers/top-products), settings, shops, store-modes, login, revoke-sessions. Mounts `analytics` sub-router.
- `analyticsRoutes.js` → analyticsController — `POST /events`
- `cartRoutes.js` → cartController — `available-coupons`, `calculate`, `validate-coupon`
- `categoryRoutes.js` → categoryController — `GET /`
- `dashboardRoutes.js` → dashboardController — `GET /`, `GET /sections/:slug/items`
- `imageRoutes.js` → imageController — CRUD `/`, `/:id`
- `notificationRoutes.js` → notificationController — list, unread-count, read/:id, read-all, delete
- `offerRoutes.js` → `GET /active`
- `orderRoutes.js` → orderController — list, get, create, cancel (PATCH+POST variants)
- `productRoutes.js` → productController — `GET /`, `GET /:id`
- `realtimeRoutes.js` → `GET /health`
- `settingsRoutes.js` → settingsController — `GET /`
- `shopRoutes.js` → shopOwnerController — shop-owner side: groups CRUD, `me`, `me/toggle`, orders + orders/history, orders/:id confirm/ready/reject, products + product group/toggle
- `storeModeRoutes.js` → storeModeController — `GET /` (public read of active store modes; admin CRUD is under adminRoutes `/store-modes`)

**middleware/**: authMiddleware.js, shopOwnerMiddleware.js, errorHandler.js
**utils/** (shared logic, not duplicated per-controller): coupons.js (rule engine — single source for cart preview + order creation), storeMode.js, deliveryPricing.js, nightDelivery.js, timeWindow.js, expoPush.js, notificationService.js, adminNotifications.js, auth.js, money.js, ttlCache.js, shops.js
**realtime/** (Socket.IO): socket.js, orderEvents.js, orderAutoAccept.js, presence.js
**db/**: index.js (init MySQL+Mongo), migrate.js (auto-runs on start), mysql.js, mysqlSsl.js, mongodb.js, seed_demo.js, migrateFreeDeliveryCoupon.js, migrate_notification_templates.js

## apps/admin (React + Vite, admin panel)

`src/pages/*.jsx` — one file per section, matching route: Dashboard, MobileDashboard, Products, Categories, Combos, Coupons, Customers, Offers, Orders, Reports, Analytics + AnalyticsUserDetail, Images, Notifications, Settings, Shops, StoreModes, BulkImport, Health, Login.
`src/routes/ProtectedRoute.jsx` — auth gate (only file in routes/).
`src/api/`, `src/components/` (incl. ImageCropper), `src/hooks/`, `src/layout/`, `src/styles/`, `src/utils/`.

## apps/web (React + Vite, iOS-style customer PWA, Zustand)

`src/screens/*` — AuthScreen, HomeScreen, CategoriesScreen, ProductListScreen, ProductDetailScreen, CartScreen, CheckoutScreen, OrdersScreen, OrderDetailScreen, OrderConfirmationScreen, NotificationsScreen, ProfileScreen, EditProfileScreen, NotFoundScreen.
`src/stores/` (Zustand) — authStore.js, cartStore.js, notificationStore.js, settingsStore.js.
`src/components/` — BillSummary, CouponSheet, OfflineBanner, OrderCard, OrderStatusTimeline.
`src/api/`, `src/config/`, `src/hooks/`, `src/styles/`, `src/utils/`.

## apps/customer-app (React Native / Expo)

Two user roles share one app, split by navigator:
- `src/navigation/RootNavigator.js` → picks `CustomerNavigator.js` or `ShopOwnerNavigator.js`; `routes.js` has route name constants.
- `src/screens/customer/*` — mirrors apps/web screen set (Auth, Home, Categories, ProductList, ProductDetail, Cart, Checkout, Orders, OrderDetail, OrderConfirmation, Notifications, Profile, EditProfile).
- `src/screens/shop/*` — ShopDashboardScreen, ShopOrdersScreen, ShopProductsScreen, NewOrderPopup (shop-owner role UI).
- `src/stores/` (Zustand, current) — useAuthStore.js, useCartStore.js, useSettingsStore.js. `src/store/` (singular, legacy/other) — index.js only, check before adding here.
- `src/features/` — feature-scoped logic (check contents per task, not enumerated here — grows often).
- `src/components/` — large shared component library (30+ dirs): Animated* (CartBadge, FadeSlide, ModalView, QuantitySwitcher, SegmentedControl, StickyMiniCart, TabItem), Button, Chip, ConfirmModal, ExitAppModal, ForceUpdateModal, ProductCard/ProductImage, VariantSheet, Toast, etc.
- `src/theme/`, `src/config/`, `src/hooks/`, `src/utils/`.

## Dual DB reminder
MySQL = relational (products/orders/users). MongoDB = other collections. Both init in `apps/api/src/db/index.js`, both must be healthy. Schema changes → `src/db/migrate.js` (auto-runs on `npm start`).

## Response shape contract
Many API responses duplicate fields camelCase + snake_case intentionally (different clients read different casing). Never remove/rename either.

## Recently touched (store-modes feature, branch `feat/store-modes`)
`storeModeRoutes.js`, `storeModeController.js`, `utils/storeMode.js` (API); `admin/src/pages/StoreModes.jsx` (admin); web mode tabs + customer-app mode capsule (Phase 3/4 commits — see `git log --oneline` for exact files, not enumerated here since still in flux).

---
When this file is stale (new route file/controller/page added and not listed here), regenerate the relevant section rather than trusting memory — `find apps/<app>/src/<dir> -maxdepth 2` per app is the cheap way to refresh a section.
