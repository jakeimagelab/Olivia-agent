# Olivia Tablet Scroll Ownership Design

## Goal

Keep the Tablet Top Bar and Dock fixed while restoring touch and wheel scrolling in Conti, Quote/Contract, and Review Content without introducing double scroll in apps that already own their viewport.

## Scroll ownership

- The Tablet shell remains fixed and clips content outside the app viewport.
- Conti uses the Tablet app frame as its single vertical page scroller because its canonical workspace grows with its content.
- Quote/Contract keeps the segment tabs fixed and makes the segment content below them the single vertical scroller.
- Review Content keeps its three-column contained editor. On Tablet, the workspace height is measured from its actual parent container rather than from the browser viewport, so its existing left/right panel scrollers receive the correct available height.
- Calendar, Clients, Documents, Chat, Memo, route wrappers, Home, and Photo Remote retain their current scroll behavior.

## Touch behavior

All new scroll owners use momentum scrolling on iPad, contain overscroll, and retain `min-height: 0` through the flex/grid chain. The implementation does not use `transform: scale()` or change Desktop/Mobile behavior.

## Verification

- At 1366×1024 Tablet Preview, Conti can reach its last section.
- Quote and Contract can reach their final actions while the segment selector remains visible.
- Review Content receives the app viewport height and its internal panels scroll to their final controls.
- Calendar and Olivia Chat do not gain a second page scrollbar.
- Desktop and Mobile surface tests, TypeScript, lint, full unit tests, and production build continue to pass.
