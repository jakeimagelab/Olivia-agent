"use client";

import { Check, Clipboard, ExternalLink, FolderOpen, RotateCcw, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  ShootingProgressActionStage,
  ShootingProgressCard,
  ShootingProgressManualState,
  ShootingProgressStage,
} from "@/lib/photo-storage/shootingProgress";
import styles from "./ShootingProgressCards.module.css";

type ClientOption = { id: string; hospital_name?: string | null; name?: string | null };

const STAGES: Array<{ key: ShootingProgressStage | "shooting"; label: string; automatic?: boolean }> = [
  { key: "shooting", label: "촬영", automatic: true },
  { key: "backup_sorting", label: "백업·분류", automatic: true },
  { key: "original_delivery", label: "1차 전달" },
  { key: "client_selection", label: "고객 셀렉" },
  { key: "raw_matching", label: "RAW 매칭", automatic: true },
  { key: "retouching", label: "보정" },
  { key: "final_delivery", label: "2차 전달" },
];

const ACTION_STAGES = new Set<ShootingProgressStage>([
  "original_delivery",
  "client_selection",
  "raw_matching",
  "retouching",
  "final_delivery",
]);

function clientLabel(client: ClientOption) {
  return client.hospital_name || client.name || "이름 없는 고객";
}

function stageStatus(card: ShootingProgressCard, key: (typeof STAGES)[number]["key"]) {
  if (key === "shooting") return "completed" as const;
  const manual = card.manualStates[key as ShootingProgressActionStage];
  if (manual === "skipped") return "skipped" as const;
  const currentIndex = STAGES.findIndex((stage) => stage.key === card.stage);
  const index = STAGES.findIndex((stage) => stage.key === key);
  if (currentIndex < 0 || index < currentIndex) return "completed" as const;
  if (index === currentIndex) return "active" as const;
  return "pending" as const;
}

