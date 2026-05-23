# Graph Report - ProjectServeLoco  (2026-05-23)

## Corpus Check
- 180 files · ~39,525 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 693 nodes · 952 edges · 78 communities (44 shown, 34 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cc21ba4d`
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
- [[_COMMUNITY_Community 77|Community 77]]

## God Nodes (most connected - your core abstractions)
1. `colors` - 29 edges
2. `typography` - 23 edges
3. `radius` - 21 edges
4. `spacing` - 21 edges
5. `useReducedMotion()` - 21 edges
6. `ServeLoco V1 Implementation Plan` - 18 edges
7. `apiClient` - 16 edges
8. `layout` - 13 edges
9. `ServeLoco Main Plan` - 13 edges
10. `API Plan` - 13 edges

## Surprising Connections (you probably didn't know these)
- `useAuthGate()` --calls--> `useAuthStore`  [INFERRED]
  Frontend-V1/src/hooks/useAuthGate.js → Frontend-V1/src/stores/useAuthStore.js
- `AdminNavigator()` --calls--> `useAdminAuthStore`  [INFERRED]
  Frontend-V1/src/navigation/AdminNavigator.js → Frontend-V1/src/stores/useAdminAuthStore.js
- `RootNavigator()` --calls--> `useAdminAuthStore`  [INFERRED]
  Frontend-V1/src/navigation/RootNavigator.js → Frontend-V1/src/stores/useAdminAuthStore.js
- `AnimatedQuantitySwitcher()` --calls--> `useReducedMotion()`  [EXTRACTED]
  Frontend-V1/src/components/AnimatedQuantitySwitcher/AnimatedQuantitySwitcher.js → Frontend-V1/src/utils/motionPreferences.js
- `AnimatedFadeSlide()` --calls--> `useReducedMotion()`  [EXTRACTED]
  Frontend-V1/src/components/AnimatedFadeSlide/AnimatedFadeSlide.js → Frontend-V1/src/utils/motionPreferences.js

## Communities (78 total, 34 thin omitted)

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
Cohesion: 0.09
Nodes (10): useAuthGate(), AdminNavigator(), Stack, Stack, Tab, RootNavigator(), useAdminAuthStore, useAuthStore (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.04
Nodes (48): 10. Order Detail, 11. Profile, 12. Edit Profile, 13. Admin Entry, 14. Admin Login, 15. Admin Dashboard, 16. Admin Orders, 17. Admin Order Detail (+40 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (4): styles, styles, styles, layout

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (8): categories, MySQL Data Models, offers, order_items, orders, products, settings, users

### Community 17 - "Community 17"
Cohesion: 0.22
Nodes (9): styles, themePlaceholder, easing, easingModal, motionConfig, fontFamily, fontSizes, fontWeights (+1 more)

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
Cohesion: 0.16
Nodes (6): styles, styles, styles, colors, palette, shadows

### Community 43 - "Community 43"
Cohesion: 0.15
Nodes (5): styles, styles, styles, spacing, typography

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (6): Backend, Backend, Frontend, Frontend, Integration, Testing Checklist

### Community 45 - "Community 45"
Cohesion: 0.07
Nodes (21): AnimatedCartBadge(), AnimatedFadeSlide(), AnimatedModalView(), styles, AnimatedQuantitySwitcher(), AnimatedSegmentedControl(), AnimatedStickyMiniCart(), AnimatedTabItem() (+13 more)

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (3): PAYMENT_COLORS, STATUS_COLORS, styles

### Community 47 - "Community 47"
Cohesion: 0.22
Nodes (4): styles, styles, borderWidth, radius

### Community 48 - "Community 48"
Cohesion: 0.60
Nodes (3): Chip(), ChipRow(), styles

### Community 51 - "Community 51"
Cohesion: 0.50
Nodes (4): Backend, Databases, Frontend, Tech Stack

### Community 52 - "Community 52"
Cohesion: 0.50
Nodes (4): Frontend Build Phases, Phase 1: App Shell, Phase 2: Customer Flow, Phase 3: Admin Flow

### Community 53 - "Community 53"
Cohesion: 0.67
Nodes (3): Included, Not Included, V1 Scope

### Community 66 - "Community 66"
Cohesion: 0.33
Nodes (3): MOCK_CATEGORIES, MOCK_CHIPS, styles

### Community 69 - "Community 69"
Cohesion: 0.33
Nodes (3): MOCK_CATEGORIES, MOCK_COMBOS, styles

### Community 72 - "Community 72"
Cohesion: 0.33
Nodes (3): FILTER_CHIPS, MOCK_ORDERS, styles

### Community 73 - "Community 73"
Cohesion: 0.33
Nodes (3): MOCK_DB, RELATED_PRODUCTS, styles

### Community 74 - "Community 74"
Cohesion: 0.29
Nodes (4): CATEGORY_CHIPS, MOCK_PRODUCTS, SORT_OPTIONS, styles

## Knowledge Gaps
- **331 isolated node(s):** `How To Use This Checklist`, `Global Frontend Rules`, `Folder Structure And Naming Standard`, `App Animation Standard`, `Task F-01: Create React Native App Shell` (+326 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `colors` connect `Community 30` to `Community 35`, `Community 43`, `Community 45`, `Community 46`, `Community 15`, `Community 47`, `Community 48`, `Community 49`, `Community 17`, `Community 21`, `Community 63`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `ServeLoco Main Plan` connect `Community 6` to `Community 14`, `Community 7`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `Frontend Plan` connect `Community 14` to `Community 6`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `How To Use This Checklist`, `Global Frontend Rules`, `Folder Structure And Naming Standard` to the rest of the system?**
  _331 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._