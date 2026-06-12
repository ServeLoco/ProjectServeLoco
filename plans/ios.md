# ServeLoco iOS Plan — React.js PWA on serveloco.app

## Goal
Build a Progressive Web App (PWA) using **React.js (no TypeScript, plain JS)** that:
- Looks and works exactly like the Android app (`Frontend-V1`)
- Is hosted on `serveloco.app`
- iOS users open it in Safari → tap "Add to Home Screen" → works like a native app
- Uses the **same backend APIs** as the Android app
- Costs nothing beyond the domain you already have

---

## Tech Stack Decision

| Choice | Reason |
|---|---|
| **React.js (Vite)** | Plain JS, fast HMR, simple build, no TypeScript |
| **Vanilla CSS** | Full control, matches Android app's custom design system |
| **Zustand** | Same state management library as Android app — same patterns |
| **React Router v6** | Client-side routing (SPA) |
| **Socket.io-client** | Real-time order updates — same as Android |
| **Workbox (vite-plugin-pwa)** | Service worker + manifest generation |
| **Vercel** | Free hosting, zero-config, auto-SSL, custom domain |

---

## Project Folder

Create inside the project root:
```
Frontend-PWA/
```
This is completely separate from `Frontend-V1` (Android). It runs independently.

---

## Design System — Android App Exact Values

All AI agents working on this MUST use these exact values from the Android app's theme system:

### Colors (from `Frontend-V1/src/theme/colors.js`)
```css
:root {
  /* Backgrounds */
  --bg-app: #EEF0F3;          /* offWhite — main screen background */
  --bg-surface: #FFFFFF;       /* white — cards, sheets */
  --bg-input: #E6E8EC;         /* grey50 — input backgrounds */
  --bg-disabled: #DFE2E6;      /* grey100 */

  /* Text */
  --text-primary: #0E1116;     /* charcoal — main text */
  --text-secondary: #6B7280;   /* grey400 — muted text */
  --text-tertiary: #9CA3AF;    /* grey300 — hints */
  --text-inverse: #FFFFFF;     /* white on dark backgrounds */
  --text-error: #E5484D;
  --text-success: #1FB574;
  --text-link: #3B82F6;

  /* Primary Accent — near-black ink */
  --primary: #0E1116;
  --primary-light: #E5E7EB;
  --primary-dark: #05070A;
  --primary-text: #FFFFFF;

  /* Success Green */
  --success: #1FB574;
  --success-light: #EAFDF5;
  --success-dark: #179E62;

  /* Error Red */
  --error: #E5484D;
  --error-light: #FFF0F0;
  --error-border: #FCA5A5;

  /* Warning Amber */
  --warning: #F4A62A;
  --warning-light: #FFFDF5;

  /* Info Blue */
  --info: #3B82F6;
  --info-light: #EFF6FF;

  /* Saffron/Orange — offers, badges */
  --saffron: #FF7A3A;
  --saffron-light: #FFF2EB;
  --saffron-dark: #E05A1A;

  /* Borders */
  --border: #DFE2E6;           /* grey100 */
  --border-strong: #C7CCD4;    /* grey200 */
  --border-focus: #4B5563;     /* primary400 */

  /* Nav */
  --nav-bg: #FFFFFF;
  --nav-active: #0E1116;
  --nav-inactive: #9CA3AF;

  /* Badge */
  --badge-bg: #FF7A3A;
  --badge-text: #FFFFFF;

  /* Buttons */
  --btn-dark-start: #2A303D;
  --btn-dark-end: #0E1116;
  --btn-success-start: #3FE09D;
  --btn-success-end: #1FB574;
  --btn-highlight-start: #FF9A66;
  --btn-highlight-end: #FF7A3A;

  /* Divider */
  --divider: #DFE2E6;
}
```

### Typography (from `Frontend-V1/src/theme/typography.js`)
```css
/* Font — Roboto (Google Fonts) to match Android */
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700;800&display=swap');

:root {
  --font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;

  /* Font Sizes */
  --fs-xs: 11px;
  --fs-sm: 12px;
  --fs-base: 14px;
  --fs-md: 15px;
  --fs-lg: 16px;
  --fs-xl: 18px;
  --fs-xxl: 20px;
  --fs-xxxl: 24px;
  --fs-display: 28px;
  --fs-hero: 32px;

  /* Font Weights */
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;
  --fw-extrabold: 800;
}
```

### Spacing (from `Frontend-V1/src/theme/spacing.js`)
```css
:root {
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-xxl: 48px;
  --screen-padding-h: 16px;   /* horizontal padding for all screens */
  --screen-padding-v: 16px;
  --card-padding: 16px;
  --section-gap: 24px;
  --list-item-gap: 12px;
}
```

### Borders (from `Frontend-V1/src/theme/borders.js`)
```css
:root {
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;        /* default card radius */
  --radius-input: 10px;    /* all inputs */
  --radius-lg: 12px;
  --radius-button: 12px;   /* all buttons */
  --radius-xl: 16px;       /* modals, bottom sheets */
  --radius-xxl: 24px;
  --radius-pill: 100px;    /* chips, badges, toggles */
}
```

---

## All Backend API Endpoints Used (from `Frontend-V1/src/api/`)

The PWA calls the **same backend** as the Android app. No backend changes needed (except one optional addition for web push notifications — Phase 4).

