# Admin Quick-Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Fix the six admin quick-win issues selected by the user: header refresh wiring, duplicated generic errors, blocking `alert()` calls, missing PWA manifest theme, form-validation UX, and small polish items.

**Architecture:** Keep changes local to `apps/admin/src`. Introduce two shared primitives (`utils/constants.js` and `hooks/useAdminRefresh.js`) and one small component (`components/MessageBanner.jsx`). Apply them consistently across pages without changing API contracts or backend behavior.

**Tech Stack:** React 18, Vite 5, vite-plugin-pwa, vanilla CSS modules, ESLint.

---

## File Structure

- `apps/admin/src/utils/constants.js` — shared `GENERIC_ERROR` and other copy constants.
- `apps/admin/src/hooks/useAdminRefresh.js` — subscribe to the header refresh event and run a callback.
- `apps/admin/src/components/MessageBanner.jsx` — reusable success / error / warning inline banner.
- `apps/admin/src/components/SharedUI.jsx` — add `role="alert"` to `ErrorState`, keep `Loading` / `EmptyState` stable.
- `apps/admin/src/components/Header.jsx` — fix refresh event wiring.
- `apps/admin/vite.config.js` — add PWA manifest metadata.
- `apps/admin/src/pages/Settings.jsx` — inline validation errors, replace `alert()`.
- `apps/admin/src/pages/Products.jsx` — inline validation errors, replace `alert()`.
- `apps/admin/src/pages/Combos.jsx` — replace `alert()` with inline message.
- `apps/admin/src/pages/Orders.jsx` — replace `alert()` with inline message.
- `apps/admin/src/pages/Customers.jsx` — replace `alert()` with inline message.
- All other pages with `GENERIC_ERROR` string — import from `utils/constants` and render `<ErrorState />` / `<Loading />` where appropriate.

---

## Task 1: Centralize `GENERIC_ERROR` and strengthen SharedUI

**Files:**
- Create: `apps/admin/src/utils/constants.js`
- Modify: `apps/admin/src/components/SharedUI.jsx`
- Modify: every page that defines `const GENERIC_ERROR`

- [ ] **Step 1: Create constants utility**

Create `apps/admin/src/utils/constants.js`:

```js
export const GENERIC_ERROR = 'Something went wrong. Please try again later.';
```

- [ ] **Step 2: Strengthen SharedUI error component**

Edit `apps/admin/src/components/SharedUI.jsx`. Update `ErrorState` to include `role="alert"`:

```jsx
export function ErrorState({ message }) {
  return (
    <div role="alert" style={{
      padding: '1.25rem 1.5rem',
      backgroundColor: 'var(--danger-soft)',
      color: 'var(--danger-color)',
      borderLeft: '4px solid var(--danger-color)',
      borderRadius: '0 var(--radius-md) var(--radius-md) 0',
      margin: '1.5rem 0',
      fontSize: '0.925rem',
      fontWeight: 500
    }}>
      Error: {message}
    </div>
  );
}
```

- [ ] **Step 3: Replace duplicated constants**

In each of the following files, delete the local `const GENERIC_ERROR = ...` line and add:

```js
import { GENERIC_ERROR } from '../utils/constants';
```

Files: `AuditLogs.jsx`, `BulkImport.jsx`, `Categories.jsx`, `Combos.jsx`, `Customers.jsx`, `Dashboard.jsx`, `Health.jsx`, `Images.jsx`, `MobileDashboard.jsx`, `Notifications.jsx`, `Offers.jsx`, `Orders.jsx`, `Products.jsx`, `Reports.jsx`, `Settings.jsx`.

- [ ] **Step 4: Use SharedUI components where missing**

For any page that still renders an error with an ad-hoc inline `<div>` (e.g. `Dashboard.jsx`, `Orders.jsx`, `Products.jsx`), replace it with:

```jsx
import { Loading, ErrorState, EmptyState } from '../components/SharedUI';
```

and render `<ErrorState message={error} />`, `<Loading />`, or `<EmptyState message="..." />` as appropriate.

- [ ] **Step 5: Verify**

Run: `cd apps/admin && npm run lint`
Expected: `ESLint: No issues found`

---

## Task 2: Fix header refresh button wiring

