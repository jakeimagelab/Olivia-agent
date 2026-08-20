"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import StatusBadge from "@/components/admin/StatusBadge";
import type { NavCategory } from "@/lib/toolNav";

const spring = { type: "spring" as const, stiffness: 280, damping: 32, mass: 0.7 };

type ToolCategoryPanelProps = {
  category: NavCategory;
  label: string;
  count: number;
  defaultOpen: boolean;
  children: ReactNode;
};

// 전체보기 첫 화면엔 카테고리 3개만 보이고, 눌러야 그 안의 기능 카드가 펼쳐진다(요청) —
// 화면이 뚝 끊기며 다른 페이지로 넘어가는 대신, 같은 자리에서 높이가 부드럽게 늘어나는
// 아코디언으로 처리한다. 검색 중일 때는(defaultOpen) 클릭 없이 바로 펼쳐서 보여준다.
// 카드 그리드(children)는 반드시 서버 컴포넌트(page.tsx)에서 미리 렌더링해서 넘겨야 한다 —
// ToolDef.icon은 함수(컴포넌트) 참조라 Server→Client 경계로 직렬화되는 prop으로는 못 넘긴다
// (이전 버전은 items를 그대로 prop으로 넘겨서 전체보기 페이지가 런타임 에러로 죽었었다).
export default function ToolCategoryPanel({ category, label, count, defaultOpen, children }: ToolCategoryPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="oa-category-section oa-tool-category-panel">
      <button
        type="button"
        className="oa-category-section__header oa-tool-category-panel__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div className="oa-category-section__heading">
          <p className="oa-category-section__eyebrow">{category.toUpperCase()}</p>
          <h2 className="oa-category-section__title">{label}</h2>
        </div>
        <div className="oa-category-section__action oa-tool-category-panel__meta">
          <StatusBadge tone="blue">{count}개 기능</StatusBadge>
          <ChevronDown size={18} className="oa-tool-category-panel__chevron" data-open={open} aria-hidden="true" />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            style={{ overflow: "hidden" }}
          >
            <div className="oa-category-section__content oa-tool-category-panel__content">
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
