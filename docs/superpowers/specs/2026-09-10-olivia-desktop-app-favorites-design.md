# Olivia Desktop app favorites design

## Scope

The All Apps window gains six top-level tabs in this order: Favorites, All, Desktop, Admin Dashboard, Client CRM, and AI Assistant. Favorites is the initial tab. The existing system-app row moves into the Desktop tab so classification has one consistent navigation surface.

## Persistence

The existing singleton `olivia_desktop_settings` row receives a `favorite_app_keys text[]` column. The default value contains calendar, quote, conti, photo workspace, memo, and clients. The desktop-settings API reads and writes the array with normalization, de-duplication, and a bounded item count. The database remains authoritative and a versioned local cache provides immediate rendering and offline continuity.

## Interaction

Every app tile supports right-click and a 550ms long press. Both open the same accessible menu with one action: add to or remove from Favorites. A long press suppresses the following click so it cannot launch the app accidentally. Updates are optimistic, serialized one at a time, and rolled back with an inline error if persistence fails.

## Data model

Route-backed tools use their canonical href as the favorite key. Desktop-only apps use an `app:<registry-id>` key. This keeps keys stable while allowing Desktop apps to participate without inventing routes.

## Verification

The migration must be applied to the live Supabase project before deployment. Tests cover defaults and normalization. Browser verification covers default-tab ordering, category contents, context-menu add/remove, long press, and persistence after reload.
