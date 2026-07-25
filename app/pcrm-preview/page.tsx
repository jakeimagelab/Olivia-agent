"use client";

import PcrmDashboard from "@/app/(client-hub)/clients/_components/PcrmDashboard";

const mockClients = [
  { id: "1", name: "라셀청담", department: "성형외과", created_at: new Date().toISOString(), waiting_approval_count: 2, open_task_count: 3, active_run: { id: "r1", project_name: "2025 브랜드 캠페인 촬영", current_step_key: "conti", status: "active", shoot_date: new Date(Date.now() + 2 * 86400000).toISOString(), manager_name: "이지현", updated_at: new Date(Date.now() - 2 * 3600000).toISOString() } },
  { id: "2", name: "미소로한의원", department: "한의원", created_at: new Date(Date.now() - 3 * 86400000).toISOString(), waiting_approval_count: 1, open_task_count: 1, active_run: { id: "r2", project_name: "의료진 프로필 촬영", current_step_key: "shooting", status: "active", shoot_date: new Date(Date.now() + 5 * 86400000).toISOString(), manager_name: "김민수", updated_at: new Date(Date.now() - 5 * 3600000).toISOString() } },
  { id: "3", name: "연세봄치과", department: "치과", created_at: new Date(Date.now() - 10 * 86400000).toISOString(), waiting_approval_count: 0, open_task_count: 0, active_run: { id: "r3", project_name: "인테리어 + 진료 연출 촬영", current_step_key: "final_delivery", status: "completed", shoot_date: new Date(Date.now() - 1 * 86400000).toISOString(), manager_name: "이지현", updated_at: new Date(Date.now() - 26 * 3600000).toISOString() } },
  { id: "4", name: "오블리브의원", department: "피부과", created_at: new Date(Date.now() - 1 * 86400000).toISOString(), waiting_approval_count: 0, open_task_count: 2, active_run: { id: "r4", project_name: "브랜드필름 제작", current_step_key: "retouching", status: "active", shoot_date: null, manager_name: "박지원", updated_at: new Date(Date.now() - 3 * 3600000).toISOString() } },
];

const mockDashboard = {
  newClientsThisWeek: 2,
  newActiveProjectsThisWeek: 1,
  completedThisMonth: 3,
  newApprovalsLast24h: 2,
  newTasksLast24h: 1,
  pendingApprovalsByType: [
    { type: "quote", label: "견적 승인 대기", count: 4 },
    { type: "contract", label: "계약 서명 대기", count: 2 },
    { type: "conti", label: "콘티 승인 대기", count: 3 },
  ],
  todaySchedule: [
    { id: "t1", title: "라셀청담 촬영", category: "shooting", time: "10:00", location: "라셀청담 성형외과" },
    { id: "t2", title: "미소로한의원 촬영", category: "shooting", time: "13:00", location: "미소로한의원 분당점" },
    { id: "t3", title: "콘티 미팅", category: "client", time: "15:00", location: "연세봄치과" },
  ],
  recentActivity: [
    { id: "a1", clientName: "라셀청담", actionType: "publication_approved", title: "콘티를 승인했습니다.", createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
    { id: "a2", clientName: "미소로한의원", actionType: "photo_revision_requested", title: "견적서에 피드백을 남겼습니다.", createdAt: new Date(Date.now() - 3 * 3600000).toISOString() },
    { id: "a3", clientName: "더맑은성형외과", actionType: "publication_viewed", title: "포털에 접속했습니다.", createdAt: new Date(Date.now() - 5 * 3600000).toISOString() },
  ],
  recentInquiries: [
    { id: "i1", clientId: "1", clientName: "라셀청담 성형외과", title: "콘티 문의", preview: "콘티 3번 장면에서 병원 간판이 잘 보이도록 부탁드립니다.", status: "open", lastMessageAt: new Date(Date.now() - 10 * 60000).toISOString() },
    { id: "i2", clientId: "2", clientName: "미소로한의원 분당점", title: "촬영 문의", preview: "촬영 당일 주차 안내 부탁드립니다.", status: "answered", lastMessageAt: new Date(Date.now() - 3600000).toISOString() },
  ],
  perPoints: { available: 1250, earnedThisMonth: 250, usedThisMonth: 0 },
};

export default function PcrmPreviewPage() {
  return (
    <div style={{ background: "#f5f0e8", minHeight: "100vh" }}>
      <PcrmDashboard
        clients={mockClients as any}
        dashboard={mockDashboard as any}
        search=""
        onSearch={() => {}}
        deletingId={null}
        onOpen={() => {}}
        onDelete={() => {}}
        onCreate={() => {}}
      />
    </div>
  );
}
