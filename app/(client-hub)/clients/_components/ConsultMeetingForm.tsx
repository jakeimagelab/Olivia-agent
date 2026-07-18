"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Contact } from "lucide-react";
import { C } from "@/lib/theme";
import { ACTIVE_WORKFLOW_STEPS } from "@/lib/workflow";

/* Contact Picker API — 안드로이드 Chrome 등 일부 브라우저만 지원, lib.dom에 타입이 없어 직접 선언 */
type ContactPickerProperty = "name" | "tel" | "email";
type ContactPickerResult = { name?: string[]; tel?: string[]; email?: string[] };
declare global {
  interface Navigator {
    contacts?: {
      select: (properties: ContactPickerProperty[], options?: { multiple?: boolean }) => Promise<ContactPickerResult[]>;
    };
  }
}

const iS: React.CSSProperties = {
  width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8,
  padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit",
  outline: "none", background: C.white, color: C.txt, boxSizing: "border-box",
};

/* DB 컬럼에 1:1 대응하는 폼 타입 */
type F = {
  name: string;         // → hospital_name
  manager_name: string; // → contact_name (담당자)
  phone: string;        // → phone
  email: string;        // → email
  department: string;   // → specialty
};

const EMPTY: F = {
  name: "", manager_name: "", phone: "", email: "", department: "",
};

interface Props {
  initialValues?: Partial<F>;
  onCancel?: () => void;
  onSuccess?: (clientId: string) => void;
}

export default function ConsultMeetingForm({ initialValues, onCancel, onSuccess }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<F>({ ...EMPTY, ...initialValues });
  const [memo, setMemo] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [startStepKey, setStartStepKey] = useState<string>(ACTIVE_WORKFLOW_STEPS[0].key);
  const [contactSupported, setContactSupported] = useState(false);

  useEffect(() => {
    setContactSupported(typeof navigator !== "undefined" && !!navigator.contacts?.select);
  }, []);

  const set =
    (k: keyof F) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

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

  const startStepIdx = ACTIVE_WORKFLOW_STEPS.findIndex((s) => s.key === startStepKey);

  const extract = async () => {
    if (!memo.trim()) return;
    setExtracting(true); setMsg(null);
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_memo: memo }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "추출 실패");

      setForm((prev) => ({
        name:         prev.name         || d.hospital_name  || "",
        manager_name: prev.manager_name || d.manager_name   || d.contact_name || "",
        phone:        prev.phone        || d.phone          || "",
        email:        prev.email        || d.email          || "",
        department:   prev.department   || d.department     || d.specialty    || "",
      }));
      setMsg({ text: "AI 추출 완료 — 내용을 확인하고 필요하면 수정하세요.", ok: true });
    } catch (e: any) {
      setMsg({ text: e.message || "AI 추출 중 오류가 발생했습니다.", ok: false });
    } finally {
      setExtracting(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:         form.name,
          manager_name: form.manager_name || null,
          phone:        form.phone        || null,
          email:        form.email        || null,
          department:   form.department   || null,
          memo:         memo.trim()       || null,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "등록 실패");
      if (onSuccess) onSuccess(d.id);
      else router.push(`/clients?id=${d.id}`);
    } catch (e: any) {
      setMsg({ text: e.message || "등록 중 오류가 발생했습니다.", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const FIELDS: { key: keyof F; label: string; placeholder: string; type?: string }[] = [
    { key: "name",         label: "병원이름 *",  placeholder: "포토클리닉",            type: "text" },
    { key: "manager_name", label: "담당자",       placeholder: "정연호 / 정연호 원장",  type: "text" },
    { key: "phone",        label: "연락처",       placeholder: "010-1234-5678",        type: "tel"  },
    { key: "email",        label: "이메일",       placeholder: "contact@clinic.com",   type: "email"},
    { key: "department",   label: "진료과",       placeholder: "피부과, 성형외과",      type: "text" },
  ];

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* 기본 정보 */}
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", background: "rgba(21,88,85,.03)", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>병원 기본 정보</div>
          <div style={{ fontSize: 11, color: C.hint, marginTop: 2 }}>등록 후 고객 상세에서 언제든 수정할 수 있습니다.</div>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          {/* 병원이름 + 담당자 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {FIELDS.slice(0, 2).map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>{label}</label>
                <input
                  type={type}
                  value={form[key]}
                  onChange={set(key)}
                  placeholder={placeholder}
                  required={key === "name"}
                  style={iS}
                />
              </div>
            ))}
          </div>
          {/* 연락처 + 이메일 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {FIELDS.slice(2, 4).map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>{label}</label>
                <input
                  type={type}
                  value={form[key]}
                  onChange={set(key)}
                  placeholder={placeholder}
                  style={iS}
                />
              </div>
            ))}
          </div>
          {/* 진료과 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>진료과</label>
            <input
              type="text"
              value={form.department}
              onChange={set("department")}
              placeholder="피부과, 성형외과"
              style={iS}
            />
          </div>
        </div>
      </div>

      {/* AI 메모 추출 */}
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", background: "rgba(124,58,237,.03)", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#7C3AED" }}>상담 메모 (AI 자동 추출)</div>
          <div style={{ fontSize: 11, color: C.hint, marginTop: 2 }}>자유롭게 적으면 AI가 위 필드를 자동으로 채웁니다. 메모는 그대로 저장됩니다.</div>
        </div>
        <div style={{ padding: 18 }}>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={5}
            placeholder={"오늘 포토클리닉 정연호 실장님과 통화. 010-0000-0000, photoclnic@gmail.com\n피부과 전문으로 리프팅 시술 위주 촬영 희망. 예산 150만원 내외, 평일 오전 선호."}
            style={{ ...iS, height: "auto", padding: "12px", resize: "vertical", lineHeight: 1.7, fontSize: 12 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              type="button"
              onClick={extract}
              disabled={!memo.trim() || extracting}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 18px", background: extracting ? "#E5D4FF" : "#7C3AED",
                color: "#fff", border: "none", borderRadius: 8,
                fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                cursor: !memo.trim() || extracting ? "not-allowed" : "pointer",
                opacity: !memo.trim() ? 0.5 : 1,
              }}
            >
              {extracting ? "분석 중..." : "✨ AI로 정보 추출"}
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
          background: msg.ok ? C.light : "#FFF0F0", color: msg.ok ? C.green : C.orange,
        }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          style={{
            flex: 1, height: 48, border: "none", borderRadius: 12,
            background: saving || !form.name.trim() ? C.hint : C.teal,
            color: "#fff", fontWeight: 900, fontSize: 15,
            cursor: saving || !form.name.trim() ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >
          {saving ? "등록 중..." : "✓ 고객 등록 + 워크플로우 시작"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              height: 48, padding: "0 24px", border: `1.5px solid ${C.border}`, borderRadius: 12,
              background: C.white, color: C.muted, fontWeight: 700, fontSize: 14,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
