# Graph Report - ProjectServeLoco  (2026-05-25)

## Corpus Check
- 237 files · ~88,442 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1583 nodes · 2906 edges · 114 communities (102 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1b5cb1e4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 109|Community 109]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 111|Community 111]]
- [[_COMMUNITY_Community 112|Community 112]]
- [[_COMMUNITY_Community 113|Community 113]]
- [[_COMMUNITY_Community 114|Community 114]]

## God Nodes (most connected - your core abstractions)
1. `colors` - 73 edges
2. `typography` - 66 edges
3. `spacing` - 63 edges
4. `radius` - 62 edges
5. `shadows` - 51 edges
6. `Admin Manager V1 Tasks` - 47 edges
7. `ServeLoco Backend Tasks` - 34 edges
8. `useAuthStore` - 28 edges
9. `layout` - 24 edges
10. `getDb()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `RootNavigator()` --calls--> `useAdminAuthStore`  [INFERRED]
  Frontend-V1/src/navigation/RootNavigator.js → Frontend-V1/src/stores/useAdminAuthStore.js
- `AdminNavigator()` --calls--> `useAdminAuthStore`  [INFERRED]
  Frontend-V1/src/navigation/AdminNavigator.js → Frontend-V1/src/stores/useAdminAuthStore.js
- `useAuthGate()` --calls--> `useAuthStore`  [INFERRED]
  Frontend-V1/src/hooks/useAuthGate.js → Frontend-V1/src/stores/useAuthStore.js
- `ProtectedRoute()` --calls--> `useAuth()`  [EXTRACTED]
  adminManager-V1/src/routes/ProtectedRoute.jsx → adminManager-V1/src/components/AuthProvider.jsx
- `Header()` --calls--> `useAuth()`  [EXTRACTED]
  adminManager-V1/src/components/Header.jsx → adminManager-V1/src/components/AuthProvider.jsx

## Communities (114 total, 12 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.13
Nodes (14): Acceptance Criteria, Admin Dashboard Requirements, Backend Environment Variables, code:text (React Native app -> Node.js Express API -> MySQL), code:text (/Backend-V1), Default Local Admin, Goal, images (+6 more)

### Community 1 - "Community 1"
Cohesion: 0.15
Nodes (13): Admin Auth, Admin Customers, Admin Dashboard, Admin Orders, Admin Products, Admin Settings / Offers, API Plan, Cart / Checkout (+5 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (24): devDependencies, @babel/core, @babel/preset-env, babel-preset-expo, @babel/runtime, eslint, eslint-plugin-react, eslint-plugin-react-hooks (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.29
Nodes (7): Backend Build Phases, Phase 1: API Foundation, Phase 2: Auth, Phase 3: Products, Categories, and Images, Phase 4: Settings, Cart, and Orders, Phase 5: Admin Operations, Phase 6: Frontend Integration Contract

### Community 4 - "Community 4"
Cohesion: 0.40
Nodes (4): id, name, projectResources, resources

### Community 5 - "Community 5"
Cohesion: 0.25
Nodes (8): Bottom Navigation, Category Cards, Combo Deals, Customer Home Dashboard Design, Mode Toggle, Offer Banner, Top Section, Visual Direction

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (13): Acceptance Criteria, Admin Dashboard Requirements, code:text (React Native app -> Node.js Express API -> MySQL), code:text (/Backend-V1), Goal, Immediate Next Steps, Included, Main Architecture Rule (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (13): Admin Auth, Admin Customers, Admin Dashboard, Admin Orders, Admin Products, Admin Settings / Offers, API Plan, Cart / Checkout (+5 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (16): Bottom Navigation, Build Phases, Category Cards, Combo Deals, First Screen: Home Dashboard, Goal, Offer Banner, Phase 1: App Shell (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.20
Nodes (9): Bottom Navigation, Category Cards, Combo Deals, Frontend Home Dashboard Design, Offer Banner, ServeLoco Plan, Toggle Button, Top Section (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (9): adminScreensPlaceholder, customerScreensPlaceholder, AdminNavigator(), Stack, Stack, styles, Tab, RootNavigator() (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.04
Nodes (48): 10. Order Detail, 11. Profile, 12. Edit Profile, 13. Admin Entry, 14. Admin Login, 15. Admin Dashboard, 16. Admin Orders, 17. Admin Order Detail (+40 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (10): styles, ICONS, styles, styles, PAYMENT_COLORS, STATUS_COLORS, styles, styles (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (8): categories, MySQL Data Models, offers, order_items, orders, products, settings, users

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (22): AdminDashboardScreen(), MetricCard(), styles, AdminEntryScreen(), styles, AdminLoginScreen(), styles, authApi (+14 more)

### Community 18 - "Community 18"
Cohesion: 0.28
Nodes (5): RCTDefaultReactNativeFactoryDelegate, AppDelegate, ReactNativeDelegate, UIApplicationDelegate, UIResponder

### Community 19 - "Community 19"
Cohesion: 0.06
Nodes (34): Current Frontend Endpoint Inventory, Frontend Field Alias Contract, Global Backend Rules, How To Use This Checklist, Phase B-01: Project Scaffold And Tooling, Phase B-02: Environment And Configuration, Phase B-03: Database Connections, Phase B-04: MySQL Schema And Seed Data (+26 more)

### Community 20 - "Community 20"
Cohesion: 0.05
Nodes (43): App Animation Standard, Folder Structure And Naming Standard, Global Frontend Rules, How To Use This Checklist, Phase 1: App Shell And Foundations, Phase 2: Auth And Preview Gate, Phase 3: Customer Shopping Flow, Phase 4: Customer Account And Orders (+35 more)

### Community 21 - "Community 21"
Cohesion: 0.08
Nodes (23): 1. Local Setup and Environment, 2. Authentication, 3.1. Customer Auth, 3.2. Customer Products & Cart, 3.3. Checkout & Orders, 3.4. Admin Auth & Management, 3. Endpoints, Base URLs (+15 more)

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (4): images, info, author, version

### Community 24 - "Community 24"
Cohesion: 0.50
Nodes (3): info, author, version

### Community 26 - "Community 26"
Cohesion: 0.50
Nodes (3): config, { getDefaultConfig }, { getDefaultConfig, mergeConfig }

### Community 27 - "Community 27"
Cohesion: 0.08
Nodes (34): config, getAdminCustomerById(), getAdminCustomers(), getAdminOrderById(), getAdminOrders(), getCustomersReport(), getDashboard(), getSalesReport() (+26 more)

### Community 28 - "Community 28"
Cohesion: 0.07
Nodes (43): AdminSettingsScreen(), asBoolean(), asText(), buildOfferPayload(), buildSettingsPayload(), DEFAULT_FORM, getErrorMessage(), getOfferData() (+35 more)

### Community 29 - "Community 29"
Cohesion: 0.06
Nodes (35): 10. Visual Acceptance Checklist, 11. Implementation Protocol, 12. Assumptions, 1. Design Goal, 2. Reference Match Checklist, 3. Current App Analysis, 4. Design Rules, 5. Things That Must Not Change (+27 more)

### Community 30 - "Community 30"
Cohesion: 0.12
Nodes (16): permissions, displayName, expo, android, assetBundlePatterns, ios, name, orientation (+8 more)

### Community 31 - "Community 31"
Cohesion: 0.08
Nodes (7): styles, styles, styles, styles, styles, styles, styles

### Community 33 - "Community 33"
Cohesion: 0.08
Nodes (15): styles, styles, styles, styles, OrderConfirmationScreen(), styles, styles, styles (+7 more)

### Community 34 - "Community 34"
Cohesion: 0.07
Nodes (28): dependencies, bcrypt, cors, dotenv, express, express-rate-limit, helmet, jsonwebtoken (+20 more)

### Community 35 - "Community 35"
Cohesion: 0.10
Nodes (23): getAuditLogs(), config, createProduct(), deleteProduct(), fs, getAdminProductById(), getAdminProducts(), { getDb } (+15 more)

### Community 43 - "Community 43"
Cohesion: 0.10
Nodes (29): ProductsApi, productsApi, CategoriesScreen(), DEFAULT_CHIPS, MOCK_CATEGORIES, MOCK_CHIPS, styles, FAST_FOOD_CATEGORIES (+21 more)

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (6): Backend, Backend, Frontend, Frontend, Integration, Testing Checklist

### Community 45 - "Community 45"
Cohesion: 0.08
Nodes (16): AnimatedCartBadge(), AnimatedFadeSlide(), AnimatedModalView(), styles, AnimatedQuantitySwitcher(), AnimatedSegmentedControl(), AnimatedStickyMiniCart(), AnimatedTabItem() (+8 more)

### Community 46 - "Community 46"
Cohesion: 0.29
Nodes (3): assetsPlaceholder, FALLBACK_SOURCE, styles

### Community 47 - "Community 47"
Cohesion: 0.21
Nodes (18): blockSchema(), categorySchema(), loginSchema(), paginationSchema(), productAvailabilitySchema(), productImageSchema(), productSchema(), trustSchema() (+10 more)

### Community 48 - "Community 48"
Cohesion: 0.09
Nodes (22): app, config, errorHandler(), notFoundHandler(), adminRoutes, app, authRoutes, cartRoutes (+14 more)

### Community 49 - "Community 49"
Cohesion: 0.15
Nodes (5): CustomersApi, DashboardApi, HealthApi, OffersApi, SettingsApi

### Community 50 - "Community 50"
Cohesion: 0.20
Nodes (10): Backend, Backend, Backend, Backend, Frontend, Frontend, Frontend, Frontend (+2 more)

### Community 51 - "Community 51"
Cohesion: 0.50
Nodes (4): Backend, Databases, Frontend, Tech Stack

### Community 52 - "Community 52"
Cohesion: 0.50
Nodes (4): Frontend Build Phases, Phase 1: App Shell, Phase 2: Customer Flow, Phase 3: Admin Flow

### Community 53 - "Community 53"
Cohesion: 0.67
Nodes (3): Included, Not Included, V1 Scope

### Community 54 - "Community 54"
Cohesion: 0.18
Nodes (7): OrdersApi, styles, FILTER_CHIPS, MOCK_ORDERS, OrdersScreen(), styles, shadows

### Community 56 - "Community 56"
Cohesion: 0.17
Nodes (14): attachImageUrls(), createCategory(), deleteCategory(), getAdminCategories(), getCategories(), { getDb }, { ObjectId }, { pool } (+6 more)

### Community 57 - "Community 57"
Cohesion: 0.25
Nodes (8): categories, MySQL Data Models, offers, order_items, orders, products, settings, users

### Community 58 - "Community 58"
Cohesion: 0.11
Nodes (18): dependencies, expo, expo-image-picker, expo-location, lucide-react-native, react, react-native, @react-native-async-storage/async-storage (+10 more)

### Community 59 - "Community 59"
Cohesion: 0.10
Nodes (34): AdminOrderCard(), AdminOrdersScreen(), PAYMENT_FILTERS, STATUS_FILTERS, styles, AdminProductFormScreen(), buildImageFormData(), getImageData() (+26 more)

### Community 60 - "Community 60"
Cohesion: 0.17
Nodes (5): mongoDB, mysqlDB, app, config, db

### Community 61 - "Community 61"
Cohesion: 0.29
Nodes (7): Backend Build Phases, Phase 1: API Foundation, Phase 2: Auth, Phase 3: Products, Categories, and Images, Phase 4: Settings, Cart, and Orders, Phase 5: Admin Operations, Phase 6: Frontend Integration Contract

### Community 63 - "Community 63"
Cohesion: 0.33
Nodes (6): Backend Plan, Default Local Admin, Environment Variables, images, MongoDB Image Model, Order Rules

### Community 64 - "Community 64"
Cohesion: 0.19
Nodes (14): cartApi, ordersApi, CartScreen(), styles, CheckoutScreen(), getLocationErrorMessage(), requestLocationPermission(), styles (+6 more)

### Community 65 - "Community 65"
Cohesion: 0.20
Nodes (9): adminRoutes, adminToken, app, authRoutes, customerToken, express, jwt, { pool } (+1 more)

### Community 66 - "Community 66"
Cohesion: 0.10
Nodes (19): attachOfferImageUrls(), createOffer(), deleteOffer(), getActiveOffer(), getAdminOffers(), { getDb }, getSettings(), { ObjectId } (+11 more)

### Community 67 - "Community 67"
Cohesion: 0.08
Nodes (23): config, deleteImage(), fs, { getDb }, getImages(), { ObjectId }, path, uploadImage() (+15 more)

### Community 68 - "Community 68"
Cohesion: 0.12
Nodes (15): 1. Health And Preflight, 2. Admin Login And Store Setup, 3. Customer Account And Browse Flow, 4. Cart, Checkout, And Customer Tracking, 5. Admin Order Fulfillment, 6. Admin Customer And Reporting Flow, Actual Smoke Steps Executed, End-To-End Flow Checklist (+7 more)

### Community 69 - "Community 69"
Cohesion: 0.50
Nodes (4): Backend, Databases, Frontend, Tech Stack

### Community 70 - "Community 70"
Cohesion: 0.08
Nodes (24): { pool }, config, mysql, pool, adminRoutes, app, express, jwt (+16 more)

### Community 71 - "Community 71"
Cohesion: 0.18
Nodes (9): config, connect(), { MongoClient }, bcrypt, { getDb }, { getDb, connect }, { ObjectId }, { pool } (+1 more)

### Community 72 - "Community 72"
Cohesion: 0.22
Nodes (8): app, express, { getDb }, imageRoutes, jwt, mockInsertOne, request, token

### Community 73 - "Community 73"
Cohesion: 0.12
Nodes (15): calculateCart(), asyncHandler, { calculateCart }, express, { requireCustomer }, router, app, cartRoutes (+7 more)

### Community 74 - "Community 74"
Cohesion: 0.24
Nodes (15): AdminCustomersScreen(), asBoolean(), BlockCustomerModal(), CustomerCard(), CustomerSkeletonList(), formatShortAddress(), getActionError(), getCustomersFromResponse() (+7 more)

### Community 75 - "Community 75"
Cohesion: 0.04
Nodes (47): 10. Offers Management, 11. Customers Management, 12. Settings Management, 13. Image Management, 14. Backend Support Tasks, 14. Reports & Analytics, 15. Backend Support Tasks, 15. Mobile Reflection (+39 more)

### Community 76 - "Community 76"
Cohesion: 0.50
Nodes (3): MockSvg, React, { View }

### Community 78 - "Community 78"
Cohesion: 0.29
Nodes (6): engines, node, main, name, private, version

### Community 79 - "Community 79"
Cohesion: 0.09
Nodes (22): dependencies, react, react-dom, react-router-dom, devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks (+14 more)

### Community 81 - "Community 81"
Cohesion: 0.14
Nodes (8): config, localDefaults, missing, requiredKeys, config, mysql, config, mysql

### Community 82 - "Community 82"
Cohesion: 0.36
Nodes (4): AdminOrderDetailScreen(), ORDER_STATUSES, PAYMENT_STATUSES, styles

### Community 83 - "Community 83"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, start, start:tunnel, test

### Community 84 - "Community 84"
Cohesion: 0.09
Nodes (22): dependencies, react, react-dom, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+14 more)

### Community 85 - "Community 85"
Cohesion: 0.16
Nodes (15): cancelOrder(), createOrder(), generateOrderNumber(), getOrderById(), getOrders(), { pool }, asyncHandler, { createOrder, getOrders, getOrderById, cancelOrder } (+7 more)

### Community 86 - "Community 86"
Cohesion: 0.11
Nodes (25): { hashPassword, comparePassword, signCustomerToken }, login(), me(), { pool }, register(), updateProfile(), extractToken(), requireAdmin() (+17 more)

### Community 88 - "Community 88"
Cohesion: 0.22
Nodes (8): adminRoutes, app, express, jwt, { pool }, productRoutes, request, token

### Community 89 - "Community 89"
Cohesion: 0.20
Nodes (9): adminRoutes, adminToken, app, customerToken, express, jwt, orderRoutes, { pool } (+1 more)

### Community 90 - "Community 90"
Cohesion: 0.29
Nodes (6): 11. Backend Tests, Goal, Goal, Location Based Delivery Tasks, Subtasks, Testing checklist

### Community 92 - "Community 92"
Cohesion: 0.20
Nodes (7): AuthContext, AuthProvider(), useAuth(), Header(), Loading(), Login(), ProtectedRoute()

### Community 93 - "Community 93"
Cohesion: 0.36
Nodes (4): API_ORIGIN, apiClient(), normalizeKeys(), storage

### Community 94 - "Community 94"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + Vite

### Community 99 - "Community 99"
Cohesion: 0.29
Nodes (7): 2. Backend Settings Fields, Defaults, Goal, New settings fields, Subtasks, Testing checklist, Things to avoid

### Community 101 - "Community 101"
Cohesion: 0.29
Nodes (7): 3. Delivery Pricing Utility, Files likely changed, Goal, Pricing rules, Subtasks, Testing checklist, Things to avoid

### Community 104 - "Community 104"
Cohesion: 0.29
Nodes (7): 4. Cart Calculation API, API change, Goal, Response should include, Subtasks, Testing checklist, Things to avoid

### Community 105 - "Community 105"
Cohesion: 0.29
Nodes (7): 8. Admin Manager Settings, Admin fields to add, Files likely changed, Goal, Subtasks, Testing checklist, Things to avoid

### Community 106 - "Community 106"
Cohesion: 0.33
Nodes (6): 10. Error And Edge Case Handling, Cases to handle, Goal, Subtasks, Testing checklist, Things to avoid

### Community 107 - "Community 107"
Cohesion: 0.33
Nodes (6): 1. Current System Review, Files likely checked, Goal, Subtasks, Testing checklist, Things to avoid

### Community 108 - "Community 108"
Cohesion: 0.33
Nodes (6): 5. Order Creation API, Files likely changed, Goal, Subtasks, Testing checklist, Things to avoid

### Community 109 - "Community 109"
Cohesion: 0.33
Nodes (6): 6. Order Database Fields, Goal, Subtasks, Suggested new order fields, Testing checklist, Things to avoid

### Community 110 - "Community 110"
Cohesion: 0.33
Nodes (6): 7. Mobile Checkout Updates, Files likely changed, Goal, Subtasks, Testing checklist, Things to avoid

### Community 111 - "Community 111"
Cohesion: 0.60
Nodes (3): Chip(), ChipRow(), styles

### Community 112 - "Community 112"
Cohesion: 0.40
Nodes (5): 9. Admin Order Visibility, Goal, Subtasks, Testing checklist, Things to avoid

### Community 113 - "Community 113"
Cohesion: 0.50
Nodes (4): 12. Frontend Testing, Goal, Subtasks, Testing checklist

### Community 114 - "Community 114"
Cohesion: 0.50
Nodes (4): 13. Final Verification, Acceptance criteria, Goal, Subtasks

## Knowledge Gaps
- **805 isolated node(s):** `install-dbs.sh script`, `id`, `name`, `resources`, `name` (+800 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `colors` connect `Community 15` to `Community 64`, `Community 33`, `Community 74`, `Community 43`, `Community 13`, `Community 46`, `Community 111`, `Community 45`, `Community 17`, `Community 82`, `Community 54`, `Community 59`, `Community 28`, `Community 31`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `typography` connect `Community 17` to `Community 64`, `Community 33`, `Community 74`, `Community 43`, `Community 13`, `Community 45`, `Community 15`, `Community 111`, `Community 82`, `Community 54`, `Community 59`, `Community 28`, `Community 31`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `spacing` connect `Community 17` to `Community 64`, `Community 33`, `Community 74`, `Community 43`, `Community 45`, `Community 111`, `Community 15`, `Community 82`, `Community 54`, `Community 59`, `Community 28`, `Community 31`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `install-dbs.sh script`, `id`, `name` to the rest of the system?**
  _805 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._