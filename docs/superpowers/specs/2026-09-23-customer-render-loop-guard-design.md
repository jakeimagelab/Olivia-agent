# Customer window render-loop guard

## Problem

The customer window continuously alternated between the window's initial customer and the customer's local selection. Each alternation updated the shared Olivia context, remounted the window content, and fetched both customer detail endpoints again. Production eventually raised React error #185 and the window error boundary retried as its reset key changed, multiplying console errors.

## Design

1. Treat `initialClientId` as an initialization or external-navigation input, not as a value that overrides every local customer selection render.
2. Make shared Olivia context setters and desktop window-context writes idempotent. Equal values must not increment revisions or publish new Zustand state.
3. Keep customer-owned client/project fields authoritative, including explicit project clearing, rather than restoring stale window values through nullish fallback.
4. Track error fingerprints per mounted app window. After the same fingerprint is caught three times, keep the error view fixed and remove retry/reset behavior for that window instance.
5. Give persisted chat messages and parsed Markdown blocks collision-safe React keys so a normal rerender does not amplify unrelated console warnings.

## Verification

- Unit coverage for customer selection precedence, three-strike error locking, idempotent context updates, and duplicate persisted message IDs.
- Browser verification opens the customer window, switches across three customers, then waits twice. Customer requests and console counts must remain stable after the intended transitions.
- Full typecheck, test suite, and production build must pass.
