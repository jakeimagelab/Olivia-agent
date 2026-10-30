# Olivia Bridge folder source selection

## Goal

Keep the existing `폴더 선택` control while allowing the user to choose either a local Mac folder or an NAS folder every time. The OS worker-status label remains informational and does not choose the folder source.

## Considered approaches

1. **Small source chooser under the existing button — selected.** This preserves the toolbar, makes both sources explicit, and reuses both existing pickers.
2. Split button with a chevron. This is compact, but makes the secondary source less discoverable and introduces a new button pattern.
3. Two permanent toolbar buttons. This is clearest, but changes the established Bridge layout and consumes toolbar space.

## Interaction design

- Every Bridge action labeled `폴더 선택` or `다른 폴더 선택` opens the same source chooser.
- The chooser contains two rows:
  - `이 Mac의 폴더`: clear stale remote-folder context, switch to `LOCAL_DIRECT`, reset the Bridge route title, and open the existing browser-native directory picker.
  - `NAS 폴더`: switch to `REMOTE_WORKER` and open the existing `PhotoSourcePicker`. A successful selection continues through the existing `loadRemoteDirectory` flow.
- The chooser has an explicit `X` close control and closes on Escape or outside click.
- The chooser uses the existing dark Bridge tone, borders, spacing, and Lucide line icons. It introduces no new color token, tab style, or filled primary action.
- `Mac Studio · NAS` in the OS top bar remains connection status only.

## Preserved behavior

- Local folder scanning and recent-folder restoration remain unchanged after source selection.
- Direct NAS opening through `?remoteFolder=` remains unchanged.
- NAS thumbnail loading and Mac Studio worker jobs remain unchanged.
- `PhotoSourcePicker` and `RemoteNasBrowser` are reused without internal changes.
- `person-select` source scope is not used.

## State and error handling

- Opening one picker closes the source chooser.
- Canceling either picker returns to the Bridge without changing loaded files.
- Choosing local clears an already displayed remote folder before the native picker opens, preventing stale `NAS · ...` labels.
- NAS picker errors continue to be rendered by the existing remote picker.

## Verification

- From an empty Bridge, `폴더 선택 → 이 Mac의 폴더` opens the native local picker.
- `폴더 선택 → NAS 폴더` opens the existing remote NAS picker.
- Cancel and `X` close without changing the current folder.
- A local folder clears stale NAS breadcrumbs and window context.
- A selected NAS folder loads through the current remote thumbnail flow.
- Direct notification links with `remoteFolder` still open the NAS folder.
- Existing Bridge tests, TypeScript, and targeted lint pass.

