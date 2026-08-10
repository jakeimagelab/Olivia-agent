export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high";

export type ChecklistItem = {
  id: string;
  taskId: string;
  label: string;
  done: boolean;
  sortOrder: number;
  createdAt: string;
};

export type TaskFile = {
  id: string;
  taskId: string;
  fileName: string;
  fileSize: number | null;
  fileUrl: string;
  createdAt: string;
};

export type Task = {
  id: string;
  dueDate: string; // YYYY-MM-DD
  dueTime: string | null; // HH:MM
  title: string;
  assigneeName: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

// 목록 화면(가운데 컬럼)에서는 체크리스트 진행률만 필요하고 전체 항목은 필요 없다 —
// 상세 패널을 열 때만 /tasks/[id]로 전체 체크리스트/첨부파일을 불러온다.
export type TaskListItem = Task & { checklistTotal: number; checklistDone: number };

export type TaskDetail = Task & { checklist: ChecklistItem[]; files: TaskFile[] };

// 기존 "캘린더"(calendar_tasks) 연동용 — 업무일지는 이 테이블에 쓰지 않고 읽기 전용으로만 보여준다.
export type CalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string | null;
  endTime: string | null;
  title: string;
  category: string;
  completed: boolean;
  location: string | null;
  memo: string;
};

export type UpcomingEntry =
  | { kind: "task"; id: string; date: string; time: string | null; title: string; done: boolean }
  | { kind: "event"; id: string; date: string; time: string | null; title: string; done: boolean };
