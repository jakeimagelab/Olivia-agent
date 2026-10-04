"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import dynamic from "next/dynamic";
import { AudioLines, Film, Laptop, MessagesSquare, Newspaper, PanelRightClose, PanelRightOpen, Server, Smartphone } from "lucide-react";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import photoStyles from "@/components/photo-workspace/PhotoWorkspace.module.css";
import tabStyles from "@/components/photo-workspace/PhotoWorkspaceTabs.module.css";
import { usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import type { VideoInterviewResult } from "@/lib/video-interview/types";
import AudioExtractPanel from "./AudioExtractPanel";
import InterviewAnalysisPanel from "./InterviewAnalysisPanel";
import ReelsPanel from "./ReelsPanel";
import VideoStudioGuide, { type VideoStudioTab } from "./VideoStudioGuide";
import WebzinePanel from "./WebzinePanel";
import {
  EDIT_ROOT_KEY,
  MACBOOK_PRO_WORKER_ID,
  MAC_STUDIO_WORKER_ID,
  useReelEdits,
  useStoredText,
  useVideoStudioJobs,
  useVideoStudioWorkers,
  videoStudioWorkerLabel,
  type VideoStudioWorkerId,
  type VideoStudioWorkerPresence,
} from "./useVideoStudio";
import styles from "./VideoStudio.module.css";

// 영상 분류는 브라우저에서 로컬 폴더(File System Access)를 직접 다루는 큰 화면이라 탭을 열 때만 불러온다.
const VideoSortingWorkspace = dynamic(() => import("./VideoSortingWorkspace"), {
  ssr: false,
  loading: () => <div className={photoStyles.workspaceLoading}>영상 분류 도구를 불러오는 중...</div>,
});

const TABS: Array<{ value: VideoStudioTab; label: string; title: string; icon: ReactElement }> = [
  { value: "interview", label: "인터뷰 분석", title: "전사 · Q&A 분리 · 핵심 정리 · 릴스 추천", icon: <MessagesSquare size={15} strokeWidth={2} aria-hidden="true" /> },
  { value: "reels", label: "릴스", title: "릴스 후보 채택과 구간 다듬기", icon: <Smartphone size={15} strokeWidth={2} aria-hidden="true" /> },
  { value: "webzine", label: "웹진 초안", title: "블로그 웹진 초안", icon: <Newspaper size={15} strokeWidth={2} aria-hidden="true" /> },
  { value: "sorting", label: "영상 분류", title: "영상 파일을 AI 카테고리·촬영 시간 기준으로 폴더 정리", icon: <Film size={15} strokeWidth={2} aria-hidden="true" /> },
  { value: "audio", label: "음성 분리", title: "영상에서 음성만 WAV로 분리", icon: <AudioLines size={15} strokeWidth={2} aria-hidden="true" /> },
];

const SELECTED_KEY = "olivia.video-studio.selected-job";

const TAB_VALUES = new Set<VideoStudioTab>(["interview", "reels", "webzine", "sorting", "audio"]);

export function resolveVideoStudioTab(value: string | null | undefined): VideoStudioTab {
  return value && TAB_VALUES.has(value as VideoStudioTab) ? (value as VideoStudioTab) : "interview";
}

/** 탭마다 실행 위치가 다르다: 분석·음성 분리는 선택한 원격 Worker, 영상 분류는 이 기기. */
const TAB_EXECUTION: Partial<Record<VideoStudioTab, "LOCAL_DIRECT" | "REMOTE_WORKER">> = {
  interview: "REMOTE_WORKER",
  audio: "REMOTE_WORKER",
  sorting: "LOCAL_DIRECT",
};

function WorkerSelector({
  value,
  workers,
  onChange,
}: {
  value: VideoStudioWorkerId;
  workers: Record<string, VideoStudioWorkerPresence>;
  onChange: (workerId: VideoStudioWorkerId) => void;
}) {
  const options: Array<{ id: VideoStudioWorkerId; icon: ReactElement }> = [
    { id: MAC_STUDIO_WORKER_ID, icon: <Server size={15} aria-hidden="true" /> },
    { id: MACBOOK_PRO_WORKER_ID, icon: <Laptop size={15} aria-hidden="true" /> },
  ];
  return (
    <div className={styles.workerChooser}>
      <span className={styles.workerChooserLabel}>실행할 컴퓨터</span>
      <div className={styles.workerSegments} role="radiogroup" aria-label="영상 작업 실행 컴퓨터">
        {options.map((option) => {
          const online = workers[option.id]?.online;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={value === option.id}
              className={styles.workerSegment}
              onClick={() => onChange(option.id)}
            >
              {option.icon}
              {videoStudioWorkerLabel(option.id)}
              <i data-state={online === true ? "online" : online === false ? "offline" : "unknown"} aria-label={online === true ? "온라인" : online === false ? "오프라인" : "상태 확인 중"} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function VideoStudio({ initialTab }: { initialTab?: string | null } = {}) {
  const contentRef = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [tab, setTab] = useState<VideoStudioTab>(() => resolveVideoStudioTab(initialTab));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { executionMode, availableModes, setExecutionMode } = usePhotoStudioExecution();
  const { jobs, error, results, loadResult, startJob } = useVideoStudioJobs();
  const { workerId, selectWorker, workers, selectedPresence } = useVideoStudioWorkers();
  const [editRoot, setEditRoot] = useStoredText(EDIT_ROOT_KEY);
  const { edits, update: updateEdits } = useReelEdits(selectedId);

  const interviewJobs = useMemo(() => jobs.filter((job) => job.action === "VIDEO_INTERVIEW_ANALYZE"), [jobs]);
  const audioJobs = useMemo(() => jobs.filter((job) => job.action === "VIDEO_AUDIO_EXTRACT"), [jobs]);
  const selectedJob = interviewJobs.find((job) => job.id === selectedId) ?? null;
  const result = selectedId ? ((results[selectedId] as VideoInterviewResult | undefined) ?? null) : null;

  useEffect(() => {
    try { setSelectedId(localStorage.getItem(SELECTED_KEY)); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
  }, []);
  const select = useCallback((jobId: string | null) => {
    setSelectedId(jobId);
    try {
      if (jobId) localStorage.setItem(SELECTED_KEY, jobId);
      else localStorage.removeItem(SELECTED_KEY);
    } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
  }, []);
  useEffect(() => {
    if (selectedJob?.status === "COMPLETED" && !result) void loadResult(selectedJob.id).catch(() => undefined);
  }, [selectedJob, result, loadResult]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const next = content.clientWidth < 900;
      setCompact(next);
      if (!next) setGuideOpen(false);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 1800);
  }, []);

  const remote = executionMode === "REMOTE_WORKER";
  const needsResult = (tab === "reels" || tab === "webzine") && !result;
  const requiredMode = TAB_EXECUTION[tab];
  const wrongMode = requiredMode !== undefined && requiredMode !== executionMode;

  useEffect(() => {
    setTab(resolveVideoStudioTab(initialTab));
  }, [initialTab]);

  let body: ReactElement;
  if (wrongMode && requiredMode === "REMOTE_WORKER") {
    body = (
      <div className={styles.panel}>
        <div className={styles.notice}>
          <Server size={16} style={{ flex: "none", marginTop: 2 }} />
          <span>
            영상작업실은 음성 인식과 분석을 선택한 작업 컴퓨터에서 실행합니다. 촬영본은 브라우저로 전송하지 않아요.
            <br />
            <button type="button" className={photoStyles.secondaryButton} style={{ marginTop: 12 }} onClick={() => setExecutionMode("REMOTE_WORKER")}>원격 작업으로 전환</button>
          </span>
        </div>
      </div>
    );
  } else if (wrongMode && requiredMode === "LOCAL_DIRECT") {
    body = (
      <div className={styles.panel}>
        <div className={styles.notice}>
          <Laptop size={16} style={{ flex: "none", marginTop: 2 }} />
          <span>
            영상 분류는 이 기기에서 영상 폴더를 직접 열어 정리합니다. (Chrome·Edge 데스크톱)
            <br />
            {availableModes.includes("LOCAL_DIRECT") ? (
              <button type="button" className={photoStyles.secondaryButton} style={{ marginTop: 12 }} onClick={() => setExecutionMode("LOCAL_DIRECT")}>이 기기에서 작업으로 전환</button>
            ) : <small>이 화면(모바일·태블릿)에서는 영상 분류를 쓸 수 없습니다.</small>}
          </span>
        </div>
      </div>
    );
  } else if (needsResult) {
    body = (
      <div className={styles.panel}>
        <div className={styles.empty}>
          인터뷰 분석 탭에서 완료된 분석을 먼저 열어주세요.
          <br />
          <button type="button" className={photoStyles.secondaryButton} style={{ marginTop: 14 }} onClick={() => setTab("interview")}>인터뷰 분석으로</button>
        </div>
      </div>
    );
  } else if (tab === "reels" && result) {
    body = <ReelsPanel result={result} edits={edits} updateEdits={updateEdits} editRoot={editRoot} notify={notify} />;
  } else if (tab === "webzine" && result) {
    body = <WebzinePanel result={result} notify={notify} />;
  } else if (tab === "sorting") {
    body = <VideoSortingWorkspace />;
  } else if (tab === "audio") {
    body = (
      <AudioExtractPanel
        jobs={audioJobs}
        results={results}
        loadResult={loadResult}
        targetWorker={workerId}
        onStart={(payload) => startJob("VIDEO_AUDIO_EXTRACT", payload, workerId)}
      />
    );
  } else {
    body = (
      <InterviewAnalysisPanel
        jobs={interviewJobs}
        selectedJob={selectedJob}
        result={result}
        edits={edits}
        editRoot={editRoot}
        targetWorker={workerId}
        onSelect={select}
        onStart={async (payload) => select(await startJob("VIDEO_INTERVIEW_ANALYZE", payload, workerId))}
        notify={notify}
      />
    );
  }

  return (
    <div className={photoStyles.page}>
      <main ref={contentRef} className={photoStyles.content}>
        <div className={tabStyles.shell}>
          <SegmentedTabs
            ariaLabel="영상 작업 선택"
            value={tab}
            onChange={setTab}
            items={TABS.map((item) => ({ ...item, id: `video-studio-tab-${item.value}`, panelId: `video-studio-panel-${item.value}` }))}
          />
        </div>
        {error ? <p className={styles.error} style={{ marginBottom: 12 }}>{error}</p> : null}
        {remote && requiredMode === "REMOTE_WORKER" && selectedPresence?.online === false ? (
          <p className={styles.error} style={{ marginBottom: 12 }}>{videoStudioWorkerLabel(workerId)}가 오프라인입니다. 분석 요청은 대기열에 들어가고, 해당 컴퓨터가 켜지면 시작됩니다.</p>
        ) : null}
        {compact && tab !== "sorting" ? (
          <button type="button" className={photoStyles.guideToggle} aria-expanded={guideOpen} onClick={() => setGuideOpen((open) => !open)}>
            {guideOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            {guideOpen ? "사용 가이드 닫기" : "사용 가이드 보기"}
          </button>
        ) : null}
        {tab === "sorting" && !wrongMode ? (
          <section role="tabpanel" id="video-studio-panel-sorting" aria-labelledby="video-studio-tab-sorting">{body}</section>
        ) : (
        <div className={`${photoStyles.workspaceGrid} ${compact ? photoStyles.workspaceGridCompact : ""}`}>
          <section className={photoStyles.workPanel} role="tabpanel" id={`video-studio-panel-${tab}`} aria-labelledby={`video-studio-tab-${tab}`}>
            {remote && (tab === "interview" || tab === "audio") ? (
              <WorkerSelector value={workerId} workers={workers} onChange={selectWorker} />
            ) : null}
            {body}
          </section>
          {!compact || guideOpen ? <VideoStudioGuide tab={tab} result={tab === "interview" || tab === "reels" ? result : null} editRoot={editRoot} onEditRootChange={setEditRoot} /> : null}
        </div>
        )}
      </main>
      {toast ? <div className={styles.toast} role="status">{toast}</div> : null}
    </div>
  );
}