```
AUTH
  POST   /auth/login                         → { token, user }
  POST   /auth/signup                        → { token, user }
  GET    /auth/me                            → current user (requires customer token)
  PATCH  /auth/profile                       → update name, address etc.
  POST   /auth/password-reset-requests       → request password reset (admin approves it)

PRODUCTS / CATALOGUE
  GET    /dashboard?storeType=fast_food|packed → home sections array (offer_banner, category_grid, product_block, combo_block)
  GET    /products?category_id=X&search=X&page=1 → product list
  GET    /products/:id?type=product|combo    → single product or combo detail
  GET    /categories?type=fast_food|packed   → list all categories
  GET    /offers/active                      → active offer/banner
  GET    /settings                           → shop settings (shopOpen, deliveryOptions, upiId, supportPhone, etc.)
  GET    /images/:id                         → resolve image document by MongoDB ID

CART
  POST   /cart/calculate                     → calculate totals
  Body:  { items: [{ productId, quantity, type: 'product'|'combo', isCombo: bool }], latitude?, longitude?, delivery_type? }
  Returns: { subtotal, deliveryCharge, discount, grandTotal, nightCharge, minimumOrder, belowThreshold, freeDeliveryOfferActive, fastDeliveryEnabled }

ORDERS
  POST   /orders                             → place order (see exact payload in Checkout screen spec)
  GET    /orders                             → my order history (requires customer token)
  GET    /orders/:id                         → order detail (requires customer token)
  POST   /orders/:id/cancel                  → cancel order (requires customer token)

NOTIFICATIONS
  GET    /notifications                      → list notifications (requires customer token)
  GET    /notifications/unread-count         → unread count
  PATCH  /notifications/read-all             → mark all read
  PATCH  /notifications/:id/read             → mark one read
  DELETE /notifications/:id                  → delete notification

REAL-TIME (Socket.io — connect to backend root, not /api)
  Auth:  { token } in socket handshake
  Event: order.created                       → new order placed
  Event: order.cancelled                     → order cancelled
  Event: order.status.updated                → status changed
  Event: order.payment.updated               → payment status changed
  Event: order.updated                       → generic order update
  Event: notification.created                → new notification
  Event: notification.unread_count.updated   → unread count changed
```

---

## Folder Structure (Complete)

```
Frontend-PWA/
├── public/
│   ├── manifest.json              ← PWA manifest
│   ├── favicon.ico
│   └── icons/
│       ├── icon-192.png           ← app icon (192×192)
│       ├── icon-512.png           ← app icon (512×512)
│       └── icon-maskable-512.png  ← maskable icon for Android
├── src/
│   ├── api/                       ← all API calls
│   │   ├── client.js              ← base axios/fetch wrapper
│   │   ├── authApi.js
│   │   ├── productsApi.js
│   │   ├── cartApi.js
│   │   ├── ordersApi.js
│   │   ├── offersApi.js
│   │   ├── settingsApi.js
│   │   ├── notificationsApi.js
│   │   └── realtimeClient.js      ← socket.io client (copied + adapted from Android)
│   ├── stores/                    ← Zustand global state
│   │   ├── authStore.js           ← user session, token
│   │   ├── cartStore.js           ← cart items (persisted to localStorage)
│   │   ├── settingsStore.js       ← shop open/closed, delivery options
│   │   └── notificationStore.js   ← unread count
│   ├── components/                ← reusable UI components
│   │   ├── BottomNav.jsx          ← the 4-tab bottom navigation bar
│   │   ├── Button.jsx             ← primary/secondary/outline button variants
│   │   ├── ProductCard.jsx        ← product card with add-to-cart button
│   │   ├── CategoryChip.jsx       ← horizontal scrolling category filter chip
│   │   ├── CartBadge.jsx          ← cart icon with item count badge
│   │   ├── OrderStatusBadge.jsx   ← coloured status chip
│   │   ├── QuantityControl.jsx    ← − [n] + stepper
│   │   ├── OfferBanner.jsx        ← promotional banner at top of home
│   │   ├── SkeletonCard.jsx       ← loading placeholder
│   │   ├── EmptyState.jsx         ← no results / empty screen
│   │   ├── ErrorState.jsx         ← error with retry button
│   │   ├── AddToHomePrompt.jsx    ← iOS Safari "Add to Home Screen" nudge
│   │   └── ShopClosedBanner.jsx   ← shown when shop_open = false
│   ├── screens/                   ← one folder per screen
│   │   ├── AuthScreen/
│   │   │   ├── AuthScreen.jsx
│   │   │   └── AuthScreen.css
│   │   ├── HomeScreen/
│   │   │   ├── HomeScreen.jsx
│   │   │   └── HomeScreen.css
│   │   ├── ProductListScreen/
│   │   │   ├── ProductListScreen.jsx
│   │   │   └── ProductListScreen.css
│   │   ├── ProductDetailScreen/
│   │   │   ├── ProductDetailScreen.jsx
│   │   │   └── ProductDetailScreen.css
│   │   ├── CartScreen/
│   │   │   ├── CartScreen.jsx
│   │   │   └── CartScreen.css
│   │   ├── CheckoutScreen/
│   │   │   ├── CheckoutScreen.jsx
│   │   │   └── CheckoutScreen.css
│   │   ├── OrderConfirmationScreen/
│   │   │   ├── OrderConfirmationScreen.jsx
│   │   │   └── OrderConfirmationScreen.css
│   │   ├── OrdersScreen/
│   │   │   ├── OrdersScreen.jsx
│   │   │   └── OrdersScreen.css
│   │   ├── OrderDetailScreen/
│   │   │   ├── OrderDetailScreen.jsx
│   │   │   └── OrderDetailScreen.css
│   │   ├── ProfileScreen/
│   │   │   ├── ProfileScreen.jsx
│   │   │   └── ProfileScreen.css
│   │   └── NotificationsScreen/
│   │       ├── NotificationsScreen.jsx
│   │       └── NotificationsScreen.css
│   ├── styles/
│   │   ├── global.css             ← CSS variables, resets, typography
│   │   └── components.css         ← shared component utility classes
│   ├── utils/
│   │   ├── storage.js             ← localStorage token helpers
│   │   ├── formatters.js          ← currency, date, order status formatters
│   │   └── deviceDetect.js        ← detect iOS Safari for the install prompt
│   ├── App.jsx                    ← root component, routing
│   └── main.jsx                   ← entry point, renders <App />
├── index.html
├── vite.config.js                 ← Vite + vite-plugin-pwa config
├── package.json
└── .env                           ← VITE_API_URL=https://your-backend-url
```

