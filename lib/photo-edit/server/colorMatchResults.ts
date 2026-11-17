import type { ColorMatchManifest, ColorMatchPublicResult } from "@/lib/photo-edit/manifest";
import { signedImageUrls, PERSON_SELECT_BUCKET } from "@/lib/person-select/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export function summarizeColorMatch(manifest: ColorMatchManifest) {
  return manifest.files.reduce((current, file) => {
    current.total += 1;
    if (file.signalAfter === "pass") current.pass += 1;
    else if (file.signalAfter === "check") current.check += 1;
    else if (file.signalAfter === "review") current.review += 1;
    else current.noSkin += 1;
    return current;
  }, { total: 0, pass: 0, check: 0, review: 0, noSkin: 0 });
}

export async function readPublicColorMatchManifest(storagePath: string): Promise<ColorMatchPublicResult> {
  const bucket = getSupabaseAdmin().storage.from(PERSON_SELECT_BUCKET);
  const { data, error } = await bucket.download(storagePath);
  if (error || !data) throw error || new Error("색 맞춤 레시피를 읽지 못했습니다.");
  const manifest = JSON.parse(await data.text()) as ColorMatchManifest;
  if (manifest.manifestVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new Error("색 맞춤 레시피 형식이 올바르지 않습니다.");
  }
  const signed = await signedImageUrls(
    manifest.files.flatMap((file) => [file.sourcePreviewPath, file.resultPreviewPath]),
    60 * 30,
  );
  return {
    ...manifest,
    files: manifest.files.map((file) => ({
      ...file,
      sourcePreviewUrl: signed.get(file.sourcePreviewPath) || null,
      resultPreviewUrl: signed.get(file.resultPreviewPath) || null,
    })),
    summary: summarizeColorMatch(manifest),
  };
}
