"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { STEP_NAME, WORKFLOW_STEPS } from "@/lib/workflow";
import ConsultMeetingForm from "./_components/ConsultMeetingForm";
import WorkflowBar from "./_components/WorkflowBar";

const C = {
  teal: "#155855", orange: "#E85D2C", bg: "#F0F9F8",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", green: "#22876A",
};

/* ─ 단계 → 기능 매핑 ─ */
interface StepFeature {
  title: string;
  href: string;
  desc: string;
  btnLabel: string;
  auto?: boolean;
  inline?: boolean;
}

const STEP_FEATURE: Record<string, StepFeature> = {
  consult_meeting:   { title: "상담/미팅 폼",       href: "",                desc: "상담 내용을 정리하고 고객 기본 정보를 등록합니다.", btnLabel: "상담 폼 열기",         inline: true },
  quote:             { title: "견적서 생성",         href: "/quote",          desc: "패키지·옵션 선택 후 PDF 견적서를 자동 생성합니다.", btnLabel: "견적서 생성하기" },
  contract:          { title: "계약서 작성",         href: "/contract",       desc: "계약서를 생성하고 서명 후 메일로 전달합니다.", btnLabel: "계약서 작성하기" },
  conti:             { title: "콘티 생성",           href: "/conti",          desc: "AI가 병원 정보로 촬영 콘티를 자동 생성합니다.", btnLabel: "콘티 생성하기" },
  shooting:          { title: "촬영",                href: "",                desc: "촬영 완료 후 수동으로 다음 단계(백업)로 전환합니다.", btnLabel: "촬영 완료 처리", inline: true },
  backup_sorting:    { title: "사진 분류",           href: "/photo-sorting",  desc: "RAW/JPG 자동 분류 및 씬별 폴더 정리를 합니다.", btnLabel: "분류 화면 열기" },
  original_delivery: { title: "원본 데이터 전달",   href: "",                desc: "NAS 공유링크 생성 후 고객에게 자동 발송합니다.", btnLabel: "자동 전달 실행",       auto: true },
  retouching:        { title: "보정",                href: "/photo-sorting",  desc: "Evoto 색감 체크 보조, 보정 진행 후 상태 확인합니다.", btnLabel: "사진 화면 열기" },
  revision:          { title: "수정 접수",           href: "/mailing",        desc: "수정 요청을 접수하고 담당자 알람 메일을 발송합니다.", btnLabel: "메일링으로 이동" },
  final_delivery:    { title: "최종파일 전달",       href: "/delivery-mail",  desc: "최종파일 + 후기 요청 메일을 함께 발송합니다.", btnLabel: "최종 전달하기" },
  review_content:    { title: "후기 콘텐츠 제작",   href: "/review-studio",  desc: "후기를 인스타그램/블로그 콘텐츠로 자동 변환합니다.", btnLabel: "Review Studio 열기" },
  reward:            { title: "고객 리워드 적립",   href: "/per",            desc: "촬영 금액 1% PER 포인트 자동 산출 및 적립합니다.", btnLabel: "PER 포인트 확인" },
  customer_care:     { title: "고객관리 알람",       href: "/mailing",        desc: "주기 알람·이벤트 메일 조건 충족 시 자동 발송합니다.", btnLabel: "메일링으로 이동" },
  content_planning:  { title: "스토리 콘텐츠 기획", href: "/content-writer", desc: "블로그 소스 연계 콘텐츠 기획 작업을 합니다.", btnLabel: "기획 화면 열기" },
};

const NEXT_STEP: Record<string, string> = {
  shooting: "backup_sorting",
  original_delivery: "retouching",
};

const MAIL_LABELS: Record<string, string> = {
  quote: "견적서", contract: "계약서", conti: "콘티", gallery: "갤러리",
  original_files: "원본파일", review_form: "후기폼", monthly_report: "리포트", shoot_reminder: "촬영알림",
};

const MAIL_COLOR: Record<string, string> = {
  draft: C.hint, ready: C.orange, sent: C.green, failed: "#DC2626",
};

