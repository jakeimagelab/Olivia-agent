import type { LucideIcon } from "lucide-react";
import { BarChart3, Camera, Film, Lightbulb, ScanSearch } from "lucide-react";

export type WorkspaceGroupId = "photo" | "video" | "brand" | "content" | "insights";
export type WorkspaceAccent = "mint" | "blue" | "purple" | "orange" | "green";

export type WorkspaceSubTool = {
  id: string;
  title: string;
  href: string;
  aliases: string[];
  /** 기존 ALL_TOOLS에서 이 기능을 대표하던 route. Launcher의 중복 카드를 제거할 때 쓴다. */
  sourceHrefs: string[];
};

export type WorkspaceGroup = {
  id: WorkspaceGroupId;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  accent: WorkspaceAccent;
  aliases: string[];
  tools: WorkspaceSubTool[];
};

export const WORKSPACE_GROUPS: readonly WorkspaceGroup[] = [
  {
    id: "photo",
    title: "사진작업실",
    description: "촬영 콘티부터 사진 셀렉, RAW 매칭, 분류와 후반 작업까지 한 곳에서.",
    href: "/photo-sorting",
    icon: Camera,
    accent: "mint",
    aliases: ["사진 작업실", "포토 작업실", "사진 도구"],
    tools: [
      { id: "plan", title: "촬영 콘티", href: "/photo-sorting?tab=plan&tool=conti", aliases: ["콘티", "촬영 콘티", "사진 콘티", "콘티 만들기", "촬영계획", "촬영 계획", "콘티 작업실", "스토리보드 스튜디오"], sourceHrefs: ["/conti"] },
      { id: "photo-select", title: "사진 셀렉", href: "/photo-sorting?mode=select", aliases: ["사진 셀렉", "AI 사진 셀렉", "AI 사진 검색", "사진 검색", "직접 셀렉", "고객 셀렉", "고객셀렉"], sourceHrefs: [] },
      { id: "raw-match", title: "RAW 매칭", href: "/photo-sorting?mode=raw-match", aliases: ["셀렉매칭", "셀렉 매칭", "RAW 매칭", "원본 매칭", "RAW 셀렉", "매칭"], sourceHrefs: ["/select-match", "/metadata-select"] },
      { id: "metadata-match", title: "촬영시간 RAW 매칭", href: "/photo-sorting?tool=metadata-match", aliases: ["메타데이터 셀렉", "EXIF 매칭", "촬영시간 매칭"], sourceHrefs: [] },
      { id: "classification", title: "사진 분류", href: "/photo-sorting?tool=classification", aliases: ["사진분류", "Scene 분류", "씬 분류"], sourceHrefs: ["/photo-sorting"] },
      { id: "t-cut", title: "T컷 정리", href: "/photo-sorting?tool=t-cut", aliases: ["T컷", "T컷 정리", "AI T컷", "AI 컷 정리", "컷정리", "컷 정리", "실패컷"], sourceHrefs: ["/raw-select"] },
      { id: "resize", title: "사진 리사이즈", href: "/photo-sorting?tool=resize", aliases: ["사진 리사이즈", "이미지 리사이즈", "사진 크기 변경"], sourceHrefs: [] },
      { id: "rename", title: "이름변경", href: "/photo-sorting?tool=rename", aliases: ["이름변경", "파일명 변경", "사진 이름 변경"], sourceHrefs: [] },
      { id: "retouch", title: "사진 보정", href: "/photo-sorting?tool=retouch", aliases: ["사진보정", "색감 보정", "리터칭"], sourceHrefs: ["/photo-retouching"] },
    ],
  },
  {
    id: "video",
    title: "영상작업실",
    description: "영상 기획과 촬영부터 인터뷰 분석, 분류, 제작·발행까지 한 곳에서.",
    href: "/video-studio",
    icon: Film,
    accent: "blue",
    aliases: ["영상 작업실", "비디오 작업실", "영상 도구", "영상 기획", "영상 촬영", "영상 후반"],
    tools: [
      { id: "video-conti", title: "영상 콘티", href: "/video-studio?tab=plan&tool=video-conti", aliases: ["영상 콘티", "브랜드 영상 콘티"], sourceHrefs: ["/video-conti"] },
      { id: "youtube-conti", title: "유튜브 편집 콘티", href: "/video-studio?tab=plan&tool=youtube-conti", aliases: ["유튜브 편집 콘티", "유튜브 편집", "편집 콘티"], sourceHrefs: ["/youtube-editing-conti"] },
      { id: "broll", title: "B-roll 프롬프트", href: "/video-studio?tab=plan&tool=broll", aliases: ["B롤", "비롤", "B-roll", "B-roll 프롬프트"], sourceHrefs: ["/broll-prompt"] },
      { id: "prompter", title: "프롬프터", href: "/video-studio?tab=shoot&tool=prompter", aliases: ["프롬프터", "텔레프롬프터", "대본 띄워줘", "프롬프터 실행", "프롬프터 열어줘"], sourceHrefs: ["/prompter"] },
      { id: "interview", title: "인터뷰 분석", href: "/video-studio?tab=post&tool=interview", aliases: ["인터뷰 분석", "영상 분석", "전사", "녹취", "Q&A 분리", "영상 내용 정리"], sourceHrefs: [] },
      { id: "reels", title: "릴스", href: "/video-studio?tab=post&tool=reels", aliases: ["릴스 추천", "릴스 구간", "쇼츠 구간"], sourceHrefs: [] },
      { id: "sorting", title: "영상 분류", href: "/video-studio?tab=post&tool=sorting", aliases: ["영상분류", "영상 분류", "비디오 분류", "AI 영상 분류", "시간차 분류", "영상 정렬"], sourceHrefs: ["/video-sorting"] },
      { id: "audio", title: "음성 분리", href: "/video-studio?tab=post&tool=audio", aliases: ["음성 분리", "오디오 추출", "음성 추출", "wav 추출"], sourceHrefs: [] },
      { id: "magazine", title: "매거진 원고", href: "/video-studio?tab=publish&tool=magazine", aliases: ["매거진 원고", "웹진 초안", "인터뷰 웹진"], sourceHrefs: [] },
      { id: "ai-video", title: "AI 영상제작", href: "/video-studio?tab=publish&tool=ai-video", aliases: ["영상제작", "영상 제작", "AI 영상", "이미지 투 비디오", "image to video", "text to video"], sourceHrefs: ["/video-production"] },
    ],
  },
  {
    id: "brand",
    title: "브랜드 진단센터",
    description: "브랜드 이미지와 채널, AI 검색 신뢰도를 한곳에서 진단합니다.",
    href: "/brand-analysis",
    icon: ScanSearch,
    accent: "purple",
    aliases: ["브랜드 진단", "병원 진단센터"],
    tools: [
      { id: "brand", title: "브랜드", href: "/brand-analysis", aliases: ["브랜드 분석", "홈페이지 브랜드 분석"], sourceHrefs: ["/brand-analysis"] },
      { id: "image", title: "이미지", href: "/hospital-brand-image-diagnosis", aliases: ["병원 이미지 진단", "브랜드 이미지 진단"], sourceHrefs: ["/diagnosis", "/hospital-brand-image-diagnosis"] },
      { id: "channel", title: "채널", href: "/channel-analyzer", aliases: ["병원 채널 분석", "채널 분석"], sourceHrefs: ["/channel-analyzer"] },
      { id: "ai-search", title: "AI 검색", href: "/ai-trust-gap", aliases: ["AI 추천 병원 역분석", "AI 검색 진단", "신뢰 격차"], sourceHrefs: ["/ai-trust-gap"] },
      { id: "trend", title: "트렌드", href: "/trend-dashboard", aliases: ["병원 트렌드 분석", "트렌드 분석"], sourceHrefs: ["/trend-dashboard"] },
    ],
  },
  {
    id: "content",
    title: "콘텐츠 스튜디오",
    description: "아이디어부터 채널별 홍보물과 리뷰 콘텐츠까지 제작합니다.",
    href: "/daily-ideas",
    icon: Lightbulb,
    accent: "orange",
    aliases: ["콘텐츠 작업실", "콘텐츠 제작"],
    tools: [
      { id: "ideas", title: "아이디어", href: "/daily-ideas", aliases: ["아이디어 제안", "콘텐츠 아이디어"], sourceHrefs: ["/daily-ideas"] },
      { id: "promotion", title: "홍보 콘텐츠", href: "/sns-manager", aliases: ["홍보 콘텐츠 제작", "SNS 콘텐츠"], sourceHrefs: ["/sns-manager"] },
      // href는 DB 목록 화면(canonical 진입점)을 가리킨다. sourceHrefs에는 예전 단독 진입점이던
      // 에디터 경로를 그대로 남겨 getCanonicalWorkspaceHref("/review-studio")도 목록으로 정규화되게 한다.
      { id: "review", title: "리뷰 콘텐츠", href: "/clients/reviews", aliases: ["리뷰 콘텐츠", "리뷰컨텐츠"], sourceHrefs: ["/review-studio"] },
    ],
  },
  {
    id: "insights",
    title: "리포트 · 인사이트",
    description: "업무 결과와 월간 운영, 시장 흐름을 리포트로 확인합니다.",
    href: "/report",
    icon: BarChart3,
    accent: "green",
    aliases: ["리포트 센터", "인사이트"],
    tools: [
      { id: "work", title: "업무 리포트", href: "/report", aliases: ["업무 리포트", "주간 리포트"], sourceHrefs: ["/report"] },
      { id: "monthly", title: "월간 리포트", href: "/monthly-report", aliases: ["월간 리포트", "월간 운영 리포트"], sourceHrefs: ["/monthly-report"] },
      { id: "trend", title: "트렌드 리포트", href: "/trend-dashboard", aliases: ["트렌드 리포트", "시장 트렌드"], sourceHrefs: ["/trend-dashboard"] },
    ],
  },
] as const;

