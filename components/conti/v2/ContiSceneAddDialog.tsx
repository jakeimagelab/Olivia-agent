"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import type { ContiStudioController } from "@/components/conti/v2/useContiStudio";
import { getDepartmentLabel } from "@/lib/conti/departmentTaxonomy";
import type { ContiSceneRecommendation } from "@/lib/conti/sceneRecommendations";
import styles from "@/components/conti/v2/ContiV2.module.css";

export default function ContiSceneAddDialog({ open, controller, onClose }: {
  open: boolean;
  controller: ContiStudioController;
  onClose: () => void;
}) {
  const runId = controller.document?.run.id ?? "";
  const specialty = controller.document?.run.specialty ?? "";
  const [recommendations, setRecommendations] = useState<ContiSceneRecommendation[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [intent, setIntent] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const loadRecommendations = useCallback(async (requestText: string, signal?: AbortSignal) => {
    if (!runId) return;
    setLoading(true); setError(""); setNotice(""); setSelected(new Set());
    try {
      const response = await fetch(`/api/conti/runs/${runId}/scene-recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: requestText }),
        signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error ?? "추천 장면을 불러오지 못했습니다.");
      setRecommendations(Array.isArray(body.recommendations) ? body.recommendations : []);
      setNotice(typeof body.notice === "string" ? body.notice : "");
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "추천 장면을 불러오지 못했습니다.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (!open) return;
    const abortController = new AbortController();
    void loadRecommendations("", abortController.signal);
    return () => abortController.abort();
  }, [loadRecommendations, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !adding) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [adding, onClose, open]);

  const selectedRecommendations = useMemo(() => recommendations.filter((item) => selected.has(item.id)), [recommendations, selected]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function addSelected() {
    if (!selectedRecommendations.length) return;
    setAdding(true); setError("");
    let needsOrderSave = false;
    for (const recommendation of selectedRecommendations) {
      if (!await controller.addScene(recommendation)) {
        if (needsOrderSave) await controller.flushSave();
        setError(controller.error || "장면을 추가하지 못했습니다.");
        setAdding(false);
        return;
      }
      needsOrderSave ||= recommendation.openingOrder !== undefined;
      setRecommendations((current) => current.filter((item) => item.id !== recommendation.id));
      setSelected((current) => {
        const next = new Set(current);
        next.delete(recommendation.id);
        return next;
      });
    }
    if (needsOrderSave && !await controller.flushSave()) {
      setError("장면은 추가했지만 순서를 저장하지 못했습니다. 다시 시도해 주세요.");
      setAdding(false);
      return;
    }
    setAdding(false); onClose();
  }

  async function addBlank() {
    setAdding(true); setError("");
    const added = await controller.addScene();
    setAdding(false);
    if (added) onClose(); else setError(controller.error || "빈 장면을 추가하지 못했습니다.");
  }

  if (!open) return null;
  return (
    <div className={styles.sceneAddBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !adding) onClose(); }}>
      <section className={styles.sceneAddDialog} role="dialog" aria-modal="true" aria-labelledby="conti-scene-add-title">
        <header className={styles.sceneAddHeader}>
          <div><span><Sparkles size={13} aria-hidden="true" /> AI 장면 추천</span><h3 id="conti-scene-add-title">{getDepartmentLabel(specialty)} 추천 장면</h3><p>현재 콘티에 없는 촬영 장면만 추천합니다.</p></div>
          <button type="button" onClick={onClose} disabled={adding} aria-label="닫기"><X size={18} strokeWidth={2} /></button>
        </header>

        <form className={styles.sceneAddPrompt} onSubmit={(event) => { event.preventDefault(); void loadRecommendations(intent); }}>
          <input value={intent} onChange={(event) => setIntent(event.target.value)} maxLength={400} placeholder="추가 요청이 있으면 적으세요. 예: 허리 시술 장면을 더 추천해줘" aria-label="AI 장면 추가 요청" />
          <button type="submit" disabled={loading || adding}><RefreshCw size={14} className={loading ? styles.spinning : undefined} />{loading ? "추천 중" : "다시 추천"}</button>
        </form>

        {notice ? <p className={styles.sceneAddNotice} role="status">{notice}</p> : null}
        {error ? <p className={styles.sceneAddError} role="alert">{error}</p> : null}
        <div className={styles.sceneRecommendationList} aria-busy={loading}>
          {loading ? <div className={styles.sceneAddEmpty}>진료과에 맞는 장면을 찾고 있습니다.</div> : null}
          {!loading && !recommendations.length ? <div className={styles.sceneAddEmpty}>새로 추천할 장면이 없습니다. 빈 장면을 추가해 직접 작성할 수 있습니다.</div> : null}
          {!loading ? recommendations.map((item) => {
            const checked = selected.has(item.id);
            return <button key={item.id} type="button" className={`${styles.sceneRecommendationRow} ${checked ? styles.sceneRecommendationSelected : ""}`} aria-pressed={checked} onClick={() => toggle(item.id)}>
              <span className={styles.sceneRecommendationCheck}>{checked ? <Check size={14} /> : null}</span>
              <span className={styles.sceneRecommendationCopy}><strong>{item.name}</strong><small>{item.reason}</small><p>{item.description}</p></span>
              <span className={styles.sceneRecommendationMeta}><small>{item.groupName} · {item.spaceText || "장소 미정"}</small><small>{item.minutes}분 · {item.media === "photo_video" ? "사진 + 영상" : item.media === "none" ? "촬영 없음" : "사진"}</small></span>
            </button>;
          }) : null}
        </div>

        <footer className={styles.sceneAddFooter}>
          <button type="button" className={styles.sceneAddBlank} disabled={adding} onClick={() => void addBlank()}><Plus size={14} />빈 장면 추가</button>
          <div><small>{selected.size ? `${selected.size}개 장면을 추가합니다.` : "추천 장면을 먼저 선택하세요."}</small><button type="button" className={styles.sceneAddPrimary} disabled={!selected.size || adding} onClick={() => void addSelected()}>{adding ? "추가 중…" : `선택한 장면 추가${selected.size ? ` (${selected.size})` : ""}`}</button></div>
        </footer>
      </section>
    </div>
  );
}
