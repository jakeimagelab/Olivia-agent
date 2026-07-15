export type MemoTemplateType = "text" | "cornell" | "todo" | "blank" | "grid" | "conti";

export type TodoItem = { id: string; text: string; done: boolean };

export type MemoTemplateData = {
  body?: string;
  cues?: string;
  notes?: string;
  summary?: string;
  todos?: TodoItem[];
  contiColumns?: number;
  contiRows?: number;
  contiCaptions?: string[];
};
export type ConsultationMemo = {
  id: string;
  hospital_id: string | null;
  title: string;
  template_type: MemoTemplateType;
  template_data: MemoTemplateData;
  raw_memo: string;
  summary: string;
  extracted_data: Record<string, unknown> | null;
  recommended_package: string;
  next_action: string;
  canvas_path: string | null;
  canvas_url: string | null;
  ai_image_path: string | null;
  ai_image_url: string | null;
  audio_path: string | null;
  audio_url: string | null;
  audio_duration_seconds: number;
  transcript: string;
  audio_summary: string;
  created_at: string;
  updated_at: string;
};

export const TEMPLATE_OPTIONS: { type: MemoTemplateType; label: string; description: string; mark: string }[] = [
  { type: "text", label: "기본 텍스트", description: "빠르게 적는 자유 메모", mark: "Aa" },
  { type: "cornell", label: "코넬형", description: "키워드·본문·요약 분리", mark: "Co" },
  { type: "todo", label: "할 일", description: "후속 작업 체크리스트", mark: "✓" },
  { type: "blank", label: "백지", description: "자유 필기와 스케치", mark: "□" },
  { type: "grid", label: "모눈종이", description: "격자 위 아이디어 정리", mark: "#" },
  { type: "conti", label: "콘티", description: "행·열 촬영 프레임", mark: "▦" },
];

export const emptyTemplateData = (type: MemoTemplateType): MemoTemplateData => {
  if (type === "todo") return { todos: [{ id: crypto.randomUUID(), text: "", done: false }] };
  if (type === "conti") return { contiColumns: 2, contiRows: 3, contiCaptions: Array(6).fill("") };
  if (type === "cornell") return { cues: "", notes: "", summary: "" };
  return { body: "" };
};
