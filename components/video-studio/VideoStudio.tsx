"use client";

import dynamic from "next/dynamic";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AudioLines,
  Clapperboard,
  Film,
  Laptop,
  MessagesSquare,
  Newspaper,
  PenLine,
  ScrollText,
  Scissors,
  Send,
  Server,
  Sparkles,
  Smartphone,
  Video,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import photoStyles from "@/components/photo-workspace/PhotoWorkspace.module.css";
import { usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { ExecutionBar } from "@/components/workspace-shell/ExecutionBar";
import { EmptyState } from "@/components/workspace-shell/Feedback";
import { WorkPanel } from "@/components/workspace-shell/WorkPanel";
import { WorkspaceGrid } from "@/components/workspace-shell/WorkspaceGrid";
import { WorkspaceContent, WorkspaceShell } from "@/components/workspace-shell/WorkspaceShell";
import { WorkspaceSubTabs } from "@/components/workspace-shell/WorkspaceSubTabs";
import { WorkspaceTabs } from "@/components/workspace-shell/WorkspaceTabs";
import type { VideoInterviewResult } from "@/lib/video-interview/types";
import AudioExtractPanel from "./AudioExtractPanel";
import InterviewAnalysisPanel from "./InterviewAnalysisPanel";
import ReelsPanel from "./ReelsPanel";
import VideoStudioGuide from "./VideoStudioGuide";
import WebzinePanel from "./WebzinePanel";
import {
  DEFAULT_VIDEO_STUDIO_TOOL,
  VIDEO_STUDIO_TOOLS,
  resolveVideoStudioRoute,
  videoStudioHref,
  type VideoStudioSection,
  type VideoStudioTool,
} from "./videoStudioNavigation";
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

const VideoSortingWorkspace = dynamic(() => import("./VideoSortingWorkspace"), {
  ssr: false,
  loading: () => <div className={photoStyles.workspaceLoading}>영상 분류 도구를 불러오는 중...</div>,
});

const VideoContiWorkspace = dynamic(
  () => import("@/app/(conti-studio)/video-conti/page"),
  { ssr: false, loading: () => <div className={photoStyles.workspaceLoading}>영상 콘티를 불러오는 중...</div> },
);
const YoutubeEditingContiWorkspace = dynamic(
  () => import("@/app/youtube-editing-conti/page"),
  { ssr: false, loading: () => <div className={photoStyles.workspaceLoading}>유튜브 편집 콘티를 불러오는 중...</div> },
);
const BrollPromptWorkspace = dynamic(
  () => import("@/app/broll-prompt/page"),
  { ssr: false, loading: () => <div className={photoStyles.workspaceLoading}>B-roll 프롬프트를 불러오는 중...</div> },
);
const PrompterWorkspace = dynamic(
  () => import("@/app/prompter/PrompterClient").then((module) => module.PrompterWorkspace),
  { ssr: false, loading: () => <div className={photoStyles.workspaceLoading}>프롬프터를 불러오는 중...</div> },
);
const VideoProductionWorkspace = dynamic(
  () => import("@/components/video-production/VideoProductionWorkspace").then((module) => module.VideoProductionWorkspace),
  { ssr: false, loading: () => <div className={photoStyles.workspaceLoading}>AI 영상제작을 불러오는 중...</div> },
);

const SECTION_TABS: Array<{ value: VideoStudioSection; label: string; title: string; icon: ReactElement }> = [
  { value: "plan", label: "기획", title: "콘티와 촬영 프롬프트를 준비합니다.", icon: <PenLine size={15} aria-hidden="true" /> },
  { value: "shoot", label: "촬영", title: "현장 촬영 도구를 엽니다.", icon: <Video size={15} aria-hidden="true" /> },
  { value: "post", label: "후반", title: "촬영본을 분석하고 정리합니다.", icon: <Scissors size={15} aria-hidden="true" /> },
  { value: "publish", label: "제작·발행", title: "콘텐츠를 제작하고 발행합니다.", icon: <Send size={15} aria-hidden="true" /> },
];

const TOOL_META: Record<VideoStudioTool, { label: string; title: string; icon: LucideIcon }> = {
  "video-conti": { label: "영상 콘티", title: "4단계 영상 콘티를 작성합니다.", icon: Clapperboard },
  "youtube-conti": { label: "유튜브 편집 콘티", title: "유튜브 편집 구성을 준비합니다.", icon: ScrollText },
  broll: { label: "B-roll 프롬프트", title: "B-roll 생성 프롬프트를 작성합니다.", icon: WandSparkles },
  prompter: { label: "프롬프터", title: "촬영 대본과 읽기 화면을 준비합니다.", icon: Video },
  interview: { label: "인터뷰 분석", title: "전사 · Q&A 분리 · 핵심 정리 · 릴스 추천", icon: MessagesSquare },
  reels: { label: "릴스", title: "릴스 후보 채택과 구간 다듬기", icon: Smartphone },
  sorting: { label: "영상 분류", title: "영상 파일을 카테고리와 촬영 시간 기준으로 정리", icon: Film },
  audio: { label: "음성 분리", title: "영상에서 음성만 WAV로 분리", icon: AudioLines },
  magazine: { label: "매거진 원고", title: "인터뷰 분석 결과로 원고 초안을 확인합니다.", icon: Newspaper },
  "ai-video": { label: "AI 영상제작", title: "AI 영상 제작 작업을 진행합니다.", icon: Sparkles },
};

const TOOL_EXECUTION: Partial<Record<VideoStudioTool, "LOCAL_DIRECT" | "REMOTE_WORKER">> = {
  interview: "REMOTE_WORKER",
  audio: "REMOTE_WORKER",
  sorting: "LOCAL_DIRECT",
};

const LIGHT_TOOLS = new Set<VideoStudioTool>([
  "video-conti",
  "youtube-conti",
  "broll",
  "prompter",
  "magazine",
  "audio",
]);

const SELECTED_KEY = "olivia.video-studio.selected-job";

function WorkerSelector({
  value,
  workers,
  tone,
  onChange,
}: {
  value: VideoStudioWorkerId;
  workers: Record<string, VideoStudioWorkerPresence>;
  tone: "dark" | "light";
  onChange: (workerId: VideoStudioWorkerId) => void;
}) {
  const options: Array<{ id: VideoStudioWorkerId; icon: ReactElement }> = [
    { id: MAC_STUDIO_WORKER_ID, icon: <Server size={15} aria-hidden="true" /> },
    { id: MACBOOK_PRO_WORKER_ID, icon: <Laptop size={15} aria-hidden="true" /> },
  ];
  return (
    <div className={styles.workerChooser} data-tone={tone}>
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

function PendingWorkspace({ tool }: { tool: VideoStudioTool }) {
  const { icon: Icon, label } = TOOL_META[tool];
  return (
    <EmptyState
      icon={<Icon size={26} aria-hidden="true" />}
      title={`${label} 화면을 연결하는 중입니다.`}
      description="기존 기능과 데이터는 유지한 채 작업실 안으로 이동합니다."
    />
  );
}

export default function VideoStudio({
  initialTab,
  initialTool,
  onRouteChange,
}: {
  initialTab?: string | null;
  initialTool?: string | null;
  onRouteChange?: (href: string) => void;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const toolParam = searchParams.get("tool");
  const queryString = searchParams.toString();
  const initialRoute = resolveVideoStudioRoute(initialTab, initialTool);
  const [section, setSection] = useState<VideoStudioSection>(initialRoute.section);
  const [tool, setTool] = useState<VideoStudioTool>(initialRoute.tool);
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
    try { setSelectedId(localStorage.getItem(SELECTED_KEY)); } catch (storageError) { console.error("[OLIVIA] Unable to restore selected video job", storageError); }
  }, []);

  const select = useCallback((jobId: string | null) => {
    setSelectedId(jobId);
    try {
      if (jobId) localStorage.setItem(SELECTED_KEY, jobId);
      else localStorage.removeItem(SELECTED_KEY);
    } catch (storageError) { console.error("[OLIVIA] Unable to persist selected video job", storageError); }
  }, []);

  useEffect(() => {
    if (selectedJob?.status === "COMPLETED" && !result) void loadResult(selectedJob.id).catch(() => undefined);
  }, [selectedJob, result, loadResult]);

  useEffect(() => {
    const route = pathname === "/video-studio"
      ? resolveVideoStudioRoute(tabParam, toolParam)
      : resolveVideoStudioRoute(initialTab, initialTool);
    setSection(route.section);
    setTool(route.tool);
  }, [initialTab, initialTool, pathname, tabParam, toolParam]);

  const navigate = useCallback((nextSection: VideoStudioSection, nextTool: VideoStudioTool) => {
    setSection(nextSection);
    setTool(nextTool);
    const href = videoStudioHref(nextSection, nextTool);
    if (pathname === "/video-studio") {
      const params = new URLSearchParams(queryString);
      params.set("tab", nextSection);
      params.set("tool", nextTool);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    onRouteChange?.(href);
  }, [onRouteChange, pathname, queryString, router]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 1800);
  }, []);

  const requiredMode = TOOL_EXECUTION[tool];
  const remote = executionMode === "REMOTE_WORKER";
  const wrongMode = requiredMode !== undefined && requiredMode !== executionMode;
  const needsResult = (tool === "reels" || tool === "magazine") && !result;
  const tone = LIGHT_TOOLS.has(tool) ? "light" : "dark";
  const sectionTools = VIDEO_STUDIO_TOOLS[section];

  let body: ReactElement;
  if (wrongMode && requiredMode === "REMOTE_WORKER") {
    body = (
      <div className={styles.panel}>
        <div className={styles.notice}>
          <Server size={16} aria-hidden="true" />
          <span>
            이 작업은 선택한 작업 컴퓨터에서 실행합니다. 촬영본은 브라우저로 전송하지 않아요.
            <br />
            <button type="button" className={photoStyles.secondaryButton} onClick={() => setExecutionMode("REMOTE_WORKER")}>원격 작업으로 전환</button>
          </span>
        </div>
      </div>
    );
  } else if (wrongMode && requiredMode === "LOCAL_DIRECT") {
    body = (
      <div className={styles.panel}>
        <div className={styles.notice}>
          <Laptop size={16} aria-hidden="true" />
          <span>
            영상 분류는 이 기기에서 영상 폴더를 직접 열어 정리합니다. (Chrome·Edge 데스크톱)
            <br />
            {availableModes.includes("LOCAL_DIRECT") ? (
              <button type="button" className={photoStyles.secondaryButton} onClick={() => setExecutionMode("LOCAL_DIRECT")}>이 기기에서 작업으로 전환</button>
            ) : <small>이 화면(모바일·태블릿)에서는 영상 분류를 쓸 수 없습니다.</small>}
          </span>
        </div>
      </div>
    );
  } else if (needsResult) {
    body = (
      <div className={styles.panel}>
        <div className={styles.empty}>
          인터뷰 분석에서 완료된 분석을 먼저 열어주세요.
          <br />
          <button type="button" className={photoStyles.secondaryButton} onClick={() => navigate("post", "interview")}>인터뷰 분석으로</button>
        </div>
      </div>
    );
  } else if (tool === "reels" && result) {
    body = <ReelsPanel result={result} edits={edits} updateEdits={updateEdits} editRoot={editRoot} notify={notify} />;
  } else if (tool === "magazine" && result) {
    body = <WebzinePanel result={result} notify={notify} />;
  } else if (tool === "sorting") {
    body = <VideoSortingWorkspace />;
  } else if (tool === "audio") {
    body = (
      <AudioExtractPanel
        jobs={audioJobs}
        results={results}
        loadResult={loadResult}
        targetWorker={workerId}
        onStart={(payload) => startJob("VIDEO_AUDIO_EXTRACT", payload, workerId)}
      />
    );
  } else if (tool === "interview") {
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
  } else if (tool === "video-conti") {
    body = <div className={styles.embeddedWorkspace}><VideoContiWorkspace /></div>;
  } else if (tool === "youtube-conti") {
    body = <div className={`${styles.embeddedWorkspace} ${styles.canvasWorkspace}`}><YoutubeEditingContiWorkspace /></div>;
  } else if (tool === "broll") {
    body = <div className={styles.embeddedWorkspace}><BrollPromptWorkspace /></div>;
  } else if (tool === "prompter") {
    body = <div className={styles.embeddedWorkspace}><PrompterWorkspace embedded /></div>;
  } else if (tool === "ai-video") {
    body = <div className={`${styles.embeddedWorkspace} ${styles.aiVideoWorkspace}`}><VideoProductionWorkspace embedded /></div>;
  } else {
    body = <PendingWorkspace tool={tool} />;
  }

  return (
    <WorkspaceShell>
      <ExecutionBar visible={requiredMode !== undefined} />
      <WorkspaceContent>
        <WorkspaceTabs
          ariaLabel="영상작업실 단계"
          value={section}
          onChange={(nextSection) => navigate(nextSection, DEFAULT_VIDEO_STUDIO_TOOL[nextSection])}
          items={SECTION_TABS.map((item) => ({ ...item, id: `video-studio-section-${item.value}` }))}
        />
        {error ? <p className={styles.error}>{error}</p> : null}
        {remote && requiredMode === "REMOTE_WORKER" && selectedPresence?.online === false ? (
          <p className={styles.error}>{videoStudioWorkerLabel(workerId)}가 오프라인입니다. 분석 요청은 대기열에 들어가고, 해당 컴퓨터가 켜지면 시작됩니다.</p>
        ) : null}
        <WorkspaceGrid guide={<VideoStudioGuide tool={tool} result={tool === "interview" || tool === "reels" ? result : null} editRoot={editRoot} onEditRootChange={setEditRoot} />}>
          <WorkPanel
            tone={tone}
            role="tabpanel"
            id={`video-studio-panel-${tool}`}
            aria-labelledby={`video-studio-section-${section}`}
          >
            {sectionTools.length > 1 ? (
              <WorkspaceSubTabs
                ariaLabel={`${SECTION_TABS.find((item) => item.value === section)?.label ?? section} 세부 작업`}
                tone={tone}
                value={tool}
                onChange={(nextTool) => navigate(section, nextTool)}
                items={sectionTools.map((value) => {
                  const meta = TOOL_META[value];
                  const Icon = meta.icon;
                  return { value, label: meta.label, title: meta.title, icon: <Icon size={15} aria-hidden="true" /> };
                })}
              />
            ) : null}
            {remote && (tool === "interview" || tool === "audio") ? (
              <WorkerSelector value={workerId} workers={workers} tone={tone} onChange={selectWorker} />
            ) : null}
            <DesktopWindowProvider value={true}>{body}</DesktopWindowProvider>
          </WorkPanel>
        </WorkspaceGrid>
      </WorkspaceContent>
      {toast ? <div className={styles.toast} role="status">{toast}</div> : null}
    </WorkspaceShell>
  );
}
