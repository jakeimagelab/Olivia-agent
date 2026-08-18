# Olivia Home Detail Tuning Design

## Goal

Preserve the current Olivia Home layout and behavior while refining visual hierarchy, softness, and spacing to better match the approved reference. This pass is presentation-only.

## Scope

- Keep the existing Home Hero, Mission Bar, Bottom Grid, Sidebar, and responsive structure.
- Apply adjustments through Home-scoped CSS wherever possible.
- Do not add cards, controls, features, or data fetching.
- Do not add attachment or microphone controls; the current Home Composer does not render them.

## Hero and Composer

- Move the welcome title, description, composer, and prompt-chip group down by 12px without changing Hero height.
- Add a very subtle mint radial highlight near the Hero's upper-left corner while preserving the existing right-side background motif.
- Keep the Hero surface solid and avoid additional backdrop blur.
- Make the Composer slightly more opaque than the Hero, with an `rgba(21,88,85,.11)` border and a modestly stronger ambient shadow.
- Use a placeholder color near `#8F9E99`.
- Keep the green send button and use `0 6px 16px rgba(21,88,85,.18)` for its shadow.
- Set prompt chips to 39px height, 13–13.5px text, weight 600, and `#25564F`; hover changes only the background to `#F4F9F7`.

## Mission Bar

- Preserve the current dimensions and six-column structure.
- Increase inter-block spacing slightly without causing overflow.
- Use CSS Grid within the existing title block so the status badge sits beside the project title without changing component markup.
- Style the label at 11.5–12px/500 and project title at 15–16px/700.
- Keep the current-stage accent orange and progress fill green.
- Maintain a floating-card surface with soft shadow and subtle border.

## Bottom Cards

- Preserve card proportions and item counts.
- Use a subtle `rgba(21,88,85,.07–.08)` border and `0 12px 30px rgba(21,88,85,.055)` shadow.
- Set card titles to 17px/700/#223631.
- Add 6–8px between headers and first rows and add 2–4px to row heights.
- Recent Work uses 13.5–14px/600 titles and 11.5–12px/500 metadata.
- Smart Suggestion icon blocks become slightly narrower; text hierarchy is strengthened and chevrons become lighter.
- Today Schedule retains the horizontal MiniCalendar/events arrangement, maximum four events, and no internal scrollbar. Divider, pill height, row typography, and padding receive only subtle refinement.

## Sidebar and Footer

- Keep Sidebar structure and active color `#EAF4F2`.
- Slightly darken inactive menu text and increase spacing around Favorites.
- Lower footer opacity so it remains visually secondary.

## Responsive Behavior

- Preserve the existing desktop, two-row intermediate, and single-column mobile breakpoints.
- Do not alter Hero height, Bottom Grid ratios, or Sidebar structure.
- Verify there is no horizontal clipping at the current browser validation width.

## Validation

- Run `git diff --check`.
- Run `npm run typecheck` and `npm test`.
- Run `npm run build`.
- Inspect the Home page in a real browser and confirm Hero content alignment, Mission badge placement, Bottom Card spacing, Today Schedule clipping, and Sidebar hierarchy.

