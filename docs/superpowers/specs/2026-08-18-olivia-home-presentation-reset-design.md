# Olivia Home Presentation Reset

## Goal

Re-establish the admin home as a conversation-first Olivia hub. The work changes presentation and responsive layout only; conversation state, APIs, tools, workspace behavior, and dashboard data sources remain unchanged.

## Chosen Approach

Keep the existing Home component tree and add route-scoped structural and CSS refinements. This avoids duplicating Olivia chat or header logic while allowing Home to have a distinct visual hierarchy.

## Home Header

- Remove the global header from normal document flow on `/admin/dashboard` and `/admin/dashboard/home`.
- Hide the duplicated brand/title on Home.
- Keep only notifications and quick-create controls as a compact control cluster aligned with the greeting.
- Preserve the mobile menu control and accessible labels.

## Greeting and Chat Hero

- Greeting remains the first page heading and shares its visual row with the Home controls.
- Empty-chat Hero height is 332px on desktop; active conversation height remains 460px for readable history without pushing the rest of the page out of reach.
- Empty state maintains this order: Olivia icon, title, description, composer, suggestion chips.
- Reduce vertical gaps so the five elements read as one compact block.
- Composer uses an 860px maximum width and 88px minimum height on desktop, avoiding an excessively wide, flat input.
- Do not create a second message list, composer, or conversation state.

## Contrast and Typography

- Keep Pretendard Variable as the primary UI font.
- Increase contrast for primary text, card headings, icons, progress values, and action controls.
- Use 14px for card body text and 12px for metadata; avoid low-contrast microcopy.
- Maintain PhotoClinic green and orange as semantic accents rather than washing the entire surface with tinted glass.

## Mission Card

- Present the current mission as a solid, elevated card rather than a thin status strip.
- Target 112–124px height with wider column spacing.
- Establish priority in this order: project title, current stage, progress, next schedule, owner, detail action.
- Increase progress track thickness and value contrast.
- Preserve the existing workflow summary source and link behavior.

## Bottom Grid

- Retain three cards: Recent Work, Smart Suggestions, Today Schedule.
- Use a 330px desktop height with 22px card padding.
- Increase row height to 60px and increase internal spacing.
- Keep four visible items per card and no internal scrollbar.
- Preserve existing API calls and navigation behavior.

## Today Schedule

- Continue using the existing compact Home `MiniCalendar`; do not embed or visually imitate the full calendar page.
- Keep the horizontal mini-calendar and schedule-list arrangement on desktop.
- Show no more than four schedule items, with remaining items available through the full-calendar link.
- Remove internal scrollbars and simplify decorative chrome.

## Sidebar

- Preserve the current navigation and favorites data.
- Clarify four visual groups: brand, primary navigation, favorites, and footer/profile controls.
- Use softer surfaces and spacing while maintaining readable selected states.
- Desktop remains text-led; mobile remains a drawer.

## Responsive Behavior

- Below 900px, Home controls move into a compact top row without covering the greeting.
- Bottom cards collapse to a single column with natural height.
- Mission details wrap without horizontal overflow.
- Touch targets remain at least 40px.

## Performance and Accessibility

- Prefer route-scoped classes and existing components over duplicate React trees.
- Do not add new client-side fetches.
- Animate transform and opacity only for decorative motion; layout changes remain restrained.
- Preserve focus states, labels, keyboard behavior, and reduced-motion handling.

## Verification

- Run unit tests, TypeScript checking, and production build.
- Verify desktop at 1440px and mobile near 390px in a real browser.
- Confirm Home has no full global header, Hero content is compact, Mission reads as a card, bottom cards have no internal scrollbars, and the Today Schedule displays at most four items.

## Out of Scope

- Conversation engine or persistence changes
- Tool/API behavior
- Workspace internals
- Database or migration changes
- Full calendar redesign
- Global redesign of non-Home pages
