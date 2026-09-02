import {
  REVIEW_STORY_WIDTH, REVIEW_STORY_HEIGHT,
  type ReviewStoryBinding, type ReviewStoryDocument, type ReviewStoryElement,
  type ReviewStoryImageElement, type ReviewStoryTemplateConfig, type ReviewStoryTextElement,
} from "./storyDocument";

// 첨부 레퍼런스 10장의 "레이아웃 geometry"만 재현한 기본 템플릿. 사진/문구는 하드코딩하지 않고
// binding(placeholder)만 지정 — 실제 값은 로드 시 bindReviewStoryDocument()가 채운다.
// 폰트는 app/layout.tsx가 이미 전역 로드해 둔 것만 사용(새 웹폰트 없음).
const SANS = "var(--font-sans)";
const SERIF = "'Nanum Myeongjo', serif";

function img(
  prefix: string, n: string, name: string, binding: ReviewStoryBinding,
  x: number, y: number, w: number, h: number, zIndex: number,
  opts: Partial<ReviewStoryImageElement> = {},
): ReviewStoryImageElement {
  return {
    id: `${prefix}-${n}`, name, type: "image", binding,
    // opacity 1로 둬서 사진을 넣기 전에도 플레이스홀더(부드러운 그라데이션 + 아이콘)가 또렷하게
    // 보이게 한다 — 텍스트는 이미 실제 후기로 바인딩되니, 사진만 비어 있어도 "완성된 디자인"
    // 미리보기처럼 보인다. bindReviewStoryDocument가 실제 사진이 들어올 때만 값을 덮어쓴다.
    x, y, width: w, height: h, rotation: 0, opacity: 1, zIndex,
    cropX: 50, cropY: 50, scale: 1,
    edgeBlend: { enabled: false, type: "gradient", directions: ["bottom"], size: 160, strength: 40 },
    ...opts,
  };
}

function txt(
  prefix: string, n: string, name: string, binding: ReviewStoryBinding, text: string,
  x: number, y: number, w: number, h: number, zIndex: number,
  opts: Partial<ReviewStoryTextElement> = {},
): ReviewStoryTextElement {
  return {
    id: `${prefix}-${n}`, name, type: "text", binding, text,
    x, y, width: w, height: h, rotation: 0, opacity: 1, zIndex,
    fontFamily: SANS, fontSize: 32, fontWeight: 700, color: "#1C2B28",
    textAlign: "left", lineHeight: 1.4, letterSpacing: 0,
    ...opts,
  };
}

function doc(background: string, elements: ReviewStoryElement[]): ReviewStoryDocument {
  return { version: 1, width: REVIEW_STORY_WIDTH, height: REVIEW_STORY_HEIGHT, background, elements };
}

export type DefaultReviewTemplateDef = {
  key: string;
  name: string;
  description: string;
  layoutConfig: ReviewStoryTemplateConfig;
};

