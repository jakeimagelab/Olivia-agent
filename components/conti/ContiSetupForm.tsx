"use client";

import type { ChangeEvent, FormEvent, RefObject } from "react";
import Link from "next/link";
import { FileText, FileUp, Library, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import type { ContiFormState, LocationItem, PatientItem, StaffItem } from "./types";

type Props = {
  form: ContiFormState;
  loading: boolean;
  error: string;
  pdfLoading: boolean;
  pdfError: string;
  pdfInputRef: RefObject<HTMLInputElement | null>;
  quickSpecialties: string[];
  quickLoading: boolean;
  quickError: string;
  specialtyOptions: readonly string[];
  staffRolePresets: readonly string[];
  patientTypePresets: readonly string[];
  onSubmit: (event: FormEvent) => void;
  onFieldChange: <K extends keyof ContiFormState>(field: K, value: ContiFormState[K]) => void;
  onPdfImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenLoad: () => void;
  onQuickSpecialtiesChange: (value: string[]) => void;
  onQuickGenerate: () => void;
};

const inputStyle = { minHeight: 42, fontSize: 13, width: "100%" } as const;

function DeleteButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label="삭제" style={{ width: 34, height: 34, border: "1px solid #fecaca", borderRadius: 6, background: "#fff", color: "#dc2626", cursor: "pointer" }}><Trash2 size={14} /></button>;
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, padding: "7px 12px", border: "1px dashed rgba(21,88,85,.35)", borderRadius: 7, background: "#fff", color: "#155855", fontWeight: 800, cursor: "pointer" }}><Plus size={13} />{label}</button>;
}

