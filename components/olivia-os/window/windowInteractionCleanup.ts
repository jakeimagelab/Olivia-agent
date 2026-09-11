type WindowInteractionCancellationOptions = {
  captureTarget: HTMLElement;
  onCancel: () => void;
  ownerWindow?: Window;
  ownerDocument?: Document;
};

/**
 * Pointer capture can disappear without a matching pointerup/pointercancel when
 * the browser loses focus or the tab is backgrounded. Keep these cancellation
 * paths in one small, testable binding so drag and resize restore global body
 * styles through the same interaction cleanup.
 */
export function bindWindowInteractionCancellation({
  captureTarget,
  onCancel,
  ownerWindow = window,
  ownerDocument = document,
}: WindowInteractionCancellationOptions) {
  let active = true;

  const dispose = () => {
    if (!active) return;
    active = false;
    captureTarget.removeEventListener("lostpointercapture", cancel);
    ownerWindow.removeEventListener("blur", cancel);
    ownerDocument.removeEventListener("visibilitychange", cancelWhenHidden);
  };
  const cancel = () => {
    if (!active) return;
    dispose();
    onCancel();
  };
  const cancelWhenHidden = () => {
    if (ownerDocument.visibilityState === "hidden") cancel();
  };

  captureTarget.addEventListener("lostpointercapture", cancel);
  ownerWindow.addEventListener("blur", cancel);
  ownerDocument.addEventListener("visibilitychange", cancelWhenHidden);

  return dispose;
}