const integratedHrefs = new Set(
  WORKSPACE_GROUPS.flatMap((group) => group.tools.flatMap((tool) => tool.sourceHrefs)),
);
integratedHrefs.add("/portrait-consent");

const canonicalHrefBySource = new Map<string, string>();
// EXIF matching is a method inside the RAW matching tab. Its legacy route
// opens that method directly instead of the filename-matching default.
const PHOTO_SOURCE_OVERRIDES = new Map<string, string>([
  ["/metadata-select", "/photo-sorting?tool=metadata-match"],
]);
for (const group of WORKSPACE_GROUPS) {
  for (const tool of group.tools) {
    for (const sourceHref of tool.sourceHrefs) {
      // 한 기존 기능이 두 그룹에서 보조 기능으로 보일 수 있다. 먼저 선언된 primary 업무 그룹을
      // Olivia의 canonical 목적지로 사용한다.
      if (!canonicalHrefBySource.has(sourceHref)) {
        canonicalHrefBySource.set(sourceHref, PHOTO_SOURCE_OVERRIDES.get(sourceHref) ?? (sourceHref === group.href ? group.href : tool.href));
      }
    }
  }
}

canonicalHrefBySource.set("/portrait-consent", "/clients?tab=documents&document=portrait-consent");

export function isIntegratedToolHref(href: string): boolean {
  return integratedHrefs.has(href);
}

export function getCanonicalWorkspaceHref(href: string): string {
  const source = new URL(href, "https://olivia.local");
  const canonicalHref = canonicalHrefBySource.get(source.pathname);
  if (!canonicalHref) return href;
  const target = new URL(canonicalHref, "https://olivia.local");
  source.searchParams.forEach((value, key) => {
    if (!target.searchParams.has(key)) target.searchParams.set(key, value);
  });
  return `${target.pathname}${target.search}`;
}

export function getWorkspaceGroup(id: WorkspaceGroupId): WorkspaceGroup | undefined {
  return WORKSPACE_GROUPS.find((group) => group.id === id);
}

export function workspaceGroupSearchText(group: WorkspaceGroup): string {
  return [
    group.title,
    group.description,
    ...group.aliases,
    ...group.tools.flatMap((tool) => [tool.title, ...tool.aliases]),
  ].join(" ");
}
