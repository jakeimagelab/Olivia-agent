# Review Studio AI Background Modal Visibility Design

## Problem

The AI background modal is rendered through a portal outside the Review Studio
`.workspace` element. Review Studio theme variables such as `--green`, `--mint`,
and `--line` are scoped to `.workspace`, so they do not cascade into the modal.
The primary generate button consequently keeps its white text while its variable-
based background and border declarations become invalid, making the action appear
almost invisible. The texture checkboxes also fall back to the browser's blue
native accent, which does not match Olivia's visual language.

## Scope

This change is intentionally limited to the AI background modal. It does not
change the shared Modal component, the AI generation request, stored assets, or
other Review Studio controls.

## Design

- Establish the Review Studio color tokens at the AI form root so all controls in
  the portaled subtree receive the intended theme values.
- Keep the existing action label and behavior, but render the `3개 생성` button
  with a clearly visible deep-green background, white text, and an accessible
  focus ring.
- Style texture checkboxes as compact Olivia controls: deep-green selected state,
  white check mark, neutral green-gray border when unselected, soft-mint hover and
  focus treatment, and a clickable label area.
- Preserve disabled and generating states. A disabled generate button remains
  legible while visibly inactive; checkbox focus remains keyboard-accessible.
- Preserve the current modal structure, option values, generated-result gallery,
  and apply-background behavior.

## Error and State Handling

No data-flow changes are required. Existing `busy === "ai-background"` handling,
notifications, API errors, and generated-asset rendering remain the source of
truth. The visual fix must not make enabled and disabled states indistinguishable.

## Verification

- Open the AI background modal and confirm the generate action is immediately
  readable on desktop and narrow viewports.
- Confirm unchecked, checked, hover, focus-visible, disabled, and generating
  states use Olivia's deep green, soft mint, and neutral border colors.
- Confirm selecting texture options still updates the generation payload.
- Run type checking and the relevant Review Studio test suite.
- Inspect the production-like modal visually after the code change.
