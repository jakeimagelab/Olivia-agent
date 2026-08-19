"use client";

import { HomeDashboardDataProvider } from "@/components/dashboard/HomeDashboardData";
import OliviaAdaptiveStage from "@/components/home/OliviaAdaptiveStage";

// Agent-first Home — 중앙은 Olivia Conversation에 집중하고, 일정/최근 작업은 사용자가 요청할
// 때만 여는 우측 Context Drawer에 둔다. 기존 기능과 데이터 소스는 각 화면에서 그대로 유지한다.
export default function AdminDashboardHomePage() {
  return (
    <HomeDashboardDataProvider>
      <div className="oa-page pc-dash-home crm-dashboard-page home-simple-dashboard">
        <OliviaAdaptiveStage />
      </div>
    </HomeDashboardDataProvider>
  );
}