**Files:**
- Create: `apps/admin/src/hooks/useAdminRefresh.js`
- Modify: `apps/admin/src/components/Header.jsx`
- Modify: `apps/admin/src/pages/Dashboard.jsx`, `Orders.jsx`, `Products.jsx`

- [ ] **Step 1: Create the refresh hook**

Create `apps/admin/src/hooks/useAdminRefresh.js`:

```js
import { useEffect, useRef } from 'react';

export function useAdminRefresh(callback) {
  const cbRef = useRef(callback);
  useEffect(() => { cbRef.current = callback; }, [callback]);

  useEffect(() => {
    const handler = () => {
      if (typeof cbRef.current === 'function') {
        cbRef.current();
      }
    };
    window.addEventListener('admin:refresh', handler);
    return () => window.removeEventListener('admin:refresh', handler);
  }, []);
}
```

- [ ] **Step 2: Fix Header.jsx refresh button**

Replace the current `handleClick` body in `RefreshButton` with:

```js
const handleClick = () => {
  window.dispatchEvent(new CustomEvent('admin:refresh'));
};
```

Remove the `tick` ref and the handled-detection logic; pages will now subscribe directly.

- [ ] **Step 3: Hook into major pages**

In `Dashboard.jsx`, after the `fetchDashboardData` definition:

```js
import { useAdminRefresh } from '../hooks/useAdminRefresh';
// ...
useAdminRefresh(fetchDashboardData);
```

Do the same in `Orders.jsx` with `fetchOrders(paginationRef.current.page || 1)` and in `Products.jsx` with `fetchProducts(pagination.page)`.

- [ ] **Step 4: Verify**

Run: `cd apps/admin && npm run lint`
Expected: `ESLint: No issues found`

---

## Task 3: Add `MessageBanner` component and replace blocking `alert()` calls

**Files:**
- Create: `apps/admin/src/components/MessageBanner.jsx`
- Create: `apps/admin/src/components/MessageBanner.css`
- Modify: `apps/admin/src/pages/Settings.jsx`, `Products.jsx`, `Combos.jsx`, `Orders.jsx`, `Customers.jsx`

- [ ] **Step 1: Create MessageBanner component**

Create `apps/admin/src/components/MessageBanner.jsx`:

```jsx
import React from 'react';
import './MessageBanner.css';

export default function MessageBanner({ type = 'info', message, onDismiss }) {
  if (!message) return null;
  return (
    <div className={`message-banner message-banner--${type}`} role="status">
      <span className="message-banner__text">{message}</span>
      {onDismiss && (
        <button className="message-banner__close" onClick={onDismiss} aria-label="Dismiss message">
          ✕
        </button>
      )}
    </div>
  );
}
```

Create `apps/admin/src/components/MessageBanner.css`:

```css
.message-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-md, 6px);
  margin: 0 0 1rem;
  font-size: 0.9rem;
  font-weight: 500;
}
.message-banner--info {
  background: var(--info-soft, #e8f4fd);
  color: var(--info-color, #0c5460);
  border-left: 4px solid var(--info-color, #0c5460);
}
.message-banner--success {
  background: var(--success-soft, #e6f4ea);
  color: var(--success-color, #1e7e34);
  border-left: 4px solid var(--success-color, #1e7e34);
}
.message-banner--error {
  background: var(--danger-soft, #fdecea);
  color: var(--danger-color, #c62828);
  border-left: 4px solid var(--danger-color, #c62828);
}
.message-banner--warning {
  background: var(--warning-soft, #fff3cd);
  color: var(--warning-color, #856404);
  border-left: 4px solid var(--warning-color, #856404);
}
.message-banner__close {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  color: inherit;
}
```

- [ ] **Step 2: Replace Settings alerts**

In `Settings.jsx`:
- Replace validation `alert()` calls with `setFormError('...')`.
- Add a new state `const [formError, setFormError] = useState(null);` and `const [saveSuccess, setSaveSuccess] = useState(null);`.
- Render `<MessageBanner type="error" message={formError} onDismiss={() => setFormError(null)} />` and `<MessageBanner type="success" message={saveSuccess} onDismiss={() => setSaveSuccess(null)} />` near the top of the form.
- Replace the final `alert('Settings saved successfully!')` with `setSaveSuccess('Settings saved successfully!')`.

- [ ] **Step 3: Replace Products alerts**

