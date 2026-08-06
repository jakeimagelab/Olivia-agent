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
