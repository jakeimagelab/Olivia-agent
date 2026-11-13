import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";
import type { RemoteJobAction } from "./requestValidation";

type RemoteJobPayload = Record<string, unknown>;

export function normalizeVideoRequestPayload(
  action: RemoteJobAction,
  requested: RemoteJobPayload,
): RemoteJobPayload | null {
  if (action !== "VIDEO_INTERVIEW_ANALYZE" && action !== "VIDEO_AUDIO_EXTRACT") return null;

  const sourceRelativePath = normalizeRemoteNasRelativePath(
    typeof requested.source_relative_path === "string" ? requested.source_relative_path : "",
  );
  if (!sourceRelativePath) throw new Error("촬영 폴더를 선택해 주세요.");
  const context = typeof requested.context === "string"
    ? requested.context.replace(/[\u0000-\u001f]/g, " ").replace(/^-+/, "").trim().slice(0, 500)
    : "";
  return {
    source_relative_path: sourceRelativePath,
    ...(action === "VIDEO_INTERVIEW_ANALYZE" && context ? { context } : {}),
  };
}
