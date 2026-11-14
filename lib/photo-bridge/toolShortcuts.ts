export type BridgeToolShortcutKey = "jpg-prep" | "select" | "raw-match" | "resize" | "tcut";

type BridgeToolShortcutEvent = Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey">;

/** Bridge 도구 전환 키를 한 곳에서 해석해 버튼과 같은 실행 경로로 보낸다. */
export function bridgeToolShortcutFromEvent(event: BridgeToolShortcutEvent): BridgeToolShortcutKey | null {
  const command = (event.metaKey || event.ctrlKey) && !event.altKey;
  if (command && event.code === "KeyJ") return "jpg-prep";
  if (command && event.code === "KeyS") return "select";
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.code === "KeyM") return "raw-match";
  if (event.code === "KeyR") return "resize";
  if (event.code === "KeyT") return "tcut";
  return null;
}
