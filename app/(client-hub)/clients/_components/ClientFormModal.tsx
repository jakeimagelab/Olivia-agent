"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Contact, X } from "lucide-react";
import { C } from "@/lib/theme";

type ContactPickerProperty = "name" | "tel" | "email";
type ContactPickerResult = { name?: string[]; tel?: string[]; email?: string[] };
declare global {
  interface Navigator {
    contacts?: {
      select: (properties: ContactPickerProperty[], options?: { multiple?: boolean }) => Promise<ContactPickerResult[]>;
    };
  }
}

type FormState = {
  name: string;
  director_name: string;
  manager_name: string;
  phone: string;
  department: string;
  email: string;
  address: string;
  website_url: string;
  instagram_url: string;
  naver_place_url: string;
  manager_staff: string;
  referral_source: string;
  notes: string;
  memo: string;
};

const EMPTY: FormState = {
  name: "", director_name: "", manager_name: "", phone: "", department: "",
  email: "", address: "", website_url: "", instagram_url: "", naver_place_url: "",
  manager_staff: "", referral_source: "", notes: "", memo: "",
};

export type ClientEditSource = {
  id: string;
  name: string;
  director_name?: string;
  manager_name?: string;
  phone?: string;
  department?: string;
  email?: string;
  address?: string;
  website_url?: string;
  instagram_url?: string;
  naver_place_url?: string;
  manager_staff?: string;
  referral_source?: string;
  notes?: string;
  memo?: string;
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  client?: ClientEditSource | null;
  onClose: () => void;
  onSaved: (clientId: string) => void;
  onSavedAndNewProject?: (clientId: string) => void;
};

// 간소화(2026-08-09) — 기본 화면엔 병원명/연락처/담당자만 보여주고 나머지는 "상세 정보
// 펼치기"로 옮긴다. DB상 실제로 필수인 값은 병원명뿐이라(lib/clients/createClientWithWorkflow.ts
// 참고) 나머지는 폼 검증에서도 필수 해제한다 — 등록 마찰을 줄이는 게 목적.
const REQUIRED_FIELDS: (keyof FormState)[] = ["name"];

function toFormState(client?: ClientEditSource | null): FormState {
  if (!client) return { ...EMPTY };
  return {
    name: client.name || "",
    director_name: client.director_name || "",
    manager_name: client.manager_name || "",
    phone: client.phone || "",
    department: client.department || "",
    email: client.email || "",
    address: client.address || "",
    website_url: client.website_url || "",
    instagram_url: client.instagram_url || "",
    naver_place_url: client.naver_place_url || "",
    manager_staff: client.manager_staff || "",
    referral_source: client.referral_source || "",
    notes: client.notes || "",
    memo: client.memo || "",
  };
}

