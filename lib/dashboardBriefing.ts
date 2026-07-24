export type WorkBriefingKind = "hospital" | "todo";
export type WorkBriefingFilter = "all" | WorkBriefingKind;

export type WorkBriefingItem = {
  id: string;
  kind: WorkBriefingKind;
  title: string;
  projectName?: string;
  badge: string;
  deadline?: string;
  status: string;
  description?: string;
  actionLabel: string;
  actionHref: string;
  completed?: boolean;
  priorityScore: number;
};

export type MarketingBriefingCategory =
  | "policy"
  | "search_trend"
  | "competitor"
  | "content_insight"
  | "market";

export type MarketingBriefingItem = {
  id: string;
  category: MarketingBriefingCategory;
  title: string;
  summary: string;
  source?: string;
  publishedAt?: string;
  importance?: "high" | "medium" | "low";
  actionLabel?: string;
  actionHref?: string;
  recommendation?: string;
};

type DashboardTask = {
  id: string;
  title: string;
  category?: string | null;
  completed: boolean;
  date?: string | null;
  time?: string | null;
  memo?: string | null;
};

export type DashboardWorkflowRun = {
  id: string;
  client_id?: string | null;
  client_name?: string | null;
  project_name?: string | null;
  current_step_name?: string | null;
  display_step_key?: string | null;
  shoot_date?: string | null;
  status?: string | null;
  delayed?: boolean;
  waiting_approval_count?: number;
  revision_request_count?: number;
  waiting_customer?: boolean;
  has_ready_mail?: boolean;
};

const STEP_BADGES: Record<string, string> = {
  quote: "견적",
  contract: "계약",
  conti: "콘티",
  shooting: "촬영",
  client_selection: "갤러리",
  final_delivery: "갤러리",
  revision: "수정",
  review_content: "리뷰",
  content_planning: "콘텐츠",
};

function todayInKorea() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function taskPriority(task: DashboardTask) {
  const category = (task.category ?? "").toLowerCase();
  const urgent = category.includes("긴급") || category.includes("urgent") || category.includes("중요");
  return (urgent ? 450 : 400) + (task.time ? 10 : 0);
}

export function buildWorkBriefingItems(
  dashboardTasks: DashboardTask[],
  workflowRuns: DashboardWorkflowRun[],
): WorkBriefingItem[] {
  const todoItems = dashboardTasks
    .filter((task) => !task.completed)
    .map<WorkBriefingItem>((task) => ({
      id: `todo:${task.id}`,
      kind: "todo",
      title: task.title,
      badge: "내 할 일",
      deadline: task.time || (task.date === todayInKorea() ? "오늘까지" : task.date || undefined),
      status: "해야 함",
      description: task.memo || undefined,
      actionLabel: "열기",
      actionHref: "/calendar",
      completed: task.completed,
      priorityScore: taskPriority(task),
    }));

  const hospitalItems = workflowRuns
    .filter((run) =>
      run.status === "active" &&
      (run.delayed || run.waiting_approval_count || run.revision_request_count || run.waiting_customer || run.has_ready_mail)
    )
    .map<WorkBriefingItem>((run) => {
      const stepKey = run.display_step_key ?? "";
      const projectName = run.client_name || run.project_name || "고객 프로젝트";
      const actionHref = `/clients?id=${encodeURIComponent(run.client_id ?? "")}&workflowRunId=${encodeURIComponent(run.id)}`;

      if (run.delayed) {
        return {
          id: `workflow:${run.id}`,
          kind: "hospital",
          title: `${projectName} 지연 업무 확인`,
          projectName,
          badge: STEP_BADGES[stepKey] ?? "병원",
          deadline: run.shoot_date ? `${run.shoot_date} 기한 경과` : "기한 경과",
          status: "지연",
          description: `${run.current_step_name ?? "현재 단계"} 진행 상태를 확인해 주세요.`,
          actionLabel: "지금 처리하기",
          actionHref,
          priorityScore: 700,
        };
      }
      if ((run.waiting_approval_count ?? 0) > 0) {
        return {
          id: `workflow:${run.id}`,
          kind: "hospital",
          title: `${projectName} 승인 요청 확인`,
          projectName,
          badge: "승인 대기",
          status: "확인 필요",
          description: `${run.current_step_name ?? "현재 단계"} 결과의 승인 여부를 결정해 주세요.`,
          actionLabel: "승인 확인",
          actionHref,
          priorityScore: 600,
        };
      }
      if ((run.revision_request_count ?? 0) > 0) {
        return {
          id: `workflow:${run.id}`,
          kind: "hospital",
          title: `${projectName} 수정 요청 확인`,
          projectName,
          badge: "수정",
          status: "확인 필요",
          description: "접수된 수정 요청과 다음 작업을 확인해 주세요.",
          actionLabel: "요청 확인",
          actionHref,
          priorityScore: 580,
        };
      }
      if (run.waiting_customer) {
        return {
          id: `workflow:${run.id}`,
          kind: "hospital",
          title: `${projectName} 고객 응답 후속 확인`,
          projectName,
          badge: STEP_BADGES[stepKey] ?? "고객",
          status: "고객 대기",
          description: `${run.current_step_name ?? "현재 단계"}에서 고객 응답을 기다리고 있습니다.`,
          actionLabel: "후속 확인",
          actionHref,
          priorityScore: 500,
        };
      }
      return {
        id: `workflow:${run.id}`,
        kind: "hospital",
        title: `${projectName} 메일 발송 확인`,
        projectName,
        badge: "메일",
        status: "발송 대기",
        description: "준비된 메일을 검토하고 발송해 주세요.",
        actionLabel: "메일 열기",
        actionHref: "/mailing",
        priorityScore: 480,
      };
    });

  return [...hospitalItems, ...todoItems].sort((a, b) =>
    b.priorityScore - a.priorityScore || a.title.localeCompare(b.title, "ko")
  );
}
