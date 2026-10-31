import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";

export type ShellSelection = {
  sourceAppId: string;
  sourceWindowId: string;
  itemId: string;
  title: string;
  subtitle?: string;
  next?: string;
  appId?: string;
  href?: string;
  context?: WindowContext;
  featureItemId?: string;
};

export type ShellSelectionEventDetail =
  | { clear: true; sourceAppId: string; sourceWindowId: string }
  | ({ clear?: false } & ShellSelection);

export function emitShellSelection(detail: ShellSelectionEventDetail) {
  window.dispatchEvent(new CustomEvent<ShellSelectionEventDetail>("olivia-shell-selection", { detail }));
}
