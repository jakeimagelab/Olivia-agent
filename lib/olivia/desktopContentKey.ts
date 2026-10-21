import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";

export function getDesktopContentKey(input: {
  windowId: string;
  appId: string;
  context?: WindowContext;
}): string {
  if (input.appId === "conti") return input.windowId;
  return `${input.appId}:${input.context?.resourceId ?? ""}:${input.context?.clientId ?? ""}:${input.context?.projectId ?? ""}`;
}
