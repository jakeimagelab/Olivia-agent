import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, stat } from "node:fs/promises";

import { parse as parseExif } from "exifr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { applyPhotoEditRecipe, clonePhotoEditRecipe } from "@/lib/photo-edit";
import { reserveColorMatchOutputFolder, safeColorMatchPathParts, scanColorMatchJpegs } from "@/lib/photo-edit/node/colorMatchFiles";
import { decodeJpegForPhotoEdit, writeEditedJpeg } from "@/lib/photo-edit/node/jpegAdapter";

describe("photo edit node adapter", () => {
  it("keeps the source untouched and preserves dimensions and capture EXIF", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "olivia-color-match-"));
    const sourcePath = path.join(root, "portrait.jpg");
    const destinationPath = path.join(root, "result", "portrait.jpg");
    const pixels = Buffer.alloc(48 * 36 * 3);
    for (let index = 0; index < pixels.length; index += 3) {
      pixels[index] = 190; pixels[index + 1] = 126; pixels[index + 2] = 98;
    }
    await sharp(pixels, { raw: { width: 48, height: 36, channels: 3 } })
      .withExif({ IFD2: { DateTimeOriginal: "2026:11:16 12:34:56" } })
      .jpeg({ quality: 95 })
      .toFile(sourcePath);
    const before = await stat(sourcePath);
    const decoded = await decodeJpegForPhotoEdit(sourcePath);
    const recipe = clonePhotoEditRecipe();
    recipe.light.exposure = 0.25;
    const edited = applyPhotoEditRecipe(decoded, recipe);
    await writeEditedJpeg(destinationPath, decoded.sourceBytes, edited);
    const after = await stat(sourcePath);
    const outputMetadata = await sharp(destinationPath).metadata();
    const outputExif = await parseExif(await readFile(destinationPath), ["DateTimeOriginal"]) as { DateTimeOriginal?: Date };
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(outputMetadata.width).toBe(48);
    expect(outputMetadata.height).toBe(36);
    expect(outputExif.DateTimeOriginal).toBeInstanceOf(Date);
    expect(outputExif.DateTimeOriginal?.getFullYear()).toBe(2026);
  });

  it("creates a sibling result folder without overwriting earlier runs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "olivia-color-folder-"));
    const source = path.join(root, "보정본");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(source);
    const first = await reserveColorMatchOutputFolder(source);
    const second = await reserveColorMatchOutputFolder(source);
    expect(path.basename(first)).toBe("보정본_색맞춤");
    expect(path.basename(second)).toBe("보정본_색맞춤_2");
  });

  it("recursively scans JPEG files and skips dot-prefixed recipe folders", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "olivia-color-scan-"));
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.join(root, "사람1"), { recursive: true });
    await mkdir(path.join(root, ".olivia-color-match"), { recursive: true });
    await writeFile(path.join(root, "사람1", "A.JPG"), "a");
    await writeFile(path.join(root, ".olivia-color-match", "hidden.jpg"), "x");
    const files = await scanColorMatchJpegs(root);
    expect(files.map((file) => file.relativePath)).toEqual(["사람1/A.JPG"]);
  });

  it("rejects traversal in a stored color-match file path", () => {
    expect(() => safeColorMatchPathParts("../원본.jpg")).toThrow("색 맞춤 파일 경로");
    expect(safeColorMatchPathParts("사람1/원본.jpg")).toEqual(["사람1", "원본.jpg"]);
  });
});
