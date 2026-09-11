# OLIVIA MOBILE OS Implementation Plan

## Goal

Implement the approved adaptive mobile command-and-control experience while preserving the existing desktop workstation and sharing all canonical data, conversation, agent, and resource identifiers.

## Task 1. Adaptive product entry

- Add a tested mobile-surface predicate and client media-query hook.
- Add `OliviaAdaptiveRoot` after authentication.
- Dynamically load exactly one of `OliviaMobileShell` or `OliviaDesktop`.
- Keep `OliviaWorkspaceShell` as the owner of the single persistent conversation.

Verification: mobile widths never mount desktop DOM; 1440px mounts existing desktop DOM.

## Task 2. Mobile navigation and shell

- Add a five-tab mobile shell and browser-history controller.
- Support contextual preview routes with resource type and ID.
- Add mobile header, bottom navigation, safe areas, `100dvh`, and keyboard viewport handling.
- Add consistent loading, empty, error, and retry states.

Verification: tab labels, back flow, 44px targets, and no hover-only interaction.

## Task 3. Canonical mobile data layer

- Add typed client adapters for calendar, memo, quotes/contracts, and document search.
- Normalize document/resource cards without copying resources.
- Resolve current work from active session context first and recent non-final DB resources second.
- Refresh on tool completion, focus/visibility, and controlled polling.

Verification: IDs and source rows match existing desktop APIs.

## Task 4. Home, calendar, memo, and documents

- Build Mobile Home with greeting, today card, current-work card, six exact quick-menu labels, and command card.
- Build simplified calendar today/week/month views plus compact create/edit sheet.
- Build memo list/search/create/edit using the existing memo endpoint.
- Build document segments, quote/contract filters, and document-library category filters.

Verification: empty/error states and canonical create/update behavior.

## Task 5. Mobile Olivia conversation

- Add a mobile conversation variant and mobile dock target.
- Keep shared conversation hydration, streaming, approvals, retries, and suggestions.
- Add the existing attachment upload-session flow to the shared composer.
- Make resource cards actionable through a supplied resource-open handler.
- Ensure all mobile-facing chat labels use `올리비아 채팅`.

Verification: persisted desktop/Telegram messages appear, attachments send, and forbidden labels do not render.

## Task 6. Canonical resource preview

- Add quote and contract mobile renderers that load records by ID.
- Add generic document fallback.
- Add share, download, and edit-request actions.
- Reuse seven-day temporary-document sharing and existing PDF code where possible.
- Set current-document context before moving to chat so short follow-ups update the same resource.

Verification: resource ID is unchanged through preview/edit-request/chat and data read-back updates.

## Task 7. Automated and browser verification

- Add unit tests for surface selection, route state, resource normalization, and context handoff.
- Run focused tests, full tests, typecheck, lint, and production build.
- Use Playwright at 375×812, 390×844, 393×852, 430×932, and 1440px desktop.
- Exercise Home, all five tabs, document segments, preview, chat, keyboard-safe composer, and desktop regression.
- Scan mobile source and rendered UI for forbidden labels.

## Task 8. Delivery

- Review the final diff for unrelated files.
- Commit only the implementation, tests, and plan.
- Push `main` and verify the production deployment and custom domain.
- Report components, modified files, branch point, navigation, shared services, E2E results, and naming acceptance.
