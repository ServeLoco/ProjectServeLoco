# Graph Report - ProjectServeLoco  (2026-05-23)

## Corpus Check
- 180 files · ~50,801 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 731 nodes · 1240 edges · 66 communities (49 shown, 17 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b3462101`
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

## God Nodes (most connected - your core abstractions)
1. `colors` - 51 edges
2. `typography` - 45 edges
3. `spacing` - 42 edges
4. `radius` - 41 edges
5. `shadows` - 29 edges
6. `useReducedMotion()` - 21 edges
7. `useAuthStore` - 19 edges
8. `layout` - 18 edges
9. `ServeLoco V1 Implementation Plan` - 18 edges
10. `apiClient` - 16 edges

## Surprising Connections (you probably didn't know these)
- `AdminEntryScreen()` --calls--> `useAuthStore`  [INFERRED]
  Frontend-V1/src/screens/AdminEntryScreen/AdminEntryScreen.js → Frontend-V1/src/stores/useAuthStore.js
- `RootNavigator()` --calls--> `useAdminAuthStore`  [INFERRED]
  Frontend-V1/src/navigation/RootNavigator.js → Frontend-V1/src/stores/useAdminAuthStore.js
- `AdminNavigator()` --calls--> `useAdminAuthStore`  [INFERRED]
  Frontend-V1/src/navigation/AdminNavigator.js → Frontend-V1/src/stores/useAdminAuthStore.js
- `CategoriesScreen()` --calls--> `useCartStore`  [EXTRACTED]
  Frontend-V1/src/screens/CategoriesScreen/CategoriesScreen.js → Frontend-V1/src/stores/useCartStore.js
- `AuthScreen()` --calls--> `useAuthStore`  [EXTRACTED]
  Frontend-V1/src/screens/AuthScreen/AuthScreen.js → Frontend-V1/src/stores/useAuthStore.js

## Communities (66 total, 17 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.13
Nodes (14): Acceptance Criteria, Admin Dashboard Requirements, Backend Environment Variables, code:text (React Native app -> Node.js Express API -> MySQL), code:text (/Backend-V1), Default Local Admin, Goal, images (+6 more)

### Community 1 - "Community 1"
Cohesion: 0.15
Nodes (13): Admin Auth, Admin Customers, Admin Dashboard, Admin Orders, Admin Products, Admin Settings / Offers, API Plan, Cart / Checkout (+5 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (42): dependencies, react, react-native, @react-native-async-storage/async-storage, @react-native/new-app-screen, react-native-safe-area-context, react-native-screens, @react-navigation/bottom-tabs (+34 more)

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
Cohesion: 0.07
Nodes (27): Acceptance Criteria, Admin Dashboard Requirements, Backend, Backend, Backend, Backend, Backend, code:text (React Native app -> Node.js Express API -> MySQL) (+19 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (34): Admin Auth, Admin Customers, Admin Dashboard, Admin Orders, Admin Products, Admin Settings / Offers, API Plan, Backend Build Phases (+26 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (16): Bottom Navigation, Build Phases, Category Cards, Combo Deals, First Screen: Home Dashboard, Goal, Offer Banner, Phase 1: App Shell (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.20
Nodes (9): Bottom Navigation, Category Cards, Combo Deals, Frontend Home Dashboard Design, Offer Banner, ServeLoco Plan, Toggle Button, Top Section (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (12): App(), displayName, name, AdminNavigator(), Stack, Stack, Tab, RootNavigator() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.04
Nodes (48): 10. Order Detail, 11. Profile, 12. Edit Profile, 13. Admin Entry, 14. Admin Login, 15. Admin Dashboard, 16. Admin Orders, 17. Admin Order Detail (+40 more)

### Community 15 - "Community 15"
Cohesion: 0.60
Nodes (3): Chip(), ChipRow(), styles

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (8): categories, MySQL Data Models, offers, order_items, orders, products, settings, users

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (4): AdminEntryScreen(), styles, styles, styles

### Community 18 - "Community 18"
Cohesion: 0.28
Nodes (5): RCTDefaultReactNativeFactoryDelegate, AppDelegate, ReactNativeDelegate, UIApplicationDelegate, UIResponder

### Community 20 - "Community 20"
Cohesion: 0.05
Nodes (43): App Animation Standard, Folder Structure And Naming Standard, Global Frontend Rules, How To Use This Checklist, Phase 1: App Shell And Foundations, Phase 2: Auth And Preview Gate, Phase 3: Customer Shopping Flow, Phase 4: Customer Account And Orders (+35 more)

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (4): images, info, author, version

### Community 24 - "Community 24"
Cohesion: 0.50
Nodes (3): info, author, version

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (33): adminAuthApi, adminCustomersApi, adminDashboardApi, adminImagesApi, adminOrdersApi, adminProductsApi, adminSettingsApi, ApiError (+25 more)

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (7): styles, styles, styles, styles, colors, palette, shadows

### Community 33 - "Community 33"
Cohesion: 0.17
Nodes (4): styles, styles, styles, typography

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (8): CartScreen(), styles, CheckoutScreen(), styles, OrderDetailScreen(), STATUS_STEPS, styles, useSettingsStore

### Community 43 - "Community 43"
Cohesion: 0.16
Nodes (4): styles, styles, styles, spacing

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (6): Backend, Backend, Frontend, Frontend, Integration, Testing Checklist

### Community 45 - "Community 45"
Cohesion: 0.07
Nodes (24): AnimatedCartBadge(), styles, AnimatedFadeSlide(), AnimatedModalView(), styles, AnimatedQuantitySwitcher(), AnimatedSegmentedControl(), styles (+16 more)

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (3): PAYMENT_COLORS, STATUS_COLORS, styles

### Community 47 - "Community 47"
Cohesion: 0.20
Nodes (4): styles, styles, borderWidth, radius

### Community 48 - "Community 48"
Cohesion: 0.43
Nodes (5): themePlaceholder, fontFamily, fontSizes, fontWeights, lineHeights

### Community 50 - "Community 50"
Cohesion: 0.13
Nodes (10): AdminDashboardScreen(), styles, AdminLoginScreen(), styles, EditProfileScreen(), FILTER_CHIPS, MOCK_ORDERS, OrdersScreen() (+2 more)

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
Nodes (9): asBoolean(), asText(), DEFAULT_FORM, getOfferData(), getPayloadData(), normalizeSettings(), NUMERIC_FIELDS, pickFirst() (+1 more)

### Community 56 - "Community 56"
Cohesion: 0.16
Nodes (6): asBoolean(), CustomerCard(), formatShortAddress(), normalizeCustomer(), pickFirst(), styles

### Community 57 - "Community 57"
Cohesion: 0.33
Nodes (4): CategoriesScreen(), MOCK_CATEGORIES, MOCK_CHIPS, styles

### Community 58 - "Community 58"
Cohesion: 0.15
Nodes (5): ORDER_STATUSES, PAYMENT_STATUSES, styles, styles, layout

### Community 59 - "Community 59"
Cohesion: 0.25
Nodes (3): PAYMENT_FILTERS, STATUS_FILTERS, styles

### Community 60 - "Community 60"
Cohesion: 0.14
Nodes (15): HomeScreen(), MOCK_CATEGORIES, MOCK_COMBOS, styles, useAuthGate(), MOCK_DB, ProductDetailScreen(), RELATED_PRODUCTS (+7 more)

### Community 61 - "Community 61"
Cohesion: 0.25
Nodes (4): AVAILABILITY, CATEGORIES, initialMockProducts, styles

## Knowledge Gaps
- **338 isolated node(s):** `id`, `name`, `resources`, `name`, `version` (+333 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `colors` connect `Community 30` to `Community 13`, `Community 15`, `Community 17`, `Community 21`, `Community 33`, `Community 35`, `Community 43`, `Community 45`, `Community 46`, `Community 47`, `Community 48`, `Community 49`, `Community 50`, `Community 54`, `Community 56`, `Community 57`, `Community 58`, `Community 59`, `Community 60`, `Community 61`, `Community 62`, `Community 63`, `Community 64`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `typography` connect `Community 33` to `Community 13`, `Community 15`, `Community 17`, `Community 21`, `Community 30`, `Community 35`, `Community 43`, `Community 45`, `Community 46`, `Community 47`, `Community 48`, `Community 49`, `Community 50`, `Community 54`, `Community 56`, `Community 57`, `Community 58`, `Community 59`, `Community 60`, `Community 61`, `Community 62`, `Community 63`, `Community 64`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `spacing` connect `Community 43` to `Community 13`, `Community 15`, `Community 17`, `Community 21`, `Community 30`, `Community 33`, `Community 35`, `Community 45`, `Community 46`, `Community 47`, `Community 48`, `Community 49`, `Community 50`, `Community 54`, `Community 56`, `Community 57`, `Community 58`, `Community 59`, `Community 60`, `Community 61`, `Community 62`, `Community 64`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `id`, `name`, `resources` to the rest of the system?**
  _338 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._