In `Products.jsx`:
- Add `const [formError, setFormError] = useState(null);`.
- Replace the two `alert()` validation calls in the save handler with `setFormError('...')` and return early.
- Replace `alert('Please select a category...')` and `alert('Selected category does not match...')` with `setFormError(...)`.
- Render `MessageBanner` at the top of the create/edit drawer.

- [ ] **Step 4: Replace Combos alerts**

In `Combos.jsx`:
- Add a `message`/`messageType` state.
- Replace all `alert()` calls with `setMessage({ type: 'error', text: '...' })`.
- Render `<MessageBanner type={message.type} message={message.text} onDismiss={() => setMessage(null)} />` in the form area.

- [ ] **Step 5: Replace Orders alerts**

In `Orders.jsx`:
- Replace `alert('No orders found to export')` and `alert('Unable to open print preview...')` with a new local `message` state rendered as `MessageBanner`.
- For the cancellation prompt, keep `window.prompt()` (it is intentional), but replace the `window.confirm()` result with an inline confirmation if desired. For this quick-win, keep the confirm but ensure no other blocking `alert()` remains.

- [ ] **Step 6: Replace Customers alert**

In `Customers.jsx`:
- Add `const [actionMessage, setActionMessage] = useState(null);`.
- Replace `alert('Password reset request ...')` with `setActionMessage({ type: 'success', text: ... })`.
- Render `MessageBanner` near the page header.

- [ ] **Step 7: Verify**

Run: `cd apps/admin && npm run lint`
Expected: `ESLint: No issues found`

---

## Task 4: Fix PWA manifest warning

**Files:**
- Modify: `apps/admin/vite.config.js`

- [ ] **Step 1: Add manifest metadata**

Update the `VitePWA(...)` options in `apps/admin/vite.config.js` to include:

```js
manifest: {
  name: 'VillKro Admin',
  short_name: 'VK Admin',
  description: 'VillKro store administration panel',
  theme_color: '#4f46e5',
  background_color: '#ffffff',
  display: 'standalone',
  start_url: '/',
}
```

- [ ] **Step 2: Verify**

Run: `cd apps/admin && npm run build`
Expected: build completes without the `theme_color is missing` warning.

---

## Task 5: Tighten form validation UX in Settings and Products

**Files:**
- Modify: `apps/admin/src/pages/Settings.jsx`
- Modify: `apps/admin/src/pages/Products.jsx`

- [ ] **Step 1: Field-level errors in Settings**

In `Settings.jsx`:
- Add `const [fieldErrors, setFieldErrors] = useState({});`.
- In the save handler, collect errors into an object keyed by field name instead of showing a single generic alert.
- Render small error text under each affected input when `fieldErrors[fieldName]` is truthy.
- Validate `minimum_version` and `current_version` inline with the same regex.

- [ ] **Step 2: Field-level errors in Products**

In `Products.jsx`:
- Add `const [fieldErrors, setFieldErrors] = useState({});`.
- On save, validate `price`, `original_price`, and `category_id` and store per-field errors.
- Clear field error when the user changes the corresponding input.
- Render error text under each field in the drawer.

- [ ] **Step 3: Verify**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: lint passes and build succeeds.

---

## Task 6: Small UX polish

**Files:**
- Modify: `apps/admin/src/components/SharedUI.jsx`
- Modify: `apps/admin/src/pages/Products.jsx`, `Combos.jsx`, `Orders.jsx`, `Customers.jsx`, `Notifications.jsx`, `Images.jsx`

- [ ] **Step 1: Consistent empty states**

Use `SharedUI.EmptyState` in any page/table that currently renders a plain string or ad-hoc empty div.

- [ ] **Step 2: Disable destructive buttons while loading**

In `Products.jsx` bulk delete confirmation, `Combos.jsx` save/delete actions, and `Customers.jsx` reset actions, ensure `disabled={loading}` is applied to all primary and destructive buttons during async work.

- [ ] **Step 3: Focus management**

In `Settings.jsx` and `Products.jsx`, when a validation error is shown, focus the first invalid input using a ref and `inputRef.current?.focus()`.

- [ ] **Step 4: Verify**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: lint passes and build succeeds.

---

## Final Verification

- [ ] Run full admin build: `cd apps/admin && npm run build`
- [ ] Run admin lint: `cd apps/admin && npm run lint`
- [ ] Check `git status` for any untracked files that should be ignored or committed.
- [ ] Summarize changes to the user.
