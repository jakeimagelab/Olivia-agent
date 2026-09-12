import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForCanvasResources } from "./canvasExport.client";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe("waitForCanvasResources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("waits for slow fonts and every image decode before export can continue", async () => {
    const fonts = deferred();
    const imageDecode = deferred();
    const decode = vi.fn(() => imageDecode.promise);
    const image = {
      complete: true,
      naturalWidth: 1080,
      naturalHeight: 1350,
      dataset: { reviewAssetName: "대표 사진" },
      alt: "",
      currentSrc: "",
      src: "/review.png",
      decode,
    } as unknown as HTMLImageElement;
    const root = {
      querySelectorAll: vi.fn(() => [image]),
    } as unknown as HTMLElement;
    vi.stubGlobal("document", { fonts: { ready: fonts.promise } });

    let completed = false;
    const waiting = waitForCanvasResources(root).then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(decode).not.toHaveBeenCalled();

    fonts.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(decode).toHaveBeenCalledOnce();
    expect(completed).toBe(false);

    imageDecode.resolve();
    await waiting;
    expect(completed).toBe(true);
  });
});
