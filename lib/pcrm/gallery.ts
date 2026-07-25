export type PhotoAnnotationInput = {
  imageId: string;
  xRatio: number;
  yRatio: number;
  content: string;
};

export function normalizeIdList(value: unknown, limit = 2_000): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    .slice(0, limit);
}

export function normalizeImageNotes(value: unknown, allowedIds: Set<string>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([id, note]) => allowedIds.has(id) && typeof note === "string")
      .map(([id, note]) => [id, String(note).trim().slice(0, 2_000)])
      .filter(([, note]) => note.length > 0),
  );
}

export function validatePhotoAnnotation(value: unknown):
  | { ok: true; value: PhotoAnnotationInput }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "사진 수정 위치 정보가 필요합니다." };
  const input = value as Record<string, unknown>;
  const imageId = String(input.imageId ?? "").trim();
  const content = String(input.content ?? "").trim();
  const xRatio = Number(input.xRatio);
  const yRatio = Number(input.yRatio);
  if (!imageId) return { ok: false, error: "수정할 사진을 선택해주세요." };
  if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio) || xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) {
    return { ok: false, error: "사진 위의 수정 위치가 올바르지 않습니다." };
  }
  if (!content || content.length > 2_000) return { ok: false, error: "수정 내용은 1~2000자로 입력해주세요." };
  return { ok: true, value: { imageId, xRatio, yRatio, content } };
}

export function calculateSelectionDiff(previousIds: string[], nextIds: string[]) {
  const previous = new Set(previousIds);
  const next = new Set(nextIds);
  return {
    added: nextIds.filter((id) => !previous.has(id)),
    removed: previousIds.filter((id) => !next.has(id)),
    unchanged: nextIds.filter((id) => previous.has(id)),
  };
}