---

## Navigation Structure

The Android app uses a **bottom tab navigator** with **4 tabs**. Mirror this exactly:

> [!IMPORTANT]
> The tabs are: **Home, Categories, Orders, Profile** — Cart is NOT a tab.
> Cart is accessed from the Home header icon and from StickyMiniCart. It is a stack screen.

```
Bottom Tab Bar (4 tabs)
├── Home (/)                  → HomeScreen
├── Categories (/categories)  → CategoriesScreen
├── Orders (/orders)          → OrdersScreen (auth required)
└── Profile (/profile)        → ProfileScreen (auth required)

Stack Routes (no bottom tab)
├── /auth                     → AuthScreen
├── /products                 → ProductListScreen (via category tap or search)
├── /product/:id              → ProductDetailScreen
├── /cart                     → CartScreen (via cart icon in header)
├── /checkout                 → CheckoutScreen (auth required)
├── /order/:id                → OrderDetailScreen
├── /order-confirmation/:id   → OrderConfirmationScreen
└── /notifications            → NotificationsScreen (auth required)
```

**StickyMiniCart:** A floating bar at the bottom of most screens (above the bottom nav)  
showing item count + total price → tapping it goes to `/cart`.

> All screen content must have `padding-bottom: 140px` (80px nav + ~60px for StickyMiniCart when visible).

---

## Screen-by-Screen Implementation Guide

> [!IMPORTANT]
> **Critical Auth Fact:** The Android app uses **Phone + Password** for login. There is NO email login, NO OTP. Password reset sends a request for **admin approval** — it does NOT reset the password automatically.

---

### Screen 1 — AuthScreen (`/auth`)

**Purpose:** Login, signup, and password reset request — 3 modes in one screen.

**UI Layout:**
```
[App Logo — centered, hidden when keyboard is up]

[Auth Card with SegmentedControl: Login | Sign Up]

-- Login Mode --
[Phone number input (numeric keyboard)]
[Password input (secure text)]
[Login button — dark gradient]
[Forgot Password? → switches to Reset mode]
[Create an account → switches to Sign Up mode]

-- Sign Up Mode --
[Full Name input]
[Phone number input]
[Password input (min 8 chars)]
[Confirm Password input]
[Create Account button]
[Already have an account? Login]

-- Reset Password Mode --
[Phone number input]
[New Password input (min 8)]
[Confirm New Password input]
[Send for Approval button]
(Note: This sends a request to admin — does NOT auto-reset)
[Back to Login link]
```

**API calls:**
- `POST /auth/login` with `{ phone, password }`
- `POST /auth/signup` with `{ name, fullName: name, phone, password }`
- `POST /auth/password-reset-requests` with `{ phone, newPassword: password, new_password: password }`
- On login/signup success: save token to `authStore` + localStorage, redirect to `/`

**State:** `mode` ('Login'|'SignUp'|'Reset'), `name`, `phone`, `password`, `confirmPassword`, `loading`, `error`, `success`

**Special:**
- If already logged in redirect to `/`
- Show shake animation on validation errors (match Android behaviour)
- Success message shown for password reset (no redirect — just a confirmation message)

---

### Screen 2 — HomeScreen (`/`)

**Purpose:** Main landing screen. Shows two store type tabs (Fast Food / Packed Items), offer banners, category sections, and product grids — all driven by the **dashboard API**.

**UI Layout:**
```
[Top Bar: App Logo | Notification bell + unread badge]

[ShopClosedBanner — shown if shop_open = false]

[SegmentedControl: Packed Items | Fast Food]

[Fake Search Bar — tapping navigates to ProductList in search mode]

[Dynamic Sections from /dashboard API — rendered in order]
  offer_banner   → OfferBannerCarousel (auto-scrolls every 4s, dot indicators)
  category_grid  → 4-wide grid of CategoryCard → tapping goes to ProductList
  product_block  → 3-wide grid of ProductCard
  combo_block    → 2-wide grid of ProductCard (with HOT badge)

[StickyMiniCart — shows item count + total → /cart]

[Bottom Nav]
```

**API calls (called on mount and on storeType tab change):**
- `GET /settings` → check `shop_open`, min order, delivery options (5-min TTL cache via settingsStore)
- `GET /dashboard?storeType=fast_food` OR `GET /dashboard?storeType=packed` → array of sections
- `GET /notifications/unread-count` → for bell badge

**Dashboard API response shape:**
```js
// Array of section objects:
[
  { type: 'offer_banner', items: [...] },
  { type: 'category_grid', items: [...] },
  { type: 'product_block', title: 'Popular', slug: '...', items: [...] },
  { type: 'combo_block', title: 'Combos', slug: '...', items: [...] }
]
```

**State:** `storeType` ('Fast Food'|'Packed Items'), `dashboardSections`, `loading`, `refreshing`, `unreadCount`

**Special behaviors:**
- Switching store type tab clears sections and re-fetches dashboard
- If `shop_open = false`: show full-width red `ShopClosedBanner`, disable all Add to Cart buttons
- Cart actions require auth — if not logged in, redirect to `/auth`

---

