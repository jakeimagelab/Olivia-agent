"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { STEP_NAME, WORKFLOW_STEPS } from "@/lib/workflow";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import NextActionCard from "@/components/NextActionCard";
import ConsultMeetingForm from "./_components/ConsultMeetingForm";

const C = {
  teal: "#155855", orange: "#E85D2C", bg: "#F0F9F8",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", green: "#22876A",
};

const STEP_INFO: Record<string, { icon: string; desc: string; href: string }> = {
  consult_meeting:   { icon: "🤝", desc: "병원 기본 정보 등록, 상담 내용 AI 분析",  href: "/consultation" },
  quote:             { icon: "📄", desc: "패키지 선택 및 PDF 견적서 자동 생성",      href: "/quote" },
  contract:          { icon: "✍️", desc: "계약서 생성 및 이메일 전달",               href: "/contract" },
  conti:             { icon: "🎬", desc: "AI 촬영 콘티 및 체크리스트 생성",          href: "/conti" },
  shooting:          { icon: "📸", desc: "촬영 당일 체크리스트 진행 및 완료 처리",   href: "/shooting" },
  backup_sorting:    { icon: "🗂️", desc: "RAW/JPG 자동 분류 및 백업 관리",          href: "/photo-sorting" },
  original_delivery: { icon: "📦", desc: "원본 파일 NAS 링크 생성 및 발송",          href: "/original-delivery" },
  retouching:        { icon: "🎨", desc: "색감 보정 및 보정 가이드 작성",             href: "/photo-retouching" },
  revision:          { icon: "🔄", desc: "수정 요청 접수 및 알람 발송",               href: "/mailing" },
  seo_delivery:      { icon: "🔍", desc: "SEO 파일명·ALT·캡션·메타데이터 자동 생성", href: "/seo-delivery" },
  final_delivery:    { icon: "🚀", desc: "최종 파일 + 후기 요청 메일 발송",           href: "/delivery-mail" },
  review_content:    { icon: "⭐", desc: "후기 텍스트 → SNS 콘텐츠 자동 변환",       href: "/review-studio" },
  reward:            { icon: "🎁", desc: "PER 포인트 자동 산출 및 적립",              href: "/per" },
  customer_care:     { icon: "💌", desc: "주기 알람 및 이벤트 메일 발송",             href: "/mailing" },
  content_planning:  { icon: "✏️", desc: "블로그 기반 콘텐츠 기획 및 작성",          href: "/content-writer" },
};

const PROMO_APPS = [
  { title: "아이디어 제안",    desc: "오늘의 홍보 콘텐츠 아이디어 AI 제안",   href: "/daily-ideas",      icon: "💡" },
  { title: "홍보 콘텐츠 제작", desc: "블로그·인스타 콘텐츠 클라이언트별 제작", href: "/sns-manager",      icon: "📢" },
  { title: "병원이미지 진단",  desc: "병원 현황 맞춤 사진 방향 AI 진단",      href: "/diagnosis",        icon: "🔬" },
  { title: "채널 분석",        desc: "인스타·홈페이지·블로그 함께 분析",      href: "/channel-analyzer", icon: "📊" },
  { title: "AI 이미지 제작",   desc: "실사 병원 이미지 AI 생성·디렉팅",      href: "/image-generator",  icon: "🎨" },
  { title: "홈페이지 제작",    desc: "병원 홈페이지 제작 기획 정리",          href: "/website-builder",  icon: "🌐" },
];

const MAIL_LABELS: Record<string, string> = {
  quote: "견적서", contract: "계약서", conti: "콘티", gallery: "갤러리",
  original_files: "원본파일", review_form: "후기폼", monthly_report: "리포트", shoot_reminder: "촬영알림",
};
const MAIL_COLOR: Record<string, string> = {
  draft: C.hint, ready: C.orange, sent: C.green, failed: "#DC2626",
};

const SHOOTING_DEFAULT = [
  "원장님 프로필 (단독)", "원장님 + 직원 단체사진",
  "진료실 / 시술실 공간", "대기실 / 로비 공간",
  "시술 연출 (협조 필요)", "의료 장비 / 기기",
  "외부 전경 / 간판",     "상품 / 패키지 이미지",
];

function stepBadgeColor(key: string) {
  const idx = WORKFLOW_STEPS.findIndex((s) => s.key === key);
  if (idx < 4) return C.orange;
  if (idx < 7) return "#7C3AED";
  if (idx < 11) return C.teal;
  return C.green;
}

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

