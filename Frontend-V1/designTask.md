# Frontend Design Theme Tasks

## 1. Design Goal

The goal is to update only the visual design and theme of the customer-facing mobile app in `Frontend-V1`.

The target style is a clean, modern, premium, mobile-first grocery and food delivery interface inspired by the provided ServeLoco reference images. The design should feel soft, tactile, and light 3D, with raised cards, smooth shadows, dark premium primary actions, semantic status colors, polished icons, and subtle motion.

The reference images are for quality and mood only. The final app must not copy the screenshots exactly. It should keep the current ServeLoco structure and behavior while improving the visual finish.

## 2. Reference Match Checklist

The final theme should clearly feel like the provided screenshots and standalone HTML design system, while still being an original implementation inside the current app.

### Visual Mood To Match

- Light 3D, tactile, soft, premium, and minimal.
- Neumorphic-style surfaces on a pale grey base.
- Dark ink primary actions with a pressed 3D bottom edge.
- White raised cards with soft surrounding shadows.
- Inset input/search fields that look gently pressed into the surface.
- Semantic color accents used sparingly and consistently.
- Smooth, quiet motion rather than flashy animation.

### Reference Palette Targets

Use these as the design targets when updating theme tokens:

- Base background: `#EEF0F3`.
- HTML canvas/background fallback: `#E6E8EC`.
- Ink/dark button: `#0E1116`.
- Ink gradient top: `#2A303D`.
- Success green: `#1FB574`.
- Warning amber: `#F4A62A`.
- Saffron/orange highlight: `#FF7A3A`.
- Info blue: `#3B82F6`.
- Danger red: `#E5484D`.
- White card: `#FFFFFF`.
- Muted text: cool grey, close to `#6B7280`.

Do not force every exact hex everywhere. Use these values as anchors so the app reads visually close to the reference.

### Component Feel To Match

- Primary button: dark vertical gradient feel, white text, strong bottom shadow/edge, rounded but not oversized.
- Confirm button: green 3D button for positive order/payment actions where existing button usage already represents confirmation.
- Offer/highlight button or banner: saffron/orange with warm depth.
- Secondary button: white raised surface with grey text and soft shadow.
- Inputs: soft inset surface, no harsh borders, clear focus state.
- Cards: raised white or near-white, soft shadow, subtle border/highlight.
- Status chips: small uppercase semantic badges similar to the HTML design system.
- Bottom navigation: white floating base with dark active pill, subtle icon movement, no route or tab changes.
- Logo/splash-like brand feel: dark rounded square, soft shadow, bold ServeLoco wordmark where relevant, but do not add a new splash screen unless one already exists.

### Screen Cues To Preserve From References

- Home should feel like the reference home screen: light background, raised search, tactile category cards, strong offer banner, and premium bottom nav.
- Auth should feel like the reference login: big bold welcome type, inset inputs, dark 3D sign-in button, soft page background.
- Cart should feel like the reference cart: raised cart rows, dark quantity steppers, green order action, clean bill details.
- Orders and tracking/order detail should use semantic status colors: blue for accepted, amber for packing, saffron/orange for out for delivery, green for delivered.
- Profile should use raised profile summary cards and clean menu rows.

## 3. Current App Analysis

The current frontend already has a strong base for a controlled redesign:

- Theme tokens are centralized in `src/theme`.
- Shared UI components live in `src/components`.
- Customer screens live in `src/screens/customer`.
- Bottom navigation and stack routing are handled in `src/navigation`.
- Existing animations already exist in screens and animated components.
- The app already uses `lucide-react-native` through `AppIcon`.

The main design improvements should focus on:

- More premium light-grey app background.
- More tactile cards and surfaces.
- Better button depth and press feel.
- More consistent semantic colors for status states.
- Softer but stronger visual hierarchy.
- Better bottom navigation polish.
- More consistent icon sizing and stroke.
- Smoother loading, tap, and page transition animations.
- Mobile readability and text containment.

## 4. Design Rules

### Colors

- Use a soft light grey app background, close to `#EEF0F3`.
- Keep the overall app closer to the standalone HTML background mood than the current warm off-white theme.
- Use white or near-white cards for raised surfaces.
- Use near-black ink, close to `#0E1116`, for primary buttons and active navigation.
- Use dark gradients and lower-edge shadows for primary 3D buttons where React Native supports the effect cleanly.
- Use green only for success, delivery, confirmation, and positive payment states.
- Use saffron/orange for offers, highlights, and promotional cards.
- Use blue for accepted/info states.
- Use amber for packing/warning states.
- Use red only for danger, cancellation, and error states.
- Keep colors semantic and restrained.

