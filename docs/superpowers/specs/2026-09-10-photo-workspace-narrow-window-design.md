# Photo workspace narrow-window design

## Container-based behavior

The floating photo-workspace window can be narrow while the browser viewport remains wide, so responsive state is based on the workspace content container rather than viewport media queries.

## Tabs

The five approved tabs render with icon and text while they fit. A `ResizeObserver` detects actual overflow and switches the tabs to icon-only presentation. The full-label width is remembered so labels return when space becomes available again. Horizontal scrolling remains enabled as the final fallback, with its scrollbar hidden.

## Guide panel

At widths of 900px or more, the guide remains the right-hand column. Below 900px it is collapsed by default and a clearly labelled toggle appears. Expanding it places the guide below the main work area without covering controls or photos.

## Window boundary

The photo-workspace registry minimum width changes from 720px to 420px. Existing default and maximized sizes remain unchanged.

## Verification

Browser checks cover wide and narrow floating-window widths, tab label changes, guide toggle behavior, and the 420px resize boundary.
