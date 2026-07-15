export type MemoTemplateType = "text" | "cornell" | "todo" | "blank" | "grid" | "conti";
export type MemoMode = "general" | "template" | "voice";

export type TodoItem = { id: string; text: string; done: boolean };

export type MemoTemplateData = {
  noteMode?: MemoMode;
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
  { type: "text", label: "일반메모", description: "키보드로 작성하는 텍스트 메모", mark: "Aa" },
  { type: "blank", label: "백지", description: "자유 필기와 스케치", mark: "□" },
  { type: "cornell", label: "코넬형", description: "키워드·노트·요약 필기", mark: "Co" },
  { type: "todo", label: "To do list", description: "직접 쓰는 할 일 체크리스트", mark: "✓" },
  { type: "grid", label: "모눈종이", description: "격자 위 아이디어 정리", mark: "#" },
  { type: "conti", label: "콘티", description: "행·열 촬영 프레임", mark: "▦" },
];

export const PEN_TEMPLATE_OPTIONS = TEMPLATE_OPTIONS.filter(option => option.type !== "text");

export const emptyTemplateData = (type: MemoTemplateType): MemoTemplateData => {
  if (type === "todo") return { todos: [{ id: crypto.randomUUID(), text: "", done: false }] };
  if (type === "conti") return { contiColumns: 2, contiRows: 3, contiCaptions: Array(6).fill("") };
  if (type === "cornell") return { cues: "", notes: "", summary: "" };
  return { body: "" };
};