### Screen 3 — ProductListScreen (`/category/:id`)

**Purpose:** Full product list filtered by a category. Accessed by tapping a category.

**UI Layout:**
```
[Back button] [Category Name]

[Search bar — filter within category]

[2-column product grid]
  [ProductCard] [ProductCard]
  ...

[Pagination / Load More]

[Bottom Nav]
```

**API calls:**
- `GET /products?category_id=:id&search=X&page=1`

**State:** `search`, `products`, `loading`, `page`, `hasMore`

---

### Screen 4 — ProductDetailScreen (`/product/:id`)

**Purpose:** Full product detail with add-to-cart.

**UI Layout:**
```
[Back button]

[Full-width product image]

[Product Name — h1]
[Unit — small text below name]
[Price — bold large | Original Price struck through]
[Discount Label badge — saffron pill]

[Description — body text]

[Divider]

[QuantityControl: − [n] + ]  ← if already in cart, shows current qty
[Add to Cart button — full width, dark gradient]

[Bottom Nav]
```

**API calls:**
- `GET /products/:id`

**State:** `product`, `loading`, `quantity`

**Cart logic:** When tapping Add to Cart, add item to `cartStore` (local Zustand state — no API call yet). Show a brief success toast.

---

### Screen 5 — CartScreen (`/cart`)

**Purpose:** Review cart items before checkout.

**UI Layout:**
```
[Header: "Your Cart" | "Clear" button (red, right side)]

[If empty: cart icon + "Start Shopping" button → /]

[Cart Items List]
  Each row:
  [Product image 64×64]
  [Name + unit + price]
  [Unavailable warning if out of stock]
  [QuantityControl: − [n] +]
  [Delete icon (right)]

[Divider]

[Order Summary Card]
  Subtotal: ₹XXX
  Delivery fee: ₹XX
  Discount: -₹XX  (if offer applied)
  ─────────────
  Total: ₹XXX

[Offer code info — if offer is active]

[Proceed to Checkout button — full width green gradient]

[Bottom Nav]
```

**API calls:**
- `POST /cart/calculate` with the exact payload:
  ```js
  {
    items: [
      { productId: number, quantity: number, type: 'product'|'combo', isCombo: boolean }
    ],
    delivery_type: 'standard' | 'fast'   // optional, used in cart preview
  }
  ```
  → Returns `bill` object with: `subtotal`, `deliveryCharge`, `discount`, `grandTotal`, `nightCharge`, `minimumOrder`, `belowThreshold`, `freeDeliveryOfferActive`

**State:** Cart items come from `cartStore` (Zustand + localStorage persist). Totals come from the API.

**Special behaviors:**
- Call `/cart/calculate` every time cart changes (debounced 300ms)
- Show yellow warning if below free-delivery threshold: "Add ₹X more for Free Delivery"
- "Proceed to Pay (₹X)" green button — disabled if shop closed or cart empty
- Show "FREE" for delivery if `deliveryCharge === 0`

---

### Screen 6 — CheckoutScreen (`/checkout`)

**Purpose:** Enter delivery address, pick delivery speed, place order.

**UI Layout:**
```
[Header: "Checkout"]

[Section: Delivery Address]
  [Name input — pre-filled from profile]
  [Phone input — pre-filled from profile]
  [Address Line 1 input]
  [Address Line 2 input]
  [City input]
  [Pincode input]

[Section: Delivery Speed]
  [Standard delivery — ₹XX — X-Y mins]   ← radio card
  [Express delivery — ₹XX — X-Y mins]    ← radio card
  (Options come from settings API)

[Section: Payment Method]
  [Cash on Delivery]   ← radio (only option for now)

[Section: Order Summary]
  Items: X
  Subtotal: ₹XXX
  Delivery: ₹XX
  Total: ₹XXX

[Place Order button — full width green gradient]

[Bottom Nav]
```

**API calls:**
- `GET /settings` → get delivery speed options (standard/express fee & time)
- `POST /cart/calculate` → final total before placing
- `POST /orders` with full order payload → on success navigate to `/order-confirmation/:id`

**Order payload (exact shape from Android app):**
```js
{
  items: [{ productId, quantity, type: 'product'|'combo', isCombo: boolean }],
  deliveryAddress: string,   // single text field (full address)
  address: string,           // same value, sent twice
  latitude?: number,         // optional if user enables GPS
  longitude?: number,
  mapUrl?: string,           // google maps link if coords available
  paymentMethod: 'Cash' | 'UPI',
  delivery_type: 'standard' | 'fast'
}
```

**Note on GPS:** "Pin My Location (Optional)" button — requests GPS, shows coords on success. If user skips, order places without coordinates.

**State:** All form fields, `deliverySpeed`, `loading`, `error`

---

### Screen 7 — OrderConfirmationScreen (`/order-confirmation/:id`)

**Purpose:** Success screen shown immediately after placing an order.

**UI Layout:**
```
[Big success checkmark icon — animated]
[Heading: "Order Placed!"]
[Order # XXXX]
[Estimated delivery: X-Y mins]

[Order Summary Card]
  [item list]
  [total]

[Track Order button → /order/:id]
[Continue Shopping button → /]
```

**API calls:**
- `GET /orders/:id` → load order details

**Special:** Clear cart in `cartStore` after loading this screen.

---

### Screen 8 — OrdersScreen (`/orders`)

**Purpose:** List of all past orders. Auth required.

**UI Layout:**
```
[Header: "My Orders"]

[If empty: EmptyState + "Start Shopping" button]

[Order cards list — most recent first]
  Each card:
  [Order # | Date]
  [Item count + total]
  [Status badge — coloured]
  [chevron → order detail]
```

