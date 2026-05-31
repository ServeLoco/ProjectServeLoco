# ServeLoco Performance Improvement Tasks

> Ordered by impact vs effort. Do HIGH priority first.

---

## 🔴 HIGH PRIORITY

### 1. Add Missing Database Indexes
**File:** `Backend-V1/src/db/migrate.js`
**Impact:** Prevents full table scans — biggest backend win

Add these via `ensureIndex` or raw SQL in the migration:
```sql
-- Notifications: soft-delete filter
ALTER TABLE notifications ADD INDEX idx_notifications_user_deleted (user_id, deleted_at);

-- Products: availability filter used in every product list query
ALTER TABLE products ADD INDEX idx_products_available_deleted (available, deleted);

-- Orders: customer order history queries
ALTER TABLE orders ADD INDEX idx_orders_customer_created (customer_id, created_at);
```

---

### 2. Replace `SELECT *` with Explicit Columns
**Files:** All controllers in `Backend-V1/src/controllers/`
**Impact:** Reduces bandwidth and memory — every API response gets lighter

Key locations to fix:
- `settingsController.js:102` — `SELECT * FROM settings`
- `notificationController.js:21` — `SELECT * FROM notifications`
- `orderController.js:60-62` — `SELECT * FROM products` and `SELECT * FROM combos`
- `adminController.js:450` — already partially done, verify remaining queries
- `cartController.js:42-44` — `SELECT * FROM combos/products`

Only select columns you actually use in the response.

---

### 3. Add Debounce to Admin Search Inputs
**File:** `adminManager-V1/src/pages/Products.jsx` lines 36-38, 71-74
**Impact:** Stops API call spam when typing in search box

```js
// Replace immediate useEffect trigger with debounced version
useEffect(() => {
  const timer = setTimeout(() => fetchProducts(1), 600);
  return () => clearTimeout(timer);
}, [filters]);
```
Apply same pattern to: `Orders.jsx`, `Customers.jsx`, `Categories.jsx`

---

### 4. Cache Settings Response on Frontend
**File:** `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js` lines 95-98
**Impact:** Eliminates redundant settings API call every time user navigates to home

Strategy: Store `lastFetched` timestamp in settings store. Re-fetch only if older than 5 minutes.

```js
// In useSettingsStore
const SETTINGS_TTL = 5 * 60 * 1000; // 5 minutes
const shouldRefetch = !lastFetched || Date.now() - lastFetched > SETTINGS_TTL;
if (shouldRefetch) await settingsApi.getSettings();
```

---

### 5. Stop Polling Notifications — Use Socket Only
**File:** `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js` lines 162-180
**Impact:** Eliminates repeated unread count API calls, saves battery

The socket already emits `notification.unread_count.updated` events. Remove the `setTimeout` polling fallback entirely. Trust the socket event for count updates, and only fetch on initial mount.

---

### 6. Add Image Caching
**File:** `Frontend-V1/src/components/ProductImage/ProductImage.js`
**Impact:** Images no longer re-downloaded on every screen visit

Replace React Native's `Image` with `expo-image` which has built-in disk caching:

```bash
npx expo install expo-image
```

```js
import { Image } from 'expo-image';

// Usage stays the same but caching is automatic
<Image source={{ uri }} style={...} contentFit="cover" cachePolicy="memory-disk" />
```

---

## 🟡 MEDIUM PRIORITY

### 7. Memoize ProductCard and CategoryCard
**Files:**
- `Frontend-V1/src/components/ProductCard/ProductCard.js` line 603
- `Frontend-V1/src/components/CategoryCard/CategoryCard.js` line 84

**Impact:** Prevents re-rendering 20+ cards when parent state changes (e.g., cart update)

```js
// Change bottom of each file from:
export default ProductCard;
// To:
export default React.memo(ProductCard);
```

---

### 8. useMemo for Filtered Lists
**File:** `Frontend-V1/src/screens/customer/CategoriesScreen/CategoriesScreen.js` lines 61-67

