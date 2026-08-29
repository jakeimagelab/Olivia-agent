"use client";

import { create } from "zustand";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

// 채팅 안에서 사진 분류 설정을 단계적으로 모으는 카드(components/olivia/PhotoClassificationChatCard.tsx)의
// 실시간 상태 — useSelectMatchChatStore.ts와 동일한 패턴(flowId로 키가 나뉜 client-only, 비영속
// 스토어). FileSystemDirectoryHandle은 JSON 직렬화가 안 되므로 여기(런타임 메모리)에만 있고
// 채팅 메시지 블록이나 localStorage로는 절대 나가지 않는다(PHASE 4, 2026-08-30).
export type PhotoClassificationChatStep =
  | "choose_mode"
  | "choose_department"
  | "picking_folder"
  | "scanning"
  | "folder_ready"
  | "choose_boundary"
  | "choose_speed"
  | "choose_options"
  | "choose_lighting"
  | "choose_submode"
  | "ready"
  | "done"
  | "error";

// 실제 PhotoSortingWorkspace.tsx 기본값과 동일하게 맞춘다(department:dermatology,
// gapMinutes:3.5, departmentLogicEnabled/profileClassificationEnabled만 기본 true,
// lightingSensitivity:medium, studioSubMode:concept).
export type PhotoClassificationSettings = {
  department: MedicalDepartment;
  gapMinutes: number;
  fastAnalyzeMode: boolean;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  lightingSensitivity: "loose" | "medium" | "strict";
  studioSubMode: "concept" | "group";
};

export type PhotoClassificationChatFlowState = {
  flowId: string;
  step: PhotoClassificationChatStep;
  photoMode: "field" | "studio" | null;
  rootDir: FileSystemDirectoryHandle | null;
  rootDirName: string;
  fileCount: number;
  settings: PhotoClassificationSettings;
  errorMessage: string | null;
};

function defaultSettings(): PhotoClassificationSettings {
  return {
    department: "dermatology",
    gapMinutes: 3.5,
    fastAnalyzeMode: false,
    departmentLogicEnabled: true,
    aiNamingEnabled: false,
    qualityAnalysisEnabled: false,
    profileClassificationEnabled: true,
    lightingSensitivity: "medium",
    studioSubMode: "concept",
  };
}

function emptyFlow(flowId: string): PhotoClassificationChatFlowState {
  return {
    flowId,
    step: "choose_mode",
    photoMode: null,
    rootDir: null,
    rootDirName: "",
    fileCount: 0,
    settings: defaultSettings(),
    errorMessage: null,
  };
}

export type PhotoClassificationChatStoreState = {
  flows: Record<string, PhotoClassificationChatFlowState>;
  startFlow: (flowId: string) => void;
  setStep: (flowId: string, step: PhotoClassificationChatStep) => void;
  setPhotoMode: (flowId: string, photoMode: "field" | "studio") => void;
  setRootDir: (flowId: string, dir: FileSystemDirectoryHandle, rootDirName: string) => void;
  setFileCount: (flowId: string, fileCount: number) => void;
  updateSettings: (flowId: string, patch: Partial<PhotoClassificationSettings>) => void;
  setError: (flowId: string, message: string) => void;
  resetFlow: (flowId: string) => void;
};

function updateFlow(
  flows: Record<string, PhotoClassificationChatFlowState>,
  flowId: string,
  patch: Partial<PhotoClassificationChatFlowState>,
): Record<string, PhotoClassificationChatFlowState> {
  const current = flows[flowId] ?? emptyFlow(flowId);
  return { ...flows, [flowId]: { ...current, ...patch } };
}

export const usePhotoClassificationChatStore = create<PhotoClassificationChatStoreState>((set) => ({
  flows: {},

  startFlow: (flowId) => set((state) => ({ flows: { ...state.flows, [flowId]: emptyFlow(flowId) } })),
  setStep: (flowId, step) => set((state) => ({ flows: updateFlow(state.flows, flowId, { step }) })),
  setPhotoMode: (flowId, photoMode) => set((state) => ({ flows: updateFlow(state.flows, flowId, { photoMode }) })),
  setRootDir: (flowId, dir, rootDirName) => set((state) => ({ flows: updateFlow(state.flows, flowId, { rootDir: dir, rootDirName }) })),
  setFileCount: (flowId, fileCount) => set((state) => ({ flows: updateFlow(state.flows, flowId, { fileCount }) })),
  updateSettings: (flowId, patch) => set((state) => {
    const current = state.flows[flowId] ?? emptyFlow(flowId);
    return { flows: { ...state.flows, [flowId]: { ...current, settings: { ...current.settings, ...patch } } } };
  }),
  setError: (flowId, message) => set((state) => ({ flows: updateFlow(state.flows, flowId, { step: "error", errorMessage: message }) })),
  resetFlow: (flowId) => set((state) => ({ flows: { ...state.flows, [flowId]: emptyFlow(flowId) } })),
}));