**API calls:**
- `GET /orders` → list of all orders for logged-in user

**Real-time:** Subscribe to `order.status.updated` socket event → refresh order in list

---

### Screen 9 — OrderDetailScreen (`/order/:id`)

**Purpose:** Full order detail with live status tracker. Auth required.

**UI Layout:**
```
[Header: "Order #XXXX"]

[Status Tracker — vertical stepper]
  ● Order Placed       ← always done
  ○ Accepted
  ○ Preparing
  ○ Out for Delivery
  ○ Delivered
  (steps fill in as status progresses)

[Delivery Address card]
  Name, Phone, Full address

[Items List]
  [image] [Name × qty] [price]

[Order Summary]
  Subtotal / Delivery / Total

[Payment Method]

[Cancel Order button — only if status = Pending]
  (shows inline confirmation: "Are you sure?" / Yes / No)
```

**API calls:**
- `GET /orders/:id`
- `POST /orders/:id/cancel` → cancel

**Real-time:** Subscribe to `order.status.updated` → update stepper live without full refresh

**Status → step mapping:**
```
Pending           → step 1 active
Accepted          → step 2 active
Preparing         → step 3 active
Out for Delivery  → step 4 active
Delivered         → step 5 active (all done)
Cancelled         → show cancelled banner (red)
```

---

### Screen 10 — ProfileScreen (`/profile`)

**Purpose:** User info, edit profile. Auth required.

**UI Layout:**
```
[Avatar circle — initials]
[User Name]
[User Email]

[Edit Profile card]
  [Name input]
  [Phone input]
  [Save button]

[Section: Account]
  [My Orders → /orders]
  [Notifications → /notifications]

[Log Out button — red text]
```

**API calls:**
- `GET /auth/me` → load profile on mount
- `PATCH /auth/profile` → save edits

---

### Screen 11 — NotificationsScreen (`/notifications`)

**Purpose:** In-app notifications list. Auth required.

**UI Layout:**
```
[Header: "Notifications" | "Mark all read" button]

[If empty: EmptyState]

[Notification list]
  Each row:
  [Icon based on type]
  [Title + message]
  [Time ago]
  [Unread dot — if unread]
  [Swipe-to-delete or delete button]
```

**API calls:**
- `GET /notifications`
- `PATCH /notifications/read-all`
- `PATCH /notifications/:id/read`
- `DELETE /notifications/:id`

**Real-time:** Subscribe to `notification.created` → append new notification to top of list

---

## Component Specifications

### ProductCard
```
[Image — 1:1 aspect ratio, rounded corners 8px]
[Name — 2 lines max, truncate]
[Unit — small grey text]
[Price row: ₹XX | Original ₹XX (struck)]
[Add button OR QuantityControl]
  - If not in cart: "+ Add" button (dark gradient)
  - If in cart: QuantityControl (− [n] +)
```

### QuantityControl
```
[− button] [number] [+ button]
All on one row, pill-shaped container
Background: var(--bg-input)
Number: bold, 16px
```

### BottomNav
```
Fixed bottom, 80px tall, white background, top border
4 items: Home | Categories | Orders | Profile
Active: var(--nav-active) = #0E1116 (near black)
Inactive: var(--nav-inactive) = #9CA3AF (grey)
NO cart tab — Cart is a stack screen, not a tab
```

### StickyMiniCart
```
Floating bar above the bottom nav
Height: ~56px, dark gradient background
Shows: item count | total price | arrow chevron
Hidden when cart is empty
Tapping navigates to /cart
```

### Button variants
```css
/* Primary — dark gradient */
.btn-primary {
  background: linear-gradient(180deg, #2A303D 0%, #0E1116 100%);
  color: #FFFFFF;
  border-radius: var(--radius-button); /* 12px */
  padding: 14px 24px;
  font-size: var(--fs-lg); /* 16px */
  font-weight: var(--fw-semibold); /* 600 */
}

/* Success — green gradient */
.btn-success {
  background: linear-gradient(180deg, #3FE09D 0%, #1FB574 100%);
  color: #FFFFFF;
}

/* Saffron — orange (offers/highlights) */
.btn-saffron {
  background: linear-gradient(180deg, #FF9A66 0%, #FF7A3A 100%);
  color: #FFFFFF;
}

/* Outline — secondary */
.btn-outline {
  background: transparent;
  border: 1.5px solid var(--border-strong);
  color: var(--text-primary);
}
```

---

## State Management (Zustand Stores)

### `authStore.js`
```js
{
  user: null,             // { id, name, email, phone }
  token: null,            // JWT string
  isLoggedIn: false,
  login(token, user),     // save to store + localStorage
  logout(),               // clear store + localStorage
  setUser(user),          // update user profile
}
// Persist: token + user to localStorage
```

### `cartStore.js`
```js
{
  // Item shape MUST include type — backend cart/calculate requires it
  items: [],   // [{ product: { id, name, price, unit, imageUrl }, quantity: number, type: 'product'|'combo' }]
  addItem(product, quantity=1),          // finds by id+type='product', increments or adds
  addCombo(combo, quantity=1),           // finds by id+type='combo', increments or adds
  removeItem(productId, type='product'),
  updateQty(productId, quantity, type),  // removes item if qty <= 0
  clearCart(),
  get totalItems(),     // sum of all quantities (for StickyMiniCart badge)
  get displayTotal(),   // sum of price*qty (display only, not API-verified)
}
// Persist: items to localStorage
// To build /cart/calculate payload:
// items.map(i => ({ productId: i.product.id, quantity: i.quantity, type: i.type, isCombo: i.type === 'combo' }))
```

### `settingsStore.js`
```js
{
  shopOpen: true,
  deliveryOptions: [],    // [{ id, label, fee, estimatedMinutes }]
  fetchSettings(),
}
```

