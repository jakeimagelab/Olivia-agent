import { Camera, SlidersHorizontal, Search } from "lucide-react";
import FeatureCard from "@/components/admin/FeatureCard";
import CategorySection from "@/components/admin/CategorySection";
import StatusBadge from "@/components/admin/StatusBadge";
import { groupToolsByCategory } from "@/lib/toolNav";

// 사이드바 "개별 기능"과 동일한 소스(lib/toolNav.ts)에서 tools 카테고리 전체를 가져온다 —
// 예전엔 여기 자체 하드코딩 목록(11개, 실제 라우트와 안 맞는 가짜 slug)이 따로 있어서
// 사이드바와 내용이 어긋났었다.
const TOOLS = groupToolsByCategory().find(g => g.category === "tools")?.items ?? [];

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
        <div className="oa-feature-grid">
          {TOOLS.map(tool => (
            <FeatureCard key={tool.href} title={tool.title} description={tool.desc}
              href={`${tool.href}${suffix}`} icon={<tool.icon size={22}/>}
              tags={[tool.meta]} status="사용 가능" orange={tool.orange}/>
          ))}
        </div>
      </CategorySection>
    </div>
  );
}