export default function ContiSetupForm({
  form, loading, error, pdfLoading, pdfError, pdfInputRef, quickSpecialties, quickLoading,
  quickError, specialtyOptions, staffRolePresets, patientTypePresets, onSubmit, onFieldChange,
  onPdfImport, onOpenLoad, onQuickSpecialtiesChange, onQuickGenerate,
}: Props) {
  const updateStaff = (index: number, patch: Partial<StaffItem>) => onFieldChange("staffItems", form.staffItems.map((item, i) => i === index ? { ...item, ...patch } : item));
  const updatePatient = (index: number, patch: Partial<PatientItem>) => onFieldChange("patientItems", form.patientItems.map((item, i) => i === index ? { ...item, ...patch } : item));
  const updateLocation = (index: number, patch: Partial<LocationItem>) => onFieldChange("locationItems", form.locationItems.map((item, i) => i === index ? { ...item, ...patch } : item));

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <Link href="/conti-library" className="admin-secondary-link"><Library size={15} /> 사례 라이브러리</Link>
        <button type="button" onClick={onOpenLoad} className="admin-secondary-link"><FileText size={15} /> 이전 콘티 불러오기</button>
        <input ref={pdfInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" hidden onChange={onPdfImport} />
        <button type="button" onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading} className="admin-secondary-link">
          <FileUp size={15} /> {pdfLoading ? "파일 인식 중..." : "PDF / 이미지 불러오기"}
        </button>
      </div>
      {pdfError ? <p style={{ color: "#dc2626", fontSize: 12 }}>⚠ {pdfError}</p> : null}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 18, background: "#fff", border: "1px solid rgba(21,88,85,.14)", borderRadius: 14, padding: 24 }}>
        <div>
          <h2 style={{ margin: 0, color: "#155855", fontSize: 20 }}>촬영에 필요한 핵심 정보만 입력하세요</h2>
        </div>
        <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <label className="field"><span>촬영명 *</span><input required value={form.shootTitle} onChange={(e) => onFieldChange("shootTitle", e.target.value)} placeholder="예: 9월 홈페이지 촬영" /></label>
          <label className="field"><span>촬영 목적 *</span><input required value={form.purpose} onChange={(e) => onFieldChange("purpose", e.target.value)} placeholder="예: 홈페이지 메인과 의료진 소개" /></label>
          <label className="field"><span>촬영 공간</span><input value={form.locationItems[0]?.spaces || ""} onChange={(e) => onFieldChange("locationItems", [{ ...(form.locationItems[0] || { floor: "", notes: "" }), spaces: e.target.value }, ...form.locationItems.slice(1)])} placeholder="예: 로비, 진료실, 시술실" /></label>
          <label className="field"><span>주요 인물</span><input value={form.mainPeople} onChange={(e) => onFieldChange("mainPeople", e.target.value)} placeholder="예: 원장 2명, 간호사 3명, 환자 모델" /></label>
        </div>
        <label className="field"><span>꼭 필요한 장면</span><textarea value={form.requiredScenes} onChange={(e) => onFieldChange("requiredScenes", e.target.value)} placeholder="예: 원장 상담, 레이저 시술, 직원 단체 사진" style={{ minHeight: 76 }} /></label>
        <label className="field"><span>참고사항</span><textarea value={form.notes} onChange={(e) => onFieldChange("notes", e.target.value)} placeholder="촬영 순서나 피해야 할 요소를 적어주세요" style={{ minHeight: 64 }} /></label>

        <details style={{ borderTop: "1px solid rgba(21,88,85,.12)", paddingTop: 14 }}>
          <summary style={{ color: "#155855", fontWeight: 800, cursor: "pointer" }}>상세 설정 및 기존 데이터</summary>
          <div style={{ display: "grid", gap: 18, marginTop: 16 }}>
            <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 100px 100px", gap: 10 }}>
              <label className="field"><span>병원/고객명</span><input value={form.hospitalName} onChange={(e) => onFieldChange("hospitalName", e.target.value)} /></label>
              <label className="field"><span>진료과</span><select multiple value={form.specialties} onChange={(e) => onFieldChange("specialties", Array.from(e.target.selectedOptions, (option) => option.value))} style={{ minHeight: 86 }}>{specialtyOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
              <label className="field"><span>원장</span><input type="number" min="0" value={form.doctors} onChange={(e) => onFieldChange("doctors", e.target.value)} /></label>
              <label className="field"><span>부원장</span><input type="number" min="0" value={form.viceDirectors} onChange={(e) => onFieldChange("viceDirectors", e.target.value)} /></label>
            </div>

            <div><strong>직원 구성</strong>{form.staffItems.map((item, index) => <div key={index} className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "160px 80px 1fr 36px", gap: 8, marginTop: 8 }}><input list={`conti-staff-${index}`} value={item.role} onChange={(e) => updateStaff(index, { role: e.target.value })} style={inputStyle} /><datalist id={`conti-staff-${index}`}>{staffRolePresets.map((role) => <option key={role} value={role} />)}</datalist><input type="number" min="1" value={item.count} onChange={(e) => updateStaff(index, { count: Number(e.target.value) || 1 })} style={inputStyle} /><input value={item.detail} onChange={(e) => updateStaff(index, { detail: e.target.value })} placeholder="촬영 역할" style={inputStyle} /><DeleteButton onClick={() => onFieldChange("staffItems", form.staffItems.filter((_, i) => i !== index))} /></div>)}<AddButton label="직원 추가" onClick={() => onFieldChange("staffItems", [...form.staffItems, { role: "", count: 1, detail: "" }])} /></div>
            <div><strong>환자 모델</strong>{form.patientItems.map((item, index) => <div key={index} className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "200px 80px 1fr 36px", gap: 8, marginTop: 8 }}><input list={`conti-patient-${index}`} value={item.type} onChange={(e) => updatePatient(index, { type: e.target.value })} style={inputStyle} /><datalist id={`conti-patient-${index}`}>{patientTypePresets.map((type) => <option key={type} value={type} />)}</datalist><input type="number" min="1" value={item.count} onChange={(e) => updatePatient(index, { count: Number(e.target.value) || 1 })} style={inputStyle} /><input value={item.detail} onChange={(e) => updatePatient(index, { detail: e.target.value })} placeholder="촬영 상황" style={inputStyle} /><DeleteButton onClick={() => onFieldChange("patientItems", form.patientItems.filter((_, i) => i !== index))} /></div>)}<AddButton label="환자 모델 추가" onClick={() => onFieldChange("patientItems", [...form.patientItems, { type: "", count: 1, detail: "" }])} /></div>
            <div><strong>촬영 공간 상세</strong>{form.locationItems.map((item, index) => <div key={index} className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 36px", gap: 8, marginTop: 8 }}><input value={item.floor} onChange={(e) => updateLocation(index, { floor: e.target.value })} placeholder="층/구역" style={inputStyle} /><input value={item.spaces} onChange={(e) => updateLocation(index, { spaces: e.target.value })} placeholder="공간" style={inputStyle} /><input value={item.notes} onChange={(e) => updateLocation(index, { notes: e.target.value })} placeholder="비고" style={inputStyle} /><DeleteButton onClick={() => onFieldChange("locationItems", form.locationItems.filter((_, i) => i !== index))} /></div>)}<AddButton label="장소 추가" onClick={() => onFieldChange("locationItems", [...form.locationItems, { floor: "", spaces: "", notes: "" }])} /></div>
          </div>
        </details>

        {error ? <p style={{ color: "#dc2626", fontWeight: 800, margin: 0 }}>⚠ {error}</p> : null}
        <button className="admin-primary-button" type="submit" disabled={loading} style={{ width: "fit-content", padding: "0 32px" }}><Sparkles size={17} /> {loading ? "AI 생성 중…" : "콘티 초안 만들기"}</button>
      </form>

      <details style={{ marginTop: 14, background: "#F0F9F8", border: "1px solid rgba(21,88,85,.14)", borderRadius: 12, padding: 16 }}>
        <summary style={{ color: "#155855", fontWeight: 800, cursor: "pointer" }}><Zap size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />진료과 기본 콘티 빠른 생성</summary>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>{specialtyOptions.map((specialty) => <button key={specialty} type="button" onClick={() => onQuickSpecialtiesChange(quickSpecialties.includes(specialty) ? quickSpecialties.filter((item) => item !== specialty) : [...quickSpecialties, specialty])} style={{ padding: "6px 10px", borderRadius: 99, border: "1px solid #155855", background: quickSpecialties.includes(specialty) ? "#155855" : "#fff", color: quickSpecialties.includes(specialty) ? "#fff" : "#155855", cursor: "pointer" }}>{specialty}</button>)}</div>
        {quickError ? <p style={{ color: "#dc2626", fontSize: 12 }}>⚠ {quickError}</p> : null}
        <button type="button" onClick={onQuickGenerate} disabled={quickLoading} className="admin-primary-button" style={{ marginTop: 14 }}><Zap size={15} /> {quickLoading ? "생성 중…" : "기본 콘티 바로 생성"}</button>
      </details>
    </section>
  );
}
