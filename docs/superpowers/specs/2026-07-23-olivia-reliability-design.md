# Olivia reliability and prompter interaction design

## Scope

This change improves seven existing areas without committing, pushing, deploying, or changing external-share behavior:

1. Make newly created calendar tasks visible to Olivia and prioritize today's, imminent, or preparation-heavy tasks on the admin home.
2. Diagnose and harden admin passkey login across production and preview origins.
3. Prevent duplicate Olivia chat messages.
4. Detect a new hospital name in feature databases except calendar and memo, then offer client registration in Olivia chat and Telegram.
5. Add calendar paste support for `Ctrl+V` and `Cmd+V`.
6. Add fullscreen tablet memo drawing and improve pen responsiveness.
7. Repair prompter controls, stacking, paragraph handling, control layout, and scroll progress.

The existing external-link generator and the prompter project share button, routes, tokens, and public pages remain unchanged.

## Architecture

### Feature-originated Olivia events

Successful writes in supported feature APIs call one shared hospital-detection service. The service normalizes the hospital name, searches existing clients conservatively, and creates one deduplicated proposal only when no client matches. Calendar and memo writes never call this service.

The first adapters cover quotes, conti saves, and prompter projects because they have explicit hospital or project names and are named in the request. Other feature adapters may call the same service only where a reliable hospital-name field already exists; free text is not treated as a hospital name.

Each proposal records its source record, suggested workflow step, and a stable deduplication key. It appears as:

- an Olivia chat work item asking whether to register the hospital;
- an admin-home Olivia insight;
- one Telegram notification.

Approving the work item creates the client through the existing client API/service and creates or focuses a workflow run. A quote source starts at `quote`; a conti source starts at `conti`. Earlier steps are not marked complete or disabled, so backfilled work remains available. A prompter source proposes client creation without pretending earlier commercial work is complete.

### Calendar awareness

Calendar creation emits an Olivia event after the task is saved. The dashboard query returns a prioritized schedule slice rather than only relying on pre-existing workflow insights. Priority is deterministic: overdue incomplete tasks, today's timed tasks, tomorrow's client/shooting tasks, then future tasks containing a location, memo, or reminder. Completed tasks are excluded from proactive prompts.

The admin-home Olivia area refreshes after `olivia-calendar-updated` and `olivia-data-changed` browser events, and also on a modest interval as a cross-device fallback. Duplicate cards use the calendar task ID as their identity.

### Passkeys

Passkeys are RP-domain bound. The current schema does not identify the RP used at registration, while login offers every stored credential for the current RP. The revised design stores `rp_id` and registration origin on each credential and filters authentication options to the current trusted RP.

Request origin resolution uses trusted forwarded host/protocol headers in production and validates the resulting host against the canonical production host, configured alternatives, localhost, and Vercel preview hosts. A credential registered for another RP is not offered; the UI explains that it must be re-registered at `olivia.photoclinic.kr`. Existing rows remain readable, but an unknown-origin legacy key receives the migration/re-registration message instead of a generic authentication failure.

Challenge persistence errors are surfaced rather than silently ignored, and challenge consumption remains one-time with the existing five-minute expiry.

### Chat deduplication

The client retains database message IDs and merges all initial-load, polling, pending, and optimistic messages through one ID-aware function. Locally created messages receive a client request ID that is persisted in metadata, allowing the database response to replace the optimistic row rather than append another copy. Polling continues to use the database timestamp cursor but also deduplicates by ID.

The same ID guard is added to team-chat Realtime insertion because a room-history response can race a Realtime insert. This is defensive and does not change message semantics.

### Calendar paste

The calendar page listens for paste only when focus is not in an editable field and no modal editor is active. It accepts plain text, parses common Korean date/time formats plus tab/newline-separated rows, and opens a populated task form for a single result. Multiple valid rows are shown as a confirmation preview before creation. Unrecognized text is left to the browser and never creates a task silently.

### Tablet memo drawing

The memo canvas gets a fullscreen shell using the Fullscreen API with a fixed-screen fallback. Fullscreen preserves the active pen, canvas bitmap, undo history, and template.

Drawing consumes `getCoalescedEvents()` when available so fast Apple Pencil movement does not leave gaps. Coordinates are sampled into the existing smoothed curve algorithm. Canvas export and React state notification are deferred until stroke completion and scheduled away from the pointer event. Resize preserves the bitmap by scaling through an offscreen canvas rather than restoring same-size `ImageData` into changed dimensions.

### Prompter playback

Playback uses explicit stacking layers: background, guide, scrolling text, top controls, bottom controls, and dialogs. The guide stays visually behind text while controls remain clickable. The scrolling layer cannot cover control hit targets.

Paragraph normalization handles CRLF, whitespace-only lines, and pasted single-line blocks consistently while preserving deliberate blank-line paragraph boundaries. Empty paragraphs are removed and speaker mappings stay aligned.

Speed and paragraph-spacing controls no longer render a changing numeric label before the sliders, preventing width changes between 9 and 10. Controls use stable widths and wrapping rules.

Scroll progress is calculated by one helper and updated from both animation playback and the scroll event, so manual scrolling in standby updates immediately. The progress track width matches the timer badge rather than spanning the viewport.

## Error handling and deduplication

- Feature saves succeed even if Olivia detection or Telegram notification fails; failures are logged for retry.
- Stable source keys prevent repeated client proposals for the same record and hospital.
- Client creation rechecks normalized client names transactionally before insert to avoid approval races.
- Calendar paste never submits ambiguous content automatically.
- Passkey responses provide a safe user-facing reason while retaining server detail in logs.
- Pointer cancellation finalizes or safely discards the active stroke without leaving capture stuck.

## Verification

- Run TypeScript checking, focused unit tests, and the production build locally.
- Verify calendar creation refreshes the admin-home Olivia panel and filters non-priority future items.
- Verify duplicate polling and Realtime deliveries collapse to one message by database ID.
- Verify quote, conti, and prompter new-hospital proposals, approval, workflow starting step, and deduplication with mocked notification delivery.
- Verify passkey option filtering for production, preview, and legacy credentials; a real biometric ceremony remains a manual browser/device check.
- Verify single and multi-row calendar paste without intercepting paste inside form fields.
- Use a real browser to test memo fullscreen, fast pointer strokes, prompter buttons, guide stacking, manual-scroll progress, and stable control wrapping at desktop and tablet sizes.

## Explicit non-goals

- No changes to external share links.
- No removal or redesign of prompter project sharing.
- No automatic client creation without user approval.
- No calendar- or memo-originated new-hospital detection.
- No Git commit, Git push, or Vercel deployment.
