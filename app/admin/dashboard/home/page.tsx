"use client";

import { DailyBriefCard, TodayScheduleCard } from "@/components/dashboard/TodayAlertBanner";
import DailyQuoteWidget from "@/components/dashboard/DailyQuoteWidget";
import { HomeDashboardDataProvider } from "@/components/dashboard/HomeDashboardData";
import IntegratedCalendar from "@/components/dashboard/IntegratedCalendar";
import MarketingBriefing from "@/components/dashboard/MarketingBriefing";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentProjects from "@/components/dashboard/RecentProjects";
import WorkBriefing from "@/components/dashboard/WorkBriefing";
import WorkspaceTodoCard from "@/components/dashboard/WorkspaceTodoCard";
import OliviaHeroChat from "@/components/home/OliviaHeroChat";
import DynamicWorkspace from "@/components/workspace/DynamicWorkspace";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";

export default function AdminDashboardHomePage() {
  const openBriefing = () => {
    document.getElementById("work-briefing")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const hasWorkspace = useWorkspaceStore((s) => s.type !== null);

  return (
    <HomeDashboardDataProvider>
      <div className="oa-page pc-dash-home crm-dashboard-page home-simple-dashboard">
        {hasWorkspace ? (
          // Olivia Agent 2.0 Phase 2 — 채팅에서 워크스페이스를 열면 채팅은 위에 작게 남고
          // 그 아래로 기능 화면(DynamicWorkspace)이 채운다. fullscreen이면 DynamicWorkspace가
          // 스스로 body로 포털돼 이 레이아웃 전체를 덮으므로 여기서는 그대로 split을 유지한다.
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

            <div className="pc-dash-legacy-label">더 확인하기</div>

            <div className="pc-dash-brief">
              <DailyBriefCard onOpenBriefing={openBriefing}/>
              <TodayScheduleCard/>
              <DailyQuoteWidget/>
            </div>

            <div style={{ marginBottom: 14 }}><WorkspaceTodoCard/></div>

            <div className="home-briefing-grid">
              <WorkBriefing/>
              <MarketingBriefing/>
            </div>
          </>
        )}
      </div>
    </HomeDashboardDataProvider>
  );
}
