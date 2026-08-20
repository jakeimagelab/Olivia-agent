import Link from "next/link";
import { ArrowRight, Camera } from "lucide-react";
import CategorySection from "@/components/admin/CategorySection";
import ToolCategoryPanel from "@/components/admin/ToolCategoryPanel";
import { ALL_TOOLS, groupToolsByCategory } from "@/lib/toolNav";
import { normalizeAdminSearchQuery } from "@/lib/adminSearch";

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
  const rawQuery = typeof params.q === "string" ? params.q : "";
  const query = normalizeAdminSearchQuery(rawQuery);
  const filteredTools = query
    ? TOOLS.filter((tool) => normalizeAdminSearchQuery(`${tool.title} ${tool.desc} ${tool.meta}`).includes(query))
    : TOOLS;
  // 카테고리별로 나눠 보여준다(요청) — 이미 있던 groupToolsByCategory(전역 사이드바용으로 만들어졌지만
  // 안 쓰이고 있었다)를 그대로 재사용해서 /admin의 3분류(관리자 대시보드/고객관리 CRM/AI Assistant)
  // 기준을 그대로 따른다. 검색으로 걸러진 뒤 비는 카테고리는 섹션 자체를 숨긴다.
  const groupedTools = groupToolsByCategory(filteredTools).filter((group) => group.items.length > 0);

  return (
    <div className="oa-page oa-tools-page">
      <section className={`oa-context-banner${linked ? " is-linked" : ""}`}>
        <span className="oa-context-banner__icon"><Camera size={19}/></span>
        <div className="oa-context-banner__copy">
          <strong>{linked ? "고객 프로젝트와 연결된 작업입니다." : "현재 고객과 연결되지 않은 독립 작업입니다."}</strong>
          <p>{linked ? [params.clientId && `고객 ${params.clientId}`, params.projectId && `프로젝트 ${params.projectId}`, params.workflowRunId && `워크플로우 ${params.workflowRunId}`].filter(Boolean).join(" · ") : "도구를 바로 실행하거나, 추후 CRM에서 고객과 프로젝트를 선택해 연결할 수 있습니다."}</p>
        </div>
        {linked ? <a className="oa-context-banner__action" href="/admin/dashboard/home">홈으로 돌아가기</a> : <a className="oa-context-banner__action" href="/clients">고객 선택해서 연결하기</a>}
      </section>

      {filteredTools.length ? groupedTools.map((group) => (
        <ToolCategoryPanel
          key={group.category}
          category={group.category}
          label={group.label}
          count={group.items.length}
          // 검색 중일 땐 카테고리를 눌러야 보이면 검색 의미가 없어지니 바로 펼쳐서 보여준다.
          defaultOpen={Boolean(query)}
        >
          {/* 카드는 여기(서버 컴포넌트)에서 아이콘까지 다 렌더링해서 완성된 JSX로 넘긴다 —
              ToolDef.icon(함수 참조)을 클라이언트 컴포넌트에 raw prop으로 넘기면 직렬화 에러가 난다. */}
          <div className="admin-menu-grid">
            {group.items.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link key={tool.href} href={`${tool.href}${suffix}`} className={`admin-menu-card${tool.orange ? " orange" : ""}`}>
                  <div className={`admin-menu-icon admin-menu-icon--${tool.category}`}><Icon size={19} /></div>
                  <div className="admin-menu-copy">
                    <span>{tool.meta}</span>
                    <h2>{tool.title}</h2>
                    <p>{tool.desc}</p>
                  </div>
                  <div className="admin-menu-action" aria-hidden="true"><ArrowRight size={17} /></div>
                </Link>
              );
            })}
          </div>
        </ToolCategoryPanel>
      )) : (
        <CategorySection eyebrow="WORK TOOLS" title="실제 작업 도구">
          <div className="oa-tool-search-empty"><strong>“{rawQuery}”에 해당하는 기능이 없습니다.</strong><p>다른 기능명이나 설명 키워드로 검색해보세요.</p><Link href={`/admin/tools${suffix}`}>검색 초기화</Link></div>
        </CategorySection>
      )}
    </div>
  );
}
