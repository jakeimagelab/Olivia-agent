"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Save, Send } from "lucide-react";
import { PortalCard, PortalError, PortalLoading, PortalPageShell } from "../_components/PortalShell";
import { usePortalDashboard } from "../_hooks/usePortalDashboard";

export default function PortalPreparationPage() {
  const { session, token, data, loading, error, dataError } = usePortalDashboard();
  const [items, setItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const loadItems = useCallback(async () => {
    if (!token) return;
    setItemsLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/client-portal/preparation", { headers: { "x-portal-token": token } });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "촬영 준비 항목을 불러오지 못했습니다.");
      setItems(payload.items ?? []);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "촬영 준비 항목을 불러오지 못했습니다.");
    } finally {
      setItemsLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const updateValue = (id: string, value: unknown) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, value: { value } } : item));
    setMessage("");
  };

  const save = async () => {
    if (busy) return;
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch("/api/client-portal/preparation", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-portal-token": token },
        body: JSON.stringify({ values: items.filter((item) => item.status !== "confirmed").map((item) => ({ id: item.id, value: item.value })) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "입력 내용을 저장하지 못했습니다.");
      setItems(payload.items ?? items);
      setMessage("입력 내용을 저장했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "입력 내용을 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const submit = async () => {
    if (busy) return;
    setBusy("submit");
    setMessage("");
    try {
      const saveResponse = await fetch("/api/client-portal/preparation", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-portal-token": token },
        body: JSON.stringify({ values: items.filter((item) => item.status !== "confirmed").map((item) => ({ id: item.id, value: item.value })) }),
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok || !saved.ok) throw new Error(saved.error || "입력 내용을 저장하지 못했습니다.");
      const response = await fetch("/api/client-portal/preparation", {
        method: "POST",
        headers: { "x-portal-token": token },
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "촬영 준비 정보를 제출하지 못했습니다.");
      setMessage("촬영 준비 정보를 담당자에게 제출했습니다.");
      await loadItems();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "촬영 준비 정보를 제출하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  if (loading || itemsLoading) return <PortalLoading />;
  if (!session || error || dataError || loadError) return <PortalError message={error || dataError || loadError || "프로젝트를 불러오지 못했습니다."} />;
  const run = data.workflowRun;
  const allConfirmed = items.length > 0 && items.every((item) => item.status === "confirmed");
  const submitted = items.some((item) => item.status === "submitted");

  return (
    <PortalPageShell session={session} active="촬영 준비">
      <main className="pcrm-portal-subpage">
        <div className="pcrm-portal-subpage-title">
          <span>PCRM · PREPARATION</span>
          <h1>촬영 준비</h1>
          <p>필요한 정보를 입력한 뒤 담당자에게 제출해 주세요. 제출 전까지 자유롭게 임시 저장할 수 있습니다.</p>
        </div>
        <div className="pcrm-preparation-grid">
          <PortalCard className="pcrm-preparation-form">
            <header>
              <div><h2>준비 정보</h2><p>필수 항목은 <b>*</b>로 표시됩니다.</p></div>
              <span className={allConfirmed ? "is-confirmed" : submitted ? "is-submitted" : ""}>
                {allConfirmed ? "관리자 확인 완료" : submitted ? "확인 대기" : "작성 중"}
              </span>
            </header>
            {items.length === 0 ? (
              <div className="pcrm-client-empty">담당자가 준비 항목을 설정하면 이곳에 표시됩니다.</div>
            ) : items.map((item) => {
              const current = item.value?.value ?? "";
              const locked = item.status === "confirmed";
              return (
                <label key={item.id} className="pcrm-preparation-field">
                  <span>{item.title}{item.is_required && <b> *</b>}<small>{item.description}</small></span>
                  {item.input_type === "textarea" ? (
                    <textarea value={String(current)} disabled={locked} maxLength={20000} onChange={(event) => updateValue(item.id, event.target.value)} />
                  ) : item.input_type === "boolean" ? (
                    <input type="checkbox" checked={Boolean(current)} disabled={locked} onChange={(event) => updateValue(item.id, event.target.checked)} />
                  ) : (
                    <input type={item.input_type === "date" ? "date" : "text"} value={String(current)} disabled={locked} maxLength={20000} onChange={(event) => updateValue(item.id, event.target.value)} />
                  )}
                  {item.status === "revision_requested" && <em>담당자가 내용 보완을 요청했습니다.</em>}
                </label>
              );
            })}
            {message && <p className="pcrm-form-message">{message}</p>}
            {items.length > 0 && !allConfirmed && (
              <footer>
                <button type="button" disabled={Boolean(busy)} onClick={() => void save()}><Save size={14} />{busy === "save" ? "저장 중" : "임시 저장"}</button>
                <button type="button" className="is-primary" disabled={Boolean(busy)} onClick={() => void submit()}><Send size={14} />{busy === "submit" ? "제출 중" : "담당자에게 제출"}</button>
              </footer>
            )}
          </PortalCard>
          <PortalCard className="pcrm-preparation-summary">
            {allConfirmed ? <CheckCircle2 size={20} /> : <CalendarDays size={20} />}
            <span>촬영 예정일</span>
            <strong>{run?.shoot_date ? new Date(run.shoot_date).toLocaleDateString("ko-KR") : "일정 미정"}</strong>
            <p>{run?.project_memo || "담당 매니저가 필요한 준비사항을 안내해 드립니다."}</p>
          </PortalCard>
        </div>
      </main>
    </PortalPageShell>
  );
}
