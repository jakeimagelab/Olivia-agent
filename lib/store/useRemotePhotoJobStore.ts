import { create } from "zustand";
import type { RemotePhotoSortJob } from "@/lib/photo-classifier/remotePhotoSort";

export type RemotePhotoPollingState = "idle" | "connected" | "reconnecting";

type RemotePhotoJobState = {
  jobId: string | null;
  job: RemotePhotoSortJob | null;
  pollingState: RemotePhotoPollingState;
  pollingMessage: string;
  setTrackedJob: (job: RemotePhotoSortJob) => void;
  setTrackedJobId: (jobId: string | null) => void;
  setPollingFailure: (message: string) => void;
  clearTrackedJob: () => void;
};

/**
 * 원격 PHOTO_SORT 상태의 브라우저 단일 소스.
 *
 * 전역 bridge만 서버를 polling하고, 사진작업실 창/provider는 이 store를 구독한다. 창을
 * 열었을 때 같은 job을 별도로 조회하지 않게 해 Vercel Function 호출과 상태 불일치를 막는다.
 */
export const useRemotePhotoJobStore = create<RemotePhotoJobState>((set) => ({
  jobId: null,
  job: null,
  pollingState: "idle",
  pollingMessage: "",
  setTrackedJob: (job) => set({
    jobId: job.id,
    job,
    pollingState: "connected",
    pollingMessage: "",
  }),
  setTrackedJobId: (jobId) => set((state) => ({
    jobId,
    job: state.job?.id === jobId ? state.job : null,
    pollingState: jobId ? state.pollingState : "idle",
    pollingMessage: jobId ? state.pollingMessage : "",
  })),
  setPollingFailure: (pollingMessage) => set({ pollingState: "reconnecting", pollingMessage }),
  clearTrackedJob: () => set({ jobId: null, job: null, pollingState: "idle", pollingMessage: "" }),
}));