### `notificationStore.js`
```js
{
  unreadCount: 0,
  setUnreadCount(n),
  incrementUnread(),
  resetUnread(),
}
```

---

## PWA Configuration

### `public/manifest.json`
```json
{
  "name": "ServeLoco",
  "short_name": "ServeLoco",
  "description": "Order food and packed items from ServeLoco",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#EEF0F3",
  "theme_color": "#0E1116",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### iOS-Specific Meta Tags (in `index.html`)
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="ServeLoco">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

The `viewport-fit=cover` is critical — it prevents white bars on iPhone X and above with the notch.

### `vite.config.js`
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,       // we manage manifest.json manually in /public
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/your-backend\.com\/api\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxAgeSeconds: 60 } }
          }
        ]
      }
    })
  ]
});
```

---

## Add to Home Screen Prompt (iOS-Specific)

iOS does not auto-prompt install. Show this component once per session on iOS Safari only:

```
╔══════════════════════════════════════════╗
║  Install ServeLoco                       ║
║  Tap the Share button then               ║
║  "Add to Home Screen"                    ║
║  for the best experience            [×]  ║
╚══════════════════════════════════════════╝
```

**Detection logic (in `deviceDetect.js`):**
```js
export const isIosSafari = () => {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isInStandaloneMode = window.navigator.standalone === true;
  // Only show if on iOS, not already installed
  return isIos && !isInStandaloneMode;
};
```

Show this banner:
- Only when `isIosSafari()` is true
- Only if user has NOT already dismissed it (check `localStorage.getItem('iosPromptDismissed')`)
- Slide up from the bottom, above the bottom nav
- On dismiss: set `localStorage.setItem('iosPromptDismissed', '1')`

---

## Real-Time Socket Setup

Copy and adapt `Frontend-V1/src/api/realtimeClient.js` for the PWA. Key differences:
- Replace `__DEV__` (React Native global) with `import.meta.env.DEV` (Vite)
- Remove `emitRealtimeForeground()` — use `document.visibilitychange` event instead
- Everything else is identical

Connect socket after login, disconnect on logout.

---

## Deployment

### Step 1 — Build
```bash
cd Frontend-PWA
npm run build
# Output: dist/
```

### Step 2 — Deploy to Vercel
```bash
npm install -g vercel
vercel --prod
```

### Step 3 — Add Custom Domain
1. Go to Vercel dashboard → Project Settings → Domains
2. Add `serveloco.app`
3. Vercel will show DNS records to add

### Step 4 — Update DNS for `serveloco.app`
In your domain registrar, set:
```
Type: A       Name: @    Value: 76.76.21.21   (Vercel IP)
Type: CNAME   Name: www  Value: cname.vercel-dns.com
```

### Step 5 — HTTPS
Vercel auto-provisions SSL. No action needed. HTTPS is required for:
- PWA install
- Service worker
- Camera/location access
- Socket.io over wss://

---

## Task List for Implementation

### Phase 1 — Project Setup
- [ ] 1.1 Run `npm create vite@latest Frontend-PWA -- --template react` from project root
- [ ] 1.2 Remove TypeScript: ensure no `.ts/.tsx` files, `jsconfig.json` only (no `tsconfig.json`)
- [ ] 1.3 Install dependencies:
  ```
  npm install react-router-dom zustand socket.io-client axios
  npm install -D vite-plugin-pwa
  ```
- [ ] 1.4 Create `src/styles/global.css` with all CSS variables from the Design System section above
- [ ] 1.5 Create `public/manifest.json` with content from PWA Configuration section
- [ ] 1.6 Add iOS meta tags to `index.html`
- [ ] 1.7 Configure `vite.config.js` with VitePWA plugin
- [ ] 1.8 Create `.env` with `VITE_API_URL=https://your-backend-url`
- [ ] 1.9 Create `src/App.jsx` with React Router v6 `<Routes>` structure (all 11 routes listed in Navigation section)
- [ ] 1.10 Set max width of the app to `430px` centered on desktop (mobile-first, no wider than phone screen)
  ```css
  #root {
    max-width: 430px;
    margin: 0 auto;
    min-height: 100vh;
    background: var(--bg-app);
  }
  ```

### Phase 2 — API Layer
- [ ] 2.1 Create `src/api/client.js` — base fetch wrapper that adds `Authorization: Bearer <token>` header from localStorage for authenticated calls, base URL from `VITE_API_URL`
- [ ] 2.2 Create `src/api/authApi.js` — `login()`, `signup()`, `getMe()`, `updateProfile()`, `requestPasswordReset()`
- [ ] 2.3 Create `src/api/productsApi.js` — `getProducts(params)`, `getProduct(id)`, `getCategories(params)`
- [ ] 2.4 Create `src/api/offersApi.js` — `getActiveOffer()`
- [ ] 2.5 Create `src/api/settingsApi.js` — `getSettings()`
- [ ] 2.6 Create `src/api/cartApi.js` — `calculate(items)`
- [ ] 2.7 Create `src/api/ordersApi.js` — `createOrder()`, `getOrders()`, `getOrder(id)`, `cancelOrder(id)`
- [ ] 2.8 Create `src/api/notificationsApi.js` — all 5 notification endpoints
- [ ] 2.9 Create `src/api/realtimeClient.js` — adapted from Android (replace `__DEV__` with `import.meta.env.DEV`)
- [ ] 2.10 Create `src/utils/storage.js` — `getToken()`, `setToken()`, `removeToken()`, `getUser()`, `setUser()`, `removeUser()`

