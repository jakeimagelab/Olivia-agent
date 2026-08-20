"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import StatusBadge from "@/components/admin/StatusBadge";
import type { NavCategory, ToolDef } from "@/lib/toolNav";

const spring = { type: "spring" as const, stiffness: 280, damping: 32, mass: 0.7 };

type ToolCategoryPanelProps = {
  category: NavCategory;
  label: string;
  items: ToolDef[];
  suffix: string;
  defaultOpen: boolean;
};

// 전체보기 첫 화면엔 카테고리 3개만 보이고, 눌러야 그 안의 기능 카드가 펼쳐진다(요청) —
// 화면이 뚝 끊기며 다른 페이지로 넘어가는 대신, 같은 자리에서 높이가 부드럽게 늘어나는
// 아코디언으로 처리한다. 검색 중일 때는(defaultOpen) 클릭 없이 바로 펼쳐서 보여준다.
export default function ToolCategoryPanel({ category, label, items, suffix, defaultOpen }: ToolCategoryPanelProps) {
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
          <StatusBadge tone="blue">{items.length}개 기능</StatusBadge>
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
              <div className="admin-menu-grid">
                {items.map((tool) => {
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
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
