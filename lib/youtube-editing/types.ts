export type VideoRatio = "16:9" | "9:16";
export type ProjectStatus = "draft" | "analyzing" | "ready" | "archived";

export type CameraOption =
  | "A캠 정면" | "B캠 측면" | "A → B 전환" | "B → A 전환"
  | "원장 화면 미사용" | "디지털 줌인" | "디지털 줌아웃";

export type CaptionType = "기본 자막" | "효과 자막" | "키워드 강조" | "자막 없음";
export type CaptionAppear = "기본" | "팝업" | "확대" | "페이드";
export type CaptionPosition = "상단" | "중앙" | "하단";
export type CaptionConfig = {
  type: CaptionType;
  text: string;
  appear: CaptionAppear;
  position: CaptionPosition;
  color: string;
  durationSec: number | null;
};

export type VisualType =
  | "자료 없음" | "이미지 자료" | "의료 모식도" | "인포그래픽"
  | "영상 B-roll" | "병원 현장" | "아이콘" | "캘린더" | "디자인 템플릿";
export type VisualLayout = "전체 화면" | "좌우 분할" | "PIP" | "원형 확대";
export type VisualStyle = "실사 사진" | "의료 일러스트" | "인포그래픽" | "의료 모식도" | "스타일 일러스트" | "영상 B-roll";
export type VisualConfig = {
  enabled: boolean;
  type: VisualType;
  description: string;
  layout: VisualLayout;
  durationSec: number | null;
  style: VisualStyle;
};

export type SoundEffectOption = "없음" | "팝" | "우시" | "임팩트" | "긴장감" | "타이핑" | "알림" | "기타";
export type TransitionOption = "컷" | "디졸브" | "줌인" | "줌아웃" | "흑백" | "흔들림" | "블러" | "없음";
export type TemplateOption =
  | "없음" | "질환 4분할" | "원인 구조도" | "핵심 문장 카드"
  | "강조 박스" | "단계형 프로세스" | "순환 구조" | "비교 화면";

export type Segment = {
  id: string;
  projectId: string;
  sortOrder: number;
  scriptText: string;
  estimatedDurationSec: number | null;
  camera: CameraOption[];
  caption: CaptionConfig;
  visual: VisualConfig;
  soundEffect: SoundEffectOption;
  transition: TransitionOption;
  template: TemplateOption;
  editingNote: string;
  aiReason: string | null;
  confidence: number | null;
  userModified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type YoutubeEditingProject = {
  id: string;
  title: string;
  hospitalName: string | null;
  fullScript: string;
  videoRatio: VideoRatio;
  preferredTone: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

// 손글씨 획 — 좌표는 캔버스 크기와 무관하게 0~1 비율로 저장해 반응형/확대에도 어긋나지 않는다.
// "lasso"는 획을 만들지 않는 선택 도구라 Stroke.tool에는 포함하지 않는다.
export type DrawTool = "pen" | "highlighter" | "eraser" | "lasso";
export type StrokePoint = { x: number; y: number; pressure?: number };
export type Stroke = {
  id: string;
  tool: "pen" | "highlighter";
  color: string;
  width: number;
  points: StrokePoint[];
};

// 캔버스에 즉시 삽입되는 도구(도형/텍스트/이미지/원장 포즈) — 그리기 모드가 아니라
// 클릭 한 번으로 기본값 오브젝트를 만들어 넣는 액션이다.
export type InsertTool = "shape" | "text" | "image" | "doctor_pose";
export type EditorTool = DrawTool | InsertTool;

export type DoctorPoseKey =
  | "front_basic" | "front_explain_both_hands" | "front_one_finger"
  | "front_x" | "left_45" | "right_45";

export type CanvasObjectType =
  | "sketch_placeholder" | "image_thumb" | "diagram_thumb" | "infographic_thumb"
  | "template_thumb" | "broll_thumb" | "hospital_thumb" | "icon_thumb" | "calendar_thumb"
  | "text" | "memo" | "arrow" | "rect" | "circle" | "frame" | "doctor_pose";

export type CanvasObject = {
  id: string;
  type: CanvasObjectType;
  x: number; // 0~1 비율
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
  zIndex: number;
  poseKey?: DoctorPoseKey;
};

export type SegmentAnnotation = {
  segmentId: string;
  strokes: Stroke[];
  canvasWidth: number | null;
  canvasHeight: number | null;
};

export type AiSegmentSuggestion = {
  order: number;
  text: string;
  estimatedDurationSec?: number;
  camera?: CameraOption[];
  caption?: Partial<CaptionConfig>;
  visual?: Partial<VisualConfig>;
  soundEffect?: SoundEffectOption;
  transition?: TransitionOption;
  template?: TemplateOption;
  editingNote?: string;
  aiReason?: string;
  confidence?: number;
};

export type SaveState = "idle" | "saving" | "saved" | "error";
