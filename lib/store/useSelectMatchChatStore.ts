"use client";

import { create } from "zustand";
import type { SelectMatchPreflight } from "@/lib/selectMatch/rawIndex";

// 채팅 안에서 셀렉 매칭을 끝까지 수행하는 카드(components/olivia/SelectMatchChatCard.tsx)의
// 실시간 상태 — flowId로 키가 나뉜다. FileSystemDirectoryHandle은 JSON 직렬화가 안 되므로
// 이 스토어(client-only, 비영속)에만 존재하고 절대 채팅 메시지 블록(OliviaMessageBlock)이나
// localStorage 대화 캐시로는 나가지 않는다. 새로고침하면 진행 중이던 흐름은 초기화된다 —
// 어차피 폴더 핸들은 브라우저 보안 정책상 새로고침 후 재사용이 어려워서 영속화의 이득이 적다.
export type SelectMatchChatStep =
  | "collecting_names"
  | "awaiting_raw_folder"
  | "scanning"
  | "preflight_ready"
  | "matching"
  | "done"
  | "error";

export type SelectMatchChatFlowState = {
  flowId: string;
  step: SelectMatchChatStep;
  selectedNames: Set<string>;
  rawRootDir: FileSystemDirectoryHandle | null;
  rawScanCount: number;
  preflight: SelectMatchPreflight | null;
  matchProgress: { cur: number; total: number; msg: string };
  log: string[];
  result: { matched: number; missing: number; selected: number } | null;
  errorMessage: string | null;
};

function emptyFlow(flowId: string): SelectMatchChatFlowState {
  return {
    flowId,
    step: "collecting_names",
    selectedNames: new Set(),
    rawRootDir: null,
    rawScanCount: 0,
    preflight: null,
    matchProgress: { cur: 0, total: 0, msg: "" },
    log: [],
    result: null,
    errorMessage: null,
  };
}

export type SelectMatchChatStoreState = {
  flows: Record<string, SelectMatchChatFlowState>;
  startFlow: (flowId: string) => void;
  setNames: (flowId: string, names: Set<string>) => void;
  setRawRootDir: (flowId: string, dir: FileSystemDirectoryHandle) => void;
  setScanProgress: (flowId: string, count: number) => void;
  setPreflight: (flowId: string, preflight: SelectMatchPreflight | null) => void;
  setStep: (flowId: string, step: SelectMatchChatStep) => void;
  appendLog: (flowId: string, line: string) => void;
  setMatchProgress: (flowId: string, progress: SelectMatchChatFlowState["matchProgress"]) => void;
  setResult: (flowId: string, result: SelectMatchChatFlowState["result"]) => void;
  setError: (flowId: string, message: string) => void;
  resetFlow: (flowId: string) => void;
};

function updateFlow(
  flows: Record<string, SelectMatchChatFlowState>,
  flowId: string,
  patch: Partial<SelectMatchChatFlowState>,
): Record<string, SelectMatchChatFlowState> {
  const current = flows[flowId] ?? emptyFlow(flowId);
  return { ...flows, [flowId]: { ...current, ...patch } };
}

export const useSelectMatchChatStore = create<SelectMatchChatStoreState>((set) => ({
  flows: {},

  startFlow: (flowId) => set((state) => ({ flows: { ...state.flows, [flowId]: emptyFlow(flowId) } })),
  setNames: (flowId, names) => set((state) => ({ flows: updateFlow(state.flows, flowId, { selectedNames: names }) })),
  setRawRootDir: (flowId, dir) => set((state) => ({ flows: updateFlow(state.flows, flowId, { rawRootDir: dir }) })),
  setScanProgress: (flowId, count) => set((state) => ({ flows: updateFlow(state.flows, flowId, { rawScanCount: count }) })),
  setPreflight: (flowId, preflight) => set((state) => ({ flows: updateFlow(state.flows, flowId, { preflight }) })),
  setStep: (flowId, step) => set((state) => ({ flows: updateFlow(state.flows, flowId, { step }) })),
  appendLog: (flowId, line) => set((state) => {
    const current = state.flows[flowId] ?? emptyFlow(flowId);
    return { flows: { ...state.flows, [flowId]: { ...current, log: [...current.log, line] } } };
  }),
  setMatchProgress: (flowId, progress) => set((state) => ({ flows: updateFlow(state.flows, flowId, { matchProgress: progress }) })),
  setResult: (flowId, result) => set((state) => ({ flows: updateFlow(state.flows, flowId, { result }) })),
  setError: (flowId, message) => set((state) => ({ flows: updateFlow(state.flows, flowId, { step: "error", errorMessage: message }) })),
  resetFlow: (flowId) => set((state) => ({ flows: { ...state.flows, [flowId]: emptyFlow(flowId) } })),
}));
