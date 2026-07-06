# Admin Dashboard Redesign — Design Spec

## Goal
Redesign the `apps/admin/src/pages/Dashboard.jsx` page so it looks modern, bold, high-contrast, and premium — especially strong in dark mode. **No workflow or data logic changes.**

## Scope
- Affected files:
  - `apps/admin/src/pages/Dashboard.jsx`
  - `apps/admin/src/pages/Dashboard.css`
- No backend, route, API, or behavior changes.
- No new npm dependencies. Icons will be inline SVGs.

## User Choices
- Overall vibe: **Bold & high-contrast** (Option C)
- Icons: **Solid SVG icons** (Option B)
- Metric cards: **Flat & clean** (Option A)
- Approach: **Dark-Mode Premium Command Center** (Option 2)

## Design Details

### Header / Shop Status
- Title block kept: "Overview" + full date subtitle.
- Shop-status toggle moved into header, unified into a single prominent pill.
- Closed state: muted red surface, white/dark text, red dot.
- Open state: vivid green surface with soft green glow, white/dark text.
- Disabled/loading state: reduced opacity, no hover transform.

### Metric Cards (4-up grid)
- Flat elevated surfaces: `var(--surface-color)` background, thin `var(--border-color)` border, stronger `var(--shadow-sm)`.
- Left accent line matching category color:
  - Sales: green
  - Orders: blue
  - Pending: amber
  - Payments: red
- Solid icon inside a subtle colored circular chip on the left side.
- Hero metric value: `2.25rem` extra-bold, `var(--text-primary)`.
- Label: tiny uppercase, muted.
- Hover: translateY(-3px) + stronger shadow; icon chip scales slightly.
- Icons:
  - Sales: `TrendingUp`
  - Orders: `ShoppingBag`
  - Pending: `Clock`
  - Payments: `CreditCard`

### Latest Orders Section
- Card-style table with stronger header bar.
- Header icon: solid `ClipboardList` (no emoji).
- Table: cleaner whitespace, heavier row hover, refined zebra striping.
- Status badges: solid rounded-full pills with category-matched backgrounds.
- "View All" link kept.

### Sidebar Widgets (right column)
- **Top Items**
  - Header icon: solid `Trophy`.
  - Medal rank badges: gold / silver / bronze using high-contrast tokens.
  - Product name with combo tag kept.
  - Sales value aligned right, bold primary color.
- **Out of Stock**
  - Header icon: solid `AlertCircle`.
  - Alert card: strong red left border, subtle red surface tint, no full red panel.
  - Alert list items in danger-soft cards.

### Global Polish
- Consistent section spacing: **1.5rem** gap between major blocks.
- Deeper, more cohesive shadows and borders.
- Entrance animation preserved (`fadeIn` on dashboard-container).
- Remove all emoji usage from the dashboard.
- Replace hardcoded colors with existing CSS variables where possible; add new local variables only if a clear gap exists.

## Responsive
- Desktop: 4-column metrics, 3fr/2fr main/sidebar split.
- Tablet (≤1100px): 2-column metrics, sidebar stacks below main content.
- Mobile (≤768px): header stacks vertically, metrics 2×2, compact cards.
- Small mobile (≤480px): tighter spacing, smaller typography.

## Assets
- No external images or icon libraries.
- All icons implemented as inline SVGs inside the JSX, sized 20–24px.

## Accessibility
- All interactive elements keep visible focus rings.
- Icon-only elements carry `aria-hidden` or contextual text already present.
- Shop toggle keeps explicit `aria-label`.
- Color alone does not convey meaning; badges include text labels.

## Anti-Patterns Avoided
- Emojis as structural icons.
- Hardcoded colors without variable fallback.
- Decorative-only gradients on metric cards.
- Layout shifts on hover.

## Success Criteria
1. Dashboard renders without errors in both light and dark modes.
2. All existing data fields display identically.
3. No workflow behavior changed (shop toggle, refresh, realtime updates).
4. Visual design feels bold, aligned, and premium in dark mode.
