# Desktop client detail, status center, and chat polish design

Date: 2026-09-24

## Goal

Fix the desktop customer project's inert detail action, consolidate desktop work notifications into the existing top-bar status control, and improve chat readability without changing the underlying customer, photo pipeline, worker, or chat data flows.

## 1. Native customer detail transition

The embedded customer workspace currently links to `/clients?id=...`. The Olivia root route redirects that URL back into the already-mounted desktop OS, while the desktop only consumes its initial launch once. The result is a route flash with no visible detail transition.

`ClientWorkspaceView` will own an in-window detail selection. `InlineClientProjectPanel` will call an `onOpenDetail` callback for both “프로젝트 상세 보기” and “전체 활동 보기”. The workspace will render the existing `DetailView` for that customer and workflow run, and `DetailView.onBack` will restore the two-column customer workspace. Standalone `/clients?id=...` behavior remains unchanged.

This reuses the existing eight-tab detail UI and APIs. It does not add a second customer detail implementation or navigate through the legacy route.

## 2. Desktop status center

The existing server icon and `StatusPanelButton` become the single desktop status center. The panel will contain:

- Mac Studio and NAS health plus recent server jobs, as today.
- Photo project approval/progress/error cards from `PhotoProjectNotificationProvider`.
- NAS backup-ready cards from the existing worker-event endpoint.
- Client-side background jobs from `useBackgroundJobsStore`.

The existing actions (approve, defer, retry, classification parameters, dismiss, cancel, and return-to-work) remain unchanged. Components receive a `panel` presentation variant so only positioning and density change. On desktop the old fixed cards are not mounted; mobile and tablet retain their existing floating notification behavior.

The top-bar server icon shows an attention dot when connectivity is unhealthy or actionable/running work exists. The panel is scrollable and remains the only desktop location for these status cards.

## 3. Chat presentation

All Olivia conversation variants use a light mint conversation canvas. Assistant messages use a white bubble with dark gray text. User messages use the Olivia orange background with white text. Explicit nested `::selection` colors make dragged text visible in both bubble types, overriding the global selection rule safely within chat only.

Message rendering, streaming, actions, attachments, and the composer are unchanged.

## 4. Verification

- Embedded desktop customer workspace opens the existing detail view without route navigation and returns to the same customer list.
- Status cards no longer float at different desktop corners; their original actions still work inside the top-bar panel.
- Mobile and tablet notification behavior is unchanged.
- User and assistant messages have the requested colors, and selected text is visibly highlighted.
- Typecheck, focused tests, full tests, and production build pass.

