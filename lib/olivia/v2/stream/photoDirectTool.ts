import type { OliviaAgentToolExecution } from "@/lib/olivia/v2/types";

// PHASE 4 작업 5(2026-09-25) — app/api/olivia/v2/stream/route.ts에서 그대로 옮겼다. 동작 변경 없음.

export const PHOTO_DIRECT_TURN_TIMEOUT_MS = 35_000;
export const PHOTO_DIRECT_TOOL_TIMEOUT_MS = 18_000;

export async function executePhotoToolBeforeDeadline(input: {
  name: string;
  execute: () => Promise<OliviaAgentToolExecution>;
  deadlineAt: number;
}): Promise<OliviaAgentToolExecution> {
  const remainingMs = Math.max(1, input.deadlineAt - Date.now());
  const timeoutMs = Math.min(PHOTO_DIRECT_TOOL_TIMEOUT_MS, remainingMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<OliviaAgentToolExecution>((resolve) => {
    timer = setTimeout(() => {
      const folderLookup = input.name === "find_photo_folder";
      const stage = folderLookup ? "폴더 조회" : "잡 생성";
      resolve({
        result: {
          tool: input.name,
          success: false,
          code: "PHOTO_DIRECT_TIMEOUT",
          error: folderLookup
            ? `${stage} 시간이 초과되었습니다. Mac Studio와 Workstation 연결 상태를 확인해주세요.`
            : `${stage} 응답이 지연됐습니다. 사진 작업 상태에서 실제 실행 여부를 확인해주세요.`,
          details: { stage },
          verification: { executed: false },
        },
        uiActions: [],
      });
    }, timeoutMs);
  });
  try {
    return await Promise.race([input.execute(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