export default function ClientFormModal({ open, mode, client, onClose, onSaved, onSavedAndNewProject }: Props) {
  const [form, setForm] = useState<FormState>(() => toFormState(client));
  const [aiMemo, setAiMemo] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState<"save" | "save_project" | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [contactSupported, setContactSupported] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(toFormState(client));
      setAiMemo("");
      setErrors({});
      setMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client?.id]);

  useEffect(() => {
    setContactSupported(typeof navigator !== "undefined" && !!navigator.contacts?.select);
  }, []);

  if (!open || typeof document === "undefined") return null;

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const pickContact = async () => {
    if (!navigator.contacts) return;
    try {
      const [picked] = await navigator.contacts.select(["name", "tel", "email"], { multiple: false });
      if (!picked) return;
      setForm((prev) => ({
        ...prev,
        manager_name: picked.name?.[0] || prev.manager_name,
        phone: picked.tel?.[0] || prev.phone,
        email: picked.email?.[0] || prev.email,
      }));
    } catch {
      /* 사용자가 선택 취소한 경우 등 — 조용히 무시 */
    }
  };

  const extractFromMemo = async () => {
    if (!aiMemo.trim()) return;
    setExtracting(true); setMessage(null);
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_memo: aiMemo }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "추출 실패");
      setForm((prev) => ({
        ...prev,
        name: prev.name || d.hospital_name || "",
        manager_name: prev.manager_name || d.manager_name || d.contact_name || "",
        phone: prev.phone || d.phone || "",
        email: prev.email || d.email || "",
        department: prev.department || d.department || d.specialty || "",
      }));
      setMessage({ text: "AI 추출 완료 — 내용을 확인하고 필요하면 수정하세요.", ok: true });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "AI 추출 중 오류가 발생했습니다.", ok: false });
    } finally {
      setExtracting(false);
    }
  };

  const validate = (): boolean => {
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    for (const key of REQUIRED_FIELDS) {
      if (!form[key].trim()) nextErrors[key] = "필수 입력입니다.";
    }
    if (form.phone && !/^[0-9\-+() ]{8,20}$/.test(form.phone.trim())) nextErrors.phone = "연락처 형식을 확인해주세요.";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = "이메일 형식을 확인해주세요.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const checkDuplicateHospital = async (): Promise<boolean> => {
    if (mode !== "create") return true;
    try {
      const res = await fetch(`/api/clients?q=${encodeURIComponent(form.name.trim())}`, { cache: "no-store" });
      const d = await res.json();
      const duplicate = (d.clients ?? []).some((c: any) => c.name?.trim().toLowerCase() === form.name.trim().toLowerCase());
      if (duplicate) {
        return window.confirm(`'${form.name.trim()}' 병원이 이미 등록되어 있습니다. 그래도 계속할까요?`);
      }
      return true;
    } catch {
      return true;
    }
  };

  const buildPayload = () => ({
    name: form.name.trim(),
    hospital_name: form.name.trim(),
    director_name: form.director_name.trim() || null,
    manager_name: form.manager_name.trim() || null,
    phone: form.phone.trim() || null,
    department: form.department.trim() || null,
    email: form.email.trim() || null,
    address: form.address.trim() || null,
    website_url: form.website_url.trim() || null,
    instagram_url: form.instagram_url.trim() || null,
    naver_place_url: form.naver_place_url.trim() || null,
    manager_staff: form.manager_staff.trim() || null,
    referral_source: form.referral_source.trim() || null,
    notes: form.notes.trim() || null,
    memo: (form.memo || aiMemo).trim() || null,
  });

  const save = async (andNewProject: boolean) => {
    if (!validate()) return;
    if (!(await checkDuplicateHospital())) return;
    setSaving(andNewProject ? "save_project" : "save");
    setMessage(null);
    try {
      let clientId = client?.id;
      if (mode === "edit" && clientId) {
        const res = await fetch(`/api/clients/${clientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || "저장 실패");
      } else {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || "등록 실패");
        clientId = d.id;
      }
      if (!clientId) throw new Error("고객 ID를 확인할 수 없습니다.");
      if (andNewProject && onSavedAndNewProject) onSavedAndNewProject(clientId);
      else onSaved(clientId);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.", ok: false });
    } finally {
      setSaving(null);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  const REQUIRED_INPUTS: { key: keyof FormState; label: string; placeholder: string; type?: string }[] = [
    { key: "name", label: "병원명/기관명", placeholder: "포토클리닉" },
    { key: "phone", label: "연락처", placeholder: "010-1234-5678", type: "tel" },
    { key: "manager_name", label: "담당자", placeholder: "정연호 실장" },
  ];
  const OPTIONAL_INPUTS: { key: keyof FormState; label: string; placeholder: string; type?: string }[] = [
    { key: "director_name", label: "원장명", placeholder: "정연호 원장" },
    { key: "department", label: "진료과", placeholder: "피부과, 성형외과" },
    { key: "email", label: "이메일", placeholder: "contact@clinic.com", type: "email" },
    { key: "address", label: "병원 주소", placeholder: "서울시 강남구 ..." },
    { key: "website_url", label: "홈페이지", placeholder: "https://" },
    { key: "instagram_url", label: "인스타그램", placeholder: "https://instagram.com/..." },
    { key: "naver_place_url", label: "네이버플레이스", placeholder: "https://naver.me/..." },
    { key: "manager_staff", label: "담당 매니저", placeholder: "포토클리닉 담당자명" },
    { key: "referral_source", label: "유입 경로", placeholder: "지인 소개, 광고 등" },
  ];

  return createPortal(
    <div className="pcrm-form-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="pcrm-form-modal">
        <header className="pcrm-form-modal__head">
          <div>
            <span>PCRM · CLIENT</span>
            <h2>{mode === "create" ? "고객 등록" : "고객 수정"}</h2>
            <p>{mode === "create" ? "신규 병원 고객 정보를 등록합니다." : "고객 기본 정보를 수정합니다."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </header>

        <form onSubmit={onSubmit} className="pcrm-form-modal__body">
          <section className="pcrm-form-section">
            <div className="pcrm-form-section__head">
              <strong>기본 정보</strong>
              {contactSupported && (
                <button type="button" className="pcrm-form-contact-pick" onClick={pickContact}>
                  <Contact size={13} /> 연락처에서 가져오기
                </button>
              )}
            </div>
            <div className="pcrm-form-grid">
              {REQUIRED_INPUTS.map(({ key, label, placeholder, type }) => (
                <label key={key} className="pcrm-form-field">
                  <span>{label}{key === "name" ? " *" : ""}</span>
                  <input type={type || "text"} value={form[key]} onChange={set(key)} placeholder={placeholder} />
                  {errors[key] && <em>{errors[key]}</em>}
                </label>
              ))}
            </div>
          </section>

          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "transparent",
              color: C.teal, fontSize: 12.5, fontWeight: 800, cursor: "pointer", padding: "4px 0",
            }}
          >
            {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            상세 정보 {detailsOpen ? "접기" : "펼치기"}
          </button>

          {detailsOpen && (
            <section className="pcrm-form-section">
              <div className="pcrm-form-grid">
                {OPTIONAL_INPUTS.map(({ key, label, placeholder, type }) => (
                  <label key={key} className="pcrm-form-field">
                    <span>{label}</span>
                    <input type={type || "text"} value={form[key]} onChange={set(key)} placeholder={placeholder} />
                    {errors[key] && <em>{errors[key]}</em>}
                  </label>
                ))}
                <label className="pcrm-form-field pcrm-form-field--wide">
                  <span>비고</span>
                  <input value={form.notes} onChange={set("notes")} placeholder="기타 참고사항" />
                </label>
              </div>
            </section>
          )}

          <section className="pcrm-form-section">
            <div className="pcrm-form-section__head"><strong>내부 메모 (AI 자동 추출)</strong></div>
            <textarea
              className="pcrm-form-memo"
              value={mode === "edit" ? form.memo : aiMemo}
              onChange={(event) => (mode === "edit" ? set("memo")(event) : setAiMemo(event.target.value))}
              rows={4}
              placeholder={"오늘 포토클리닉 정연호 실장님과 통화. 010-0000-0000\n피부과 전문으로 리프팅 시술 위주 촬영 희망."}
            />
            {mode === "create" && (
              <button type="button" className="pcrm-form-extract" disabled={!aiMemo.trim() || extracting} onClick={() => void extractFromMemo()}>
                {extracting ? "분석 중..." : "✨ AI로 정보 추출"}
              </button>
            )}
          </section>

          {message && <p className={`pcrm-form-message ${message.ok ? "is-ok" : "is-error"}`}>{message.text}</p>}

          <footer className="pcrm-form-modal__footer">
            <button type="button" className="pc-btn pc-btn--ghost" onClick={onClose}>취소</button>
            {mode === "create" && onSavedAndNewProject && (
              <button type="button" className="pc-btn pc-btn--secondary" disabled={saving !== null} onClick={() => void save(true)}>
                {saving === "save_project" ? "저장 중..." : "등록 후 바로 견적서 작성"}
              </button>
            )}
            <button type="submit" className="pc-btn pc-btn--orange" disabled={saving !== null}>
              {saving === "save" ? "저장 중..." : "저장"}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body
  );
}
