import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { createPhotoThumbPage } from "@/scripts/photo-thumbs-runner";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "olivia-photo-thumbs-"));
  temporaryDirectories.push(root);
  const folder = path.join(root, "shoot", "JPG전체");
  await mkdir(folder, { recursive: true });
  return { root, folder };
}

describe("photo thumbs runner", () => {
  it("returns a valid empty result before image generation is attached", async () => {
    const { root } = await fixture();
    const result = await createPhotoThumbPage({ sourceRoot: root, remotePath: "shoot" });
    expect(result).toEqual({ ok: true, folder: "shoot", thumbs: [], total: 0 });
  });

  it("reads JPG files only, ignores hidden files, and returns a 320px JPEG data URL", async () => {
    const { root, folder } = await fixture();
    const original = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#155855" } }).jpeg().toBuffer();
    await writeFile(path.join(folder, "IMG_0001.JPG"), original);
    await writeFile(path.join(folder, "._IMG_0001.JPG"), original);
    await writeFile(path.join(folder, ".DS_Store"), "metadata");
    await writeFile(path.join(folder, "note.txt"), "ignore");

    const result = await createPhotoThumbPage({ sourceRoot: root, remotePath: "shoot/JPG전체" });
    expect(result.total).toBe(1);
    expect(result.thumbs).toHaveLength(1);
    expect(result.thumbs[0].name).toBe("IMG_0001.JPG");
    expect(result.thumbs[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    const output = Buffer.from(result.thumbs[0].dataUrl.split(",")[1], "base64");
    const metadata = await sharp(output).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(320);
  });
});
