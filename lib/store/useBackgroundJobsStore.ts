import { create } from "zustand";

// RAW 매칭(SelectMatchWorkspace.tsx)/사진 분류(PhotoSortingWorkspace.tsx) 같은 오래 걸리는
// 클라이언트 작업의 진행률을 페이지 이동과 무관하게 보여주기 위한 전역 스토어. 페이지 컴포넌트는
// Next.js 라우트 전환(OliviaPageTransition)에 의해 통째로 unmount되지만, 이 스토어는
// usePhotoClassificationHandoffStore와 같은 순수 zustand 싱글턴이라 살아남는다(새로고침까지는
// 못 버틴다 — FileSystemHandle은 애초에 직렬화가 안 되므로 이건 시도하지 않는다).
export type BackgroundJobStatus = "running" | "done" | "error" | "cancelled";

export type BackgroundJob = {
  id: string;
  label: string;
  cur: number;
  total: number;
  msg?: string;
  status: BackgroundJobStatus;
  // 팝업을 클릭했을 때 돌아갈 경로, 예: "/photo-sorting?mode=raw-match"
  returnPath: string;
  // 작업을 실제로 실행 중인 함수가 이미 갖고 있는 cancelRef 객체를 그대로 등록한다 — 그
  // 함수의 반복문은 이미 이 객체의 .current를 매 반복 확인하므로, 여기서 값을 true로 바꾸기만
  // 하면 컴포넌트가 unmount된 상태에서도 새 취소 배관 없이 기존 로직이 그대로 반응한다.
  cancelRef: { current: boolean };
};

type BackgroundJobsState = {
  jobs: Record<string, BackgroundJob>;
  startJob: (job: BackgroundJob) => void;
  updateJob: (id: string, patch: { cur: number; total: number; msg?: string }) => void;
  finishJob: (id: string, status: Exclude<BackgroundJobStatus, "running">) => void;
  dismissJob: (id: string) => void;
  cancelJob: (id: string) => void;
};

export const useBackgroundJobsStore = create<BackgroundJobsState>((set, get) => ({
  jobs: {},
  startJob: (job) => set((state) => ({ jobs: { ...state.jobs, [job.id]: job } })),
  updateJob: (id, patch) => set((state) => {
    const job = state.jobs[id];
    if (!job) return state;
    return { jobs: { ...state.jobs, [id]: { ...job, ...patch } } };
  }),
  finishJob: (id, status) => set((state) => {
    const job = state.jobs[id];
    if (!job) return state;
    return { jobs: { ...state.jobs, [id]: { ...job, status } } };
  }),
  dismissJob: (id) => set((state) => {
    const { [id]: _removed, ...rest } = state.jobs;
    return { jobs: rest };
  }),
  cancelJob: (id) => {
    const job = get().jobs[id];
    if (job) job.cancelRef.current = true;
  },
}));