```js
// Wrap filtered categories in useMemo
const displayCategories = useMemo(() =>
  categories.filter(cat =>
    activeChip === 'All' || cat.type === normalizedStoreType
  ),
  [categories, activeChip, normalizedStoreType]
);
```

---

### 9. Fire-and-Forget Notifications (Don't Block Order Response)
**File:** `Backend-V1/src/controllers/orderController.js` lines 189-193
**Impact:** Order creation response is faster — notifications sent in background

```js
// Change from awaiting notification creation to fire-and-forget
notificationService.createOrderNotification({ userId, order, event: 'order_placed', connection })
  .then(result => realtimeEvents.emitNotificationCreated(userId, result))
  .catch(err => console.error('Notification failed (non-blocking):', err));

// Don't await it — respond to user immediately
```

This pattern is already used in some places — make it consistent everywhere in `orderController.js` and `adminController.js`.

---

### 10. Add LIMIT Safety Guard to Inner Queries
**File:** `Backend-V1/src/controllers/orderController.js`

Queries like `SELECT * FROM order_items WHERE order_id = ?` have no LIMIT.
Add `LIMIT 200` as a safety cap to prevent memory spikes on corrupt data.

---

## 🟢 LOW PRIORITY

### 11. Lazy Load Heavy Screens in Navigation
**File:** `Frontend-V1/src/navigation/CustomerNavigator.js`
**Impact:** Faster initial app startup

Use `React.lazy` + `Suspense` for screens that aren't shown on first load (e.g., `OrderDetailScreen`, `ProductDetailScreen`).

---

### 12. useCallback for Inline Event Handlers in Lists
**File:** `Frontend-V1/src/screens/customer/HomeScreen/HomeScreen.js`

Handlers like `onAdd`, `onIncrement`, `onDecrement` passed to `ProductCard` create new function instances on every render. Wrap with `useCallback` to make them stable references, which helps `React.memo` on `ProductCard` actually work.

---

### 13. Paginate Admin Notification History
**File:** `adminManager-V1/src/pages/Notifications.jsx`

The broadcast history table fetches all records. Add pagination controls (page/limit) to avoid loading thousands of rows.

---

### 14. Add `keyExtractor` and `getItemLayout` to FlatLists
**Files:** Any screen using `FlatList` in `Frontend-V1/src/screens/`

`getItemLayout` allows FlatList to skip measurement and scroll instantly to any position:
```js
getItemLayout={(data, index) => ({
  length: ITEM_HEIGHT,
  offset: ITEM_HEIGHT * index,
  index,
})}
```
Only worth adding if item height is fixed and consistent.

---

## Summary

| # | Task | Priority | Est. Time | Impact |
|---|------|----------|-----------|--------|
| 1 | Database indexes | 🔴 HIGH | 30 min | Query speed 10x |
| 2 | Remove SELECT * | 🔴 HIGH | 2-3 hrs | Bandwidth -40% |
| 3 | Admin search debounce | 🔴 HIGH | 45 min | API calls -80% |
| 4 | Cache settings on frontend | 🔴 HIGH | 1 hr | API calls -60% |
| 5 | Stop notification polling | 🔴 HIGH | 1 hr | Battery + server load |
| 6 | Image caching (expo-image) | 🔴 HIGH | 2 hrs | Image load speed |
| 7 | Memo ProductCard/CategoryCard | 🟡 MED | 30 min | UI smoothness |
| 8 | useMemo for filtered lists | 🟡 MED | 30 min | CPU on filter |
| 9 | Fire-and-forget notifications | 🟡 MED | 1 hr | Order response speed |
| 10 | LIMIT safety on inner queries | 🟡 MED | 30 min | Memory safety |
| 11 | Lazy load screens | 🟢 LOW | 2 hrs | Startup time |
| 12 | useCallback for list handlers | 🟢 LOW | 1 hr | Re-render reduction |
| 13 | Paginate admin notification history | 🟢 LOW | 1 hr | Admin load time |
| 14 | FlatList getItemLayout | 🟢 LOW | 1 hr | Scroll performance |

**Total estimated time: ~16 hours**
**Start with tasks 1, 3, 9 — they take under 1 hour each and have the highest return.**
