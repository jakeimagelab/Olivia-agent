export const REVIEW_STORY_WIDTH = 1080;
export const REVIEW_STORY_HEIGHT = 1350;

export type ReviewStoryBinding =
  | "headline"
  | "reviewBody"
  | "clinicName"
  | "doctorName"
  | "date"
  | "url"
  | "photo1"
  | "photo2"
  | "photo3";

const PHOTO_BINDINGS: ReviewStoryBinding[] = ["photo1", "photo2", "photo3"];

type ReviewStoryElementBase = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked?: boolean;
  hidden?: boolean;
  binding?: ReviewStoryBinding;
};

export type ReviewStoryTextElement = ReviewStoryElementBase & {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
};

export type ReviewStoryImageElement = ReviewStoryElementBase & {
  type: "image";
  src?: string;
  storagePath?: string;
  cropX: number;
  cropY: number;
  scale: number;
  edgeBlend?: {
    enabled: boolean;
    type: "blur" | "gradient";
    directions: Array<"top" | "bottom" | "left" | "right">;
    size: number;
    strength: number;
  };
};

export type ReviewStoryShapeElement = ReviewStoryElementBase & {
  type: "shape";
  fill: string;
  radius: number;
};

export type ReviewStoryElement = ReviewStoryTextElement | ReviewStoryImageElement | ReviewStoryShapeElement;

export type ReviewStoryDocument = {
  version: 1;
  width: typeof REVIEW_STORY_WIDTH;
  height: typeof REVIEW_STORY_HEIGHT;
  background: string;
  elements: ReviewStoryElement[];
};

export type ReviewStorySource = {
  reviewText: string;
  hospitalName: string;
  doctorName?: string;
  date?: string;
  photo?: { src?: string; storagePath?: string };
};

