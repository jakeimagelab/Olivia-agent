"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const C = {
  teal: "#155855", orange: "#E85D2C", green: "#22876A",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2",
};

const iS: React.CSSProperties = {
  width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8,
  padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit",
  outline: "none", background: C.white, color: C.txt, boxSizing: "border-box",
};

type F = {
  name: string; director_name: string; department: string;
  main_treatments: string; doctor_count: string;
  website_url: string; instagram_url: string; special_notes: string;
};

const EMPTY: F = {
  name: "", director_name: "", department: "", main_treatments: "",
  doctor_count: "", website_url: "", instagram_url: "", special_notes: "",
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

  const set =
    (k: keyof F) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

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

      const mapping: Partial<F> = {
        name: d.hospital_name || "",
        director_name: d.manager_name || "",
        department: d.department || "",
        special_notes: d.special_notes || "",
        doctor_count: d.doctors_count ? String(d.doctors_count) : "",
      };
      setForm((prev) => {
        const n = { ...prev };
        for (const [k, v] of Object.entries(mapping) as [keyof F, string][]) {
          if (!n[k] && v) n[k] = v;
        }
        return n;
      });
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
          ...form,
          doctor_count: form.doctor_count ? parseInt(form.doctor_count, 10) : null,
          memo: memo.trim() || null,
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

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* 구조화 필드 */}
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", background: "rgba(21,88,85,.03)", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>병원 기본 정보</div>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>병원이름 *</label>
              <input value={form.name} onChange={set("name")} placeholder="온유성형외과" style={iS} required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>원장이름</label>
              <input value={form.director_name} onChange={set("director_name")} placeholder="홍길동 원장" style={iS} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>진료과</label>
              <input value={form.department} onChange={set("department")} placeholder="피부과, 성형외과" style={iS} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>의료진 수</label>
              <input type="number" value={form.doctor_count} onChange={set("doctor_count")} placeholder="3" min="1" style={iS} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>주요 진료 / 시술</label>
            <input value={form.main_treatments} onChange={set("main_treatments")} placeholder="리프팅, 보톡스, 필러, 레이저 토닝" style={iS} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>홈페이지</label>
              <input value={form.website_url} onChange={set("website_url")} placeholder="https://clinic.com" style={iS} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>인스타그램</label>
              <input value={form.instagram_url} onChange={set("instagram_url")} placeholder="@clinic_insta" style={iS} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>기타 특이사항</label>
            <textarea
              value={form.special_notes}
              onChange={set("special_notes")}
              placeholder="원장님 직접 응대, 촬영 전 협의 필요 등"
              rows={2}
              style={{ ...iS, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.6 }}
            />
          </div>
        </div>
      </div>

      {/* AI 메모 추출 */}
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", background: "rgba(124,58,237,.03)", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#7C3AED" }}>빠른 메모 (AI 자동 추출)</div>
          <div style={{ fontSize: 11, color: C.hint, marginTop: 2 }}>상담 내용을 자유롭게 적으면 AI가 위 필드를 자동으로 채웁니다.</div>
        </div>
        <div style={{ padding: 18 }}>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={5}
            placeholder={"오늘 온유성형외과 김실장님과 통화. 피부과 전문 3인 클리닉으로 리프팅 시술 위주 촬영 희망.\n예산은 150만원 내외, 평일 오전 촬영 선호. 홈페이지 리뉴얼 예정이라 웹용 이미지도 필요하다고 함."}
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
