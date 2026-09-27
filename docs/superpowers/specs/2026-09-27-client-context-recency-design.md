# Client context recency and list-entry safety

## Problem

Opening `/clients` without a `clientId` currently selects the first loaded client and writes it into the Olivia chat context. This turns a list-only navigation into an unintended target selection and can override the customer discussed in the conversation.

## Scope

1. A customer list with no explicit customer remains unselected. Only an explicit URL target or a row selection writes a screen target.
2. The client context snapshot carries the time and source of the active customer selection.
3. Server-side target resolution compares an explicit message target first, then the most recently selected screen or conversation target. A legacy snapshot without a selection time stays screen-first.
4. Different screen and conversation targets selected within one minute are ambiguous: execution asks which target is intended instead of choosing either.
5. The chat banner shows the target source and provides a target-clear control.

## Data flow

`setClient()` records a screen selection time by default. `setContextLink()` records a server-resolved conversation or explicit target when the active customer changes. `getOliviaContextSnapshot()` sends both fields with the chat request.

Conversation history already includes `created_at`. The most recent message metadata that identifies a client or resource becomes the recent conversation candidate and uses that message time. `resolveTrustedClientProjectContext()` returns the chosen link plus source/ambiguity metadata. Stream and Hermes consumers use the same decision before a tool can run.

## Safety rules

- Explicit customer names always win.
- A missing `activeClientSelectedAt` preserves existing screen-first behavior.
- An ambiguous conflict never executes against either customer.
- Clearing the banner target clears customer/project/document selection without changing customer data.

## Verification

- Add the ten requested client-target priority, ambiguity, and regression tests.
- Update customer-workspace selection tests so a list-only entry remains unselected.
- Add banner/source and clear-control tests where practical.
- Run typecheck, the full test suite, and production build.