function stepBadgeColor(key: string) {
  const idx = WORKFLOW_STEPS.findIndex((s) => s.key === key);
  if (idx < 4) return C.orange;
  if (idx < 7) return "#7C3AED";
  if (idx < 11) return C.teal;
  return C.green;
}

/* ══════════ ENTRY ══════════ */
export default function ClientsPage() {
  return (
    <Suspense fallback={<SpinBox />}>
      <ClientsInner />
    </Suspense>
  );
}

function SpinBox() {
  return (
    <div style={{ padding: "80px 0", textAlign: "center", color: C.hint }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>불러오는 중...</div>
    </div>
  );
}

function ClientsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");
  if (id) return <DetailView clientId={id} onBack={() => router.push("/clients")} />;
  return <ListView />;
}

/* ══════════ LIST VIEW ══════════ */
function ListView() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/clients");
    const d = await res.json();
    if (d.ok) setClients(d.clients || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = clients.filter((c) =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.department || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ color: C.txt }}>
      {/* 히어로 */}
      <div style={{ background: `linear-gradient(135deg, ${C.teal}, #0d3e3b)`, color: "#fff", padding: "24px 24px 20px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.7, marginBottom: 4 }}>👥 Client Hub</div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>고객 · 워크플로우 관리</h1>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>고객 등록이 곧 워크플로우 1단계 시작입니다. 상담부터 납품까지 한 화면에서 관리합니다.</p>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 20px 80px" }}>
        {/* 컨트롤 바 */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="병원명 · 진료과 검색"
            style={{
              flex: "1 1 180px", maxWidth: 300, height: 40,
              border: `1.5px solid ${C.border}`, borderRadius: 8,
              padding: "0 14px", fontSize: 13, fontFamily: "inherit",
              outline: "none", background: C.white, color: C.txt,
            }}
          />
          <span style={{ fontSize: 12, color: C.hint, marginLeft: "auto" }}>총 {filtered.length}명</span>
          <button
            onClick={() => setShowModal(true)}
            style={{ height: 40, padding: "0 20px", background: C.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
          >
            + 신규 등록
          </button>
        </div>

        {/* 요약 카드 */}
        {!loading && clients.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: "전체 고객", value: clients.length },
              { label: "워크플로우 진행", value: clients.filter((c) => c.active_run).length },
              { label: "촬영 이전", value: clients.filter((c) => { const i = WORKFLOW_STEPS.findIndex((s) => s.key === c.active_run?.current_step_key); return i >= 0 && i < 5; }).length },
              { label: "후처리 중", value: clients.filter((c) => { const i = WORKFLOW_STEPS.findIndex((s) => s.key === c.active_run?.current_step_key); return i >= 5 && i < 11; }).length },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.teal }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* 카드 목록 */}
        {loading ? <SpinBox /> : filtered.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🏥</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
              {search ? "검색 결과가 없습니다." : "등록된 고객이 없습니다."}
            </div>
            {!search && (
              <button onClick={() => setShowModal(true)} style={{ marginTop: 12, height: 44, padding: "0 28px", background: C.orange, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                + 첫 고객 등록하기
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {filtered.map((c) => {
              const stepKey = c.active_run?.current_step_key;
              const stepName = stepKey ? (STEP_NAME[stepKey] || stepKey) : null;
              const sc = stepKey ? stepBadgeColor(stepKey) : C.hint;
              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/clients?id=${c.id}`)}
                  style={{ background: C.white, borderRadius: 14, border: `1.5px solid ${C.border}`, padding: "16px", cursor: "pointer", transition: "all .15s", boxShadow: "0 2px 8px rgba(21,88,85,.05)" }}
                  onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.teal; el.style.boxShadow = "0 4px 16px rgba(21,88,85,.12)"; }}
                  onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.border; el.style.boxShadow = "0 2px 8px rgba(21,88,85,.05)"; }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: C.teal, marginBottom: 3 }}>{c.name}</div>
                      {c.department && <div style={{ fontSize: 11, color: C.muted }}>{c.department}</div>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 99, background: `${sc}18`, color: sc, border: `1px solid ${sc}30`, whiteSpace: "nowrap", marginLeft: 8 }}>
                      {stepName ?? "미시작"}
                    </span>
                  </div>
                  {c.director_name && <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>원장: {c.director_name}</div>}
                  {c.main_treatments && <div style={{ fontSize: 11, color: C.hint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.main_treatments}</div>}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: C.hint }}>{c.created_at ? new Date(c.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : ""}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.teal }}>상세 보기 →</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 신규 등록 모달 */}
      {showModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{ background: C.bg, borderRadius: 20, width: "100%", maxWidth: 600, padding: 28, boxShadow: "0 24px 80px rgba(0,0,0,.24)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: C.orange, letterSpacing: ".1em", marginBottom: 4 }}>STEP 1 · 상담/미팅</div>
                <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 900, color: C.teal }}>신규 고객 등록</h2>
                <p style={{ margin: 0, fontSize: 12, color: C.muted }}>등록 즉시 워크플로우 1단계(상담/미팅)가 자동으로 시작됩니다.</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, cursor: "pointer", fontSize: 18, color: C.muted, fontFamily: "inherit", flexShrink: 0 }}>×</button>
            </div>
            <ConsultMeetingForm
              onCancel={() => setShowModal(false)}
              onSuccess={(id) => { setShowModal(false); router.push(`/clients?id=${id}`); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════ DETAIL VIEW ══════════ */
function DetailView({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [pageData, setPageData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const [advMsg, setAdvMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}`);
    const d = await res.json();
    if (d.ok) {
      setPageData(d);
      if (!selectedStep) setSelectedStep(d.workflowRun?.current_step_key || WORKFLOW_STEPS[0].key);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId]);

  const advance = async (toKey: string) => {
    if (!pageData?.workflowRun?.id) return;
    setAdvancing(true); setAdvMsg("");
    const res = await fetch("/api/workflow/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_run_id: pageData.workflowRun.id, to_step_key: toKey }),
    });
    const d = await res.json();
    if (d.ok) {
      setAdvMsg(`✓ '${STEP_NAME[toKey] || toKey}' 단계로 이동됐습니다.`);
      setSelectedStep(toKey);
      await load();
    } else {
      setAdvMsg(d.error || "단계 전환 중 오류가 발생했습니다.");
    }
    setAdvancing(false);
    setTimeout(() => setAdvMsg(""), 4000);
  };

  if (loading) return <SpinBox />;
  if (!pageData?.client) return (
    <div style={{ padding: "60px 24px", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>❌</div>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>고객을 찾을 수 없습니다.</div>
      <button onClick={onBack} style={{ height: 40, padding: "0 20px", background: C.teal, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← 목록으로</button>
    </div>
  );

  const { client, workflowRun, mailingQueue } = pageData;
  const currentStepKey = workflowRun?.current_step_key || WORKFLOW_STEPS[0].key;
  const feature = STEP_FEATURE[selectedStep];
  const stepMeta = WORKFLOW_STEPS.find((s) => s.key === selectedStep);
  const selectedStepIdx = WORKFLOW_STEPS.findIndex((s) => s.key === selectedStep);

  return (
    <div style={{ color: C.txt }}>
      {/* 헤더 */}
      <div style={{ background: `linear-gradient(135deg, ${C.teal}, #0d3e3b)`, color: "#fff", padding: "20px 24px 18px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>
            ← 고객 목록
          </button>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h1 style={{ margin: "0 0 5px", fontSize: 22, fontWeight: 900 }}>{client.name}</h1>
              <div style={{ fontSize: 12, opacity: 0.8, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {client.department && <span>{client.department}</span>}
                {client.director_name && <span>원장: {client.director_name}</span>}
                {client.doctor_count && <span>의료진 {client.doctor_count}명</span>}
              </div>
            </div>
            {workflowRun && (
              <span style={{ background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.3)", borderRadius: 99, padding: "4px 14px", fontSize: 12, fontWeight: 800 }}>
                현재: {STEP_NAME[currentStepKey] || currentStepKey}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 20px 80px" }}>

        {/* ─ 워크플로우 바 ─ */}
        <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: C.muted, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 10 }}>
            워크플로우 14단계 — 클릭하면 해당 단계 기능 카드로 이동합니다
          </div>
          {workflowRun ? (
            <WorkflowBar currentStepKey={currentStepKey} selectedStepKey={selectedStep} onSelect={setSelectedStep} />
          ) : (
            <div style={{ fontSize: 13, color: C.muted, padding: "8px 0" }}>워크플로우가 아직 시작되지 않았습니다.</div>
          )}
        </div>

        {advMsg && (
          <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: advMsg.startsWith("✓") ? C.light : "#FFF0F0", color: advMsg.startsWith("✓") ? C.green : C.orange, fontSize: 13, fontWeight: 700 }}>
            {advMsg}
          </div>
        )}

        {/* ─ 2열 레이아웃 ─ */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>

          {/* 왼쪽: 단계별 기능 카드 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {feature && (
              <div style={{ background: C.white, borderRadius: 14, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", background: "rgba(21,88,85,.03)", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: C.orange, letterSpacing: ".05em", marginBottom: 3 }}>
                    Step {selectedStepIdx + 1} · {selectedStep === currentStepKey ? "현재 단계" : ""}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: C.teal }}>{feature.title}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
                    {stepMeta?.requires_approval && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: `${C.orange}18`, color: C.orange, border: `1px solid ${C.orange}30` }}>승인 필요</span>
                    )}
                    {stepMeta?.creates_mailing_draft && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: `${C.teal}18`, color: C.teal, border: `1px solid ${C.teal}30` }}>메일 초안</span>
                    )}
                    {feature.auto && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: "#F0F9F8", color: C.green, border: "1px solid rgba(21,88,85,.2)" }}>자동화</span>
                    )}
                  </div>
                </div>
                <div style={{ padding: "16px 18px" }}>
                  <p style={{ margin: "0 0 16px", fontSize: 13, color: C.muted, lineHeight: 1.7 }}>{feature.desc}</p>

                  {/* 촬영 완료 처리 */}
                  {selectedStep === "shooting" && (
                    <button
                      onClick={() => advance(NEXT_STEP.shooting)}
                      disabled={advancing}
                      style={{ width: "100%", height: 44, background: C.green, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 900, cursor: advancing ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: advancing ? 0.7 : 1 }}
                    >
                      {advancing ? "처리 중..." : "✓ 촬영 완료 → 백업 단계로 전환"}
                    </button>
                  )}

                  {/* 원본 자동 전달 */}
                  {selectedStep === "original_delivery" && (
                    <button
                      onClick={() => advance("retouching")}
                      disabled={advancing}
                      style={{ width: "100%", height: 44, background: C.teal, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 900, cursor: advancing ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: advancing ? 0.7 : 1 }}
                    >
                      {advancing ? "전달 중..." : "⚡ 원본 자동 전달 + 다음 단계"}
                    </button>
                  )}

                  {/* 외부 기능 페이지 이동 */}
                  {!feature.inline && !feature.auto && feature.href && (
                    <Link
                      href={`${feature.href}?client_id=${clientId}`}
                      style={{ display: "block", textAlign: "center", height: 44, lineHeight: "44px", background: C.teal, color: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 900, textDecoration: "none" }}
                    >
                      {feature.btnLabel} →
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* 메일링 큐 */}
            {mailingQueue.length > 0 && (
              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.03)" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>메일 현황</div>
                </div>
                <div style={{ padding: "4px 0" }}>
                  {mailingQueue.map((m: any) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: `${MAIL_COLOR[m.status] || C.hint}18`, color: MAIL_COLOR[m.status] || C.hint }}>
                        {m.status === "draft" ? "초안" : m.status === "ready" ? "대기" : m.status === "sent" ? "발송" : m.status}
                      </span>
                      <span style={{ flex: 1, fontSize: 12, color: C.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {MAIL_LABELS[m.type] || m.type}{m.subject ? ` — ${m.subject}` : ""}
                      </span>
                      <span style={{ fontSize: 10, color: C.hint }}>
                        {m.created_at ? new Date(m.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 오른쪽: 고객 기본 정보 */}
          <InfoPanel client={client} onUpdate={load} />
        </div>
      </div>
    </div>
  );
}

/* ══════════ INFO PANEL ══════════ */
function InfoPanel({ client, onUpdate }: { client: any; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const startEdit = () => {
    setForm({
      name:           client.name           || "",
      director_name:  client.director_name  || "",
      department:     client.department     || "",
      main_treatments:client.main_treatments|| "",
      doctor_count:   client.doctor_count   ? String(client.doctor_count) : "",
      manager_name:   client.manager_name   || "",
      email:          client.email          || "",
      phone:          client.phone          || "",
      website_url:    client.website_url    || "",
      instagram_url:  client.instagram_url  || "",
      special_notes:  client.special_notes  || "",
    });
    setEditing(true); setMsg("");
  };

  const save = async () => {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, doctor_count: form.doctor_count ? parseInt(form.doctor_count, 10) : null }),
    });
    const d = await res.json();
    if (d.ok) { setEditing(false); onUpdate(); setMsg("저장됐습니다."); }
    else setMsg(d.error || "저장 실패");
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const iS: React.CSSProperties = {
    width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 6,
    padding: "5px 9px", fontSize: 12, fontFamily: "inherit",
    outline: "none", background: C.white, color: C.txt, boxSizing: "border-box",
  };

  type Row = [key: string, label: string];
  const rows: Row[] = [
    ["name", "병원이름"],
    ["director_name", "원장이름"],
    ["department", "진료과"],
    ["main_treatments", "주요 시술"],
    ["doctor_count", "의료진 수"],
    ["manager_name", "담당자"],
    ["email", "이메일"],
    ["phone", "연락처"],
    ["website_url", "홈페이지"],
    ["instagram_url", "인스타그램"],
    ["special_notes", "특이사항"],
  ];

  const displayVal = (key: string) => {
    const v = client[key];
    if (!v) return "—";
    if (key === "doctor_count") return `${v}명`;
    return String(v);
  };

  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.03)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>고객 기본 정보</div>
        {!editing ? (
          <button onClick={startEdit} style={{ fontSize: 11, fontWeight: 800, color: C.teal, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>수정</button>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setEditing(false); setMsg(""); }} style={{ fontSize: 11, fontWeight: 700, color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>취소</button>
            <button onClick={save} disabled={saving} style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: saving ? C.hint : C.teal, border: "none", borderRadius: 6, padding: "4px 14px", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{saving ? "..." : "저장"}</button>
          </div>
        )}
      </div>

      {msg && (
        <div style={{ padding: "8px 18px", background: msg.includes("실패") ? "#FFF0F0" : C.light, fontSize: 12, fontWeight: 700, color: msg.includes("실패") ? C.orange : C.green }}>
          {msg}
        </div>
      )}

      <div style={{ padding: "12px 18px", display: "grid", gap: 10 }}>
        {rows.map(([key, label]) => (
          <div key={key} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, alignItems: "start" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, paddingTop: 3 }}>{label}</span>
            {editing ? (
              key === "special_notes" ? (
                <textarea value={form[key] || ""} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} rows={2}
                  style={{ ...iS, height: "auto", padding: "6px 9px", resize: "vertical", lineHeight: 1.5 }} />
              ) : (
                <input type={key === "doctor_count" ? "number" : "text"} value={form[key] || ""} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} style={iS} />
              )
            ) : (
              <span style={{ fontSize: 12, color: displayVal(key) === "—" ? C.hint : C.txt, wordBreak: "break-word" }}>
                {(key === "website_url" || key === "instagram_url") && displayVal(key) !== "—" ? (
                  <a href={displayVal(key).startsWith("http") ? displayVal(key) : `https://${displayVal(key)}`} target="_blank" rel="noreferrer" style={{ color: C.teal, textDecoration: "none" }}>
                    {displayVal(key)} ↗
                  </a>
                ) : displayVal(key)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
