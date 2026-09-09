# Olivia Desktop responsive Dock design

## Scope

Only the Olivia Desktop Dock is changed. The full-width appearance remains at the current 48px icon size.

## Responsive behavior

- Observe the width currently available to the Dock with `ResizeObserver`.
- Keep 48px icons while the complete Dock fits within 90% of that width.
- Step down to 40px, then 34px only when the preceding size no longer fits.
- If the complete Dock cannot fit at 34px, keep 34px icons and enable horizontal scrolling.
- Preserve a 6px item gap, 10px horizontal padding, dividers, and 4px running indicators at every size.
- Hide the horizontal scrollbar without disabling keyboard, wheel, or touch scrolling.

## Implementation boundary

`DesktopDock` owns size selection because its item count includes dynamically running apps. A small pure layout function calculates the chosen size and is unit-tested independently. CSS custom properties keep the button and icon geometry synchronized so the outer button cannot become narrower than its icon.

## Verification

- Unit-test all four layout outcomes and dynamic item counts.
- Run TypeScript checking and focused Olivia OS tests.
- Verify the rendered Dock at wide, compact, and scrolling viewport widths.
