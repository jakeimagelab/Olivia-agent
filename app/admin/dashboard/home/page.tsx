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

export default function AdminDashboardHomePage() {
  const openBriefing = () => {
    document.getElementById("work-briefing")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <HomeDashboardDataProvider>
      <div className="oa-page pc-dash-home crm-dashboard-page home-simple-dashboard">
        {/* Olivia Agent 2.0 — 채팅 중심 홈: 큰 채팅이 맨 위, 빠른실행/최근프로젝트/통합캘린더가
            그 아래 3장 카드로 온다. 기존 위젯(브리핑/일정체크/업무브리핑/마케팅브리핑)은 삭제하지
            않고 그 아래로 유지한다. */}
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
      </div>
    </HomeDashboardDataProvider>
  );
}
