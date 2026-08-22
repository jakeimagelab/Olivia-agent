# Olivia Home Chat Border Motion Enhancement

## Goal

Make the home chat surface visibly feel awake and responsive. The current rotating one-pixel gradient is too uniform and faint, so users perceive it as a static border. The revised effect must make the direction and position of motion legible without turning the chat into neon, RGB lighting, or a loading spinner.

## Scope

- Change only the home chat border and its ambient glow.
- Preserve the chat DOM, dimensions, radius, messages, composer, controls, state management, scrolling, attachments, voice, and responsive layout.
- Reuse only Olivia's official deep green (`#155855`) and orange (`#E85D2C`).
- Leave the All Tools card treatment unchanged.

## Visual System

The border uses three coordinated CSS-only layers:

1. **Base rail** — a quiet, complete one-pixel green/orange border so the chat remains defined at every animation frame.
2. **Moving light heads** — two compact highlights placed on opposite sections of a conic gradient. Their high-contrast positions make clockwise motion immediately visible.
3. **Trailing ambient glow** — a wider, lower-opacity duplicate behind the card. The glow rotates in phase with the light heads so it appears attached to them rather than pulsing over the entire card.

The moving highlights have soft tapered tails. Literal arrows are not rendered; direction is communicated by the moving heads and tails. The content surface, input, and card geometry never rotate, scale, or flash.

## State Choreography

- **Idle:** 7.5 seconds per revolution. Clearly visible light heads, restrained glow.
- **Typing:** 5.5 seconds per revolution. Border and glow gain a small amount of opacity.
- **Thinking:** 3.8 seconds per revolution. Motion becomes more purposeful and the glow slightly brighter, without blinking.
- **Return to idle:** active layers fade over 520 milliseconds while the idle layer remains in motion, producing a perceptual deceleration instead of an abrupt speed switch.

State remains driven by the existing `data-border-state` value from real `isStreaming`, composer focus, and input content. No timers or synthetic AI states are added.

## Implementation

- Extend the existing shared gradient tokens in `app/admin/admin.css` with a more concentrated chat-only conic gradient.
- Keep the existing pseudo-element architecture on `.olivia-adaptive-stage__chat` and `.olivia-conversation--home`.
- Use `mask-composite` to expose only the border ring.
- Keep every decorative layer `pointer-events: none`.
- Animate only the registered gradient angle and opacity; no React render loop or layout property animation.
- Use a custom easing curve for opacity transitions. The continuous angular progression remains constant to avoid visible acceleration seams at the loop boundary.

## Accessibility and Performance

- Under `prefers-reduced-motion: reduce`, stop all rotation and retain a static branded border.
- Restrict blur to the single non-scrolling outer chat glow.
- Keep `will-change` limited to the active glow/ring layers.
- Preserve all keyboard focus indicators and input hit targets.

## Validation

1. Capture idle and typing screenshots at desktop width.
2. Sample computed animation duration and opacity for idle, typing, and thinking styles.
3. Confirm the card and composer bounding boxes do not move between animation states.
4. Confirm reduced motion disables rotation.
5. Run lint, typecheck, tests, and production build.
6. Inspect browser console; environment/auth API failures are reported separately from UI errors.

## Explicit Non-goals

- No literal directional arrows.
- No new JavaScript animation loop or library.
- No chat layout, copy, control, or functional change.
- No All Tools card redesign in this adjustment.
