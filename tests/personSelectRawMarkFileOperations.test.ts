import path from "node:path";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  clearPersonSelectRawMarks,
  markPersonSelectRawSidecar,
} from "@/lib/person-select/node/rawMarkFileOperations";
import { normalizePersonSelectRawLabelNames } from "@/lib/person-select/rawMatch";

describe("person select RAW mark file operations", () => {
  it("updates and restores the XMP without changing the RAW file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "olivia-raw-mark-"));
    const rawPath = path.join(root, "PHOTO_0001.CR2");
    const xmpPath = path.join(root, "PHOTO_0001.xmp");
    await writeFile(rawPath, "raw-file-content", "utf8");
    await writeFile(
      xmpPath,
      '<?xml version="1.0"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" xmp:Rating="2" crs:Exposure2012="0.45" /></rdf:RDF></x:xmpmeta>',
      "utf8",
    );
    const rawBefore = await stat(rawPath);

    const marked = await markPersonSelectRawSidecar({
      raw: { path: rawPath, relPath: "PHOTO_0001.CR2" },
      shootingRoot: root,
      jobId: "job-1",
      rating: 5,
      colorLabel: 6,
      labelNames: normalizePersonSelectRawLabelNames(undefined),
    });

    const rawAfter = await stat(rawPath);
    const markedXmp = await readFile(xmpPath, "utf8");
    expect(rawAfter.size).toBe(rawBefore.size);
    expect(rawAfter.mtimeMs).toBe(rawBefore.mtimeMs);
    expect(markedXmp).toContain('xmp:Rating="5"');
    expect(markedXmp).toContain('xmp:Label="Select"');
    expect(markedXmp).toContain('crs:Exposure2012="0.45"');

    const cleared = await clearPersonSelectRawMarks({
      shootingRoot: root,
      previousResult: {
        mode: "mark",
        rawMarkJobId: "job-1",
        markedSidecars: [marked],
      },
    });
    const restoredXmp = await readFile(xmpPath, "utf8");
    expect(cleared).toMatchObject({ restored: 1, deleted: 0, failed: [] });
    expect(restoredXmp).toContain('xmp:Rating="2"');
    expect(restoredXmp).toContain('crs:Exposure2012="0.45"');
  });
});
