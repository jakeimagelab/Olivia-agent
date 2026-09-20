"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronRight,
  Clock3,
  Eye,
  FolderOpen,
  Search,
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
type MobileWeather = { temperature: number; label: string; symbol: string; location: string | null };

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
const PENDING_PHOTO_STATUSES = new Set<PhotoStorageProject["status"]>([
  "READY", "MERGE_COMPLETED", "REVIEW_REQUIRED", "MERGE_FAILED", "COPY_FAILED", "CLASSIFY_FAILED",
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

function seoulDateLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date()).replace(/\.$/, "");
}

function recentDate(value?: string) {
  if (!value) return "최근";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "최근";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(date);
}

function resourceIconName(type: MobileResource["type"]): IconName {
  if (type === "quote") return "quote";
  if (type === "contract") return "contract";
  if (type === "storyboard") return "storyboard";
  return "library";
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
  const [recentResources, setRecentResources] = useState<MobileResource[]>([]);
  const [weather, setWeather] = useState<MobileWeather | null>(null);
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
      const temporaryResources = (temporaryPayload.documents || [])
        .map((row: Record<string, unknown>) => normalizeMobileDocument(row))
        .filter((item: MobileResource | null): item is MobileResource => Boolean(item));
      const quoteResources = (quotesPayload.quotes || [])
        .map((row: Record<string, unknown>) => normalizeQuoteResource(row))
        .filter((item: MobileResource | null): item is MobileResource => Boolean(item));
      const contractResources = (contractsPayload.contracts || [])
        .map((row: Record<string, unknown>) => normalizeContractResource(row))
        .filter((item: MobileResource | null): item is MobileResource => Boolean(item));
      const uniqueResources = new Map<string, MobileResource>();
      [...temporaryResources, ...quoteResources, ...contractResources]
        .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
        .forEach((item) => {
          const key = `${item.type}:${item.id}`;
          if (!uniqueResources.has(key)) uniqueResources.set(key, item);
        });
      setRecentResources([...uniqueResources.values()].slice(0, 2));
      if (contextualResource) {
        setResource(contextualResource);
      } else {
        const temporary = temporaryResources[0] || null;
        const canonical = [
          ...quoteResources,
          ...contractResources,
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
    if (!("geolocation" in navigator)) return;
    let active = true;
    navigator.geolocation.getCurrentPosition((position) => {
      const params = new URLSearchParams({
        latitude: String(position.coords.latitude),
        longitude: String(position.coords.longitude),
      });
      void fetch(`/api/mobile/weather?${params}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (!active || !payload?.ok || !payload.weather) return;
          setWeather({ ...payload.weather, location: typeof payload.location === "string" ? payload.location : null });
        })
        .catch(() => undefined);
    }, () => undefined, { enableHighAccuracy: false, maximumAge: 15 * 60_000, timeout: 5_000 });
    return () => { active = false; };
  }, []);
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
  const pendingPhotoCount = useMemo(() => projects.filter((project) => PENDING_PHOTO_STATUSES.has(project.status)).length, [projects]);

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
          <span className={styles.homeBrandMark}><Image src="/assets/photoclinic-mark.png" alt="" width={38} height={38} priority /></span>
          <span><strong>PHOTO CLINIC</strong><small>OLIVIA MOBILE</small></span>
        </div>
        <div className={styles.homeHeaderActions}>
          <button type="button" onClick={() => onNavigate("clients")} aria-label="고객 검색"><Search size={19} /></button>
          <button type="button" onClick={() => onNavigate("photo-workspace")} aria-label="사진 작업 알림">
            <Bell size={19} />
            {pendingPhotoCount > 0 ? <i aria-hidden="true" /> : null}
          </button>
        </div>
      </header>
      <div className={styles.homeGreetingRow}>
        <div className={styles.homeGreeting}>
          <small>대표님, 안녕하세요!</small>
          <h1>오늘도 좋은 하루 되세요! <span>👋</span></h1>
          <p>좋은 이미지는 좋은 변화를 만듭니다.</p>
        </div>
        <div className={styles.homeDateWeather}>
          <strong>{seoulDateLabel()}</strong>
          {weather ? <span>{weather.symbol} {weather.label} {weather.temperature}°</span> : null}
          {weather?.location ? <small>{weather.location}</small> : null}
        </div>
      </div>

      <button type="button" className={`${styles.card} ${styles.todayCard}`} onClick={() => onNavigate("calendar")}>
        <span className={styles.todayIcon}><CalendarAppIcon /></span>
        <span><strong>오늘 일정</strong><small>{loading ? "일정을 확인하고 있어요." : `${todayTasks.length}개의 일정이 있어요.`}</small></span>
        <ChevronRight size={20} />
      </button>
      {todayTasks[0] ? <div className={styles.nextSchedule}><Clock3 size={14} /><strong>{todayTasks[0].time?.slice(0, 5) || "시간 미정"}</strong><span>{todayTasks[0].title}</span></div> : null}

      <section className={styles.homeSection}>
        <div className={styles.homeSectionHeading}><h2 className={styles.sectionLabel}>현재 작업 중</h2></div>
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
        <div className={styles.homeSectionHeading}><h2 className={styles.sectionLabel}>빠른 메뉴</h2></div>
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

      {recentResources.length ? <section className={styles.homeSection}>
        <div className={styles.homeSectionHeading}>
          <h2 className={styles.sectionLabel}>최근 문서</h2>
          <button type="button" onClick={() => onOpenDocuments("quote-contract")}>전체 보기 <ChevronRight size={14} /></button>
        </div>
        <div className={styles.recentDocumentList}>
          {recentResources.map((item) => (
            <button type="button" key={`${item.type}:${item.id}`} onClick={() => onOpenPreview({ resourceType: item.type, resourceId: item.id, temporaryDocumentId: item.temporaryDocumentId })}>
              <span><DesktopAppIcon name={resourceIconName(item.type)} size={29} /></span>
              <strong>{item.title}</strong>
              <small>{recentDate(item.updatedAt)}</small>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </section> : null}

      {pendingPhotoCount > 0 ? <button type="button" className={styles.pendingPhotoCard} onClick={() => onNavigate("photo-workspace")}>
        <span><FolderOpen size={21} /></span>
        <span><strong>파일 분류 대기</strong><small>분류가 필요한 파일이 {pendingPhotoCount.toLocaleString("ko-KR")}개 있어요.</small></span>
        <b>{pendingPhotoCount.toLocaleString("ko-KR")}</b>
        <ChevronRight size={17} />
      </button> : null}

    </section>
  );
}
