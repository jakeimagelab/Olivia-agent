"use client";

import { HomeDashboardDataProvider } from "@/components/dashboard/HomeDashboardData";
import OliviaAdaptiveStage from "@/components/home/OliviaAdaptiveStage";

// Olivia Agent 2.0 — 홈은 Olivia Chat이 압도적 메인(약 74%)이고, 하단은 빠른실행/최근프로젝트/
// 통합스케줄을 중요도에 따라 비대칭 비율로 배치한다(빠른실행 작게, 통합스케줄 가장 넓게).
// 예전 대시보드 위젯(브리핑/오늘 스케줄/명언/업무 브리핑/마케팅 브리핑)은 화면에서 뺐다 —
// 필요하면 각 기능(캘린더/워크플로우/마케팅) 화면에서 확인할 수 있다.
export default function AdminDashboardHomePage() {
  return (
    <HomeDashboardDataProvider>
      <div className="oa-page pc-dash-home crm-dashboard-page home-simple-dashboard">
        <OliviaAdaptiveStage />
      </div>
    </HomeDashboardDataProvider>
  );
}
