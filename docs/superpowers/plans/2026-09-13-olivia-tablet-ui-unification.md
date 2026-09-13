# Olivia Tablet UI Unification V2 Implementation Plan

1. Extend Tablet navigation with the Conti app and selected Conti context while preserving browser history.
2. Add a shared Tablet app frame that provides the Photo Workspace visual hierarchy without duplicating feature logic.
3. Recompose every Tablet app through the shared frame and connect Conti directly to the canonical Conti V2 workspace.
4. Make Tablet Home a fixed-height dashboard with no internal page scroll and route all Conti entry points through Tablet navigation.
5. Apply the deep-green Tablet header and simplify Dock active styling to an orange dot only.
6. Compact the 13-app Dock so landscape and portrait fit without horizontal scrolling.
7. Add navigation, Conti, and structural regression tests.
8. Verify with TypeScript, targeted ESLint, full Vitest, production build, and Playwright at 1366×1024 and 1024×1366.