### Phase 3 — Zustand Stores
- [ ] 3.1 Create `src/stores/authStore.js` with `user`, `token`, `isLoggedIn`, `login()`, `logout()`, `setUser()` — persist token+user to localStorage
- [ ] 3.2 Create `src/stores/cartStore.js` with `items`, `addItem()`, `removeItem()`, `updateQty()`, `clearCart()`, computed `itemCount` and `subtotal` — persist items to localStorage
- [ ] 3.3 Create `src/stores/settingsStore.js` with `shopOpen`, `deliveryOptions`, `fetchSettings()`
- [ ] 3.4 Create `src/stores/notificationStore.js` with `unreadCount`, `setUnreadCount()`, `incrementUnread()`, `resetUnread()`

### Phase 4 — Shared Components
- [ ] 4.1 `BottomNav.jsx` + CSS — 4 tabs fixed to bottom, cart badge, active state
- [ ] 4.2 `Button.jsx` + CSS — 4 variants: primary (dark), success (green), saffron (orange), outline
- [ ] 4.3 `ProductCard.jsx` + CSS — image, name, unit, price, add-to-cart/qty control
- [ ] 4.4 `QuantityControl.jsx` + CSS — − [n] + with pill container
- [ ] 4.5 `CategoryChip.jsx` + CSS — horizontal scroll chip, active/inactive state
- [ ] 4.6 `OrderStatusBadge.jsx` + CSS — coloured pill for each order status
- [ ] 4.7 `OfferBanner.jsx` + CSS — full-width image banner from offers API
- [ ] 4.8 `SkeletonCard.jsx` + CSS — animated shimmer loading placeholder
- [ ] 4.9 `EmptyState.jsx` + CSS — centered icon + message + optional CTA button
- [ ] 4.10 `ErrorState.jsx` + CSS — error message + retry button
- [ ] 4.11 `ShopClosedBanner.jsx` + CSS — full-width warning when shop is closed
- [ ] 4.12 `AddToHomePrompt.jsx` + CSS — iOS install nudge, detect with `deviceDetect.js`
- [ ] 4.13 `src/utils/deviceDetect.js` — `isIosSafari()` detection function
- [ ] 4.14 `src/utils/formatters.js` — `formatPrice(n)`, `formatDate(d)`, `timeAgo(d)`, `getStatusLabel(status)`, `getStatusColor(status)`

### Phase 5 — Auth Screen
- [ ] 5.1 Build `AuthScreen.jsx` with 3 modes: Login, Sign Up, Reset Password
- [ ] 5.2 Login form: **phone number** (type=tel, numeric) + password + error display + loading state — NO email field
- [ ] 5.3 Signup form: full name + **phone** + password (min 8 chars) + confirm password + error display
- [ ] 5.4 Reset Password form: phone + new password + confirm — show success message on submit (no auto-redirect, awaits admin approval)
- [ ] 5.5 On login/signup success: call `authStore.login()`, call `connectCustomerRealtime(token)`, navigate to `/`
- [ ] 5.6 Wrap protected routes (`/orders`, `/checkout`, `/profile`, `/notifications`) in `<AuthGuard>` that redirects to `/auth` if not logged in

### Phase 6 — Home Screen
- [ ] 6.1 On mount: fetch settings (5-min TTL), fetch `GET /dashboard?storeType=fast_food` (default), fetch notification unread count
- [ ] 6.2 Render `ShopClosedBanner` if `settingsStore.shopOpen === false`
- [ ] 6.3 Render `SegmentedControl` (Packed Items / Fast Food) — on tab switch clear sections + re-fetch dashboard with new storeType param
- [ ] 6.4 Render fake search bar (tapping navigates to `/products?mode=search`)
- [ ] 6.5 Render each dashboard section by type:
  - `offer_banner` → `OfferBannerCarousel` (auto-scroll 4s, dot indicators)
  - `category_grid` → 4-column grid of `CategoryCard` → tap goes to ProductListScreen
  - `product_block` → section title + 3-column product grid with `ProductCard`
  - `combo_block` → section title + 2-column combo grid with HOT badge on cards
- [ ] 6.6 All Add to Cart actions: check auth first — redirect to `/auth` if not logged in
- [ ] 6.7 Disable all Add to Cart buttons when shop is closed
- [ ] 6.8 Show `StickyMiniCart` above bottom nav when cart has items
- [ ] 6.9 Notification bell in top bar shows `notificationStore.unreadCount` badge

### Phase 7 — Product List + Product Detail
- [ ] 7.1 Build `ProductListScreen.jsx` — fetch `GET /products?category_id=:id`, search input, grid, load more
- [ ] 7.2 Build `ProductDetailScreen.jsx` — fetch `GET /products/:id`, full layout with image, price, description
- [ ] 7.3 Add to cart logic: call `cartStore.addItem(product)`, show brief success toast
- [ ] 7.4 If product already in cart: show `QuantityControl` instead of Add button
- [ ] 7.5 Display discount label badge (saffron pill) if `discount_label` exists

### Phase 8 — Cart Screen
- [ ] 8.1 Read `cartStore.items` — if empty show `EmptyState` with "Start Shopping" → `/`
- [ ] 8.2 Render each cart item row with thumbnail (64×64), name + unit, `QuantityControl`, delete icon
- [ ] 8.3 Call `POST /cart/calculate` on every cart change (debounce **300ms**), display returned `bill` object
- [ ] 8.4 Show bill summary: Subtotal, Delivery (or FREE), Night Charge (if >0), Discount (if >0), Grand Total
- [ ] 8.5 Show yellow threshold warning if `bill.belowThreshold`: "Add ₹X more for Free Delivery"
- [ ] 8.6 "Proceed to Pay (₹X)" green button → `/checkout` — disabled if shop closed, empty cart, or still calculating