export const DEFAULT_REVIEW_TEMPLATES: DefaultReviewTemplateDef[] = [
  {
    key: "a", name: "3컷 콜라주", description: "좌측 큰 세로 사진 + 우측 2컷, 상단 짧은 헤드라인",
    layoutConfig: { editorDocument: doc("#FFFFFF", [
      img("a", "photo1", "대표 사진", "photo1", 64, 64, 560, 1222, 1),
      txt("a", "headline", "상단 헤드라인", "headline", "REAL REVIEW", 648, 64, 368, 40, 2, { fontSize: 22, fontWeight: 800, letterSpacing: 2, color: "#8A9A96" }),
      img("a", "photo2", "보조 사진 1", "photo2", 648, 120, 368, 520, 1),
      img("a", "photo3", "보조 사진 2", "photo3", 648, 664, 368, 520, 1),
      txt("a", "clinic", "병원명", "clinicName", "병원명", 648, 1206, 368, 44, 2, { fontSize: 22, fontWeight: 800 }),
      txt("a", "url", "URL", "url", "photoclinic.kr", 648, 1254, 368, 28, 2, { fontSize: 15, fontWeight: 600, color: "#8A9A96" }),
    ]) },
  },
  {
    key: "b", name: "미니멀 센터 이미지", description: "중앙 가로형 이미지, 위아래 짧은 문구",
    layoutConfig: { editorDocument: doc("#F7F4EE", [
      txt("b", "headline", "상단 캡션", "headline", "REAL REVIEW", 64, 196, 952, 60, 2, { fontSize: 26, fontWeight: 800, letterSpacing: 3, textAlign: "center", color: "#8A9A96" }),
      img("b", "photo1", "대표 사진", "photo1", 64, 280, 952, 784, 1),
      txt("b", "review", "후기 본문", "reviewBody", "후기 내용을 입력해 주세요.", 100, 1090, 880, 140, 2, { fontSize: 28, fontWeight: 600, textAlign: "center", lineHeight: 1.5 }),
      txt("b", "clinic", "병원명", "clinicName", "병원명", 64, 1246, 952, 40, 2, { fontSize: 22, fontWeight: 800, textAlign: "center" }),
      txt("b", "url", "URL", "url", "photoclinic.kr", 64, 1292, 952, 26, 2, { fontSize: 14, fontWeight: 600, textAlign: "center", color: "#8A9A96" }),
    ]) },
  },
  {
    key: "c", name: "2컷 디테일", description: "좌상단 세로 사진 + 우측 텍스트, 우하단 보조 사진",
    layoutConfig: { editorDocument: doc("#FFFFFF", [
      img("c", "photo1", "대표 사진", "photo1", 64, 64, 480, 700, 1),
      txt("c", "headline", "헤드라인", "headline", "REAL REVIEW", 584, 64, 432, 90, 2, { fontFamily: SERIF, fontSize: 42, fontWeight: 700 }),
      txt("c", "review", "후기 본문", "reviewBody", "후기 내용을 입력해 주세요.", 584, 174, 432, 470, 2, { fontSize: 26, fontWeight: 500, lineHeight: 1.6, color: "#33443F" }),
      img("c", "photo2", "보조 사진", "photo2", 584, 700, 432, 522, 1),
      txt("c", "clinic", "병원명", "clinicName", "병원명", 64, 820, 480, 40, 2, { fontSize: 22, fontWeight: 800 }),
      txt("c", "url", "URL", "url", "photoclinic.kr", 64, 868, 480, 28, 2, { fontSize: 15, fontWeight: 600, color: "#8A9A96" }),
    ]) },
  },
  {
    key: "d", name: "텍스트 미니멀", description: "이미지 없이 중앙 헤드라인 + 서브카피, 넓은 여백",
    layoutConfig: { editorDocument: doc("#FBF9F5", [
      txt("d", "headline", "헤드라인", "headline", "REAL REVIEW", 120, 540, 840, 220, 1, { fontFamily: SERIF, fontSize: 64, fontWeight: 700, textAlign: "center", lineHeight: 1.25 }),
      txt("d", "review", "서브 카피", "reviewBody", "후기 내용을 입력해 주세요.", 160, 800, 760, 160, 1, { fontSize: 26, fontWeight: 500, textAlign: "center", lineHeight: 1.6, color: "#5A7470" }),
      txt("d", "clinic", "병원명", "clinicName", "병원명", 160, 1180, 760, 40, 1, { fontSize: 20, fontWeight: 800, textAlign: "center" }),
      txt("d", "url", "URL", "url", "photoclinic.kr", 160, 1228, 760, 26, 1, { fontSize: 14, fontWeight: 600, textAlign: "center", color: "#8A9A96" }),
    ]) },
  },
  {
    key: "e", name: "레이어드 투 이미지", description: "작은 세로 사진 + 겹쳐지는 큰 세로 사진, 텍스트 최소",
    layoutConfig: { editorDocument: doc("#FFFFFF", [
      img("e", "photo1", "배경 사진", "photo1", 64, 120, 380, 980, 1, { edgeBlend: { enabled: true, type: "gradient", directions: ["right"], size: 140, strength: 45 } }),
      img("e", "photo2", "대표 사진", "photo2", 380, 64, 636, 1120, 2),
      txt("e", "clinic", "병원명", "clinicName", "병원명", 64, 1230, 952, 38, 3, { fontSize: 20, fontWeight: 800, textAlign: "center" }),
      txt("e", "url", "URL", "url", "photoclinic.kr", 64, 1276, 952, 26, 3, { fontSize: 14, fontWeight: 600, textAlign: "center", color: "#8A9A96" }),
    ]) },
  },
  {
    key: "f", name: "풀 이미지 에디토리얼", description: "이미지가 캔버스 대부분을 차지, 하단 짧은 텍스트",
    layoutConfig: { editorDocument: doc("#101110", [
      img("f", "photo1", "대표 사진", "photo1", 0, 0, 1080, 1350, 1, { edgeBlend: { enabled: true, type: "gradient", directions: ["bottom"], size: 420, strength: 72 } }),
      txt("f", "review", "후기 한 줄", "reviewBody", "후기 내용을 입력해 주세요.", 80, 1130, 920, 150, 2, { fontFamily: SERIF, fontSize: 32, fontWeight: 700, textAlign: "center", lineHeight: 1.4, color: "#FFFFFF" }),
      txt("f", "clinic", "병원명 · URL", "clinicName", "병원명", 80, 1290, 920, 32, 2, { fontSize: 16, fontWeight: 600, textAlign: "center", color: "#E7EEEC" }),
    ]) },
  },
  {
    key: "g", name: "타이포그래피 히어로", description: "이미지 없이 대형 타이틀 중심의 매거진 스타일",
    layoutConfig: { editorDocument: doc("#F5F1EA", [
      { id: "g-accent", name: "포인트 바", type: "shape", x: 90, y: 380, width: 90, height: 8, rotation: 0, opacity: 1, zIndex: 1, fill: "#E85D2C", radius: 4, locked: true },
      txt("g", "headline", "대형 타이틀", "headline", "REAL REVIEW", 90, 420, 900, 320, 2, { fontFamily: SERIF, fontSize: 84, fontWeight: 700, lineHeight: 1.15, letterSpacing: -1 }),
      txt("g", "review", "서브 타이틀", "reviewBody", "후기 내용을 입력해 주세요.", 90, 760, 780, 140, 2, { fontSize: 26, fontWeight: 500, color: "#5A7470", lineHeight: 1.55 }),
      txt("g", "clinic", "병원명", "clinicName", "병원명", 90, 1220, 500, 40, 2, { fontSize: 20, fontWeight: 800 }),
      txt("g", "url", "URL", "url", "photoclinic.kr", 90, 1266, 500, 26, 2, { fontSize: 14, fontWeight: 600, color: "#8A9A96" }),
    ]) },
  },
  {
    key: "h", name: "센터 이미지", description: "중앙 정사각형 이미지, 넓은 흰 여백과 하단 캡션",
    layoutConfig: { editorDocument: doc("#FFFFFF", [
      img("h", "photo1", "대표 사진", "photo1", 160, 220, 760, 760, 1),
      txt("h", "review", "캡션", "reviewBody", "후기 내용을 입력해 주세요.", 160, 1030, 760, 70, 2, { fontSize: 27, fontWeight: 600, textAlign: "center" }),
      txt("h", "clinic", "병원명", "clinicName", "병원명", 160, 1136, 760, 40, 2, { fontSize: 20, fontWeight: 800, textAlign: "center" }),
      txt("h", "url", "URL", "url", "photoclinic.kr", 160, 1182, 760, 26, 2, { fontSize: 14, fontWeight: 600, textAlign: "center", color: "#8A9A96" }),
    ]) },
  },
  {
    key: "i", name: "투 포트레이트 컬럼", description: "세로 사진 2컬럼, 하단 큰 헤드라인",
    layoutConfig: { editorDocument: doc("#FFFFFF", [
      img("i", "photo1", "사진 1", "photo1", 64, 64, 472, 980, 1, { edgeBlend: { enabled: true, type: "gradient", directions: ["bottom"], size: 150, strength: 40 } }),
      img("i", "photo2", "사진 2", "photo2", 544, 64, 472, 980, 1, { edgeBlend: { enabled: true, type: "gradient", directions: ["bottom"], size: 150, strength: 40 } }),
      txt("i", "headline", "헤드라인", "headline", "REAL REVIEW", 64, 1080, 700, 160, 2, { fontSize: 50, fontWeight: 800, lineHeight: 1.2, letterSpacing: -1 }),
      txt("i", "clinic", "병원명", "clinicName", "병원명", 64, 1256, 700, 40, 2, { fontSize: 20, fontWeight: 700, color: "#5A7470" }),
    ]) },
  },
  {
    key: "j", name: "이미지 + 텍스트 분할", description: "좌측 세로 사진, 우측 텍스트 블록",
    layoutConfig: { editorDocument: doc("#FFFFFF", [
      img("j", "photo1", "대표 사진", "photo1", 64, 64, 480, 1222, 1),
      txt("j", "headline", "헤드라인", "headline", "REAL REVIEW", 600, 480, 416, 220, 2, { fontFamily: SERIF, fontSize: 44, fontWeight: 700, lineHeight: 1.3 }),
      txt("j", "review", "후기 본문", "reviewBody", "후기 내용을 입력해 주세요.", 600, 716, 416, 300, 2, { fontSize: 25, fontWeight: 500, lineHeight: 1.6, color: "#33443F" }),
      txt("j", "clinic", "병원명", "clinicName", "병원명", 600, 1078, 416, 40, 2, { fontSize: 20, fontWeight: 800 }),
      txt("j", "url", "URL", "url", "photoclinic.kr", 600, 1124, 416, 26, 2, { fontSize: 14, fontWeight: 600, color: "#8A9A96" }),
    ]) },
  },
];
