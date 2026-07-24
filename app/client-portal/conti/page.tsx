"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, FileText, MessageSquareText, RotateCcw } from "lucide-react";
import { getPcrmSceneKey } from "@/lib/pcrm/collaboration";
import { PortalCard, PortalError, PortalLoading, PortalPageShell } from "../_components/PortalShell";
import { usePortalDashboard } from "../_hooks/usePortalDashboard";

export default function PortalContiPage() {
  const { session, token, data, loading, error, dataError } = usePortalDashboard();
  const [feedbackRows, setFeedbackRows] = useState<any[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [editing, setEditing] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const contis = useMemo(() => data?.contiSaves ?? [], [data?.contiSaves]);

  useEffect(() => {
    if (!token || !data) return;
    let active = true;
    setFeedbackLoading(true);
    Promise.all(contis.map(async (conti: any) => {
      const response = await fetch(`/api/client-portal/conti-feedback?contiId=${encodeURIComponent(conti.id)}`, {
        headers: { "x-portal-token": token },
      });
      const payload = await response.json();
      return response.ok && payload.ok ? payload.feedback ?? [] : [];
    })).then((groups) => {
      if (active) setFeedbackRows(groups.flat());
    }).finally(() => active && setFeedbackLoading(false));
    return () => { active = false; };
  }, [token, data, contis]);

  const submit = async (contiId: string, scene: Record<string, unknown>, sceneIndex: number, status: string) => {
    const sceneKey = getPcrmSceneKey(scene, sceneIndex);
    if (busy) return;
    setBusy(`${contiId}-${sceneKey}`);
    setMessage("");
    try {
      const response = await fetch("/api/client-portal/conti-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal-token": token },
        body: JSON.stringify({
          contiId,
          sceneKey,
          sceneIndex,
          status,
          feedback: drafts[`${contiId}-${sceneKey}`] ?? "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "피드백을 저장하지 못했습니다.");
      setFeedbackRows((current) => [payload.feedback, ...current.filter((item) =>
        !(item.conti_id === contiId && item.scene_key === sceneKey)
      )]);
      setEditing("");
      setMessage("담당자에게 피드백을 전달했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "피드백을 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  if (loading || feedbackLoading) return <PortalLoading />;
  if (!session || error || dataError) return <PortalError message={error || dataError || "프로젝트를 불러오지 못했습니다."} />;

  return (
    <PortalPageShell session={session} active="콘티">
      <main className="pcrm-portal-subpage">
        <div className="pcrm-portal-subpage-title"><span>PCRM · CONTI</span><h1>촬영 콘티</h1><p>장면별로 승인하거나 의견과 수정 요청을 남길 수 있습니다.</p></div>
        {message && <p className="pcrm-page-message">{message}</p>}
        {contis.length === 0 ? (
          <PortalCard><div className="pcrm-client-empty">아직 공개된 촬영 콘티가 없습니다.</div></PortalCard>
        ) : contis.map((conti: any) => {
          const scenes = Array.isArray(conti.result?.conti) ? conti.result.conti : [];
          return (
            <PortalCard key={conti.id} className="pcrm-conti-card">
              <header><FileText size={19} /><div><h2>{conti.title || "촬영 콘티"}</h2><span>장면 {scenes.length}개 · 장면별 피드백 가능</span></div></header>
              <div>{scenes.map((scene: any, index: number) => {
                const sceneKey = getPcrmSceneKey(scene, index);
                const formKey = `${conti.id}-${sceneKey}`;
                const row = feedbackRows.find((item) => item.conti_id === conti.id && item.scene_key === sceneKey);
                return (
                  <article key={sceneKey} className="pcrm-conti-scene">
                    <b>{index + 1}</b>
                    <div className="pcrm-conti-scene-body">
                      <strong>{scene.category || scene.title || "촬영 장면"}</strong>
                      {scene.description && <p>{scene.description}</p>}
                      {scene.location && <span>{scene.location}</span>}
                      {row && (
                        <div className={`pcrm-conti-feedback-state is-${row.status}`}>
                          <b>{row.status === "approved" ? "승인" : row.status === "revision_requested" ? "수정 요청" : row.status === "resolved" ? "답변 완료" : "의견"}</b>
                          {row.feedback && <p>{row.feedback}</p>}
                          {row.admin_reply && <blockquote><strong>담당자 답변</strong>{row.admin_reply}</blockquote>}
                        </div>
                      )}
                      {editing === formKey ? (
                        <div className="pcrm-conti-feedback-form">
                          <textarea
                            value={drafts[formKey] ?? row?.feedback ?? ""}
                            onChange={(event) => setDrafts((current) => ({ ...current, [formKey]: event.target.value }))}
                            placeholder="촬영 장면에 대한 의견을 적어주세요."
                            maxLength={2000}
                            autoFocus
                          />
                          <div>
                            <button type="button" onClick={() => setEditing("")}>취소</button>
                            <button type="button" disabled={busy === formKey} onClick={() => void submit(conti.id, scene, index, "commented")}><MessageSquareText size={13} /> 의견 남기기</button>
                            <button type="button" className="is-warning" disabled={busy === formKey} onClick={() => void submit(conti.id, scene, index, "revision_requested")}><RotateCcw size={13} /> 수정 요청</button>
                          </div>
                        </div>
                      ) : (
                        <div className="pcrm-conti-scene-actions">
                          <button type="button" onClick={() => setEditing(formKey)}><MessageSquareText size={13} /> 의견</button>
                          <button type="button" className="is-primary" disabled={row?.status === "approved" || busy === formKey} onClick={() => void submit(conti.id, scene, index, "approved")}><Check size={13} /> {row?.status === "approved" ? "승인됨" : "이 장면 승인"}</button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}</div>
            </PortalCard>
          );
        })}
      </main>
    </PortalPageShell>
  );
}