export function ShootingProgressDialog({
  card,
  variant,
  onClose,
  onUpdated,
  onOpenFolder,
  onOpenClient,
}: {
  card: ShootingProgressCard;
  variant: "mobile" | "desktop";
  onClose: () => void;
  onUpdated?: () => Promise<void> | void;
  onOpenFolder?: (card: ShootingProgressCard) => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const [nasLink, setNasLink] = useState(card.nasLink ?? "");
  const [clientId, setClientId] = useState(card.clientId ?? "");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectionUrl, setSelectionUrl] = useState(card.selectionUrl ?? "");
  const [portalUrl, setPortalUrl] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (card.clientId || card.stage !== "original_delivery") return;
    const controller = new AbortController();
    void fetch("/api/clients?scope=list", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "고객 목록을 불러오지 못했습니다.");
        setClients(Array.isArray(payload.clients) ? payload.clients : []);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "고객 목록을 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [card.clientId, card.stage]);

  const activeIsActionStage = ACTION_STAGES.has(card.stage);
  const skippedStages = useMemo(
    () => STAGES.filter((stage) => stage.key !== "shooting" && card.manualStates[stage.key as ShootingProgressActionStage] === "skipped"),
    [card.manualStates],
  );

  const postAction = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/photo-storage/projects/${encodeURIComponent(card.projectId)}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "촬영 진행 상태를 변경하지 못했습니다.");
      await onUpdated?.();
      return payload as { selectionUrl?: string; portalUrl?: string | null };
    } finally {
      setSaving(false);
    }
  };

  const registerLink = async () => {
    try {
      const payload = await postAction({ action: "register_link", nasLink, clientId: clientId || null });
      setSelectionUrl(payload.selectionUrl || "");
      setPortalUrl(payload.portalUrl || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "유그린 링크를 등록하지 못했습니다.");
    }
  };

  const updateStage = async (stage: ShootingProgressActionStage, state: ShootingProgressManualState) => {
    try {
      await postAction({ action: "update_stage", stage, state });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "촬영 진행 상태를 변경하지 못했습니다.");
    }
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => current === label ? null : current), 1800);
    } catch {
      setError("링크를 클립보드에 복사하지 못했습니다.");
    }
  };

  const content = (
    <div className={`${styles.dialogBackdrop} ${styles[`${variant}Dialog`]}`} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="shooting-progress-title">
        <header className={styles.dialogHeader}>
          <div><span>SHOOTING WORKFLOW</span><h2 id="shooting-progress-title">{card.projectName}</h2><p>{card.detail}</p></div>
          <button type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </header>

        <ol className={styles.timeline}>
          {STAGES.map((stage) => {
            const status = stageStatus(card, stage.key);
            return (
              <li className={styles[status]} key={stage.key}>
                <span className={styles.timelineDot}>{status === "completed" ? <Check size={13} /> : status === "skipped" ? "—" : null}</span>
                <div><strong>{stage.label}</strong><small>{status === "active" ? "지금 차례" : status === "completed" ? "완료" : status === "skipped" ? "건너뜀" : "대기"}</small></div>
                {stage.automatic ? <b>자동</b> : null}
                {status === "skipped" ? <button type="button" disabled={saving} onClick={() => void updateStage(stage.key as ShootingProgressActionStage, "restored")}><RotateCcw size={13} />되돌리기</button> : null}
              </li>
            );
          })}
        </ol>

        <div className={styles.activePanel}>
          <span>{card.stageLabel}</span>
          <h3>{card.summary}</h3>
          {card.stage === "original_delivery" ? (
            <div className={styles.linkForm}>
              {!card.clientId ? (
                <label>고객 연결<select value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">나중에 연결</option>{clients.map((client) => <option value={client.id} key={client.id}>{clientLabel(client)}</option>)}</select></label>
              ) : null}
              <label>유그린 링크<input type="url" inputMode="url" autoCapitalize="none" value={nasLink} onChange={(event) => setNasLink(event.target.value)} placeholder="https://..." /></label>
              <button type="button" disabled={saving || !nasLink.trim()} onClick={() => void registerLink()}>{saving ? "등록 중..." : "링크 등록하기"}</button>
            </div>
          ) : null}
          {card.stage === "retouching" ? <button type="button" className={styles.primaryAction} disabled={saving} onClick={() => void updateStage("retouching", "completed")}>보정 완료</button> : null}
          {card.stage === "final_delivery" ? <button type="button" className={styles.primaryAction} disabled={saving} onClick={() => void updateStage("final_delivery", "completed")}>2차 전달 완료</button> : null}
          {card.stage === "backup_sorting" || card.stage === "raw_matching" ? <p className={styles.autoNote}>이 단계는 사진 파이프라인이 자동으로 갱신합니다.</p> : null}
          {selectionUrl ? <div className={styles.generatedLink}><span>고객 셀렉 링크</span><a href={selectionUrl} target="_blank" rel="noopener noreferrer">{selectionUrl}<ExternalLink size={13} /></a><button type="button" onClick={() => void copy("selection", selectionUrl)}><Clipboard size={14} />{copied === "selection" ? "복사됨" : "복사"}</button></div> : null}
          {portalUrl ? <div className={styles.generatedLink}><span>고객 포털 링크</span><a href={portalUrl} target="_blank" rel="noopener noreferrer">{portalUrl}<ExternalLink size={13} /></a><button type="button" onClick={() => void copy("portal", portalUrl)}><Clipboard size={14} />{copied === "portal" ? "복사됨" : "복사"}</button></div> : null}
          {error ? <p className={styles.dialogError}>{error}</p> : null}
        </div>

        <footer className={styles.dialogFooter}>
          <button type="button" onClick={() => onOpenFolder?.(card)}><FolderOpen size={16} />폴더 열기</button>
          <button type="button" disabled={!card.clientId} onClick={() => card.clientId && onOpenClient?.(card.clientId)}><UserRound size={16} />고객 정보</button>
          {activeIsActionStage ? <button type="button" className={styles.skipAction} disabled={saving} onClick={() => void updateStage(card.stage as ShootingProgressActionStage, "skipped")}>이 단계 건너뛰기</button> : null}
        </footer>
        {skippedStages.length ? <p className={styles.auditNote}>건너뛴 단계는 단계 목록의 ‘되돌리기’로 다시 열 수 있습니다.</p> : null}
      </section>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(content, document.body);
}