### Spacing

- Keep the current app layout and screen structure.
- Refine spacing through theme tokens where possible.
- Keep mobile gutters consistent.
- Avoid crowded cards, buttons, and list rows.
- Do not create horizontal overflow.

### Border Radius

- Use controlled, professional radius values.
- Prefer `8px` to `16px` for cards, containers, inputs, and buttons.
- Use pill radius only for chips, badges, toggles, and active nav elements.
- Avoid oversized rounded cards unless the existing component requires it.

### Shadows And Surfaces

- Use soft raised shadows for cards and headers.
- Use subtle inset-like styling for inputs where possible.
- Use layered shadows to suggest depth: light top edge, darker lower edge, and soft ambient elevation.
- Avoid harsh dark shadows.
- Avoid flat white blocks that blend into the background.
- Keep elevation consistent across cards, modals, bottom bars, and sticky actions.

### Typography

- Keep the current system font stack.
- Use bold headings and compact readable labels.
- Keep line heights comfortable on phone screens.
- Ensure text never overflows buttons, chips, cards, or nav labels.
- Do not change visible copy except where needed for fit or polish.

### Icons

- Keep the lucide icon system.
- Standardize stroke width, size, and color.
- Do not replace icons with unrelated meanings.
- Use semantic colors only where they clarify status or action.

### Animations

- Keep motion subtle, fast, and mobile-friendly.
- Use tap compression for buttons.
- Use small card lift or scale on press.
- Use smooth screen fade/slide transitions.
- Use polished loading shimmer.
- Respect existing reduced-motion utilities where already available.
- Do not add slow, distracting, or behavior-changing animations.

### Mobile Responsiveness

- Design phone-first.
- Preserve the existing app layout.
- Keep category grid behavior intact, including four cards per row where currently intended.
- Check common phone widths around `360px`, `390px`, and `430px`.

## 5. Things That Must Not Change

- Do not change backend logic.
- Do not change API integrations.
- Do not change routing.
- Do not add or remove main features.
- Do not change form validation behavior.
- Do not change button actions.
- Do not change state/store logic.
- Do not change cart, checkout, auth, order, profile, or product flows.
- Do not restructure the app layout.
- Do not alter database or backend files.
- Do not modify `adminManager-V1` for this design work.

## 6. Theme Implementation Plan

1. Start from existing theme tokens in `src/theme`.
2. Update the theme foundation first: colors, shadows, radius, typography, spacing, and motion.
3. Apply the new theme to shared components before screen-specific styles.
4. Update bottom navigation styling after component tokens are stable.
5. Polish customer screens only where shared components do not cover the visual work.
6. Keep changes visual-only and behavior-preserving.
7. Run lint and tests after each task.
8. Stop after each task and wait for approval before continuing.

## 7. Animation Plan

Animations should improve feel without changing user flow:

- Buttons: add quick tap compression and release.
- Cards: add subtle press feedback without changing layout dimensions.
- Bottom navigation: make the active state feel more tactile and premium.
- Screen content: keep existing fade/slide entrance, but refine timing through motion tokens.
- Loading states: improve skeleton shimmer softness and consistency.
- Quantity changes: preserve existing quantity bump behavior and polish it visually.
- Auth screen: keep current entrance and shake behavior, but refine timing and surfaces.

Avoid:

- Long animation delays.
- Continuous decorative motion.
- Animations that hide important content.
- Animations tied to API or business logic.

## 8. Icon Update Plan

Use the existing `AppIcon` component as the main icon control point.

Updates should:

- Keep lucide icons.
- Standardize default stroke width.
- Use active nav color for selected tab icons.
- Use softer inactive icon color.
- Use semantic accent colors only for status contexts.
- Keep icon names and feature meanings unchanged.

Avoid:

- Replacing icons with unrelated symbols.
- Adding new icon libraries.
- Hardcoding icon styles across many screens when `AppIcon` can centralize the change.

## 9. Subtasks

### Task 1: Study Current Frontend Structure

**Goal**

Confirm the current frontend structure before styling work starts.

**Files likely to be changed**

- `Frontend-V1/designTask.md`

**Exact changes to make (Completed Documentation)**

