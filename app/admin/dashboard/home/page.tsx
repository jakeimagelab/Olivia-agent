"use client";

import { HomeDashboardDataProvider } from "@/components/dashboard/HomeDashboardData";
import IntegratedCalendar from "@/components/dashboard/IntegratedCalendar";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentProjects from "@/components/dashboard/RecentProjects";
import OliviaHeroChat from "@/components/home/OliviaHeroChat";
import DynamicWorkspace from "@/components/workspace/DynamicWorkspace";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";

// Olivia Agent 2.0 — 홈은 채팅 + 빠른실행/최근프로젝트/통합캘린더 3장이 전부다(참고 목업 그대로).
// 예전 대시보드 위젯(브리핑/오늘 스케줄/명언/업무 브리핑/마케팅 브리핑)은 화면에서 뺐다 —
// 필요하면 각 기능(캘린더/워크플로우/마케팅) 화면에서 확인할 수 있다.
export default function AdminDashboardHomePage() {
  const hasWorkspace = useWorkspaceStore((s) => s.type !== null);

  return (
    <HomeDashboardDataProvider>
      <div className="oa-page pc-dash-home crm-dashboard-page home-simple-dashboard">
        {hasWorkspace ? (
          // Phase 2 — 채팅에서 워크스페이스를 열면 채팅은 위에 작게 남고 그 아래로 기능 화면
          // (DynamicWorkspace)이 채운다. fullscreen이면 DynamicWorkspace가 스스로 body로
          // 포털돼 이 레이아웃 전체를 덮으므로 여기서는 그대로 split을 유지한다.
          <div className="pc-dash-split">
            <div className="pc-dash-split__chat">
              <OliviaHeroChat compact />
            </div>
            <div className="pc-dash-split__workspace">
              <DynamicWorkspace />
            </div>
          </div>
        ) : (
          <>
            <div className="pc-dash-hero">
              <OliviaHeroChat />
            </div>

            <div className="pc-dash-quickrow">
              <QuickActions />
              <RecentProjects />
              <IntegratedCalendar />
            </div>
          </>
        )}
      </div>
    </HomeDashboardDataProvider>
  );
}
