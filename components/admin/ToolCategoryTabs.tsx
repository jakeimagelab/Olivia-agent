"use client";

import { useState, type ReactNode } from "react";

// category는 원래 lib/toolNav.ts의 NavCategory였지만, 이 컴포넌트의 유일한 소비자인
// app/admin/tools/page.tsx가 전용 표시 카테고리(lib/toolNavDisplayCategory.ts)로 바뀌면서
// string으로 넓혔다(전체보기 개편, 2026-08-31) — 로직은 문자열 비교뿐이라 타입만 넓혀도 안전.
type TabGroup = { category: string; label: string; count: number };

type ToolCategoryTabsProps = {
  groups: TabGroup[];
  totalCount: number;
  defaultActive?: string;
  children: ReactNode;
};

// 3단 아코디언 대신 상단 필터 탭으로 카테고리를 즉시 전환한다(요청) — 기능 카드는
// page.tsx(서버 컴포넌트)가 아이콘까지 다 렌더링해서 children으로 넘긴 단일 그리드
// 그대로고, 여기서는 어떤 카테고리를 보여줄지 data-active-tab 속성만 바꾼다.
// ToolDef.icon(함수 참조)을 클라이언트 컴포넌트에 raw prop으로 넘기면 직렬화 에러가 난다
// (이전 버전이 그렇게 죽었었다) — 그래서 카드 목록 자체는 절대 prop으로 받지 않는다.
export default function ToolCategoryTabs({ groups, totalCount, defaultActive = "all", children }: ToolCategoryTabsProps) {
  const [active, setActive] = useState<NavCategory | "all">(defaultActive);

  return (
    <>
      <div className="oa-tool-tabs" role="tablist" aria-label="기능 카테고리">
        <button type="button" className="oa-tool-tabs__tab" data-active={active === "all"} role="tab" aria-selected={active === "all"} onClick={() => setActive("all")}>
          전체<span className="oa-tool-tabs__tab-count">{totalCount}</span>
        </button>
        {groups.map((group) => (
          <button key={group.category} type="button" className="oa-tool-tabs__tab" data-active={active === group.category} role="tab" aria-selected={active === group.category} onClick={() => setActive(group.category)}>
            {group.label}<span className="oa-tool-tabs__tab-count">{group.count}</span>
          </button>
        ))}
      </div>
      <div className="oa-tool-tabs__grid" data-active-tab={active}>
        {children}
      </div>
    </>
  );
}
