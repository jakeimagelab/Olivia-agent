"use client";

import { DailyBriefCard, TodayScheduleCard } from "@/components/dashboard/TodayAlertBanner";
import DailyQuoteWidget from "@/components/dashboard/DailyQuoteWidget";
import { HomeDashboardDataProvider } from "@/components/dashboard/HomeDashboardData";
import MarketingBriefing from "@/components/dashboard/MarketingBriefing";
import QuickActions from "@/components/dashboard/QuickActions";
import WorkBriefing from "@/components/dashboard/WorkBriefing";

export default function AdminDashboardHomePage() {
  const openBriefing = () => {
    document.getElementById("work-briefing")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <HomeDashboardDataProvider>
      <div className="oa-page pc-dash-home crm-dashboard-page home-simple-dashboard">
        <div className="pc-dash-brief">
          <DailyBriefCard onOpenBriefing={openBriefing}/>
          <TodayScheduleCard/>
          <DailyQuoteWidget/>
        </div>

        <QuickActions/>

        <div className="home-briefing-grid">
          <WorkBriefing/>
          <MarketingBriefing/>
        </div>
      </div>
    </HomeDashboardDataProvider>
  );
}
