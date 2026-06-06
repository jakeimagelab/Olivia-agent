"use client";

import Link from "next/link";
import { ArrowLeft, Camera, Download, ImagePlus, Loader2, Maximize2, Sparkles, Upload, UserRound, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type Mode = "scene" | "avatar" | "photoVariation";
type DetailTab = "scene" | "background";

type GeneratorForm = {
  mode: Mode;
  instagramFormat: string;
  shootingPreset: string;
  department: string;
  scene: string;
  doctorDescription: string;
  content: string;
  interior: string;
  staffPresence: string;
  patientDescription: string;
  mood: string;
  cameraStyle: string;
  usage: string;
  backgroundDescription: string;
  backgroundMustShow: string;
  backgroundAvoid: string;
  referenceAnalysis: string;
  variationRequest: string;
  extraRequest: string;
};

type GeneratedImage = {
  imageUrl: string;
  variationNo: number;
  category: string;
};

const initialForm: GeneratorForm = {
  mode: "scene",
  instagramFormat: "인스타그램 피드용 1:1 정사각형 대표 이미지",
  shootingPreset: "화사한 역광 상담컷",
  department: "피부과",
  scene: "",
  doctorDescription: "",
  content: "",
  interior: "따뜻한 아이보리 컬러",
  staffPresence: "",
  patientDescription: "",
  mood: "따뜻하고 자연스러운, 프리미엄한, 신뢰감 있는",
  cameraStyle: "포토클리닉 인스타그램 피드에 올라갈 법한 실제 촬영 사진, 자연광 느낌, 화사하지만 부담스럽지 않은 조명",
  usage: "포토클리닉 인스타그램 피드, 릴스 썸네일, 홈페이지 홍보용",
  backgroundDescription: "아이보리와 화이트톤의 깨끗한 병원 상담실, 창가에서 들어오는 자연광, 정돈된 프리미엄 공간",
  backgroundMustShow: "상담 테이블, 부드러운 커튼 또는 창가 빛, 병원 공간의 깊이감",
  backgroundAvoid: "복잡한 소품, 어두운 배경, 차가운 형광등 느낌, 과도한 병원 장비 노출",
  referenceAnalysis: "",
  variationRequest: "원본 사진의 촬영감, 인물 배치, 창가 자연광, 병원 공간 톤, 카메라 거리감은 90% 이상 유지. 아주 살짝 낮은 구도, 아이가 조금 더 미소 짓는 표정, 손과 스푼 위치만 자연스럽게 미세 변화.",
  extraRequest: ""
};

const instagramFormats = [
  "인스타그램 피드용 1:1 정사각형 대표 이미지",
  "릴스 썸네일용 세로형 이미지",
  "원장 브랜딩용 프로필 피드",
  "상담 장면 콘텐츠용",
  "시술 신뢰 이미지용",
  "공간 무드컷 피드용"
];

const shootingPresets = [
  {
    title: "화사한 역광 상담컷",
    description: "창가 역광, 머리결 림라이트, 어깨 실루엣",
    prompt:
      "bright backlight from a clinic window, soft rim light around hair and shoulders, glowing hair strands, gentle silhouette on shoulder line, airy ivory-white clinic interior, soft overexposed highlights without losing details"
  },
  {
    title: "35mm 로우앵글 환경 인물컷",
    description: "약간 아래서 찍고 인물과 배경이 함께 보이는 구도",
    prompt:
      "shot on a 35mm lens, slight low-angle perspective from just below eye level, environmental portrait composition, both the person and clinic background are clearly visible, natural depth and realistic perspective"
  },
  {
    title: "머리결 림라이트 프로필컷",
    description: "헤어 라인과 어깨 라인이 빛으로 감싸이는 프로필",
    prompt:
      "soft rim light outlining hair strands and shoulder line, elegant side profile feeling, warm backlit glow, clean medical branding portrait, natural candid posture"
  },
  {
    title: "아이보리 공간 무드컷",
    description: "인물은 자연스럽고 병원 공간 톤이 충분히 드러나는 컷",
    prompt:
      "wide enough composition to show ivory-white clinic interior, clean reception or consultation room atmosphere, balanced human and space composition, premium calm clinic mood"
  },
  {
    title: "원장님 시술 집중컷",
    description: "시술은 과하지 않게, 손과 표정이 자연스러운 신뢰 컷",
    prompt:
      "doctor focused on a gentle procedure preparation, natural hands, calm facial expression, trustworthy medical scene, no graphic treatment details, polished but realistic clinic photography"
  },
  {
    title: "창가 자연광 인터뷰컷",
    description: "밝은 창가에서 자연스럽게 포착된 원장 브랜딩 컷",
    prompt:
      "natural window light interview-style portrait, relaxed posture, bright airy background, warm editorial medical branding image, approachable professional expression"
  }
];

const photorealRules = [
  "Photorealistic DSLR photograph, indistinguishable from a real photo.",
  "Canon EOS R5, 85mm f/1.4L lens, ISO 320 — natural side window light.",
  "Authentic Korean skin texture with visible natural pores, subtle retouching only.",
  "Realistic hands and fingers, natural body posture, believable relaxed facial expression.",
  "Extremely shallow depth of field — subject sharp, background creamy bokeh.",
  "Warm ivory and beige color grade, subtle film grain, slight chromatic aberration at edges.",
  "High-end commercial editorial photography, real camera photograph."
];

function selectedShootingPresetPrompt(title: string) {
  return shootingPresets.find((preset) => preset.title === title)?.prompt || shootingPresets[0].prompt;
}

function buildPrompt(form: GeneratorForm) {
  const isAvatar = form.mode === "avatar";
  const isPhotoVariation = form.mode === "photoVariation";
  const presetPrompt = selectedShootingPresetPrompt(form.shootingPreset);

  if (isPhotoVariation) {
    return [
      "Create highly faithful subtle variations from the uploaded original photograph.",
      "Preserve at least 90 percent of the original photo's feeling: same real camera photography style, same clinic or hospital room atmosphere, same bright natural window light, same warm ivory-white color grade, same depth of field, same subject placement, same overall composition, same crop ratio, and same documentary editorial medical branding mood.",
      "Do not redesign the scene. Do not change the location identity. Do not replace the people with different-looking people. Do not turn it into illustration, CGI, 3D render, stock photo, or overly polished AI image.",
      "Make only tiny believable photographer-like variations: a slightly lower camera angle, a very small change in facial expression such as a softer smile, tiny natural hand or gaze changes, subtle micro-adjustments in framing, and gentle exposure/color variations.",
      "The output must look like another frame from the same real photoshoot, captured seconds before or after the original.",
      form.variationRequest && `Specific variation request: ${form.variationRequest}.`,
      form.referenceAnalysis && `Reference analysis: ${form.referenceAnalysis}.`,
      form.extraRequest && `Additional request: ${form.extraRequest}.`,
      ...photorealRules
    ].filter(Boolean).join(" ");
  }

  // Flux Dev는 자연스러운 영어 문장 묘사가 훨씬 효과적
  const subjectLine = isAvatar
    ? `A photorealistic portrait of ${form.doctorDescription || "a Korean medical professional"} for hospital branding, upper-body composition, clean background, professional yet approachable expression.`
    : `A photorealistic photograph of ${form.scene || "a Korean medical clinic scene"} at a premium ${form.department || "dermatology"} clinic.`;

  const personLine = !isAvatar && form.doctorDescription
    ? `The main subject is ${form.doctorDescription}.`
    : "";

  const contentLine = form.content
    ? `The scene shows ${form.content}.`
    : "";

  const backgroundLine = [
    form.backgroundDescription && `Background: ${form.backgroundDescription}.`,
    form.backgroundMustShow && `Key background elements: ${form.backgroundMustShow}.`
    // backgroundAvoid는 부정 표현으로 OpenAI 필터에 걸릴 수 있어 제외
  ].filter(Boolean).join(" ");

  const staffLine = [
    form.staffPresence && `Staff: ${form.staffPresence}.`,
    form.patientDescription && `Patient: ${form.patientDescription}.`
  ].filter(Boolean).join(" ");

  const technicalLine = `Shot with ${form.cameraStyle || "Canon EOS R5, 85mm f/1.4L, ISO 320, natural side window light, shallow depth of field, creamy bokeh background"}.`;

  const moodLine = `Overall mood: ${form.mood || "warm, trustworthy, premium"}.`;

  const colorLine = `Warm ivory and beige color grade, subtle film grain, developed in Lightroom with warm highlights.`;

  const compositionLine = [
    presetPrompt,
    "Environmental portrait composition — subject and clinic background both visible.",
    "Subject placed along upper third-rule guideline, upper body and shoulder line in frame.",
    "Soft rim light on hair strands and shoulder line from backlight."
  ].join(" ");

  const qualityLine = [
    ...photorealRules,
    "High-end PHOTOCLINIC Instagram editorial style, premium Korean medical branding photography.",
    "Clean, tasteful, and professional medical imagery suitable for all audiences.",
    "Warm and welcoming hospital environment with a trustworthy, premium feel."
  ].join(" ");

  const referenceNote = form.referenceAnalysis
    ? `Style reference note: ${form.referenceAnalysis}.`
    : "";

  const extraLine = form.extraRequest
    ? `Additional request: ${form.extraRequest}.`
    : "";

  return [
    subjectLine,
    personLine,
    contentLine,
    backgroundLine,
    staffLine,
    technicalLine,
    moodLine,
    colorLine,
    compositionLine,
    qualityLine,
    referenceNote,
    extraLine
  ]
    .filter(Boolean)
    .join(" ");
}

export default function ImageGeneratorPage() {
  const [form, setForm] = useState<GeneratorForm>(initialForm);
  const [detailTab, setDetailTab] = useState<DetailTab>("scene");
  const [variationImage, setVariationImage] = useState<File | null>(null);
  const [variationPreview, setVariationPreview] = useState("");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState("");
  const [styleReferenceImage, setStyleReferenceImage] = useState<File | null>(null);
  const [styleReferencePreview, setStyleReferencePreview] = useState("");
  const [hasFaceConsent, setHasFaceConsent] = useState(false);
  const [hasVariationConsent, setHasVariationConsent] = useState(false);
  const [fluxStrength, setFluxStrength]   = useState(0.85); // Flux Redux 강도 (낮을수록 원본 유지)
  const [openaiStrength, setOpenaiStrength] = useState(0.7); // OpenAI 변화 강도
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const prompt = useMemo(() => {
    const basePrompt = buildPrompt(form);
    const referenceInstructions = [];
    if (form.mode === "photoVariation" && variationImage) {
      referenceInstructions.push(
        "업로드된 원본 사진을 베리에이션 기준 이미지로 사용한다.",
        "원본 사진의 촬영감, 조명, 구도, 색감, 인물 간 거리, 병원 공간 분위기를 90% 이상 유지한다.",
        "새 콘셉트로 바꾸지 말고 같은 촬영 현장에서 나온 다른 컷처럼 아주 미세한 변화만 만든다."
      );
    }
    if (referenceImage) {
      referenceInstructions.push(
        "업로드된 원장 프로필 사진을 인물 참조 이미지로 사용한다.",
        "참조 사진 속 인물의 얼굴형, 눈매, 코, 입, 전체 인상, 헤어 분위기를 최대한 자연스럽게 보존한다.",
        "증명사진을 그대로 복사하지 말고, 실제 병원 촬영 현장에서 연출한 자연스러운 홍보 사진으로 재구성한다."
      );
    }
    if (styleReferenceImage) {
      referenceInstructions.push(
        "업로드된 참고 이미지는 색감, 조명, 구도, 공간 분위기, 배경 밀도, 인스타그램 피드 톤을 분석하기 위한 스타일 참고 이미지로 사용한다.",
        "참고 이미지의 인물이나 로고를 그대로 복제하지 않고, 포토클리닉 촬영 문법에 맞는 무드와 촬영감만 반영한다."
      );
    }
    if (!referenceInstructions.length) return basePrompt;
    return [
      basePrompt,
      ...referenceInstructions
    ].join(" ");
  }, [form, variationImage, referenceImage, styleReferenceImage]);

  const update = (key: keyof GeneratorForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleReferenceImage = (file: File | null) => {
    setReferenceImage(file);
    if (!file) {
      setReferencePreview("");
      return;
    }
    setReferencePreview(URL.createObjectURL(file));
  };

  const handleVariationImage = (file: File | null) => {
    setVariationImage(file);
    if (!file) {
      setVariationPreview("");
      return;
    }
    setVariationPreview(URL.createObjectURL(file));
    setForm((prev) => ({
      ...prev,
      mode: "photoVariation",
      scene: prev.scene || "원본 촬영 사진 베리에이션",
      department: prev.department || "병원",
      doctorDescription: prev.doctorDescription || "원본 사진 속 인물과 분위기 유지",
      content: prev.content || "원본 사진과 거의 같은 촬영감으로 미세한 표정, 구도, 손동작만 변주"
    }));
  };

  const handleStyleReferenceImage = (file: File | null) => {
    setStyleReferenceImage(file);
    if (!file) {
      setStyleReferencePreview("");
      return;
    }
    setStyleReferencePreview(URL.createObjectURL(file));
    if (!form.referenceAnalysis) {
      setForm((prev) => ({
        ...prev,
        referenceAnalysis: "참고 이미지의 밝은 역광, 아이보리 톤, 인물과 배경이 함께 보이는 구도, 인스타그램 피드에 어울리는 따뜻한 병원 브랜딩 무드를 반영"
      }));
    }
  };

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (form.mode === "photoVariation" && !variationImage) {
      setErrorMessage("베리에이션할 원본 사진을 업로드해주세요.");
      return;
    }

    if (form.mode === "photoVariation" && !hasVariationConsent) {
      setErrorMessage("업로드한 사진을 AI 베리에이션 생성에 사용할 권한과 동의를 확인해주세요.");
      return;
    }

    if (form.mode !== "photoVariation" && (!form.department.trim() || !form.scene.trim() || !form.doctorDescription.trim() || !form.content.trim())) {
      setErrorMessage("진료과, 장면, 원장/인물, 내용은 꼭 입력해주세요.");
      return;
    }

    if (referenceImage && !hasFaceConsent) {
      setErrorMessage("원장 프로필 사진 사용 권한과 본인/병원 동의를 확인해주세요.");
      return;
    }

    setIsGenerating(true);
    try {
      const payload = new FormData();
      payload.append("prompt", prompt);
      payload.append("generationMode", form.mode);
      payload.append("category", form.mode === "avatar" ? "포토클리닉 의료진 아바타" : form.mode === "photoVariation" ? "내가 찍은 사진 베리에이션" : form.scene);
      if (variationImage) payload.append("variationImage", variationImage);
      if (referenceImage) payload.append("referenceImage", referenceImage);
      if (styleReferenceImage) payload.append("styleReferenceImage", styleReferenceImage);

      const response = await fetch("/api/image-generator", {
        method: "POST",
        body: payload
      });
      const data = (await response.json()) as { images?: GeneratedImage[]; error?: string };
      if (!response.ok) throw new Error(data.error || "이미지 생성에 실패했습니다.");
      setImages(data.images || []);
      setSelectedImage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "이미지 생성에 실패했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = async (image: GeneratedImage) => {
    const fileName = `photoclinic-ai-${image.variationNo}.png`;
    const response = await fetch(image.imageUrl);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <main className="image-generator-page">
      <header className="image-generator-header">
        <div className="brand-lockup">
          <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" />
          <span>AI Image Generator</span>
        </div>
        <Link className="admin-secondary-link" href="/">
          <ArrowLeft size={17} />
          관리자 홈
        </Link>
      </header>

      <section className="image-generator-hero">
        <p className="admin-kicker">PHOTOCLINIC AI IMAGE GENERATOR</p>
        <h1>포토클리닉 사진 느낌을 AI로 생성합니다</h1>
        <p>
          상담 장면, 시술 장면, 원장 프로필, 의료진 아바타까지 필요한 정보를 칸별로 입력하면 포토클리닉 톤의 상세 프롬프트로 변환해 4장의 샘플 이미지를 생성합니다.
        </p>
      </section>

      <form className="image-generator-layout" onSubmit={generate}>
        <section className="image-generator-form">
          <div className="mode-selector">
            <button
              type="button"
              className={form.mode === "scene" ? "mode-card active" : "mode-card"}
              onClick={() => setForm((prev) => ({ ...prev, mode: "scene" }))}
            >
              <ImagePlus size={22} />
              <strong>사진 장면 생성</strong>
              <span>상담, 시술, 공간, 접수 장면</span>
            </button>
            <button
              type="button"
              className={form.mode === "avatar" ? "mode-card active" : "mode-card"}
              onClick={() => setForm((prev) => ({ ...prev, mode: "avatar" }))}
            >
              <UserRound size={22} />
              <strong>의료진 아바타 생성</strong>
              <span>원장, 의료진 프로필 이미지</span>
            </button>
            <button
              type="button"
              className={form.mode === "photoVariation" ? "mode-card active" : "mode-card"}
              onClick={() => setForm((prev) => ({ ...prev, mode: "photoVariation" }))}
            >
              <Camera size={22} />
              <strong>내 사진 베리에이션</strong>
              <span>찍은 사진 느낌 90% 이상 유지</span>
            </button>
          </div>

          <section className={form.mode === "photoVariation" ? "photo-variation-panel active" : "photo-variation-panel"}>
            <div>
              <p className="admin-kicker">MY PHOTO VARIATION</p>
              <h2>내가 찍은 사진 베리에이션</h2>
              <p>
                원본 사진의 촬영감, 조명, 구도, 색감, 인물 배치, 병원 공간 분위기를 최대한 유지하고 아주 작은 표정·구도 변화만 만듭니다.
              </p>
            </div>
            <label className="variation-upload-box">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => handleVariationImage(event.target.files?.[0] || null)}
              />
              {variationPreview ? (
                <img src={variationPreview} alt="베리에이션 원본 사진" />
              ) : (
                <span>
                  <Upload size={24} />
                  원본 사진 업로드
                </span>
              )}
            </label>
            <label className="field variation-request">
              <span>원하는 아주 작은 변화</span>
              <textarea
                value={form.variationRequest}
                onChange={(event) => update("variationRequest", event.target.value)}
                placeholder="예: 90% 이상 원본 느낌 유지, 살짝 아래 구도, 아이가 조금 더 미소, 손 위치만 자연스럽게 변화"
              />
            </label>
            {/* ── 강도 조절 슬라이더 ── */}
            <div className="variation-strength-panel">
              <div className="variation-strength-row">
                <div>
                  <strong>Flux 원본 유지 강도</strong>
                  <span>낮을수록 원본과 유사 · 높을수록 변화 많음</span>
                </div>
                <div className="strength-slider-group">
                  <span className="strength-label">원본 유지</span>
                  <input type="range" min="0.5" max="1.0" step="0.05"
                    value={fluxStrength}
                    onChange={(e) => setFluxStrength(parseFloat(e.target.value))}
                    className="strength-slider"
                  />
                  <span className="strength-label">변화 많음</span>
                  <span className="strength-value">{Math.round(fluxStrength * 100)}%</span>
                </div>
              </div>
              <div className="variation-strength-row">
                <div>
                  <strong>OpenAI 변화 강도</strong>
                  <span>OpenAI API 사용 시 적용 · 낮을수록 원본 느낌 유지</span>
                </div>
                <div className="strength-slider-group">
                  <span className="strength-label">미세 변화</span>
                  <input type="range" min="0.3" max="1.0" step="0.05"
                    value={openaiStrength}
                    onChange={(e) => setOpenaiStrength(parseFloat(e.target.value))}
                    className="strength-slider"
                  />
                  <span className="strength-label">큰 변화</span>
                  <span className="strength-value">{Math.round(openaiStrength * 100)}%</span>
                </div>
              </div>
            </div>

            {variationImage ? (
              <label className="face-consent">
                <input type="checkbox" checked={hasVariationConsent} onChange={(event) => setHasVariationConsent(event.target.checked)} />
                <span>업로드한 사진을 AI 베리에이션 생성 참조로 사용할 권한과 등장 인물/병원 측 동의를 확인했습니다.</span>
              </label>
            ) : null}
          </section>

          <section className={form.mode === "photoVariation" ? "reference-upload-panel hidden-section" : "reference-upload-panel"}>
            <div>
              <p className="admin-kicker">FACE REFERENCE</p>
              <h2>원장 프로필 사진 참조</h2>
              <p>
                얼굴이 명확히 보이는 정면 또는 반측면 사진을 업로드하면, AI가 해당 인물의 인상을 최대한 유지해 자연스러운 병원 연출사진을 만듭니다.
              </p>
            </div>
            <label className="reference-upload-box">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => handleReferenceImage(event.target.files?.[0] || null)}
              />
              {referencePreview ? (
                <img src={referencePreview} alt="원장 프로필 참조 이미지" />
              ) : (
                <span>
                  <Upload size={24} />
                  프로필 사진 업로드
                </span>
              )}
            </label>
            {referenceImage ? (
              <label className="face-consent">
                <input type="checkbox" checked={hasFaceConsent} onChange={(event) => setHasFaceConsent(event.target.checked)} />
                <span>업로드한 인물 사진을 AI 이미지 생성 참조로 사용할 권한과 당사자 동의를 확인했습니다.</span>
              </label>
            ) : null}
          </section>

          <section className={form.mode === "photoVariation" ? "style-reference-panel hidden-section" : "style-reference-panel"}>
            <div>
              <p className="admin-kicker">STYLE REFERENCE</p>
              <h2>참고 이미지 업로드 / 분석</h2>
              <p>포토클리닉 인스타그램과 비슷한 느낌의 참고 이미지를 올리고, 조명·구도·색감·배경 특징을 메모하면 프롬프트에 반영됩니다.</p>
            </div>
            <label className="style-reference-upload">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => handleStyleReferenceImage(event.target.files?.[0] || null)}
              />
              {styleReferencePreview ? (
                <img src={styleReferencePreview} alt="스타일 참고 이미지" />
              ) : (
                <span>
                  <Upload size={22} />
                  참고 이미지 업로드
                </span>
              )}
            </label>
            <label className="field style-reference-note">
              <span>참고 이미지 분석 메모</span>
              <textarea
                value={form.referenceAnalysis}
                onChange={(event) => update("referenceAnalysis", event.target.value)}
                placeholder="예: 창가 역광이 강하고, 머리결과 어깨에 림라이트가 보임. 인물은 오른쪽 1/3 지점, 배경은 아이보리 상담실."
              />
            </label>
          </section>

          <section className={form.mode === "photoVariation" ? "instagram-style-panel hidden-section" : "instagram-style-panel"}>
            <div>
              <p className="admin-kicker">INSTAGRAM STYLE</p>
              <h2>포토클리닉 인스타그램 톤</h2>
              <p>피드에 바로 올릴 수 있는 따뜻한 병원 브랜딩 사진 톤을 기본으로 고정합니다.</p>
            </div>
            <div className="instagram-format-grid">
              {instagramFormats.map((format) => (
                <button
                  key={format}
                  type="button"
                  className={form.instagramFormat === format ? "instagram-chip active" : "instagram-chip"}
                  onClick={() => update("instagramFormat", format)}
                >
                  {format}
                </button>
              ))}
            </div>
          </section>

          <section className={form.mode === "photoVariation" ? "shooting-preset-panel hidden-section" : "shooting-preset-panel"}>
            <div>
              <p className="admin-kicker">PHOTOCLINIC SHOOTING LOOK</p>
              <h2>포토클리닉 촬영감 프리셋</h2>
              <p>역광, 35mm 로우앵글, 3분할 구도처럼 일반 이미지 생성과 다른 포토클리닉식 촬영 문법을 고정합니다.</p>
            </div>
            <div className="shooting-preset-grid">
              {shootingPresets.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  className={form.shootingPreset === preset.title ? "shooting-preset-card active" : "shooting-preset-card"}
                  onClick={() => update("shootingPreset", preset.title)}
                >
                  <strong>{preset.title}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="photoreal-rules-panel">
            <div>
              <p className="admin-kicker">REAL PHOTO QUALITY</p>
              <h2>실사 품질 고정 규칙</h2>
              <p>AI 렌더링처럼 보이지 않도록 실제 카메라, 자연스러운 피부, 현실적인 손과 조명 조건을 항상 프롬프트에 넣습니다.</p>
            </div>
            <ul>
              <li>35mm 렌즈로 촬영한 실제 사진 느낌</li>
              <li>자연스러운 피부 질감과 은은한 보정</li>
              <li>현실적인 손가락, 자세, 표정</li>
              <li>균형 잡힌 노출, 자연스러운 그림자와 심도</li>
              <li>CGI, 3D 렌더, 플라스틱 피부, 과한 광택 방지</li>
            </ul>
          </section>

          <section className="detail-tabs-panel">
            <div className="detail-tab-list">
              <button type="button" className={detailTab === "scene" ? "detail-tab active" : "detail-tab"} onClick={() => setDetailTab("scene")}>
                장면 설명
              </button>
              <button type="button" className={detailTab === "background" ? "detail-tab active" : "detail-tab"} onClick={() => setDetailTab("background")}>
                배경 설명
              </button>
            </div>

            {detailTab === "scene" ? (
              <div className="detail-tab-content">
                <div className="generator-grid two">
                  <label className="field">
                    <span>진료과</span>
                    <input value={form.department} onChange={(event) => update("department", event.target.value)} placeholder="예: 피부과" />
                  </label>
                  <label className="field">
                    <span>장면</span>
                    <input value={form.scene} onChange={(event) => update("scene", event.target.value)} placeholder="예: 원장님 시술 / 상담하는 장면" />
                  </label>
                </div>

                <label className="field">
                  <span>{form.mode === "avatar" ? "아바타 인물 설명" : "원장 / 주요 인물"}</span>
                  <input
                    value={form.doctorDescription}
                    onChange={(event) => update("doctorDescription", event.target.value)}
                    placeholder="예: 아담한 키의 한국인 여성 원장, 부드러운 인상"
                  />
                </label>

                <label className="field">
                  <span>내용</span>
                  <textarea
                    value={form.content}
                    onChange={(event) => update("content", event.target.value)}
                    placeholder="예: 주사 시술 장면(필러), 환자에게 편안하게 설명하며 준비하는 모습"
                  />
                </label>

                <div className="generator-grid two">
                  <label className="field">
                    <span>직원 유무</span>
                    <input value={form.staffPresence} onChange={(event) => update("staffPresence", event.target.value)} placeholder="예: 1명 간호사" />
                  </label>
                  <label className="field">
                    <span>환자 / 함께 등장하는 인물</span>
                    <input value={form.patientDescription} onChange={(event) => update("patientDescription", event.target.value)} placeholder="예: 30대 여성 환자" />
                  </label>
                </div>
              </div>
            ) : (
              <div className="detail-tab-content">
                <label className="field">
                  <span>배경 설명</span>
                  <textarea
                    value={form.backgroundDescription}
                    onChange={(event) => update("backgroundDescription", event.target.value)}
                    placeholder="예: 아이보리 톤 상담실, 창가 자연광, 깊이감 있는 복도, 따뜻한 우드 포인트"
                  />
                </label>

                <div className="generator-grid two">
                  <label className="field">
                    <span>배경에서 꼭 보여야 할 요소</span>
                    <input value={form.backgroundMustShow} onChange={(event) => update("backgroundMustShow", event.target.value)} placeholder="예: 창가 빛, 상담 테이블, 아이보리 벽면" />
                  </label>
                  <label className="field">
                    <span>배경에서 피해야 할 요소</span>
                    <input value={form.backgroundAvoid} onChange={(event) => update("backgroundAvoid", event.target.value)} placeholder="예: 어두운 배경, 복잡한 장비, 차가운 형광등" />
                  </label>
                </div>

                <div className="generator-grid two">
                  <label className="field">
                    <span>인테리어</span>
                    <input value={form.interior} onChange={(event) => update("interior", event.target.value)} placeholder="예: 따뜻한 아이보리 컬러" />
                  </label>
                  <label className="field">
                    <span>분위기</span>
                    <input value={form.mood} onChange={(event) => update("mood", event.target.value)} placeholder="예: 따뜻하고 신뢰감 있는" />
                  </label>
                </div>
              </div>
            )}
          </section>

          <div className="generator-grid two">
            <label className="field">
              <span>사진 느낌</span>
              <input value={form.cameraStyle} onChange={(event) => update("cameraStyle", event.target.value)} placeholder="예: 자연광, 50mm 렌즈, 실제 홍보 사진" />
            </label>
            <label className="field">
              <span>활용 목적</span>
              <input value={form.usage} onChange={(event) => update("usage", event.target.value)} placeholder="예: 홈페이지 메인, SNS 광고" />
            </label>
          </div>

          <label className="field">
            <span>추가 요청</span>
            <textarea value={form.extraRequest} onChange={(event) => update("extraRequest", event.target.value)} placeholder="피하고 싶은 표현, 원하는 구도, 의상, 배경 등을 적어주세요." />
          </label>

          {errorMessage ? <p className="generator-error">{errorMessage}</p> : null}

          <button className="admin-primary-button generator-submit" type="submit" disabled={isGenerating}>
            {isGenerating ? <Loader2 className="spin-icon" size={18} /> : <Sparkles size={18} />}
            {isGenerating ? "AI 이미지 생성 중" : "AI 이미지 4장 생성하기"}
          </button>
        </section>

        <aside className="prompt-panel">
          <p className="admin-kicker">PROMPT PREVIEW</p>
          <h2>자동 생성 프롬프트</h2>
          <p>{prompt}</p>
        </aside>
      </form>

      {images.length ? (
        <section className="generated-section">
          <div>
            <p className="admin-kicker">GENERATED RESULT</p>
            <h2>생성 결과</h2>
          </div>
          <div className="generated-grid">
            {images.map((image) => (
              <article className="generated-card" key={`${image.variationNo}-${image.imageUrl}`}>
                <button className="generated-image-button" type="button" onClick={() => setSelectedImage(image)}>
                  <img src={image.imageUrl} alt={`생성 이미지 ${image.variationNo}`} />
                  <span>
                    <Maximize2 size={16} />
                    크게 보기
                  </span>
                </button>
                <div>
                  <strong>Variation {image.variationNo}</strong>
                  <span>{image.category}</span>
                  <button type="button" onClick={() => downloadImage(image)}>
                    <Download size={15} />
                    다운로드
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {selectedImage ? (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="생성 이미지 크게 보기" onClick={() => setSelectedImage(null)}>
          <div className="image-lightbox-panel" onClick={(event) => event.stopPropagation()}>
            <div className="image-lightbox-toolbar">
              <div>
                <strong>Variation {selectedImage.variationNo}</strong>
                <span>{selectedImage.category}</span>
              </div>
              <div>
                <button type="button" onClick={() => downloadImage(selectedImage)}>
                  <Download size={16} />
                  다운로드
                </button>
                <button type="button" aria-label="닫기" onClick={() => setSelectedImage(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <img src={selectedImage.imageUrl} alt={`생성 이미지 ${selectedImage.variationNo} 크게 보기`} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
