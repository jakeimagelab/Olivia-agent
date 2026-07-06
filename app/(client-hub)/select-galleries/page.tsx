"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { GALLERY_STATUS_COLOR, GALLERY_STATUS_LABEL, type SelectGallery } from "@/lib/selectGallery";

const C = {
  teal: "#155855", bg: "#F0F9F8", white: "#FFFFFF",
  border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", green: "#22876A", red: "#DC2626",
  orange: "#E85D2C",
};

function nextActionLabel(g: SelectGallery) {
  if (g.status === "draft") return { text: "브랜드메일 발송 필요", color: C.orange };
  if (g.status === "mail_sent" || g.status === "waiting_selection") return { text: "고객 선택 대기 중", color: C.teal };
  if (g.status === "selection_submitted") return { text: "RAW 자동 매칭 필요", color: C.orange };
  if (g.status === "raw_matched") return { text: "보정 단계로 이동", color: C.green };
  if (g.status === "expired") return { text: "만료됨", color: C.muted };
  return { text: "-", color: C.hint };
}

export default function SelectGalleriesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#5A7470", fontFamily: "'Noto Sans KR',sans-serif" }}>불러오는 중...</div>}>
      <SelectGalleriesInner />
    </Suspense>
  );
}

function SelectGalleriesInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const clientId = sp.get("clientId") ?? sp.get("client_id") ?? "";
  const workflowRunId = sp.get("workflowRunId") ?? "";

  const [galleries, setGalleries] = useState<SelectGallery[]>([]);
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", hospital_name: "", shooting_name: "", shooting_date: "", expire_days: 3 });
  const [showForm, setShowForm] = useState(false);

  // clientId 없이(고객 워크플로우를 거치지 않고) 이 페이지에 바로 들어온 경우에도
  // 등록된 고객 목록에서 골라서 자동 연동할 수 있도록 한다.
  const [allClients, setAllClients] = useState<{ id: string; hospital_name: string; contact_name: string }[]>([]);
  const [pickedClientId, setPickedClientId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [showClientPicker, setShowClientPicker] = useState(false);

  useEffect(() => {
    if (clientId) return; // 이미 특정 고객 컨텍스트로 들어온 경우엔 고를 필요 없음
    fetch("/api/clients/directory").then(r => r.json()).then(d => { if (d.ok) setAllClients(d.clients); }).catch(() => {});
  }, [clientId]);

  const filteredClients = allClients.filter(c =>
    (c.hospital_name ?? "").toLowerCase().includes(clientQuery.toLowerCase()) ||
    (c.contact_name ?? "").toLowerCase().includes(clientQuery.toLowerCase())
  ).slice(0, 8);

  const pickClient = (c: { id: string; hospital_name: string; contact_name: string }) => {
    setPickedClientId(c.id);
    setForm(p => ({ ...p, hospital_name: c.hospital_name ?? "", title: `${c.hospital_name ?? ""} 셀렉 갤러리` }));
    setShowClientPicker(false);
    setClientQuery("");
  };

  const load = () => {
    setLoading(true);
    const qs = clientId ? `?clientId=${clientId}` : "";
    fetch(`/api/select-galleries${qs}`).then(r => r.json()).then(d => {
      if (d.ok) setGalleries(d.galleries);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/clients/${clientId}`).then(r => r.json()).then(d => {
      if (d.ok || d.client) setClient(d.client ?? d);
    });
  }, [clientId]);

  useEffect(() => {
    if (client) {
      setForm(p => ({
        ...p,
        hospital_name: client.hospital_name ?? "",
        title: `${client.hospital_name ?? client.name ?? ""} 셀렉 갤러리`,
      }));
    }
  }, [client]);

  const create = async () => {
    if (!form.title) return;
    setCreating(true);
    const res = await fetch("/api/select-galleries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, client_id: clientId || undefined, workflow_run_id: workflowRunId || undefined }),
    });
    const d = await res.json();
    setCreating(false);
    if (d.ok) {
      setShowForm(false);
      const params = new URLSearchParams();
      if (clientId) params.set("clientId", clientId);
      if (workflowRunId) params.set("workflowRunId", workflowRunId);
      params.set("stepKey", "client_selection");
      router.push(`/select-galleries/${d.gallery.id}?${params.toString()}`);
    } else {
      alert("오류: " + d.error);
    }
  };

  const buildDetailHref = (g: SelectGallery) => {
    const params = new URLSearchParams();
    if (clientId) params.set("clientId", clientId);
    if (workflowRunId) params.set("workflowRunId", workflowRunId);
    params.set("stepKey", g.status === "selection_submitted" || g.status === "raw_matched" ? "raw_matching" : "client_selection");
    return `/select-galleries/${g.id}?${params.toString()}`;
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px", fontFamily: "'Noto Sans KR',sans-serif" }}>

      {/* 고객 컨텍스트 배너 */}
      {client ? (
        <div style={{ background: "#EAF4F2", border: "1.5px solid #B2D8D4", borderRadius: 10, padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 2 }}>현재 고객</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.txt }}>{client.hospital_name ?? client.name}</div>
            {client.manager_name && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{client.manager_name}</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`/clients?clientId=${clientId}`} style={{ fontSize: 12, color: C.teal, fontWeight: 700, padding: "6px 14px", border: `1px solid ${C.teal}`, borderRadius: 6, textDecoration: "none" }}>
              고객관리로
            </Link>
          </div>
        </div>
      ) : clientId ? null : (
        <div style={{ background: "#FFF8F0", border: "1px solid #FBD5B5", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: C.muted }}>
          고객관리와 연결되지 않은 셀렉 갤러리입니다. 고객 워크플로우에서 접근하면 자동 연결됩니다.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.teal, marginBottom: 4 }}>📸 고객 셀렉 갤러리</div>
          <div style={{ fontSize: 13, color: C.muted }}>고객에게 원본 확인 링크를 보내고 RAW 매칭까지 처리합니다</div>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ background: C.teal, color: C.white, border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          + 새 갤러리
        </button>
      </div>

      {showForm && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.teal, marginBottom: 16 }}>새 셀렉 갤러리 만들기</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {([
              ["title", "갤러리 제목 *", "예: 정연호 원장 2026년 6월 촬영"],
              ["hospital_name", "병원명", "예: 피부과 클리닉"],
              ["shooting_name", "촬영명", "예: 2026년 프로필 촬영"],
              ["shooting_date", "촬영일", ""],
            ] as const).map(([key, label, placeholder]) => (
              <div key={key}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>{label}</label>
                <input type={key === "shooting_date" ? "date" : "text"}
                  value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit" }} />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>파일 보관 기간</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[3, 5, 7].map(d => (
                <button key={d} onClick={() => setForm(p => ({ ...p, expire_days: d }))}
                  style={{ padding: "6px 16px", borderRadius: 6, border: `1.5px solid ${form.expire_days === d ? C.teal : C.border}`, background: form.expire_days === d ? C.teal : "transparent", color: form.expire_days === d ? C.white : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {d}일
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={create} disabled={!form.title || creating}
              style={{ background: C.teal, color: C.white, border: "none", padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: form.title ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: form.title ? 1 : 0.5 }}>
              {creating ? "생성 중..." : "갤러리 생성"}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              취소
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontSize: 14 }}>불러오는 중...</div>
      ) : galleries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontSize: 14 }}>
          {clientId ? "이 고객의 셀렉 갤러리가 없습니다." : "아직 생성된 갤러리가 없습니다."}<br />
          <span style={{ fontSize: 12 }}>위에서 새 갤러리를 만들어보세요.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {galleries.map(g => {
            const na = nextActionLabel(g);
            return (
              <Link key={g.id} href={buildDetailHref(g)}
                style={{ textDecoration: "none", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, transition: "box-shadow .15s" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.txt, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.shooting_name ?? g.title}
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.muted, flexWrap: "wrap", marginBottom: 4 }}>
                    {g.hospital_name && <span>🏥 {g.hospital_name}</span>}
                    {g.shooting_date && <span>📅 {g.shooting_date}</span>}
                    <span>📸 {g.total_jpg_count}장</span>
                    {g.selected_count > 0 && <span>✅ {g.selected_count}장 선택</span>}
                    <span style={{ color: new Date(g.file_expires_at) < new Date() ? C.red : C.muted }}>
                      🗓 만료 {new Date(g.file_expires_at).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: na.color }}>→ {na.text}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: (GALLERY_STATUS_COLOR[g.status] ?? "#888") + "20", color: GALLERY_STATUS_COLOR[g.status] ?? C.muted }}>
                    {GALLERY_STATUS_LABEL[g.status] ?? g.status}
                  </span>
                  <span style={{ fontSize: 11, color: C.hint }}>
                    {new Date(g.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
