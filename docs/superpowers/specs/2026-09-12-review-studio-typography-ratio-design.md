# Review Studio Typography, Canvas Ratio, and Template Preview Design

Date: 2026-09-12

## Scope

Extend the existing Review Content Studio without redesigning its overall UI. The work is limited to typography controls, natural text wrapping, page aspect ratios, and meaningful template previews. Editor, PNG, and PDF must continue to share `ReviewCanvasRenderer` as their visual source of truth.

## Typography controls

- Keep the current context toolbar and its visual language.
- Add only fonts that are already available to the application; do not add a new remote font dependency.
- Replace the cramped font-size, line-height, and letter-spacing number fields with compact horizontal range controls that also expose the current numeric value.
- Keep keyboard-accessible number entry and appropriate min/max/step constraints.

## Natural wrapping

Add an optional `autoWrap` property to text elements. Missing values are treated as enabled so existing saved documents gain the improved behavior without migration.

When enabled, text preserves author-entered newlines and uses Korean-friendly wrapping: words are kept together where possible, punctuation follows strict line-breaking rules, exceptionally long unbroken content can still wrap, and the browser's pretty wrapping is requested to reduce orphaned final words.

When disabled, author-entered newlines remain, but the renderer does not insert additional line breaks. Overflow continues to be clipped by the explicit text-layer bounds.

The wrapping state is rendered in `ReviewCanvasRenderer`, so Editor, PNG, PDF, and thumbnails remain identical. The existing toolbar receives a single compact checkbox/toggle; no surrounding UI redesign is included.

## Canvas ratios

Supported ratios are:

- 4:5 Instagram: 1080 × 1350
- 3:4: 1080 × 1440
- 2:3: 1080 × 1620
- 1:1: 1080 × 1080

The page document stores its actual width and height. Width stays at 1080 and height changes with the selected ratio. Ratio selection is added to the existing toolbar.

Changing ratio preserves element sizes and horizontal positions. Full-bleed layers resize to the new canvas height. Other layers are repositioned using top, center, or bottom anchoring so bottom metadata stays attached to the bottom edge and text is not stretched. All coordinates are clamped to the canvas. The change is recorded in the existing undo history.

PNG uses the selected document dimensions. High-resolution PNG doubles both dimensions. PDF pages use the same captured image and selected ratio; no separate reflow is introduced.

## Template previews

The first five template choices must never fall back to a generic layout icon when their template configuration can be rendered. For templates without uploaded thumbnails or stored editor documents, construct a preview document from the existing template configuration and current sample/source data, then render it with `ReviewTemplateThumbnail` and the shared canvas renderer.

This preview is display-only. Selecting a template continues to use the current template-switching behavior and preserves review source data.

## Compatibility and failure handling

- Existing version-1 documents remain readable; optional `autoWrap` defaults to enabled.
- Existing 1080 × 1350 documents remain 4:5 unless the user changes the ratio.
- Invalid stored dimensions fall back to the current 4:5 dimensions.
- Unsupported or unavailable font values fall back to the current application sans-serif stack.
- Ratio changes do not mutate other pages in the content set.

## Verification

- Unit tests cover wrap style on/off and backwards compatibility.
- Unit tests cover all four canvas dimensions and ratio conversion anchoring.
- Renderer tests confirm selected dimensions and wrapping attributes are present in shared markup.
- Existing typecheck, unit test, and production build must pass.
- Playwright visually verifies the text toolbar, wrapping toggle, each ratio, and five distinct template previews at a desktop viewport.

