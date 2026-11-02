import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { createPhotoThumbPage } from "@/scripts/photo-thumbs-runner";
import { readPhotoXmpRatings } from "@/scripts/photo-xmp-ratings-runner";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.SOURCE_ROOT;
  delete process.env.OLIVIA_PHOTO_SOURCE_ROOT;
  delete process.env.OLIVIA_PERSON_SELECT_ROOTS;
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
    process.env.SOURCE_ROOT = root;
    const result = await createPhotoThumbPage({ remotePath: "shoot" });
    expect(result).toEqual({ ok: true, folder: "shoot", thumbs: [], total: 0 });
  });

  it("reads JPG files only, ignores hidden files, and returns a 320px JPEG data URL", async () => {
    const { root, folder } = await fixture();
    const original = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#155855" } }).jpeg().toBuffer();
    await writeFile(path.join(folder, "IMG_0001.JPG"), original);
    await writeFile(path.join(folder, "._IMG_0001.JPG"), original);
    await writeFile(path.join(folder, ".DS_Store"), "metadata");
    await writeFile(path.join(folder, "note.txt"), "ignore");

    process.env.SOURCE_ROOT = root;
    const result = await createPhotoThumbPage({ remotePath: "shoot/JPG전체" });
    expect(result.total).toBe(1);
    expect(result.thumbs).toHaveLength(1);
    expect(result.thumbs[0].name).toBe("IMG_0001.JPG");
    expect(result.thumbs[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    const output = Buffer.from(result.thumbs[0].dataUrl.split(",")[1], "base64");
    const metadata = await sharp(output).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(320);
  });

  it("reads a virtual person-select root without SOURCE_ROOT", async () => {
    const { root } = await fixture();
    process.env.OLIVIA_PERSON_SELECT_ROOTS = JSON.stringify([root]);
    const result = await createPhotoThumbPage({ remotePath: "root-0/shoot" });
    expect(result).toEqual({ ok: true, folder: "root-0/shoot", thumbs: [], total: 0 });
  });

  it("reads Adobe sidecar ratings from a virtual person-select root", async () => {
    const { root, folder } = await fixture();
    process.env.OLIVIA_PERSON_SELECT_ROOTS = JSON.stringify([root]);
    await writeFile(path.join(folder, "IMG_0002.JPG"), "jpeg placeholder");
    await writeFile(path.join(folder, "IMG_0002.xmp"), '<x:xmpmeta><rdf:Description xmp:Rating="4" /></x:xmpmeta>');
    const result = await readPhotoXmpRatings({ remotePath: "root-0/shoot" });
    expect(result.ratings).toEqual([{ key: "img_0002", name: "IMG_0002.JPG", rating: 4, source: "sidecar" }]);
  });

  it("keeps traversal and disconnected-drive errors blocked", async () => {
    const { root } = await fixture();
    process.env.SOURCE_ROOT = root;
    await expect(createPhotoThumbPage({ remotePath: "../outside" })).rejects.toThrow("NAS Root 밖");
    process.env.SOURCE_ROOT = path.join(root, "missing-drive");
    await expect(createPhotoThumbPage({ remotePath: "shoot" })).rejects.toThrow("드라이브가 연결되어 있지 않아요");
  });
});
