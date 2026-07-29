"use client";

import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { C, R } from "@/lib/theme";

type Props = {
  clientId: string;
  clientName: string;
  run: {
    id: string;
    project_name?: string;
    project_type?: string;
    shooting_type?: string;
    manager_name?: string;
    consultation_date?: string | null;
    shoot_date?: string | null;
    start_date?: string | null;
    expected_completion_date?: string | null;
    expected_contract_amount?: number | null;
    project_memo?: string;
  };
  onClose: () => void;
  onUpdated: () => void;
};

const PROJECT_TYPES = [
  "병원 브랜드 촬영",
  "의료진 프로필",
  "진료 연출",
  "인테리어 촬영",
  "브랜드필름",
  "유튜브 콘텐츠",
  "홈페이지 제작",
  "정기 구독 촬영",
  "기타",
];

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  boxSizing: "border-box",
  border: `1px solid ${C.border}`,
  borderRadius: R.sm,
  padding: "0 12px",
  background: C.white,
  color: C.ink,
  font: "inherit",
  fontSize: 12,
  outline: "none",
};

export default function EditPcrmProjectDialog({ clientId, clientName, run, onClose, onUpdated }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    projectName: run.project_name || `${clientName} 프로젝트`,
    projectType: run.project_type || "병원 브랜드 촬영",
    shootingType: run.shooting_type || "",
    managerName: run.manager_name || "",
    consultationDate: run.consultation_date || "",
    shootDate: run.shoot_date || "",
    startDate: run.start_date || "",
    expectedCompletionDate: run.expected_completion_date || "",
    expectedContractAmount: run.expected_contract_amount != null ? String(run.expected_contract_amount) : "",
    projectMemo: run.project_memo || "",
  });

  const set = (key: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${clientId}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, runId: run.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "프로젝트를 수정하지 못했습니다.");
      onUpdated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "프로젝트를 수정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pcrm-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="pcrm-project-dialog" onSubmit={submit}>
        <header>
          <div><span>PCRM · PROJECT</span><h2>프로젝트 정보 수정</h2><p>{clientName} 고객의 프로젝트 정보를 수정합니다.</p></div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <div className="pcrm-project-form-grid">
          <label className="is-wide">프로젝트명<input required maxLength={200} value={form.projectName} onChange={set("projectName")} style={fieldStyle} /></label>
          <label>프로젝트 유형<select value={form.projectType} onChange={set("projectType")} style={fieldStyle}>{PROJECT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>촬영 유형<input value={form.shootingType} onChange={set("shootingType")} placeholder="사진, 영상, 혼합" style={fieldStyle} /></label>
          <label>담당 매니저<input value={form.managerName} onChange={set("managerName")} placeholder="담당자명" style={fieldStyle} /></label>
          <label>상담일<input type="date" value={form.consultationDate} onChange={set("consultationDate")} style={fieldStyle} /></label>
          <label>촬영 예정일<input type="date" value={form.shootDate} onChange={set("shootDate")} style={fieldStyle} /></label>
          <label>시작일<input type="date" value={form.startDate} onChange={set("startDate")} style={fieldStyle} /></label>
          <label>예상 완료일<input type="date" value={form.expectedCompletionDate} onChange={set("expectedCompletionDate")} style={fieldStyle} /></label>
          <label>계약 예정 금액<input type="number" min={0} step={10000} value={form.expectedContractAmount} onChange={set("expectedContractAmount")} placeholder="0" style={fieldStyle} /></label>
          <label className="is-wide">프로젝트 메모<textarea value={form.projectMemo} onChange={set("projectMemo")} rows={3} maxLength={10000} style={{ ...fieldStyle, height: "auto", padding: 12, resize: "vertical" }} /></label>
        </div>

        {error && <p className="pcrm-dialog-error">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit" disabled={saving}>{saving ? "저장 중..." : "저장"}</button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
