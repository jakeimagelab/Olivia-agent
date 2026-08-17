"use client";

import { FilePlus2, FolderUp, CalendarPlus, UsersRound } from "lucide-react";
import { navigateToFeature } from "@/lib/olivia/features/navigationBridge";

// 코드 요청서 — UI/UX 통일 개편(2026-08-18) 7절: 홈 하단 Quick Actions는
// "새 프로젝트/문서 업로드/일정 등록/고객 검색" 네 가지 화면 이동만 담당한다(맥락 해석이
// 필요한 견적/콘티/자료 생성은 채팅에게 말로 시키는 쪽이 Olivia의 핵심 UX라 여기서 빼둔다).
const QUICK_LINKS = [
  { label: "새 프로젝트", href: "/clients", icon: FilePlus2 },
  { label: "문서 업로드", href: "/quote", icon: FolderUp },
  { label: "일정 등록", href: "/calendar", icon: CalendarPlus },
  { label: "고객 검색", href: "/clients", icon: UsersRound },
] as const;

export default function QuickActions() {
  return (
    <section className="pc-panel pc-quick-panel">
      <div className="pc-panel__header">
        <h3>빠른 실행</h3>
      </div>

      <div className="pc-quick-actions">
        {QUICK_LINKS.map(({ label, href, icon: Icon }) => (
          <button key={label} type="button" className="pc-quick-action" onClick={() => navigateToFeature(href)}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
