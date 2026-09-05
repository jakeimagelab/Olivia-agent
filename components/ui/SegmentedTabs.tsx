"use client";

import type { CSSProperties, ReactNode } from "react";

export type SegmentedTabsItem<T extends string = string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  /* 탭 옆에 보조 설명이 필요하면 title(hover 툴팁)로만 — 세그먼트 컨트롤은 본문에
     설명 문구를 안 보여준다(제안서 1.3 "탭 위아래에 정체불명의 띠를 두지 않는다"와 같은 맥락:
     탭 자체도 크게 만들지 않는다). */
  title?: string;
};

type SegmentedTabsProps<T extends string> = {
  items: SegmentedTabsItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  style?: CSSProperties;
};

const trackStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  width: "max-content",
  maxWidth: "100%",
  overflowX: "auto",
  padding: 3,
  borderRadius: 10,
  background: "rgba(21, 88, 85, .07)",
};

function tabStyle(active: boolean): CSSProperties {
  return {
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: 0,
    borderRadius: 8,
    padding: "7px 14px",
    background: active ? "#fff" : "transparent",
    color: active ? "var(--teal)" : "var(--muted)",
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 700,
    whiteSpace: "nowrap",
    cursor: "pointer",
    boxShadow: active ? "0 1px 4px rgba(21, 88, 85, .18)" : "none",
    transition: "background 180ms cubic-bezier(.32,.72,0,1), color 180ms cubic-bezier(.32,.72,0,1)",
  };
}

// OLIVIA OS Desktop UI 제안서 1.3 + 3단계 — 사진작업실(PhotoWorkspaceTabs)에서 이미
// 검증된 맥 스타일 알약 세그먼트 컨트롤을 그대로 프리미티브로 뽑았다. 좌측 상단 배치,
// 중앙 정렬 금지, 탭 전환에 오렌지를 쓰지 않는 것(활성 탭은 흰 배경+진한 틸 글씨)까지
// 전부 이 컴포넌트 하나로 보장된다.
export default function SegmentedTabs<T extends string>({ items, value, onChange, ariaLabel, style }: SegmentedTabsProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} style={{ ...trackStyle, ...style }}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={item.title}
            style={tabStyle(active)}
            onClick={() => onChange(item.value)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