- **Existing Theme Folder (`src/theme/`)**:
  - `colors.js`: Defines primary (amber-orange `#F07C00`), success (teal-green `#1AA362`), and semantic status colors.
  - `borders.js`: Defines radius (sm: 6, md: 8, lg: 12, xl: 16, pill: 100) and border widths.
  - `shadows.js`: Defines platform-specific shadows (xs, sm, md, lg, xl, card, navBar).
  - `motion.js`: Standardizes animation durations (tap: 150ms, small: 200ms, screen: 320ms) and bezier easings.
  - `layout.js`: Centralizes dimensions (padding, input/button heights, tab bar height, list card sizes).
  - `spacing.js`: Employs a 4px base spacing grid with semantic aliases.
  - `typography.js`: Standardizes system font weights, sizes (xs to hero), line heights, and hierarchy.
  - `index.js`: Re-exports all theme tokens for unified importing.
- **Reusable Component Layer (`src/components/`)**:
  - Contains core widgets: `Button`, `IconButton`, `TextButton`, `TextInputField`, `QuantityStepper`, `Chip`, `SegmentedControl`.
  - Base containers: `AppScreen`, `AppHeader`, `EmptyState`, `ErrorState`, `LoadingSkeleton`.
  - Content Cards: `ProductCard`, `CategoryCard`, `OrderCard`.
  - Animations: `PressableScale` (for quick feedback), `AnimatedTabItem`, `AnimatedStickyMiniCart`, `AnimatedCartBadge`, `AnimatedFadeSlide`, `AnimatedModalView`, `AnimatedQuantitySwitcher`.
- **Customer Screen Layer (`src/screens/customer/`)**:
  - Auth: `AuthScreen` (login/signup visual entrance).
  - Main Flow: `HomeScreen` (layout, banners, categories, lists), `CategoriesScreen` (grid), `ProductListScreen` (items), `ProductDetailScreen` (details & specs).
  - Cart & Checkout: `CartScreen` (items & total), `CheckoutScreen` (shipping & payment), `OrderConfirmationScreen` (success visual).
  - Orders: `OrdersScreen` (history), `OrderDetailScreen` (delivery status tracking).
  - Profile: `ProfileScreen` (user choices), `EditProfileScreen` (update details).
- **Current Navigation Layer (`src/navigation/`)**:
  - `RootNavigator.js`: Determines auth vs app navigation routing.
  - `CustomerNavigator.js`: Houses bottom tab navigator (`Home`, `Categories`, `Orders`, `Profile`) and nested detail stacks.
  - `routes.js`: Defines string constants for navigation targets.
- **Redesign Scope Confirmation**:
  - Verified customer-facing only. Only elements within `Frontend-V1/src` (themes, common UI components, customer screens, tab bar navigation) are target zones. No changes are permitted in `Backend-V1` or `adminManager-V1`.

**Things to avoid**

- Do not edit app code.
- Do not change theme tokens.
- Do not change routes, APIs, or components.

**Testing checklist**

- Confirm `Frontend-V1/designTask.md` exists.
- Confirm the file is readable and detailed.
- Confirm no app behavior changed.

### Task 2: Create Design Tokens

**Goal**

Define the new visual foundation for the light 3D premium style.

**Files likely to be changed**

- `Frontend-V1/src/theme/colors.js`
- `Frontend-V1/src/theme/shadows.js`
- `Frontend-V1/src/theme/borders.js`
- `Frontend-V1/src/theme/typography.js`
- `Frontend-V1/src/theme/motion.js`
- `Frontend-V1/src/theme/layout.js`

**Exact changes to make**

- Update app background to a soft light grey.
- Anchor the palette around `#EEF0F3`, `#0E1116`, `#1FB574`, `#F4A62A`, `#FF7A3A`, `#3B82F6`, and `#E5484D`.
- Add or refine near-black ink tokens for primary actions and active navigation.
- Add semantic accent tokens for success, saffron, info, warning, danger, and neutral states.
- Add gradient-ready color pairs for dark, green, and saffron 3D buttons, even if the first implementation uses layered solid colors.
- Refine card, header, nav, modal, inset, and floating shadows.
- Add surface-friendly radius tokens while preserving exported token names.
- Refine motion durations for tap, small transitions, screen transitions, and shimmer.
- Preserve all existing exported token names so imports do not break.

**Things to avoid**

- Do not remove token exports currently used by the app.
- Do not introduce a one-color theme.
- Do not use harsh shadows.
- Do not change backend or API files.

**Testing checklist**

- Run `npm run lint` in `Frontend-V1`.
- Run `npm test -- --runInBand` in `Frontend-V1`.
- Confirm theme imports still resolve.

### Task 3: Update Global Surfaces

**Goal**

Make screens, headers, and base surfaces feel softer and more premium.

**Files likely to be changed**

- `Frontend-V1/src/components/AppScreen/AppScreen.js`
- `Frontend-V1/src/components/AppHeader/AppHeader.js`
- Theme files if small token refinements are needed.

