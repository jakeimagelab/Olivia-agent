"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Eye,
  FileArchive,
  FileSignature,
  MessageCircle,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
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
import type { MobileDocumentsSection } from "./MobileDocuments";
import styles from "./OliviaMobileShell.module.css";

type CalendarTask = { id: string; title: string; time?: string | null; location?: string | null };

const QUICK_ITEMS = [
  { id: "calendar", label: "캘린더", description: "오늘 일정 확인", Icon: CalendarDays },
  { id: "memo", label: "메모", description: "아이디어 / 업무 기록", Icon: StickyNote },
  { id: "quote-contract", label: "견적/계약", description: "작성 및 진행 상태", Icon: FileSignature },
  { id: "library", label: "문서함", description: "파일 한곳에", Icon: FileArchive },
  { id: "chat", label: "올리비아 채팅", description: "Olivia에게 업무 지시", Icon: MessageCircle },
  { id: "preview", label: "미리보기", description: "현재 작업 결과 확인", Icon: Eye },
] as const;

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

  const handleQuick = (id: typeof QUICK_ITEMS[number]["id"]) => {
    if (id === "quote-contract") return onOpenDocuments("quote-contract");
    if (id === "library") return onOpenDocuments("library");
    if (id === "preview") {
      if (resource) onOpenPreview({ resourceType: resource.type, resourceId: resource.id, temporaryDocumentId: resource.temporaryDocumentId });
      else onOpenDocuments("quote-contract");
      return;
    }
    onNavigate(id);
  };

  return (
    <section className={styles.screen} aria-label="Olivia 모바일 홈">
      <div className={styles.homeBrand}>
        <span className={styles.homeBrandMark}><OliviaIcon size={20} /></span>
        <strong>OLIVIA</strong>
      </div>
      <div className={styles.homeGreeting}>
        <h1>안녕하세요,<br />오늘도 좋은 하루 되세요! <span>👋</span></h1>
        <p>포토클리닉 스튜디오</p>
      </div>

      <button type="button" className={`${styles.card} ${styles.todayCard}`} onClick={() => onNavigate("calendar")}>
        <span className={styles.todayIcon}><CalendarDays size={20} /></span>
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

      <section className={styles.homeSection}>
        <h2 className={styles.sectionLabel}>빠른 메뉴</h2>
        <div className={styles.quickGrid}>
          {QUICK_ITEMS.map(({ id, label, description, Icon }) => (
            <button type="button" key={id} onClick={() => handleQuick(id)}>
              <span><Icon size={20} strokeWidth={1.7} /></span>
              <strong>{label}</strong>
              <small>{id === "preview" && !resource ? "현재 작업 없음" : description}</small>
            </button>
          ))}
        </div>
      </section>

      <button type="button" className={styles.commandCard} onClick={() => onNavigate("chat")}>
        <span className={styles.commandIcon}><Sparkles size={19} /></span>
        <span><strong>Olivia에게 무엇을 시킬까요?</strong><small>견적 만들어줘 · 일정 추가 · 메모 남기기</small></span>
        <ChevronRight size={19} />
      </button>
    </section>
  );
}