/* ── LIST VIEW ── */
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
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 20px 80px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="병원명 · 진료과 검색"
            style={{ flex: "1 1 180px", maxWidth: 300, height: 40, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 14px", fontSize: 13, fontFamily: "inherit", outline: "none", background: C.white, color: C.txt }} />
          <span style={{ fontSize: 12, color: C.hint, marginLeft: "auto" }}>총 {filtered.length}명</span>
          <button onClick={() => setShowModal(true)}
            style={{ height: 40, padding: "0 20px", background: C.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
            + 신규 등록
          </button>
        </div>

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
                <div key={c.id} onClick={() => router.push(`/clients?id=${c.id}`)}
                  style={{ background: C.white, borderRadius: 14, border: `1.5px solid ${C.border}`, padding: "16px", cursor: "pointer", transition: "all .15s", boxShadow: "0 2px 8px rgba(21,88,85,.05)" }}
                  onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.teal; el.style.boxShadow = "0 4px 16px rgba(21,88,85,.12)"; }}
                  onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.border; el.style.boxShadow = "0 2px 8px rgba(21,88,85,.05)"; }}>
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
                  {c.next_action?.label && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: C.light, borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: C.hint, fontWeight: 900, marginBottom: 2 }}>다음 액션</div>
                      <div style={{ fontSize: 12, color: C.teal, fontWeight: 800, lineHeight: 1.45 }}>{c.next_action.label}</div>
                    </div>
                  )}
                  {c.main_treatments && <div style={{ fontSize: 11, color: C.hint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.main_treatments}</div>}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: C.hint }}>{c.created_at ? new Date(c.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : ""}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.teal }}>{c.next_action?.primaryButtonLabel || "처리하기"} →</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.45)", overflowY: "auto" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{ minHeight: "100%", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px 60px" }}>
            <div style={{ background: C.bg, borderRadius: 20, width: "100%", maxWidth: 600, padding: 28, boxShadow: "0 24px 80px rgba(0,0,0,.24)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: C.orange, letterSpacing: ".1em", marginBottom: 4 }}>STEP 1 · 상담/미팅</div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 900, color: C.teal }}>신규 고객 등록</h2>
                  <p style={{ margin: 0, fontSize: 12, color: C.muted }}>등록 즉시 워크플로우 1단계가 자동으로 시작됩니다.</p>
                </div>
                <button onClick={() => setShowModal(false)} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, cursor: "pointer", fontSize: 18, color: C.muted, fontFamily: "inherit", flexShrink: 0 }}>×</button>
              </div>
              <ConsultMeetingForm
                onCancel={() => setShowModal(false)}
                onSuccess={(id) => { setShowModal(false); router.push(`/clients?id=${id}`); }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── DETAIL VIEW ── */
function DetailView({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [pageData, setPageData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState("");
  const [showAllSteps, setShowAllSteps] = useState(false);

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
  const currentIdx = WORKFLOW_STEPS.findIndex((s) => s.key === currentStepKey);

  return (
    <div style={{ color: C.txt }}>
      {/* 헤더 */}
      <div style={{ background: `linear-gradient(135deg, ${C.teal}, #0d3e3b)`, color: "#fff", padding: "16px 24px 14px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            ← 목록
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{client.name}</h1>
            {client.specialty && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{client.specialty}</div>}
          </div>
          <div style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 10, padding: "6px 14px", textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,.6)", letterSpacing: ".08em" }}>진행</div>
            <div style={{ fontSize: 15, fontWeight: 900 }}>{currentIdx}/{WORKFLOW_STEPS.length}</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 16px 80px", display: "grid", gridTemplateColumns: "1fr", gap: 14, alignItems: "start" }}>
        <NextActionCard client={client} workflowRun={workflowRun} onRefresh={load} />

        <button onClick={() => setShowAllSteps((v) => !v)}
          style={{ minHeight: 44, border: `1px solid ${C.border}`, borderRadius: 12, background: C.white, color: C.teal, fontSize: 13, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
          <span>전체 단계 {showAllSteps ? "접기" : "보기"} ({currentIdx + 1}/{WORKFLOW_STEPS.length})</span>
          <span style={{ color: C.orange }}>{showAllSteps ? "접기 ↑" : "펼치기 ↓"}</span>
        </button>

        {/* ── 왼쪽: 14단계 체크리스트 ── */}
        {showAllSteps && <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "rgba(21,88,85,.04)", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: C.teal }}>전체 단계 ({currentIdx}/{WORKFLOW_STEPS.length})</div>
            <div style={{ marginTop: 6, height: 4, borderRadius: 99, background: C.border, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(currentIdx / WORKFLOW_STEPS.length) * 100}%`, background: C.teal, borderRadius: 99, transition: "width .4s" }} />
            </div>
          </div>
          <div style={{ maxHeight: "calc(100vh - 160px)", overflowY: "auto" }}>
            {WORKFLOW_STEPS.map((step, idx) => {
              const isDone = idx < currentIdx;
              const isCurrent = step.key === currentStepKey;
              const isSelected = step.key === selectedStep;
              return (
                <button key={step.key} onClick={() => setSelectedStep(step.key)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 14px", border: "none", textAlign: "left",
                    background: isCurrent ? `${C.teal}10` : isSelected ? `${C.teal}06` : "transparent",
                    borderLeft: isCurrent ? `3px solid ${C.teal}` : isSelected ? `3px solid ${C.border}` : "3px solid transparent",
                    cursor: "pointer", fontFamily: "inherit",
                    borderBottom: `1px solid ${C.border}`,
                  }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: isDone ? 11 : 10, fontWeight: 900,
                    background: isDone ? C.green : isCurrent ? C.teal : C.light,
                    color: isDone || isCurrent ? "#fff" : C.muted,
                  }}>
                    {isDone ? "✓" : idx + 1}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: isCurrent ? 900 : isDone ? 600 : 500, color: isCurrent ? C.teal : isDone ? C.muted : C.txt, flex: 1 }}>
                    {STEP_NAME[step.key] || step.key}
                  </span>
                  {isCurrent && <span style={{ fontSize: 8, fontWeight: 900, color: C.orange, background: `${C.orange}15`, borderRadius: 99, padding: "2px 6px" }}>NOW</span>}
                </button>
              );
            })}
          </div>
        </div>}

        {/* ── 오른쪽: 선택된 단계 패널 ── */}
        {/* 오른쪽 컬럼 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <StepPanel
            key={selectedStep}
            selectedStepKey={selectedStep}
            currentStepKey={currentStepKey}
            currentIdx={currentIdx}
            client={client}
            workflowRun={workflowRun}
            onAdvance={load}
            clientId={clientId}
          />

          {/* 고객 기본정보 + 메일 현황 */}
          <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: mailingQueue.length > 0 ? "1fr 1fr" : "1fr", gap: 14 }}>
            <InfoPanel client={client} onUpdate={load} />
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

          {/* 촬영 갤러리 */}
          <ClientGallerySection clientId={clientId} hospitalName={client.name} email={client.email} workflowRunId={workflowRun?.id} />

          {/* 홍보 콘텐츠 앱 */}
          <div>
          <div style={{ fontSize: 11, fontWeight: 900, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12, paddingLeft: 2 }}>
            📢 홍보 콘텐츠 앱
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {PROMO_APPS.map((app) => (
              <Link key={app.href} href={`${app.href}?clientId=${clientId}&client_id=${clientId}${workflowRun?.id ? `&workflowRunId=${workflowRun.id}` : ""}&stepKey=${currentStepKey}`}
                style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, textDecoration: "none", transition: "all .15s" }}
                onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.teal; el.style.boxShadow = "0 4px 12px rgba(21,88,85,.1)"; }}
                onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.border; el.style.boxShadow = "none"; }}>
                <span style={{ fontSize: 22 }}>{app.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.teal, marginBottom: 3 }}>{app.title}</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{app.desc}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.orange, marginTop: "auto" }}>열기 →</span>
              </Link>
            ))}
          </div>
          </div>
        </div>

      </div>{/* 2컬럼 그리드 끝 */}
    </div>
  );
}

/* ── 촬영 갤러리 섹션 ── */
function ClientGallerySection({ hospitalName, email }: { hospitalName: string; email?: string }) {
  const [galleries, setGalleries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ nasLink: "", shootDate: "", description: "" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/galleries?q=${encodeURIComponent(hospitalName)}`);
      const d = await res.json();
      if (d.ok) setGalleries(d.galleries || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [hospitalName]);

  const save = async () => {
    if (!form.nasLink) { setMsg("NAS 링크를 입력해주세요."); return; }
    setSaving(true); setMsg("");
    try {
      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospitalName,
          contactEmail: email || "",
          nasLink: form.nasLink,
          shootDate: form.shootDate,
          description: form.description,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      setForm({ nasLink: "", shootDate: "", description: "" });
      setShowForm(false);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "저장 실패"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.03)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>📷 촬영 갤러리</div>
        <button onClick={() => setShowForm(v => !v)} style={{ fontSize: 11, fontWeight: 700, color: C.teal, background: "rgba(21,88,85,.06)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
          {showForm ? "닫기" : "+ 갤러리 추가"}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.02)", display: "grid", gap: 10 }}>
          <input value={form.nasLink} onChange={e => setForm(f => ({ ...f, nasLink: e.target.value }))}
            placeholder="NAS 갤러리 링크 *" style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", fontFamily: "inherit", color: C.txt, background: C.white, boxSizing: "border-box" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input type="date" value={form.shootDate} onChange={e => setForm(f => ({ ...f, shootDate: e.target.value }))}
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", fontFamily: "inherit", color: C.txt, background: C.white }} />
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="촬영 내용 메모" style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", fontFamily: "inherit", color: C.txt, background: C.white }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={save} disabled={saving} style={{ height: 34, padding: "0 18px", background: C.teal, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
              {saving ? "저장 중..." : "저장"}
            </button>
            {msg && <span style={{ fontSize: 11, color: msg.includes("실패") || msg.includes("입력") ? C.orange : C.teal, fontWeight: 700 }}>{msg}</span>}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "16px 18px", fontSize: 12, color: C.hint }}>불러오는 중...</div>
      ) : galleries.length === 0 ? (
        <div style={{ padding: "16px 18px", fontSize: 12, color: C.hint, textAlign: "center" }}>
          등록된 갤러리가 없습니다. 위에서 NAS 링크를 추가해주세요.
        </div>
      ) : (
        <div style={{ padding: "8px 0" }}>
          {galleries.map((g: any) => (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${C.border}` }}>
              {g.items?.[0]?.thumbnail_url ? (
                <img src={g.items[0].thumbnail_url} alt="" style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 48, height: 36, background: C.light, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 18 }}>📷</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.txt }}>
                  {g.shoot_date ? new Date(g.shoot_date).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" }) : "날짜 미입력"}
                </div>
                {g.description && <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.description}</div>}
              </div>
              <a href={g.nas_link} target="_blank" rel="noreferrer"
                style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: C.teal, background: C.light, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 10px", textDecoration: "none" }}>
                🔗 열기
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── STEP PANEL (인라인 전환) ── */
type SPProps = {
  selectedStepKey: string;
  currentStepKey: string;
  currentIdx: number;
  client: any;
  workflowRun: any;
  onAdvance: () => void;
  clientId: string;
};

function StepPanel({ selectedStepKey, currentStepKey, currentIdx, client, workflowRun, onAdvance, clientId }: SPProps) {
  const selectedIdx = WORKFLOW_STEPS.findIndex((s) => s.key === selectedStepKey);
  const isCurrent = selectedStepKey === currentStepKey;
  const isDone = selectedIdx < currentIdx;
  const info = STEP_INFO[selectedStepKey] ?? { icon: "📌", desc: "", href: "/" };
  const nextStepKey = WORKFLOW_STEPS[selectedIdx + 1]?.key;
  const nextStepName = nextStepKey ? (STEP_NAME[nextStepKey] || nextStepKey) : null;

  const [advancing, setAdvancing] = useState(false);
  const [advMsg, setAdvMsg] = useState("");
  const [nasLink, setNasLink] = useState("");
  const [fileCount, setFileCount] = useState("");
  const [checklist, setChecklist] = useState(SHOOTING_DEFAULT.map((item) => ({ item, done: false })));
  const [notes, setNotes] = useState("");
  // final_delivery 전용
  const [finalNasLink, setFinalNasLink] = useState("");
  const [finalFileCount, setFinalFileCount] = useState("");
  const [finalPackage, setFinalPackage] = useState("");

  const advance = async (toKey: string) => {
    if (!workflowRun?.id) return;
    setAdvancing(true);
    const payload: Record<string, unknown> = { workflow_run_id: workflowRun.id, to_step_key: toKey };
    // 최종 전달 완료 시 배송 데이터 전달
    if (selectedStepKey === "final_delivery" && toKey === "review_content" && finalNasLink) {
      payload.deliveryData = { nasLink: finalNasLink, fileCount: finalFileCount, packageName: finalPackage };
    }
    const res = await fetch("/api/workflow/advance", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (d.ok) {
      if (d.automated && d.action === "final_delivery_queued") {
        setAdvMsg("✅ 보정본 배송 메일이 메일링함에 자동 등록됐습니다.");
        setTimeout(() => { setAdvMsg(""); onAdvance(); }, 2000);
      } else {
        onAdvance();
      }
    } else {
      setAdvMsg(d.error || "오류가 발생했습니다.");
    }
    setAdvancing(false);
  };

  const toggleCheck = (idx: number) =>
    setChecklist((prev) => prev.map((c, i) => (i === idx ? { ...c, done: !c.done } : c)));

  const headerBg = isCurrent ? C.teal : isDone ? "#F0FDF8" : "rgba(21,88,85,.03)";
  const headerTxt = isCurrent ? "#fff" : C.teal;
  const checkDone = checklist.filter((c) => c.done).length;

  return (
    <div style={{
      background: C.white, borderRadius: 14, overflow: "hidden", marginBottom: 16,
      border: `1.5px solid ${isCurrent ? C.teal : isDone ? "rgba(34,135,106,.3)" : C.border}`,
    }}>
      {/* 헤더 */}
      <div style={{ padding: "14px 20px", background: headerBg, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 26 }}>{info.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: headerTxt, lineHeight: 1.2 }}>
                Step {selectedIdx + 1} · {STEP_NAME[selectedStepKey] || selectedStepKey}
              </div>
              <div style={{ fontSize: 11, color: isCurrent ? "rgba(255,255,255,.7)" : C.muted, marginTop: 3 }}>{info.desc}</div>
            </div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: "4px 12px", borderRadius: 99, flexShrink: 0,
            background: isCurrent ? "rgba(255,255,255,.2)" : isDone ? "rgba(34,135,106,.12)" : C.light,
            color: isCurrent ? "#fff" : isDone ? C.green : C.muted,
            border: isCurrent ? "1px solid rgba(255,255,255,.3)" : "none",
          }}>
            {isCurrent ? "▶ 진행 중" : isDone ? "✓ 완료" : "대기 중"}
          </span>
        </div>
      </div>

      {/* 바디 */}
      <div style={{ padding: "20px" }}>

        {/* ── 완료된 단계 ── */}
        {isDone && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ fontSize: 13, color: C.muted }}>이 단계는 완료됐습니다. 앱에서 내용을 재확인할 수 있습니다.</div>
            <Link href={buildStepAppLink({ stepKey: selectedStepKey, clientId, workflowRunId: workflowRun?.id })}
              style={{ padding: "8px 18px", background: C.light, color: C.teal, borderRadius: 8, fontSize: 12, fontWeight: 800, textDecoration: "none", border: `1px solid rgba(21,88,85,.2)` }}>
              {STEP_NAME[selectedStepKey]} 앱 열기 →
            </Link>
          </div>
        )}

        {/* ── 대기 중인 단계 ── */}
        {!isCurrent && !isDone && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>아직 이 단계에 도달하지 않았습니다.</div>
              <div style={{ fontSize: 11, color: C.hint }}>현재 단계: {STEP_NAME[currentStepKey]}</div>
            </div>
            <Link href={buildStepAppLink({ stepKey: selectedStepKey, clientId, workflowRunId: workflowRun?.id })}
              style={{ padding: "8px 18px", background: "rgba(21,88,85,.04)", color: C.muted, borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: "none", border: `1px solid ${C.border}` }}>
              미리 열기
            </Link>
          </div>
        )}

        {/* ── 현재 진행 단계 ── */}
        {isCurrent && (
          <>
            {/* 촬영 — 인라인 체크리스트 */}
            {selectedStepKey === "shooting" && (
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", background: "rgba(21,88,85,.04)", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>촬영 체크리스트</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: checkDone === checklist.length ? C.green : C.muted }}>{checkDone}/{checklist.length}</span>
                  </div>
                  <div style={{ padding: "6px" }}>
                    {checklist.map((item, idx) => (
                      <label key={idx} onClick={() => toggleCheck(idx)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px", borderRadius: 6, cursor: "pointer", background: item.done ? C.light : "transparent" }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `2px solid ${item.done ? C.green : C.border}`, background: item.done ? C.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {item.done && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 12, color: item.done ? C.muted : C.txt, textDecoration: item.done ? "line-through" : "none" }}>{item.item}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 2 }}>촬영 현장 메모</div>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={7}
                    placeholder="특이사항, 추가 요청, 컷 수 등"
                    style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "inherit", resize: "none", outline: "none", color: C.txt, boxSizing: "border-box", flex: 1 }} />
                </div>
              </div>
            )}

            {/* 원본 전달 — NAS 링크 인라인 */}
            {selectedStepKey === "original_delivery" && (
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>NAS 공유 링크</label>
                  <input value={nasLink} onChange={(e) => setNasLink(e.target.value)} placeholder="https://nas.example.com/share/..."
                    style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit", outline: "none", color: C.txt, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>파일 수량</label>
                  <input value={fileCount} onChange={(e) => setFileCount(e.target.value)} placeholder="예: RAW 324컷 / JPG 324컷"
                    style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit", outline: "none", color: C.txt, boxSizing: "border-box" }} />
                </div>
              </div>
            )}

            {/* 상담/미팅 — 고객 정보 요약 */}
            {selectedStepKey === "consult_meeting" && (
              <div style={{ background: C.light, borderRadius: 10, padding: "14px 18px", marginBottom: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                {[
                  ["병원이름", client.name], ["원장이름", client.director_name],
                  ["진료과", client.department], ["의료진 수", client.doctor_count ? `${client.doctor_count}명` : null],
                  ["주요 시술", client.main_treatments], ["특이사항", client.special_notes],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label as string}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, color: C.txt, fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 최종 전달 — 배송 정보 + 자동 메일 */}
            {selectedStepKey === "final_delivery" && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ background: "#FFF8F5", border: `1px solid ${C.orange}30`, borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.orange, marginBottom: 10 }}>
                    ✉️ 완료 시 보정본 배송 메일이 자동으로 메일링함에 등록됩니다
                  </div>
                  <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>NAS 공유 링크 *</label>
                      <input value={finalNasLink} onChange={(e) => setFinalNasLink(e.target.value)} placeholder="https://nas.example.com/share/..."
                        style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit", outline: "none", color: C.txt, boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>전달 수량</label>
                      <input value={finalFileCount} onChange={(e) => setFinalFileCount(e.target.value)} placeholder="예: 85"
                        style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit", outline: "none", color: C.txt, boxSizing: "border-box" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>폴더 구성 (패키지명)</label>
                    <input value={finalPackage} onChange={(e) => setFinalPackage(e.target.value)} placeholder="예: 프리미엄 패키지 : 프로필, 연출, 인테리어"
                      style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit", outline: "none", color: C.txt, boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>
            )}

            {/* 고객 셀렉 단계 */}
            {selectedStepKey === "client_selection" && (
              <SelectionStepPanel clientId={clientId} workflowRunId={workflowRun?.id} />
            )}

            {/* RAW 매칭 단계 */}
            {selectedStepKey === "raw_matching" && (
              <RawMatchingStepPanel clientId={clientId} workflowRunId={workflowRun?.id} />
            )}

            {/* 보정 단계 — 갤러리 등록 버튼 추가 */}
            {selectedStepKey === "retouching" && (
              <div style={{ marginBottom: 18, display: "grid", gap: 10 }}>
                <div style={{ padding: "14px 18px", background: C.light, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ fontSize: 13, color: C.teal, lineHeight: 1.6 }}>
                    <strong>{client.name}</strong>의 <strong>색감 보정</strong> 단계를 진행하세요.
                  </div>
                  <Link href={buildStepAppLink({ stepKey: selectedStepKey, clientId, workflowRunId: workflowRun?.id })}
                    style={{ padding: "10px 22px", background: C.white, color: C.teal, borderRadius: 8, fontSize: 13, fontWeight: 800, textDecoration: "none", border: `1.5px solid ${C.teal}`, whiteSpace: "nowrap" }}>
                    보정 앱 열기 →
                  </Link>
                </div>
                <div style={{ padding: "14px 18px", background: "#FFF8F5", borderRadius: 10, border: `1px solid ${C.orange}30`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: C.orange, marginBottom: 4 }}>🎉 보정 완료 후 갤러리 등록</div>
                    <div style={{ fontSize: 11, color: C.muted }}>저장 시 메일 draft 자동 생성 + 다음 단계로 자동 전진</div>
                  </div>
                  <Link href={`/gallery?client_id=${clientId}${workflowRun?.id ? `&workflow_run_id=${workflowRun.id}` : ""}`}
                    style={{ padding: "10px 22px", background: C.orange, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 900, textDecoration: "none", whiteSpace: "nowrap" }}>
                    📷 갤러리 등록 (보정 완료) →
                  </Link>
                </div>
              </div>
            )}

            {/* 기본 단계 — 설명 + 앱 링크 */}
            {!["shooting", "original_delivery", "consult_meeting", "final_delivery", "client_selection", "raw_matching", "retouching"].includes(selectedStepKey) && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18, padding: "14px 18px", background: C.light, borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: C.teal, lineHeight: 1.6 }}>
                  <strong>{client.name}</strong>의 <strong>{STEP_NAME[selectedStepKey]}</strong> 단계를 진행하세요.
                </div>
                <Link href={buildStepAppLink({ stepKey: selectedStepKey, clientId, workflowRunId: workflowRun?.id })}
                  style={{ padding: "10px 22px", background: C.white, color: C.teal, borderRadius: 8, fontSize: 13, fontWeight: 800, textDecoration: "none", border: `1.5px solid ${C.teal}`, whiteSpace: "nowrap" }}>
                  전체 앱에서 열기 →
                </Link>
              </div>
            )}

            {/* 완료 버튼 */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              {advMsg && <div style={{ fontSize: 12, color: C.orange, width: "100%" }}>{advMsg}</div>}
              {nextStepKey ? (
                <>
                  <span style={{ fontSize: 11, color: C.hint }}>완료 후 다음 단계: <strong style={{ color: C.teal }}>{nextStepName}</strong></span>
                  <button onClick={() => advance(nextStepKey)} disabled={advancing}
                    style={{ height: 42, padding: "0 24px", background: advancing ? C.hint : C.green, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 900, cursor: advancing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {advancing ? "처리 중..." : `✓ 완료 → ${nextStepName}`}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>🎉 14단계 모두 완료! 워크플로우가 마무리됐습니다.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── INFO PANEL ── */
function InfoPanel({ client, onUpdate }: { client: any; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const startEdit = () => {
    setForm({
      name:         client.hospital_name || client.name || "",
      manager_name: client.contact_name  || client.manager_name || "",
      phone:        client.phone         || "",
      email:        client.email         || "",
      department:   client.specialty     || client.department    || "",
      memo:         client.memo          || "",
    });
    setEditing(true); setMsg("");
  };

  const save = async () => {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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

  const rows: [string, string][] = [
    ["name",         "병원이름"],
    ["manager_name", "담당자"],
    ["phone",        "연락처"],
    ["email",        "이메일"],
    ["department",   "진료과"],
    ["memo",         "메모"],
  ];

  const displayVal = (key: string) => {
    const v = client[key] ?? client[{ name:"hospital_name", manager_name:"contact_name", department:"specialty" }[key] ?? key];
    if (!v) return "—";
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
      {msg && <div style={{ padding: "8px 18px", background: msg.includes("실패") ? "#FFF0F0" : C.light, fontSize: 12, fontWeight: 700, color: msg.includes("실패") ? C.orange : C.green }}>{msg}</div>}
      <div style={{ padding: "12px 18px", display: "grid", gap: 10 }}>
        {rows.map(([key, label]) => (
          <div key={key} className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, alignItems: "start" }}>
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
                  <a href={displayVal(key).startsWith("http") ? displayVal(key) : `https://${displayVal(key)}`} target="_blank" rel="noreferrer" style={{ color: C.teal, textDecoration: "none" }}>{displayVal(key)} ↗</a>
                ) : displayVal(key)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 셀렉 단계 인라인 패널 ── */
function SelectionStepPanel({ clientId, workflowRunId }: { clientId: string; workflowRunId?: string }) {
  const [gallery, setGallery] = useState<any>(null);
  const [selection, setSelection] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    // workflowRunId 우선, 없으면 clientId 기준 최신
    const qs = workflowRunId ? `workflowRunId=${workflowRunId}` : `clientId=${clientId}`;
    fetch(`/api/select-galleries?${qs}`)
      .then(r => r.json())
      .then(async d => {
        let g = d.ok && d.galleries.length > 0 ? d.galleries[0] : null;
        // workflowRunId로 못 찾았으면 clientId로 재조회
        if (!g && workflowRunId) {
          const d2 = await fetch(`/api/select-galleries?clientId=${clientId}`).then(r => r.json());
          g = d2.ok && d2.galleries.length > 0 ? d2.galleries[0] : null;
        }
        if (g) {
          setGallery(g);
          if (["selection_submitted", "raw_matched", "raw_matching"].includes(g.status)) {
            fetch(`/api/select-galleries/${g.id}`)
              .then(r => r.json())
              .then(d3 => { if (d3.ok) setSelection(d3.selection); });
          }
        }
      })
      .finally(() => setLoading(false));
  }, [clientId, workflowRunId]);

  const params = new URLSearchParams();
  params.set("clientId", clientId);
  if (workflowRunId) params.set("workflowRunId", workflowRunId);
  params.set("stepKey", "client_selection");

  if (loading) return <div style={{ fontSize: 13, color: C.muted, padding: "10px 0", marginBottom: 18 }}>셀렉 갤러리 확인 중...</div>;

  return (
    <div style={{ background: C.light, borderRadius: 10, padding: "14px 18px", marginBottom: 18 }}>
      {gallery ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.teal, marginBottom: 8 }}>📸 셀렉 갤러리 연결됨</div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.muted, flexWrap: "wrap", marginBottom: 10 }}>
            <span>상태: <strong style={{ color: C.txt }}>{gallery.status}</strong></span>
            <span>이미지: <strong>{gallery.total_jpg_count}장</strong></span>
            {gallery.selected_count > 0 && <span style={{ color: C.green, fontWeight: 700 }}>선택 완료 {gallery.selected_count}장</span>}
          </div>
          {selection?.customer_memo && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400E", marginBottom: 10 }}>
              💬 {selection.customer_memo}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
          연결된 셀렉 갤러리가 없습니다. 사진 분류 완료 후 갤러리를 생성하세요.
        </div>
      )}
      <Link href={`/select-galleries?${params.toString()}`}
        style={{ display: "inline-block", padding: "9px 20px", background: C.teal, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
        셀렉 갤러리 열기 →
      </Link>
    </div>
  );
}

/* ── RAW 매칭 단계 인라인 패널 ── */
function RawMatchingStepPanel({ clientId, workflowRunId }: { clientId: string; workflowRunId?: string }) {
  const [gallery, setGallery] = useState<any>(null);
  const [selection, setSelection] = useState<any>(null);
  const [rawMatches, setRawMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    const qs = workflowRunId ? `workflowRunId=${workflowRunId}` : `clientId=${clientId}`;
    fetch(`/api/select-galleries?${qs}`)
      .then(r => r.json())
      .then(async d => {
        let g = d.ok && d.galleries.length > 0 ? d.galleries[0] : null;
        if (!g && workflowRunId) {
          const d2 = await fetch(`/api/select-galleries?clientId=${clientId}`).then(r => r.json());
          g = d2.ok && d2.galleries.length > 0 ? d2.galleries[0] : null;
        }
        if (g) {
          setGallery(g);
          fetch(`/api/select-galleries/${g.id}`)
            .then(r => r.json())
            .then(d3 => {
              if (d3.ok) { setSelection(d3.selection); setRawMatches(d3.rawMatches ?? []); }
            });
        }
      })
      .finally(() => setLoading(false));
  }, [clientId]);

  const params = new URLSearchParams();
  params.set("clientId", clientId);
  if (workflowRunId) params.set("workflowRunId", workflowRunId);
  params.set("stepKey", "raw_matching");

  if (loading) return <div style={{ fontSize: 13, color: C.muted, padding: "10px 0", marginBottom: 18 }}>데이터 로딩 중...</div>;

  const matchedCount = rawMatches.filter(m => m.status === "matched").length;
  const missingCount = rawMatches.filter(m => m.status === "raw_missing").length;
  const isMatched = rawMatches.length > 0;

  return (
    <div style={{ background: C.light, borderRadius: 10, padding: "14px 18px", marginBottom: 18 }}>
      {selection ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.teal, marginBottom: 8 }}>
            {isMatched ? "✅ RAW 매칭 완료" : "⏳ 고객 선택 완료 — RAW 매칭 대기 중"}
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ color: C.green, fontWeight: 700 }}>선택 {selection.selected_count}장</span>
            {isMatched && <span style={{ color: C.green, fontWeight: 700 }}>RAW 매칭 {matchedCount}장</span>}
            {isMatched && missingCount > 0 && <span style={{ color: "#DC2626", fontWeight: 700 }}>누락 {missingCount}장</span>}
          </div>
          {selection.customer_memo && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400E", marginBottom: 10 }}>
              💬 {selection.customer_memo}
            </div>
          )}
          {!isMatched && (
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
              선택 파일명:&nbsp;
              {selection.selected_files.slice(0, 5).join(", ")}
              {selection.selected_files.length > 5 ? ` 외 ${selection.selected_files.length - 5}개` : ""}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>고객이 아직 사진을 선택하지 않았습니다.</div>
      )}
      <Link href={gallery ? `/select-galleries/${gallery.id}?${params.toString()}` : `/select-galleries?${params.toString()}`}
        style={{ display: "inline-block", padding: "9px 20px", background: C.teal, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
        {isMatched ? "RAW 매칭 리포트 보기 →" : "RAW 자동 매칭 시작 →"}
      </Link>
    </div>
  );
}