**Exact changes to make**

- Apply the soft app background consistently.
- Refine header surfaces with soft elevation.
- Improve header buttons and action surfaces.
- Make search/input-like global surfaces feel inset where applicable.
- Keep safe-area handling unchanged.
- Keep screen padding behavior unchanged.

**Things to avoid**

- Do not change header actions.
- Do not change back button behavior.
- Do not change safe-area logic.
- Do not restructure screens.

**Testing checklist**

- Open Home, Cart, Orders, Profile, Auth, and Product screens.
- Confirm safe areas look correct.
- Confirm headers still show the same actions.
- Run lint and tests.

### Task 4: Update Bottom Navigation Styling

**Goal**

Give the bottom navigation a floating, tactile, premium mobile feel.

**Files likely to be changed**

- `Frontend-V1/src/navigation/CustomerNavigator.js`
- `Frontend-V1/src/components/AnimatedTabItem/AnimatedTabItem.js` if needed.
- `Frontend-V1/src/theme/shadows.js` if nav shadow needs token support.

**Exact changes to make**

- Make the tab bar feel softly elevated.
- Use a dark active pill state inspired by the reference bottom nav.
- Keep inactive icons subtle and readable.
- Refine active icon animation without changing navigation.
- Keep the same tab names and route targets.

**Things to avoid**

- Do not change tab order.
- Do not rename routes.
- Do not add or remove tabs.
- Do not alter stack navigation.

**Testing checklist**

- Tap Home, Categories, Orders, and Profile.
- Confirm active state updates.
- Confirm icons and labels remain visible.
- Confirm no route breaks.

### Task 5: Update Cards And Containers

**Goal**

Make product, category, order, cart, and profile containers feel raised and polished.

**Files likely to be changed**

- `Frontend-V1/src/components/ProductCard/ProductCard.js`
- `Frontend-V1/src/components/CategoryCard/CategoryCard.js`
- `Frontend-V1/src/components/OrderCard/OrderCard.js`
- Customer screen local styles where cards are defined inline.

**Exact changes to make**

- Apply raised white surfaces.
- Use softer shadows and controlled radius.
- Improve spacing inside cards.
- Improve status chip styling using the reference semantic palette.
- Make category cards feel like small raised tiles on the grey base.
- Make profile/menu/cart/order rows feel tactile without moving their current positions.
- Keep current card dimensions close enough to preserve layout.
- Preserve all press handlers and data rendering.

**Things to avoid**

- Do not change card data mapping.
- Do not change navigation on card press.
- Do not hide product, category, order, or profile information.
- Do not change product availability behavior.

**Testing checklist**

- Check Home category grid.
- Check Product List cards.
- Check Product Detail related items if present.
- Check Cart rows.
- Check Orders list and Order Detail.
- Check Profile sections.
- Run lint and tests.

### Task 6: Update Buttons And Inputs

**Goal**

Make buttons, inputs, chips, and steppers match the premium tactile style.

**Files likely to be changed**

- `Frontend-V1/src/components/Button/Button.js`
- `Frontend-V1/src/components/TextInputField/TextInputField.js`
- `Frontend-V1/src/components/QuantityStepper/QuantityStepper.js`
- `Frontend-V1/src/components/IconButton/IconButton.js`
- `Frontend-V1/src/components/SegmentedControl/SegmentedControl.js`
- `Frontend-V1/src/components/Chip/Chip.js`

**Exact changes to make**

- Make primary buttons dark and tactile.
- Make success/confirm actions green where a matching variant already exists or can be visually mapped without behavior changes.
- Make secondary buttons raised and light.
- Give inputs an inset surface feel.
- Polish quantity stepper buttons.
- Add 3D lower-edge depth to primary, confirm, and offer/highlight button styles.
- Keep disabled and loading states clear.

**Things to avoid**

- Do not change submit handlers.
- Do not change validation.
- Do not change disabled/loading logic.
- Do not change field names or payloads.

**Testing checklist**

- Test Login and Sign Up form visuals.
- Test Checkout form visuals.
- Test Add to Cart.
- Test quantity increment/decrement.
- Test disabled and loading button states.
- Run lint and tests.

### Task 7: Update Icons

**Goal**

Improve icon consistency while keeping all meanings unchanged.

**Files likely to be changed**

- `Frontend-V1/src/components/AppIcon/AppIcon.js`
- Screen or component files only if a specific icon needs styling polish.

**Exact changes to make**

