import { create } from "zustand";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

// 채팅(PhotoClassificationChatCard)에서 모은 설정을 PhotoSortingWorkspace가 마운트될 때
// 한 번 읽어가는 핸드오프 전용 스토어(PHASE 4, 2026-08-30). field/studio 리터럴은
// PhotoSortingWorkspace.tsx(3500줄짜리 컴포넌트 파일)에서 다시 import하면 채팅 카드 쪽까지
// 그 무거운 파일이 번들에 딸려 들어가므로, 여기서는 같은 값을 독립적으로 재선언한다.
export type PhotoClassificationHandoff = {
  photoMode: "field" | "studio";
  department?: MedicalDepartment;
  rootDir: FileSystemDirectoryHandle | null;
  rootDirName?: string;
  gapMinutes?: number;
  fastAnalyzeMode?: boolean;
  departmentLogicEnabled?: boolean;
  aiNamingEnabled?: boolean;
  qualityAnalysisEnabled?: boolean;
  profileClassificationEnabled?: boolean;
  lightingSensitivity?: "loose" | "medium" | "strict";
  studioSubMode?: "concept" | "group";
};

type PhotoClassificationHandoffState = {
  active: boolean;
  data: PhotoClassificationHandoff | null;
  handoff: (data: PhotoClassificationHandoff) => void;
  // PhotoSortingWorkspace가 마운트 시 한 번만 소비한다 — 소비 후 즉시 리셋해서, 이후 사용자가
  // 페이지를 직접 새로고침하거나 다시 방문해도 예전 핸드오프 값으로 자동 재실행되지 않는다.
  consume: () => PhotoClassificationHandoff | null;
};

export const usePhotoClassificationHandoffStore = create<PhotoClassificationHandoffState>((set, get) => ({
  active: false,
  data: null,
  handoff: (data) => set({ active: true, data }),
  consume: () => {
    const { active, data } = get();
    set({ active: false, data: null });
    return active ? data : null;
  },
}));
