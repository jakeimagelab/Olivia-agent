import { describe, expect, it, vi } from "vitest";
import { bindWindowInteractionCancellation } from "@/components/olivia-os/window/windowInteractionCleanup";

class VisibilityTarget extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

function interactionTargets() {
  return {
    captureTarget: new EventTarget() as unknown as HTMLElement,
    ownerWindow: new EventTarget() as unknown as Window,
    ownerDocument: new VisibilityTarget() as unknown as Document,
  };
}

describe("window interaction cancellation", () => {
  it.each(["lostpointercapture", "blur"] as const)("cancels once on %s", (eventName) => {
    const targets = interactionTargets();
    const onCancel = vi.fn();
    bindWindowInteractionCancellation({ ...targets, onCancel });

    const target = eventName === "lostpointercapture" ? targets.captureTarget : targets.ownerWindow;
    target.dispatchEvent(new Event(eventName));
    target.dispatchEvent(new Event(eventName));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels only when document visibility becomes hidden", () => {
    const targets = interactionTargets();
    const ownerDocument = targets.ownerDocument as unknown as VisibilityTarget;
    const onCancel = vi.fn();
    bindWindowInteractionCancellation({ ...targets, onCancel });

    ownerDocument.dispatchEvent(new Event("visibilitychange"));
    expect(onCancel).not.toHaveBeenCalled();

    ownerDocument.visibilityState = "hidden";
    ownerDocument.dispatchEvent(new Event("visibilitychange"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("removes all cancellation listeners when an interaction finishes normally", () => {
    const targets = interactionTargets();
    const ownerDocument = targets.ownerDocument as unknown as VisibilityTarget;
    const onCancel = vi.fn();
    const dispose = bindWindowInteractionCancellation({ ...targets, onCancel });

    dispose();
    targets.captureTarget.dispatchEvent(new Event("lostpointercapture"));
    targets.ownerWindow.dispatchEvent(new Event("blur"));
    ownerDocument.visibilityState = "hidden";
    ownerDocument.dispatchEvent(new Event("visibilitychange"));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
