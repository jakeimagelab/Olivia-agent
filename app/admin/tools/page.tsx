import Link from "next/link";
import { ArrowRight, Camera, SlidersHorizontal, Search } from "lucide-react";
import CategorySection from "@/components/admin/CategorySection";
import StatusBadge from "@/components/admin/StatusBadge";
import { ALL_TOOLS } from "@/lib/toolNav";

// 사이드바 "개별 기능"은 tools 카테고리만 보여주지만, 이 홈은 이름 그대로 전체 기능 목록
// (메모·캘린더 등 대시보드/CRM 카테고리 포함)이 다 있어야 한다는 요청 — ALL_TOOLS 전체를 쓴다.
// 카드 디자인은 예전 홈(app/page.tsx)의 admin-menu-card를 그대로 재사용 — 새로 만들지 않고
// 이미 검증된 반응형 그리드(5→4→3→2→1열)를 그대로 가져다 써서 old-design 느낌을 100% 맞춘다.
const TOOLS = ALL_TOOLS;

const CONTEXT_KEYS = ["clientId", "projectId", "workflowRunId", "stepKey"] as const;

export default async function AdminToolsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const context = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value) context.set(key, value);
  }
  const linked = context.size > 0;
  const suffix = linked ? `?${context.toString()}` : "";

  return (
    <div className="oa-page oa-tools-page">
      <section className={`oa-context-banner${linked ? " is-linked" : ""}`}>
        <span className="oa-context-banner__icon"><Camera size={19}/></span>
        <div className="oa-context-banner__copy">
          <strong>{linked ? "고객 프로젝트와 연결된 작업입니다." : "현재 고객과 연결되지 않은 독립 작업입니다."}</strong>
          <p>{linked ? [params.clientId && `고객 ${params.clientId}`, params.projectId && `프로젝트 ${params.projectId}`, params.workflowRunId && `워크플로우 ${params.workflowRunId}`].filter(Boolean).join(" · ") : "도구를 바로 실행하거나, 추후 CRM에서 고객과 프로젝트를 선택해 연결할 수 있습니다."}</p>
        </div>
        {linked ? <a className="oa-context-banner__action" href="/admin/crm/dashboard">CRM으로 돌아가기</a> : <a className="oa-context-banner__action" href="/admin/crm/clients">고객 선택해서 연결하기</a>}
      </section>

      <CategorySection
        eyebrow="WORK TOOLS"
        title="실제 작업 도구"
        description="각 기능은 고객 연결 없이도 독립적으로 실행할 수 있습니다."
        action={<StatusBadge tone="blue">{TOOLS.length}개 기능</StatusBadge>}
      >
        <div className="oa-tool-toolbar" aria-label="기능 탐색 도구">
          <label className="oa-tool-search">
            <Search size={15} aria-hidden="true"/>
            <span className="oa-visually-hidden">기능 검색</span>
            <input type="search" placeholder="기능 이름 검색" />
          </label>
          <div className="oa-tool-filters" aria-label="기능 카테고리">
            <button className="is-active" type="button">전체</button>
            <button type="button" aria-label="필터 설정"><SlidersHorizontal size={14} aria-hidden="true"/></button>
          </div>
        </div>
        <div className="admin-menu-grid">
          {TOOLS.map(tool => {
            const Icon = tool.icon;
            return (
              <Link key={tool.href} href={`${tool.href}${suffix}`} className={`admin-menu-card${tool.orange ? " orange" : ""}`}>
                <div className="admin-menu-icon"><Icon size={26}/></div>
                <div className="admin-menu-copy">
                  <span>{tool.meta}</span>
                  <h2>{tool.title}</h2>
                  <p>{tool.desc}</p>
                </div>
                <div className="admin-menu-action" aria-hidden="true"><ArrowRight size={21}/></div>
              </Link>
            );
          })}
        </div>
      </CategorySection>
    </div>
  );
}
