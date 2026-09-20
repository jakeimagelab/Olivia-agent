"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Clock3,
  Eye,
} from "lucide-react";
import { AppIcon as DesktopAppIcon, type IconName } from "@/components/AppIcon";
import { CalendarAppIcon } from "@/components/olivia-os/CalendarAppIcon";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import type { MobilePrimaryView, MobileResourceType } from "@/lib/olivia/mobile/navigation";
import {
  isOpenMobileResourceStatus,
  normalizeContractResource,
  normalizeMobileDocument,
  normalizeQuoteResource,
  type MobileResource,
} from "@/lib/olivia/mobile/resources";
import MobileCurrentWorkCard, { type MobileWorkState } from "./MobileCurrentWorkCard";
import { usePhotoProjectNotifications } from "@/components/photo-storage/PhotoProjectNotificationProvider";
import type { PhotoStorageProject } from "@/lib/photo-storage/types";
import type { MobileDocumentsSection } from "./MobileDocuments";
import styles from "./OliviaMobileShell.module.css";

type CalendarTask = { id: string; title: string; time?: string | null; location?: string | null };

const QUICK_ITEMS = [
  { id: "voice", label: "음성 기록", description: "현장 음성 메모", iconName: "work-log" },
  { id: "clients", label: "고객관리", description: "고객과 진행 상황", iconName: "clients" },
  { id: "quote-contract", label: "견적/계약", description: "문서 확인" },
  { id: "conti", label: "콘티", description: "현장 촬영 순서", iconName: "storyboard" },
  { id: "photo-workspace", label: "사진작업실", description: "Mac Studio 원격 작업", iconName: "photo-studio" },
  { id: "preview", label: "미리보기", description: "현재 작업 결과 확인" },
] as const;

const ACTIVE_PHOTO_STATUSES = new Set<PhotoStorageProject["status"]>([
  "MERGING", "COPY_QUEUED", "COPYING", "COPY_VERIFYING", "CLASSIFY_QUEUED", "CLASSIFYING", "CLASSIFY_VERIFYING",
]);

function photoProgress(project: PhotoStorageProject) {
  const progress = project.status === "MERGING" ? project.merge_progress
    : project.status.startsWith("CLASSIFY") ? project.classification_progress
      : project.copy_progress;
  const current = typeof progress.current === "number" ? progress.current : 0;
  const total = typeof progress.total === "number" ? progress.total : project.jpg_count;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const status = project.status === "MERGING" ? "JPG 통합 중"
    : project.status === "COPY_QUEUED" ? "복사 준비 중"
      : project.status === "COPYING" ? "JPG 복사 중"
        : project.status === "COPY_VERIFYING" ? "복사 확인 중"
          : project.status === "CLASSIFY_QUEUED" ? "분류 준비 중"
            : project.status === "CLASSIFYING" ? "씬 분류 중"
              : "분류 확인 중";
  return { status, percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0 };
}

function QuickMenuIcon({
  id,
  iconName,
  resource,
}: {
  id: typeof QUICK_ITEMS[number]["id"];
  iconName?: IconName;
  resource: MobileResource | null;
}) {
  if (id === "quote-contract") return (
    <span className={styles.quickIconPair} aria-hidden="true">
      <DesktopAppIcon name="quote" size={31} />
      <DesktopAppIcon name="contract" size={31} />
    </span>
  );
  if (id === "preview") {
    const resourceIcon: IconName | undefined = resource?.type === "quote"
      ? "quote"
      : resource?.type === "contract"
        ? "contract"
        : resource?.type === "storyboard"
          ? "storyboard"
          : resource
            ? "library"
            : undefined;
    return resourceIcon ? <DesktopAppIcon name={resourceIcon} size={42} /> : <Eye size={21} strokeWidth={1.7} />;
  }
  return iconName ? <DesktopAppIcon name={iconName} size={42} /> : null;
}

function seoulDate() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

async function jsonRequest(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || "데이터를 불러오지 못했어요.");
  return payload;
}

async function loadContextResource(type: string | undefined, id: string | undefined) {
  if (!id) return null;
  if (type === "quote") {
    const payload = await jsonRequest(`/api/quotes/${encodeURIComponent(id)}`);
    return normalizeQuoteResource(payload.quote);
  }
  if (type === "contract") {
    const payload = await jsonRequest(`/api/contracts/${encodeURIComponent(id)}`);
    return normalizeContractResource(payload.data);
  }
  return null;
}

