"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const C = {
  teal: "#155855", orange: "#E85D2C", bg: "#F0F9F8",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", green: "#22876A",
};

function DeliveryInner() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id");

  const [client, setClient] = useState<any>(null);
  const [workflowRun, setWorkflowRun] = useState<any>(null);
  const [nasLink, setNasLink] = useState("");
  const [fileCount, setFileCount] = useState("");
  const [memo, setMemo] = useState("");
  const [delivering, setDelivering] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/clients/${clientId}`).then(r => r.json()).then(d => {
      if (d.ok) { setClient(d.client); setWorkflowRun(d.workflowRun); }
    });
  }, [clientId]);

  const deliver = async () => {
    if (!workflowRun?.id) return;
    setDelivering(true);
    const res = await fetch("/api/workflow/advance", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_run_id: workflowRun.id, to_step_key: "retouching" }),
    });
    const d = await res.json();
    setDoneMsg(d.ok ? "원본 전달 완료! 8단계(보정)로 이동됐습니다." : d.error || "오류가 발생했습니다.");
    setDelivering(false);
  };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif", color: C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="/assets/photoclinic-logo.png" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">원본 데이터 전달</span>
          </div>
        </div>
        <div className="pc-header-actions" style={{ padding: "0 20px" }}>
          {clientId
            ? <Link href={`/clients?id=${clientId}`} className="pc-header-back">← 고객 화면</Link>
            : <Link href="/clients" className="pc-header-back">← 고객 목록</Link>}
          <span style={{ fontSize: 10, fontWeight: 900, color: "#7C3AED", border: "1px solid rgba(124,58,237,.4)", borderRadius: 99, padding: "3px 10px" }}>Step 7 · 원본 전달</span>
        </div>
      </header>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 60px" }}>

        {client && (
          <div style={{ background: `linear-gradient(135deg, ${C.teal}, #0d3e3b)`, color: "#fff", borderRadius: 16, padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Step 7 · 원본 데이터 전달</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{client.name}</div>
            {client.email && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>전달 이메일: {client.email}</div>}
          </div>
        )}

        <div className="pc-card">
          <div style={{ padding: "14px 20px", background: "rgba(21,88,85,.04)", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.teal }}>📦 원본 파일 전달 정보</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>NAS 공유 링크와 파일 정보를 입력 후 전달 완료 처리하세요.</div>
          </div>
          <div style={{ padding: "20px", display: "grid", gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6 }}>NAS 공유 링크</label>
              <input value={nasLink} onChange={e => setNasLink(e.target.value)} placeholder="https://nas.example.com/share/..."
                style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 42, fontSize: 13, fontFamily: "inherit", outline: "none", background: C.white, color: C.txt, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6 }}>파일 수량</label>
              <input value={fileCount} onChange={e => setFileCount(e.target.value)} placeholder="예: RAW 324컷 / JPG 324컷"
                style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 42, fontSize: 13, fontFamily: "inherit", outline: "none", background: C.white, color: C.txt, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6 }}>전달 메모 (고객에게 안내할 내용)</label>
              <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3}
                placeholder="원본 파일 보관 기간 안내, 다운로드 방법 등"
                style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", lineHeight: 1.65, resize: "vertical", outline: "none", background: C.white, color: C.txt, boxSizing: "border-box" }} />
            </div>

            <div style={{ background: C.light, borderRadius: 10, padding: "12px 16px", fontSize: 12, color: C.teal, lineHeight: 1.7 }}>
              <strong>전달 후 안내 사항:</strong><br />
              · 원본 보관 기간: 촬영일로부터 30일<br />
              · 보정 완료 후 최종본을 별도 전달 예정<br />
              · 수정 요청은 최종 전달 후 1회 무상 제공
            </div>

            {doneMsg ? (
              <div style={{ padding: "14px 18px", background: doneMsg.includes("완료") ? C.light : "#FFF0F0", borderRadius: 10, fontSize: 13, fontWeight: 700, color: doneMsg.includes("완료") ? C.green : C.orange }}>
                {doneMsg}
                {doneMsg.includes("완료") && clientId && (
                  <Link href={`/photo-sorting?client_id=${clientId}`} className="pc-btn pc-btn--primary" style={{ display: "flex", width: "100%", marginTop: 12, textDecoration: "none" }}>
                    8단계: 보정 화면으로 →
                  </Link>
                )}
              </div>
            ) : (
              <button onClick={deliver} disabled={delivering || !workflowRun} className="pc-btn pc-btn--primary pc-btn--lg">
                {delivering ? "처리 중..." : "⚡ 원본 전달 완료 → 8단계(보정)로 이동"}
              </button>
            )}
          </div>
        </div>

        {clientId && (
          <Link href={`/clients?id=${clientId}`} className="pc-btn pc-btn--secondary" style={{ display: "flex", width: "100%", marginTop: 14, textDecoration: "none" }}>
            ← 고객 화면으로 돌아가기
          </Link>
        )}
      </div>
    </main>
  );
}

export default function OriginalDeliveryPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: "center", color: "#9BB5B0" }}>로딩 중...</div>}>
      <DeliveryInner />
    </Suspense>
  );
}
