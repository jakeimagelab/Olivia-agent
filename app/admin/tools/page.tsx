import Link from "next/link";
import { ArrowRight, ChevronDown, Layers3, Search } from "lucide-react";
import CategorySection from "@/components/admin/CategorySection";
import ToolCategoryTabs from "@/components/admin/ToolCategoryTabs";
import { normalizeAdminSearchQuery } from "@/lib/adminSearch";
import { ALL_TOOLS } from "@/lib/toolNav";
import { getDisplayCategory, groupToolsByDisplayCategory } from "@/lib/toolNavDisplayCategory";
import {
  WORKSPACE_GROUPS,
  isIntegratedToolHref,
  workspaceGroupSearchText,
} from "@/lib/workspaceGroups";

const CONTEXT_KEYS = ["clientId", "projectId", "workflowRunId", "stepKey"] as const;

function withContext(href: string, context: URLSearchParams) {
  if (context.size === 0) return href;
  const url = new URL(href, "https://olivia.local");
  context.forEach((value, key) => url.searchParams.set(key, value));
  return `${url.pathname}${url.search}`;
}

export default async function AdminToolsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const context = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value) context.set(key, value);
  }

  const rawQuery = typeof params.q === "string" ? params.q : "";
  const query = normalizeAdminSearchQuery(rawQuery);
  const workspaceGroups = query
    ? WORKSPACE_GROUPS.filter((group) => normalizeAdminSearchQuery(workspaceGroupSearchText(group)).includes(query))
    : WORKSPACE_GROUPS;
  const standaloneTools = ALL_TOOLS
    .filter((tool) => !isIntegratedToolHref(tool.href))
    .filter((tool) => !query || normalizeAdminSearchQuery(`${tool.title} ${tool.desc} ${tool.meta} ${(tool.aliases ?? []).join(" ")}`).includes(query));
  const standaloneGroups = groupToolsByDisplayCategory(standaloneTools)
    .map((group) => ({ category: group.category, label: group.label, count: group.items.length }))
    .filter((group) => group.count > 0);
  const hasResults = workspaceGroups.length > 0 || standaloneTools.length > 0;

  return (
    <div className="oa-page oa-tools-launcher oa-workspace-launcher">
      <div className="oa-tools-launcher__heading">
        <h1>통합 작업실</h1>
        <p>흩어진 기능을 업무 단위로 통합해 더 빠르게 작업합니다.</p>
      </div>

      <section className="oa-workspace-notice" aria-label="통합 작업실 안내">
        <span className="oa-workspace-notice__icon"><Layers3 size={18} aria-hidden="true" /></span>
        <div>
          <strong>중복 기능을 줄이고, 채팅과 페이지를 같은 구조로 연결합니다.</strong>
          {context.size > 0 ? (
            <p>{[
              typeof params.clientId === "string" && `고객 ${params.clientId}`,
              typeof params.projectId === "string" && `프로젝트 ${params.projectId}`,
            ].filter(Boolean).join(" · ")} 컨텍스트를 작업실에 이어갑니다.</p>
          ) : null}
        </div>
      </section>

      <form className="oa-tools-search" method="GET" action="/admin/tools">
        {CONTEXT_KEYS.map((key) => (params[key] ? <input key={key} type="hidden" name={key} value={String(params[key])} /> : null))}
        <Search size={16} aria-hidden="true" />
        <input type="search" name="q" defaultValue={rawQuery} placeholder="작업실 또는 기능 검색" aria-label="작업실 또는 기능 검색" />
      </form>

      {workspaceGroups.length > 0 ? (
        <section className="oa-workspace-list" aria-label="업무별 작업실">
          {workspaceGroups.map((workspace) => {
            const Icon = workspace.icon;
            const workspaceHref = withContext(workspace.href, context);
            return (
              <article key={workspace.id} className="oa-workspace-card" data-accent={workspace.accent}>
                <Link className="oa-workspace-card__overlay" href={workspaceHref} aria-label={`${workspace.title} 열기`} />
                <span className="oa-workspace-card__icon" aria-hidden="true"><Icon size={24} strokeWidth={1.7} /></span>
                <div className="oa-workspace-card__body">
                  <h2>{workspace.title}</h2>
                  <p>{workspace.description}</p>
                  <div className="oa-workspace-card__tools" aria-label={`${workspace.title} 세부 기능`}>
                    {workspace.tools.map((tool) => (
                      <Link key={tool.id} href={withContext(tool.href, context)}>{tool.title}</Link>
                    ))}
                  </div>
                </div>
                <Link className="oa-workspace-card__open" href={workspaceHref}>
                  열기 <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </section>
      ) : null}

      {standaloneTools.length > 0 ? (
        <details className="oa-standalone-tools" open={query ? true : undefined}>
          <summary className="oa-standalone-tools__heading">
            <span><strong>독립 기능</strong><small>캘린더, 프롬프터, 팀 채팅 등 {standaloneTools.length}개</small></span>
            <span className="oa-standalone-tools__toggle">기능 보기 <ChevronDown size={15} aria-hidden="true" /></span>
          </summary>
          <div className="oa-standalone-tools__content">
            <ToolCategoryTabs groups={standaloneGroups} totalCount={standaloneTools.length}>
              <div className="admin-menu-grid">
                {standaloneTools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Link key={tool.href} href={withContext(tool.href, context)} data-tool-category={getDisplayCategory(tool)} className={`admin-menu-card${tool.orange ? " orange" : ""}`} aria-label={tool.title}>
                      <div className="admin-menu-icon"><Icon size={19} /></div>
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
            </ToolCategoryTabs>
          </div>
        </details>
      ) : null}

      {!hasResults ? (
        <CategorySection eyebrow="WORKSPACES" title="검색 결과">
          <div className="oa-tool-search-empty">
            <strong>“{rawQuery}”에 해당하는 작업실이나 기능이 없습니다.</strong>
            <p>다른 업무명이나 기능명으로 검색해보세요.</p>
            <Link href={withContext("/admin/tools", context)}>검색 초기화</Link>
          </div>
        </CategorySection>
      ) : null}
    </div>
  );
}