### Phase 9 — Checkout Screen
- [ ] 9.1 Fetch settings for delivery speed options, fees, UPI ID
- [ ] 9.2 Address field: single multiline textarea (pre-filled from `authStore.user.address`) — NOT separate line1/line2/city/pincode fields
- [ ] 9.3 "Pin My Location (Optional)" button — calls browser `navigator.geolocation.getCurrentPosition`, shows coords on success (don't block order without it)
- [ ] 9.4 Delivery speed cards (Standard / Fast) — only render if `bill.fastDeliveryEnabled === true`
- [ ] 9.5 Payment method: Cash on Delivery AND UPI cards — if UPI selected show QR image (fetch from `/images/:upiQrImageId`) and UPI ID text
- [ ] 9.6 Call `POST /cart/calculate` (debounce 250ms) whenever delivery type or GPS coords change
- [ ] 9.7 Show final bill summary from latest `calculate` response
- [ ] 9.8 Double-submit guard using a `useRef` (sync ref, not state) — prevents race condition on slow connections
- [ ] 9.9 On "Place Order": validate address, call `POST /orders` with exact payload, on success navigate to `/order-confirmation/:id` and clear cart

### Phase 10 — Order Screens
- [ ] 10.1 `OrderConfirmationScreen.jsx` — fetch `GET /orders/:id`, show animated success checkmark, clear cart
- [ ] 10.2 `OrdersScreen.jsx` — fetch `GET /orders`, list order cards, subscribe to socket for live updates
- [ ] 10.3 `OrderDetailScreen.jsx` — fetch `GET /orders/:id`, vertical stepper, cancel button for Pending orders
- [ ] 10.4 Stepper maps order status to step number (Pending=1, Accepted=2, Preparing=3, Out for Delivery=4, Delivered=5)
- [ ] 10.5 Socket: subscribe to `order.status.updated` → update stepper in real time without page reload
- [ ] 10.6 Cancel order: inline confirmation (not browser `confirm()`), call `POST /orders/:id/cancel`

### Phase 11 — Profile + Notifications
- [ ] 11.1 `ProfileScreen.jsx` — load user, edit name + phone form, logout button
- [ ] 11.2 On logout: call `authStore.logout()`, disconnect socket, clear cart, navigate to `/auth`
- [ ] 11.3 `NotificationsScreen.jsx` — fetch notifications, mark read on view, swipe/delete buttons
- [ ] 11.4 Subscribe to `notification.created` socket → prepend new notification to list
- [ ] 11.5 Subscribe to `notification.unread_count.updated` → update `notificationStore.unreadCount` → update bell badge in home top bar

### Phase 12 — PWA Polish
- [ ] 12.1 Generate 3 icon sizes: 192×192, 512×512, 512×512 maskable — save to `public/icons/`
- [ ] 12.2 Add `AddToHomePrompt` to `App.jsx` so it shows on all screens on iOS Safari
- [ ] 12.3 Add `<meta name="theme-color" content="#0E1116">` so the status bar on iOS matches the app
- [ ] 12.4 Add `safe-area-inset` padding at bottom for iPhone X notch:
  ```css
  .bottom-nav {
    padding-bottom: env(safe-area-inset-bottom);
  }
  ```
- [ ] 12.5 Test offline: service worker should cache static assets so the app shell loads offline
- [ ] 12.6 Lighthouse audit — target PWA score > 90, Performance > 80

### Phase 13 — Deployment
- [ ] 13.1 Set `VITE_API_URL` to production backend URL in Vercel environment variables
- [ ] 13.2 Deploy to Vercel with `vercel --prod`
- [ ] 13.3 Add `serveloco.app` as custom domain in Vercel dashboard
- [ ] 13.4 Update DNS records at your domain registrar (A record + CNAME per Vercel instructions)
- [ ] 13.5 Wait for SSL certificate (usually < 5 minutes on Vercel)
- [ ] 13.6 Test on a real iPhone in Safari — add to home screen, open, check all screens

---

## What Each AI Agent Should Know

When handing off tasks to another AI, include this context block:

```
PROJECT: ServeLoco PWA
FRAMEWORK: React.js (Vite), plain JS — NO TypeScript
STYLES: Vanilla CSS only, NO Tailwind
FOLDER: Frontend-PWA/ (inside /home/linux/Documents/ProjectServeLoco/)
BACKEND: Same as Android app Frontend-V1 — see API Endpoints section in plans/ios.md
DESIGN: Mirror Android app exactly — see Design System section in plans/ios.md for all color/spacing/radius values
STATE: Zustand stores in src/stores/ — see State Management section
ROUTING: React Router v6, BrowserRouter, see Navigation section for all routes
ICONS: Use plain Unicode characters or simple inline SVG — do NOT add icon libraries
NO EMOJIS in visible UI text (Android app rule — keep same)
MAX WIDTH: 430px centered on desktop
```

---

## Checklist for "Looks Like the Android App"

Before marking any screen as done, verify:
- [ ] Background color is `#EEF0F3` (offWhite), not white
- [ ] Cards have `background: #FFFFFF`, `border-radius: 8px`
- [ ] Primary buttons are dark gradient (`#2A303D → #0E1116`), not blue/green
- [ ] Text primary is `#0E1116` (near black), not pure `#000`
- [ ] Font is Roboto (Google Fonts), not system default
- [ ] Bottom nav is present on all main screens, 80px tall
- [ ] Spacing uses 4px base unit multiples (8, 12, 16, 24, 32)
- [ ] Inputs have `background: #E6E8EC`, `border-radius: 10px`
- [ ] Max width capped at 430px with `margin: 0 auto` on desktop