export default function MobileHome({
  onNavigate,
  onOpenDocuments,
  onOpenPreview,
}: {
  onNavigate: (view: MobilePrimaryView) => void;
  onOpenDocuments: (section: MobileDocumentsSection) => void;
  onOpenPreview: (resource: { resourceType: MobileResourceType; resourceId: string; temporaryDocumentId?: string }) => void;
}) {
  const currentDocumentId = useOliviaContextStore((state) => state.currentDocumentId || state.activeResourceId);
  const currentDocumentType = useOliviaContextStore((state) => state.currentDocumentType || state.activeWorkspace);
  const agentRuns = useOliviaConversationStore((state) => state.agentRuns);
  const isSending = useOliviaConversationStore((state) => state.isSending);
  const [todayTasks, setTodayTasks] = useState<CalendarTask[]>([]);
  const [resource, setResource] = useState<MobileResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { projects } = usePhotoProjectNotifications();

  const load = useCallback(async () => {
    setError("");
    try {
      const [calendarPayload, contextualResource, temporaryPayload, quotesPayload, contractsPayload] = await Promise.all([
        jsonRequest(`/api/calendar?date=${seoulDate()}`),
        loadContextResource(currentDocumentType, currentDocumentId).catch(() => null),
        jsonRequest("/api/documents/search?temporary=true&limit=5").catch(() => ({ documents: [] })),
        jsonRequest("/api/quotes?limit=10").catch(() => ({ quotes: [] })),
        jsonRequest("/api/contracts?limit=10").catch(() => ({ contracts: [] })),
      ]);
      setTodayTasks(calendarPayload.tasks || []);
      if (contextualResource) {
        setResource(contextualResource);
      } else {
        const temporary = (temporaryPayload.documents || [])
          .map((row: Record<string, unknown>) => normalizeMobileDocument(row))
          .find(Boolean) || null;
        const canonical = [
          ...(quotesPayload.quotes || []).map((row: Record<string, unknown>) => normalizeQuoteResource(row)),
          ...(contractsPayload.contracts || []).map((row: Record<string, unknown>) => normalizeContractResource(row)),
        ]
          .filter((item): item is MobileResource => Boolean(item) && isOpenMobileResourceStatus(item.status))
          .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())[0] || null;
        setResource(temporary || canonical);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "홈을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [currentDocumentId, currentDocumentType]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("olivia-resource-updated", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("olivia-resource-updated", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const workState = useMemo<MobileWorkState>(() => {
    if (isSending) return "working";
    const runs = Object.values(agentRuns);
    const latest = runs.at(-1);
    if (latest?.status === "failed") return "failed";
    if (latest && ["queued", "running", "waiting_approval"].includes(latest.status || "")) return "working";
    if (latest?.status === "completed") return "done";
    return "idle";
  }, [agentRuns, isSending]);

  const activePhotoProject = useMemo(() => projects
    .filter((project) => ACTIVE_PHOTO_STATUSES.has(project.status))
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())[0] || null, [projects]);

  const handleQuick = (id: typeof QUICK_ITEMS[number]["id"]) => {
    if (id === "quote-contract") return onOpenDocuments("quote-contract");
    if (id === "preview") {
      if (resource) onOpenPreview({ resourceType: resource.type, resourceId: resource.id, temporaryDocumentId: resource.temporaryDocumentId });
      else onOpenDocuments("quote-contract");
      return;
    }
    onNavigate(id);
  };

  return (
    <section className={`${styles.screen} ${styles.homeScreen}`} aria-label="Olivia 모바일 홈">
      <header className={styles.homeHeader}>
        <div className={styles.homeBrand}>
          <span className={styles.homeBrandMark}><Image src="/assets/photoclinic-mark.png" alt="" width={30} height={30} priority /></span>
          <span><strong>PHOTO CLINIC</strong><small>OLIVIA MOBILE</small></span>
        </div>
      </header>
      <div className={styles.homeGreeting}>
        <h1>안녕하세요, 오늘도 좋은 하루 되세요! <span>👋</span></h1>
      </div>

      <button type="button" className={`${styles.card} ${styles.todayCard}`} onClick={() => onNavigate("calendar")}>
        <span className={styles.todayIcon}><CalendarAppIcon /></span>
        <span><strong>오늘 일정</strong><small>{loading ? "일정을 확인하고 있어요." : `${todayTasks.length}개의 일정이 있어요.`}</small></span>
        <ChevronRight size={20} />
      </button>
      {todayTasks[0] ? <div className={styles.nextSchedule}><Clock3 size={14} /><strong>{todayTasks[0].time?.slice(0, 5) || "시간 미정"}</strong><span>{todayTasks[0].title}</span></div> : null}

      <section className={styles.homeSection}>
        <h2 className={styles.sectionLabel}>현재 작업 중</h2>
        {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>현재 작업을 확인하고 있어요...</div> : (
          <MobileCurrentWorkCard resource={resource} state={workState} onPreview={onOpenPreview} onContinue={() => onNavigate("chat")} />
        )}
      </section>

      {activePhotoProject ? <button type="button" className={styles.photoProgressCard} onClick={() => onNavigate("photo-workspace")}>
        <span>사진 작업</span>
        <strong>{activePhotoProject.project_name} · {photoProgress(activePhotoProject).status} · {photoProgress(activePhotoProject).percent}%</strong>
        <ChevronRight size={17} />
      </button> : null}

      <section className={styles.homeSection}>
        <h2 className={styles.sectionLabel}>빠른 메뉴</h2>
        <div className={styles.quickGrid}>
          {QUICK_ITEMS.map(({ id, label, description, ...item }) => (
            <button type="button" key={id} onClick={() => handleQuick(id)}>
              <span className={styles.quickIcon}><QuickMenuIcon id={id} iconName={"iconName" in item ? item.iconName : undefined} resource={resource} /></span>
              <strong>{label}</strong>
              <small>{id === "preview" && !resource ? "현재 작업 없음" : description}</small>
            </button>
          ))}
        </div>
      </section>

    </section>
  );
}
