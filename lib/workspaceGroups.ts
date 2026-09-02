import type { LucideIcon } from "lucide-react";
import { BarChart3, Camera, Clapperboard, Lightbulb, ScanSearch } from "lucide-react";

export type WorkspaceGroupId = "photo" | "conti" | "brand" | "content" | "insights";
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
    description: "RAW 매칭부터 셀렉, 정리, 검색까지 한 번에.",
    href: "/photo-sorting",
    icon: Camera,
    accent: "mint",
    aliases: ["사진 작업실", "포토 작업실", "사진 도구"],
    tools: [
      { id: "select-raw", title: "셀렉 & RAW 매칭", href: "/photo-sorting?tool=select-raw", aliases: ["셀렉매칭", "셀렉 매칭", "사진 셀렉", "고객 셀렉", "고객셀렉", "RAW 매칭", "원본 매칭", "매칭"], sourceHrefs: ["/select-match"] },
      { id: "metadata-match", title: "메타데이터 매칭", href: "/photo-sorting?tool=metadata-match", aliases: ["메타데이터 셀렉", "EXIF 매칭", "촬영시간 매칭"], sourceHrefs: ["/metadata-select"] },
      { id: "ai-cull", title: "AI 컷 정리", href: "/photo-sorting?tool=ai-cull", aliases: ["AI 컷 정리", "RAW 셀렉", "컷 정리"], sourceHrefs: ["/raw-select"] },
      { id: "ai-search", title: "AI 사진검색", href: "/photo-sorting?tool=ai-search", aliases: ["AI 사진 검색", "사진 검색", "의미 검색"], sourceHrefs: [] },
      { id: "classification", title: "사진 분류", href: "/photo-sorting?tool=classification", aliases: ["사진분류", "Scene 분류", "씬 분류"], sourceHrefs: ["/photo-sorting"] },
      { id: "retouch", title: "사진 보정", href: "/photo-sorting?tool=retouch", aliases: ["사진보정", "색감 보정", "리터칭"], sourceHrefs: ["/photo-retouching"] },
      { id: "conversion", title: "파일 변환", href: "/photo-sorting?tool=conversion", aliases: ["파일 변환", "4K FHD 변환", "영상 변환"], sourceHrefs: ["/video-convert"] },
    ],
  },
  {
    id: "conti",
    title: "콘티 스튜디오",
    description: "촬영과 영상 기획, 편집 콘티와 동의서를 한 흐름으로.",
    href: "/conti",
    icon: Clapperboard,
    accent: "blue",
    aliases: ["콘티", "콘티/초상권 작성", "콘티/초상권", "콘티 작업실", "스토리보드 스튜디오"],
    tools: [
      { id: "shooting", title: "촬영 콘티", href: "/conti?tool=shooting", aliases: ["촬영 콘티", "사진 콘티"], sourceHrefs: ["/conti"] },
      { id: "video", title: "영상 콘티", href: "/video-conti", aliases: ["영상 콘티", "브랜드 영상 콘티"], sourceHrefs: ["/video-conti"] },
      { id: "youtube", title: "유튜브 편집", href: "/youtube-editing-conti", aliases: ["유튜브 편집 콘티", "편집 콘티"], sourceHrefs: ["/youtube-editing-conti"] },
      { id: "broll", title: "B-roll 프롬프트", href: "/broll-prompt", aliases: ["B롤", "비롤", "B-roll"], sourceHrefs: ["/broll-prompt"] },
      { id: "portrait", title: "초상권", href: "/conti?tool=portrait", aliases: ["초상권", "초상권 동의서"], sourceHrefs: [] },
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

const canonicalHrefBySource = new Map<string, string>();
for (const group of WORKSPACE_GROUPS) {
  for (const tool of group.tools) {
    for (const sourceHref of tool.sourceHrefs) {
      // 한 기존 기능이 두 그룹에서 보조 기능으로 보일 수 있다. 먼저 선언된 primary 업무 그룹을
      // Olivia의 canonical 목적지로 사용한다.
      if (!canonicalHrefBySource.has(sourceHref)) {
        canonicalHrefBySource.set(sourceHref, sourceHref === group.href ? group.href : tool.href);
      }
    }
  }
}

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
