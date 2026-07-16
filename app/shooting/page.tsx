"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const C = {
  teal: "#155855", orange: "#E85D2C", bg: "#F0F9F8",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", green: "#22876A",
};

const DEFAULT_ITEMS = [
  "원장님 프로필 (단독)",
  "원장님 + 직원 단체사진",
  "진료실 / 시술실 공간",
  "대기실 / 로비 공간",
  "시술 연출 (협조 필요)",
  "의료 장비 / 기기",
  "외부 전경 / 간판",
  "상품 / 패키지 이미지",
];

function ShootingInner() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id");

  const [client, setClient] = useState<any>(null);
  const [workflowRun, setWorkflowRun] = useState<any>(null);
  const [checklist, setChecklist] = useState(DEFAULT_ITEMS.map(item => ({ item, done: false })));
  const [notes, setNotes] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/clients/${clientId}`).then(r => r.json()).then(d => {
      if (d.ok) { setClient(d.client); setWorkflowRun(d.workflowRun); }
    });
  }, [clientId]);

  const toggle = (idx: number) =>
    setChecklist(prev => prev.map((c, i) => i === idx ? { ...c, done: !c.done } : c));

  const completeShooting = async () => {
    if (!workflowRun?.id) return;
    setAdvancing(true);
    const res = await fetch("/api/workflow/advance", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_run_id: workflowRun.id, to_step_key: "backup_sorting" }),
    });
    const d = await res.json();
    setDoneMsg(d.ok ? "촬영 완료! 6단계(백업/분류)로 이동됐습니다." : d.error || "오류가 발생했습니다.");
    setAdvancing(false);
  };

  const done = checklist.filter(c => c.done).length;
  const total = checklist.length;

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif", color: C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="/assets/photoclinic-logo.png" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">촬영 앱</span>
          </div>
        </div>
        <div className="pc-header-actions" style={{ padding: "0 20px" }}>
          {clientId
            ? <Link href={`/clients?id=${clientId}`} className="pc-header-back">← 고객 화면</Link>
            : <Link href="/clients" className="pc-header-back">← 고객 목록</Link>}
          <span style={{ fontSize: 10, fontWeight: 900, color: C.orange, border: `1px solid ${C.orange}40`, borderRadius: 99, padding: "3px 10px" }}>Step 5 · 촬영</span>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 60px" }}>

        {/* 클라이언트 헤더 */}
        {client ? (
          <div style={{ background: `linear-gradient(135deg, ${C.teal}, #0d3e3b)`, color: "#fff", borderRadius: 16, padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Step 5 · 촬영 진행 중</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>{client.name}</div>
            <div style={{ fontSize: 12, opacity: 0.8, display: "flex", gap: 14 }}>
              {client.department && <span>{client.department}</span>}
              {client.director_name && <span>원장: {client.director_name}</span>}
              {client.main_treatments && <span>{client.main_treatments}</span>}
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11 }}>
                <span style={{ opacity: 0.7 }}>촬영 진행률</span>
                <span style={{ fontWeight: 900 }}>{done} / {total}</span>
              </div>
              <div style={{ height: 7, background: "rgba(255,255,255,.2)", borderRadius: 99 }}>
                <div style={{ height: "100%", background: "#EB8F22", borderRadius: 99, width: `${total ? (done / total) * 100 : 0}%`, transition: "width .3s" }} />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: C.light, borderRadius: 12, padding: "16px 20px", marginBottom: 24, fontSize: 13, color: C.muted }}>
            촬영 앱 — client_id 파라미터가 없으면 체크리스트만 사용 가능합니다.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

          {/* 체크리스트 */}
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", background: "rgba(21,88,85,.03)", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>촬영 체크리스트</div>
              <span style={{ fontSize: 11, fontWeight: 800, color: done === total && total > 0 ? C.green : C.muted }}>{done}/{total} 완료</span>
            </div>
            <div style={{ padding: "8px" }}>
              {checklist.map((item, idx) => (
                <label key={idx} onClick={() => toggle(idx)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 10px",
                  borderRadius: 8, cursor: "pointer", transition: "background .1s",
                  background: item.done ? C.light : "transparent",
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: `2px solid ${item.done ? C.green : C.border}`,
                    background: item.done ? C.green : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s",
                  }}>
                    {item.done && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, color: item.done ? C.muted : C.txt, textDecoration: item.done ? "line-through" : "none" }}>
                    {item.item}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* 메모 + 완료 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px" }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 10 }}>촬영 현장 메모</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={6}
                placeholder="촬영 중 특이사항, 추가 요청, 컷 수, 주의사항 등을 기록하세요."
                style={{
                  width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8,
                  padding: "10px 12px", fontSize: 13, fontFamily: "inherit",
                  lineHeight: 1.65, resize: "vertical", outline: "none",
                  background: C.white, color: C.txt, boxSizing: "border-box",
                }}
              />
            </div>

            {doneMsg ? (
              <div style={{ padding: "16px 18px", background: doneMsg.includes("완료") ? C.light : "#FFF0F0", borderRadius: 12, fontSize: 13, fontWeight: 700, color: doneMsg.includes("완료") ? C.green : C.orange }}>
                {doneMsg}
                {doneMsg.includes("완료") && clientId && (
                  <Link href={`/photo-sorting?client_id=${clientId}`} style={{ display: "block", marginTop: 12, padding: "10px 0", textAlign: "center", background: C.teal, color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 800, fontSize: 13 }}>
                    6단계: 사진 분류/백업 →
                  </Link>
                )}
              </div>
            ) : (
              <button onClick={completeShooting} disabled={advancing || !workflowRun} className="pc-btn pc-btn--orange pc-btn--lg">
                {advancing ? "처리 중..." : !workflowRun ? "워크플로우 없음 (client_id 필요)" : "✓ 촬영 완료 → 6단계(백업)로 전환"}
              </button>
            )}

            {clientId && (
              <Link href={`/clients?id=${clientId}`} style={{ textAlign: "center", padding: "12px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12, fontWeight: 700, color: C.muted, textDecoration: "none" }}>
                ← 고객 화면으로 돌아가기
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ShootingPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: "center", color: "#9BB5B0" }}>로딩 중...</div>}>
      <ShootingInner />
    </Suspense>
  );
}
