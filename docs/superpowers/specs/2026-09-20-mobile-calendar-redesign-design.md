# Olivia Mobile Calendar Redesign

Date: 2026-09-20

## Scope

Redesign only the Olivia mobile calendar for the iPhone PWA experience. The desktop calendar, calendar API contract, persistence model, Hermes path, and photo pipeline remain unchanged.

The same change set also adds non-destructive close controls to photo-status cards, zoom and close controls to the mobile document preview, and a mobile new-conversation action.

## Calendar architecture

`MobileCalendar` remains the mobile coordinator and owns fetching, refresh events, selected date, active view, and event-screen state. Focused child components handle:

- the shared weekly date strip;
- the compact month grid and selected-day agenda;
- the today/week time-axis layout;
- full-screen event detail and edit modes.

This keeps the mobile implementation independent from the desktop calendar and avoids coupling either surface to the other's layout.

## Navigation and interaction

- Calendar opens on the month tab.
- The top weekly strip is available above calendar content, marks today/selection, shows event dots, and consumes its own horizontal gesture so it cannot trigger the shell tab swipe.
- Selecting an event changes the mobile calendar into a full-screen detail view.
- Detail mode has a back action labeled with the selected date and an edit action.
- Edit mode uses one full-width row per field and a bottom-fixed save action.
- Creating a new event opens edit mode directly.
- Deleting an event uses the existing trash-backed `DELETE /api/calendar` endpoint.

## Event field mapping

- All-day is represented by `time = null` and `end_time = null`; no schema change is required.
- Start/end date and time controls use native date/time inputs so iOS supplies its picker.
- The current API has one event date and an optional end time, so cross-day events are not introduced.
- Alerts reuse `reminder_enabled` and `reminder_minutes_before`.
- Recurrence is not present in the current API/schema. The mobile form displays `반복 · 안 함` without writing unsupported data.
- Title, location, memo, category, date, time, and end time continue using the existing API fields.

## Calendar views

### Today and week

Use a vertical 24-hour time axis. Timed events are positioned by start minutes and sized by their start/end duration. Events without a start time appear in a compact all-day lane. On entry, scroll to the first event or the current-time region.

### Month

Keep a compact six-week grid and a bounded selected-date agenda in one viewport on iPhone 15 Pro. When the selected date has more entries than fit, only the agenda area scrolls; the month grid stays stable.

## Additional mobile and notification changes

- Desktop photo failure/retry cards receive an X control.
- Mobile JPG merge/status cards receive the same X control.
- X dismissal is session-local UI state and does not defer, retry, or mutate the server project status.
- Mobile document preview receives a floating close button and explicit zoom-out/zoom-in controls. Zoom is local UI state and does not modify the document.
- Mobile chat receives a floating `새 대화` action using the existing conversation-store endpoint, while retaining the current close-to-home action.

## Error handling and accessibility

- Each async save/delete/new-conversation action exposes a visible error and prevents duplicate submission.
- Icon-only controls include Korean accessible labels.
- Fixed controls account for top and bottom safe-area insets.
- Calendar refresh events continue to re-fetch data without changing the current selected date or screen mode unnecessarily.

## Verification

- Add focused tests for date/week helpers, timeline positioning, month default behavior, all-day payload mapping, and local notification dismissal where practical.
- Run `npx tsc --noEmit`, `npm test`, and `npm run build`.
- Perform responsive browser verification at iPhone 15 Pro dimensions. Final standalone-PWA safe-area and native-picker validation must also be checked on the physical iPhone because desktop browser emulation cannot exactly reproduce iOS `visualViewport` and standalone behavior.
