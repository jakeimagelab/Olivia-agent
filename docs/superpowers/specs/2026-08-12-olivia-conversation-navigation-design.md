# Olivia Conversation Navigation Design

## Scope

This change improves Olivia conversation continuity and navigation without changing the AI engine, tool execution, workspace internals, or database schema.

## Layout

- Desktop home chat uses a three-column conversation shell.
- A 176px left rail groups conversation anchors by date and shows time plus a short user-message title.
- The existing Olivia conversation remains in the center and keeps the same Zustand store.
- A 36px right rail renders a vertical message guide. Each tick represents one user-led exchange; the currently visible exchange is highlighted.
- Workspace and drawer variants collapse the left rail and keep a narrow right guide.

## Interaction

- Clicking a left navigation item scrolls to the corresponding user message.
- Clicking or touching a right guide tick opens a popover containing timestamp, user request, and a short response preview.
- The popover provides a button to scroll to that exchange.
- The active tick follows the message currently closest to the upper-middle region of the scroll container.

## Conversation Continuity

- The active conversation continues across home, workspace, drawer, and page navigation.
- Messages are mirrored to a versioned local cache so a transient API or hydration failure does not visually reset today's conversation.
- Server data remains authoritative when it contains a newer or longer copy of the active conversation.
- Only the explicit New Conversation action clears the current runtime and cached message list.
- Date grouping is derived from message timestamps; no database migration is required.

## Sidebar and Home Height

- Desktop sidebar menu text remains visible at compact desktop widths; mobile drawer behavior is unchanged.
- The idle home context section becomes shorter so the chat receives more vertical space.
- Conversation dock and workspace behavior remain unchanged.

## Performance

- Navigation metadata is derived with memoization.
- Message DOM nodes expose stable IDs and refs instead of duplicating message content.
- Scroll tracking uses requestAnimationFrame and passive scroll listeners.
- The guide subscribes only to the message list and its local active state.

## Validation

- Verify sidebar text at compact and wide desktop widths.
- Verify today's messages survive component remount, page navigation, and hydration failure.
- Verify date-group navigation and right-guide scrolling with a long conversation.
- Verify home chat height is larger while quick actions, recent projects, and calendar remain accessible.
- Run unit tests, typecheck, build, and browser checks at desktop and mobile widths.
