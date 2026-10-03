# Existing Olivia Chat Compact Mode

## Goal

The desktop quick-chat action must not render a second chat interface. It collapses the existing `olivia-chat` app window so that only its existing composer remains visible.

## Behavior

- The top-bar chat action and `Cmd/Ctrl + /` toggle the existing chat window between full and compact presentation.
- Compact presentation keeps the same `OliviaConversation` portal, conversation store, draft, attachments, send path, and tool execution path.
- The full window bounds remain unchanged in the desktop window store. Compact mode only overrides the rendered bounds, so expanding restores the exact previous window layout.
- Compact mode is positioned above the desktop Dock at the right edge and shows only the existing composer.
- Sending a message expands the same chat window so the response is visible.
- Clicking the Olivia Dock icon expands and focuses the same chat window.
- The former standalone `OliviaMiniChat` component and its styles are removed.

## State ownership

Desktop-only compact presentation state stays in `useOliviaDesktopUtilityStore`. Conversation data remains exclusively in `useOliviaConversationStore`; no second message or draft store is introduced.

## Verification

- Confirm compact/full toggling uses one `olivia-chat` window.
- Confirm the compact composer updates the shared draft and sends through the existing conversation component.
- Confirm send auto-expands, Dock click expands, and no standalone mini-chat element is mounted.
- Run focused desktop tests, TypeScript checks, lint on changed files, and the production build.
