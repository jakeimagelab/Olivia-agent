# Olivia UI and workflow polish design

## Goal

Apply the nine approved home, detail-navigation, calendar, quote-saving, and workflow-generation changes without replacing the existing admin visual system or workflow engine.

## UI decisions

- The admin header brand is the Photo Clinic PNG logo followed by `포토클리닉 올리비아` on the home route. Other routes keep their page-specific title.
- The quote widget keeps the schedule-card visual language and uses author-specific pixel portraits with recognizable visual traits rather than a generic deterministic face.
- The mobile admin menu becomes a deep-green bottom-left floating control. The existing blue sticky control is removed.
- Memo `PageHeader` is the canonical detail-page structure: logo/title in the header, actions in a separate row, and section tabs below. Active section tabs use text and underline/border emphasis, never an orange filled button.
- The tools home remains a four-column mobile grid but uses smaller labels and denser spacing.
- Workflow progress is wrapped in one rounded, bordered card containing its title, stage columns, and project cards.

## Calendar collision layout

Timed events are converted to minute ranges. Events that overlap transitively form a collision group. A greedy interval-column allocator assigns each event a column. Its left offset and width are derived from the number of columns used by that group, with a small internal gap. The same allocator is shared by week and day views. Non-overlapping events retain full width.

## Quote persistence

Quote saving becomes awaitable and reports success only after the API confirms persistence. The API validates the payload, writes the current schema, and falls back to the legacy column subset when an additive column is missing. The UI no longer inserts a failed save into the recent-quote list as if it succeeded.

## Workflow data context

The existing automation engine remains responsible for task creation and execution. Before task creation/execution, a workflow context adapter reads registered client, project, consultation memo, quote, contract, and relevant workflow metadata. Available records are added to `agent_tasks.input_data`; missing optional tables do not fail the workflow. Draft builders prefer registered DB values and retain conservative fallbacks only when no registered value exists.

## Compatibility and verification

- No workflow step keys or existing API response fields are removed.
- Existing mock/fallback behavior remains available for incomplete projects.
- Calendar drag and resize behavior remains intact.
- Verify focused unit tests, TypeScript, production build, and representative desktop/mobile routes.
