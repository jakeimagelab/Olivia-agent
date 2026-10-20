import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("Olivia OS notification close controls", () => {
  it("dismisses a photo task card without invoking job cancellation", () => {
    const statusBar = source("components/olivia-os/PhotoTaskStatusBar.tsx");

    expect(statusBar).toContain("dismissedJobIds");
    expect(statusBar).toContain("!dismissedJobIds.includes(job.id)");
    expect(statusBar).toContain("<ModalCloseButton");
    expect(statusBar).toContain("event.stopPropagation()");
    expect(statusBar).toContain("cancelRemotePhotoSortJob(job.id)");
  });

  it("puts the shared close control on every floating OS notification", () => {
    const files = [
      "components/olivia-os/DesktopUtilityToast.tsx",
      "components/olivia-os/BackupReadyNotifications.tsx",
      "components/photo-storage/PhotoProjectNotification.tsx",
    ];

    for (const file of files) {
      expect(source(file)).toContain("<ModalCloseButton");
    }
  });
});