- Standardize stroke width.
- Standardize common icon sizes.
- Improve active and inactive colors.
- Use semantic colors for status contexts only.
- Keep icon styling minimal, line-based, and consistent with the reference.
- Keep icon names stable.

**Things to avoid**

- Do not add a new icon library.
- Do not replace icons with unrelated symbols.
- Do not remove accessibility labels.

**Testing checklist**

- Check cart, search, profile, orders, back, close, add, and remove icons.
- Confirm icons remain recognizable.
- Confirm no missing icon fallback appears unexpectedly.
- Run lint and tests.

### Task 8: Add Smooth Animations

**Goal**

Make the app feel fluid and premium through subtle motion.

**Files likely to be changed**

- Existing animated components in `Frontend-V1/src/components`.
- Selected customer screens that already use `Animated`.
- `Frontend-V1/src/theme/motion.js`.
- `Frontend-V1/src/utils/motionPreferences.js` only if needed.

**Exact changes to make**

- Add button tap scale feedback.
- Add subtle card press feedback.
- Refine page fade/slide timings.
- Refine bottom nav active motion.
- Improve loading shimmer smoothness.
- Keep existing quantity animation behavior and polish timing.

**Things to avoid**

- Do not add slow animations.
- Do not add distracting looping animations.
- Do not change API loading logic.
- Do not delay user actions.

**Testing checklist**

- Tap buttons quickly.
- Tap cards and nav tabs.
- Test add/remove cart quantity.
- Check loading skeletons.
- Confirm no animation causes layout jumps.
- Run lint and tests.

### Task 9: Improve Mobile Responsiveness

**Goal**

Preserve the current layout while improving fit and polish on phone screens.

**Files likely to be changed**

- `Frontend-V1/src/theme/layout.js`
- Customer screen local styles where text or cards need containment.
- Shared components if text wrapping needs global improvement.

**Exact changes to make**

- Confirm no horizontal scroll.
- Keep category cards fitting four per row where intended.
- Ensure labels and buttons do not overflow.
- Ensure product and cart cards remain readable on narrow phones.
- Keep layout structure unchanged.

**Things to avoid**

- Do not redesign page structure.
- Do not add new sections.
- Do not remove existing information.
- Do not change routes or screen hierarchy.

**Testing checklist**

- Check around `360px`, `390px`, and `430px` widths.
- Check Home, Product List, Cart, Checkout, Orders, and Profile.
- Confirm text stays inside cards and buttons.
- Run lint and tests.

### Task 10: Final UI Testing

**Goal**

Verify the completed theme update does not break behavior.

**Files likely to be changed**

- None unless a visual bug is found.

**Exact changes to make**

- Run final checks.
- Inspect key customer flows.
- Fix only theme-related issues discovered during testing.

**Things to avoid**

- Do not fix unrelated backend issues.
- Do not add new features.
- Do not change business logic.

**Testing checklist**

- Run `npm run lint` in `Frontend-V1`.
- Run `npm test -- --runInBand` in `Frontend-V1`.
- Check Home.
- Check Auth.
- Check Product List and Product Detail.
- Check Cart and Checkout.
- Check Orders and Order Detail.
- Check Profile and Edit Profile.
- Check loading, empty, error, disabled, and closed-shop states.

## 10. Visual Acceptance Checklist

Before considering the design work complete, compare the app visually against the reference images and HTML file:

- The app background reads as the same soft grey family as the references.
- Primary buttons feel like dark 3D tactile controls, not flat orange buttons.
- Positive order actions use green, not the generic primary color.
- Offer/highlight areas use saffron/orange with depth.
- Cards look raised and touchable on the grey base.
- Inputs/search fields look soft and inset.
- Bottom navigation has a premium active state similar to the dark reference pill.
- Status chips use the semantic color system from the HTML reference.
- Typography feels bold, compact, modern, and mobile-first.
- The app does not look like an exact copy of the reference screens.
- Existing layout, behavior, APIs, routing, and user flows remain unchanged.

## 11. Implementation Protocol

- First action is this file only.
- Do not begin theme coding until a task is approved.
- Complete only one approved task at a time.
- After finishing one task, stop and ask before continuing.
- Run focused checks after each task.
- Keep all changes customer-frontend-only unless a task explicitly says otherwise.

## 12. Assumptions

- Planning file path is `Frontend-V1/designTask.md`.
- The reference screenshots define the design mood, not an exact UI to copy.
- `Frontend-V1` is the customer-facing mobile app.
- `Backend-V1` must not be changed for this theme update.
- `adminManager-V1` must not be changed for this theme update.
- The existing app layout, routes, APIs, state, forms, and user flows must remain unchanged.