export type ReviewStoryTemplateConfig = {
  template?: "photo_bottom" | "photo_overlay" | "text_only" | "frame" | "accent_bar";
  background?: string;
  accent?: string;
  textColor?: string;
  editorDocument?: ReviewStoryDocument;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function textElement(
  id: string,
  name: string,
  binding: ReviewStoryBinding,
  text: string,
  position: Pick<ReviewStoryElementBase, "x" | "y" | "width" | "height" | "zIndex">,
  style: Partial<ReviewStoryTextElement> = {},
): ReviewStoryTextElement {
  return {
    id,
    name,
    binding,
    type: "text",
    rotation: 0,
    opacity: 1,
    fontFamily: "var(--font-sans)",
    fontSize: 54,
    fontWeight: 700,
    color: "#173734",
    textAlign: "left",
    lineHeight: 1.48,
    letterSpacing: -1,
    ...position,
    ...style,
    text: style.text ?? text,
  } as ReviewStoryTextElement;
}

export function createReviewStoryDocument(
  source: ReviewStorySource,
  config: ReviewStoryTemplateConfig = {},
): ReviewStoryDocument {
  if (config.editorDocument?.version === 1) return bindReviewStoryDocument(config.editorDocument, source);

  const template = config.template || "text_only";
  const background = config.background || (template === "text_only" || template === "photo_overlay" ? "#155855" : "#F7F4EE");
  const accent = config.accent || "#E85D2C";
  const dark = template === "text_only" || template === "photo_overlay";
  const textColor = config.textColor || (dark ? "#FFFFFF" : "#173734");
  const elements: ReviewStoryElement[] = [];

  if (template !== "text_only") {
    elements.push({
      id: "photo-1",
      name: "대표 사진",
      binding: "photo1",
      type: "image",
      x: template === "frame" ? 72 : 0,
      y: template === "photo_bottom" ? 0 : 0,
      width: template === "frame" ? 936 : REVIEW_STORY_WIDTH,
      height: template === "photo_bottom" ? 520 : template === "frame" ? 620 : REVIEW_STORY_HEIGHT,
      rotation: 0,
      opacity: source.photo?.src ? 1 : 0.16,
      zIndex: 1,
      src: source.photo?.src,
      storagePath: source.photo?.storagePath,
      cropX: 50,
      cropY: 50,
      scale: 1,
      edgeBlend: {
        enabled: template === "photo_overlay" || template === "photo_bottom",
        type: "gradient",
        directions: ["bottom"],
        size: 220,
        strength: 86,
      },
    });
  }

  if (template === "accent_bar") {
    elements.push({ id: "accent", name: "포인트 바", type: "shape", x: 72, y: 210, width: 12, height: 820, rotation: 0, opacity: 1, zIndex: 2, fill: accent, radius: 6, locked: true });
  }

  elements.push(
    textElement("eyebrow", "리뷰 상단 문구", "headline", "PHOTOCLINIC · CLIENT REVIEW", { x: 84, y: template === "photo_bottom" ? 570 : 104, width: 900, height: 52, zIndex: 3 }, { fontSize: 24, fontWeight: 700, color: dark ? "#DCEAE7" : "#53716C", letterSpacing: 3 }),
    textElement("review", "후기 본문", "reviewBody", source.reviewText, { x: template === "accent_bar" ? 132 : 84, y: template === "photo_bottom" ? 665 : 340, width: template === "accent_bar" ? 820 : 900, height: 500, zIndex: 4 }, { fontSize: source.reviewText.length > 130 ? 44 : 54, color: textColor }),
    textElement("clinic", "병원 / 원장명", "clinicName", source.doctorName ? `${source.hospitalName} · ${source.doctorName}` : source.hospitalName, { x: 84, y: 1130, width: 850, height: 70, zIndex: 5 }, { fontSize: 30, color: dark ? "#F0F7F5" : "#315B55" }),
    textElement("url", "브랜드 URL", "url", "photoclinic.kr", { x: 84, y: 1260, width: 500, height: 40, zIndex: 5 }, { fontSize: 22, color: dark ? "#BFD4CF" : "#6D8984", letterSpacing: 2 }),
  );

  if (source.date) {
    elements.push(textElement("date", "촬영일", "date", source.date, { x: 760, y: 1260, width: 235, height: 40, zIndex: 5 }, { fontSize: 22, color: dark ? "#BFD4CF" : "#6D8984", textAlign: "right" }));
  }

  return { version: 1, width: REVIEW_STORY_WIDTH, height: REVIEW_STORY_HEIGHT, background, elements };
}

export function bindReviewStoryDocument(document: ReviewStoryDocument, source: ReviewStorySource) {
  const next = clone(document);
  const bindings: Partial<Record<ReviewStoryBinding, string>> = {
    headline: "PHOTOCLINIC · CLIENT REVIEW",
    reviewBody: source.reviewText,
    clinicName: source.doctorName ? `${source.hospitalName} · ${source.doctorName}` : source.hospitalName,
    doctorName: source.doctorName,
    date: source.date,
    url: "photoclinic.kr",
  };
  next.elements = next.elements.map((element) => {
    if (element.type === "text" && element.binding && bindings[element.binding] != null) {
      return { ...element, text: bindings[element.binding] || "" };
    }
    if (element.type === "image" && element.binding === "photo1" && source.photo) {
      return { ...element, src: source.photo.src, storagePath: source.photo.storagePath, opacity: 1 };
    }
    return element;
  });
  return next;
}

export function duplicateStoryElement(element: ReviewStoryElement, id: string): ReviewStoryElement {
  return { ...clone(element), id, name: `${element.name} 복사본`, x: element.x + 20, y: element.y + 20, zIndex: element.zIndex + 1 };
}

export function toReviewStoryTemplateDocument(document: ReviewStoryDocument) {
  const next = clone(document);
  next.elements = next.elements.map((element) => {
    if (element.type === "text" && element.binding) return { ...element, text: `{{${element.binding}}}` };
    if (element.type === "image" && element.binding) return { ...element, src: undefined, storagePath: undefined, opacity: 0.16 };
    return element;
  });
  return next;
}

export function splitReviewForPages(text: string, count: number) {
  const clean = text.trim();
  if (!clean) return Array.from({ length: count }, () => "후기 내용을 입력해 주세요.");
  const paragraphs = clean.split(/\n\s*\n|(?<=[.!?。])\s+/).map((value) => value.trim()).filter(Boolean);
  return Array.from({ length: count }, (_, index) => paragraphs[index % paragraphs.length] || clean);
}

export function isReviewStoryDocument(value: unknown): value is ReviewStoryDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReviewStoryDocument>;
  return candidate.version === 1 && candidate.width === REVIEW_STORY_WIDTH && candidate.height === REVIEW_STORY_HEIGHT && Array.isArray(candidate.elements);
}
