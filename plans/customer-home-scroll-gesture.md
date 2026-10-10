# Customer Home scrolling: gesture lifecycle

## Scope and baseline

Customer Home uses a progressive vertical Animated.ScrollView with horizontal
product rails, a native animated header and decorative loops. Admin Home uses
a simpler FlatList. Finished network loading does not eliminate native drawing
work. These structural differences suggest performance costs; this task has
not established their relative cost with a device profile.

The workspace already contained uncommitted customer Home optimizations before
this task: homeScrollMotion registration, animation pause/resume, Android
clipping and hardware textures. Preserve those edits. Do not include unrelated
admin/API changes or publish an OTA.

## Plan

1. Inspect the existing animation controller and scroll event handlers.
2. Fix the concrete lifecycle gap: an idle timer must not restart decorative
   animations while the user is still holding a slow vertical drag.
3. Keep momentum quiet, retain the missing-momentum-end fallback and release
   held state during the existing navigation cleanup.
4. Exercise long held drags, delayed momentum, new rows and animation cleanup
   in unit tests; run the mobile suite and scoped lint.
5. Check customer Home on the connected phone when it is in customer mode.

## Implementation

- Added beginDrag/endDrag to the existing controller. Scroll event gaps during
  a held drag no longer schedule animation restarts.
- Drag end and momentum events share the existing 180 ms idle window. A
  momentum-end event no longer immediately resets every decorative loop.
- finish clears held state, retaining the existing Home focus cleanup.
- No React state updates, product remounts, fetches, order changes or design
  changes added by this gesture fix.

## Validation

- Targeted gesture/rail/mode tests: 3 suites, 36 tests passed.
- Scoped ESLint: 0 errors, 5 existing Home unused-variable warnings.
- Full mobile suite: 92 suites, 701 tests passed, exit 0 (existing Jest
  open-handle warning).
- Android Expo export passed to /tmp/serveloco-customer-scroll-export.
- Read-only review of the targeted lifecycle fix: no actionable findings.
- Phone was still in admin mode at initial inspection; customer Home device
  validation requested from the user. No quantitative smoothness claim yet.
- Changes remain local, alongside pre-existing uncommitted customer work.
