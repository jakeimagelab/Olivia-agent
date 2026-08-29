import type { ComponentType } from "react";
import {
  NotebookPen, Calendar, ClipboardList, FileVideo, Users, Link2, Mail, Wand2,
  BarChart2, Share2, Lightbulb, CalendarCheck, Sparkles, ScanSearch, ShieldCheck,
  ImageDown, Activity, TrendingUp, Globe2, Search, Trash2, Images, Trophy, MessageCircle, Mic,
  Fingerprint, Library, ImagePlus, PenTool, LayoutGrid, Megaphone,
  Target, Scissors, Film, Video, Palette, Clock, FileSignature,
} from "lucide-react";

/* /admin 콘솔의 3개 카테고리(관리자 대시보드 / 고객관리 CRM / 개별 기능)와 동일한 분류 —
   세부 페이지 전역 사이드바(GlobalFeatureSidebar)도 같은 기준으로 묶어서 보여준다. */
export type NavCategory = "dashboard" | "crm" | "tools";
export const NAV_CATEGORY_LABEL: Record<NavCategory, string> = {
  dashboard: "관리자 대시보드",
  crm:       "고객관리 CRM",
  tools:     "AI Assistant",
};

export type ToolDef = {
  title: string; desc: string; href: string;
  icon: ComponentType<{ size?: number }>; meta: string; orange: boolean;
  category: NavCategory;
  /* Olivia가 자연어 요청을 이 기능과 매칭할 때 쓰는 대체 표현들 — 없으면 title/meta로만 매칭.
     lib/olivia/features/resolver.ts가 소비한다. */
  aliases?: string[];
};

/* 업무 도구 — 대시보드 왼쪽 그리드 & 전역 사이드바 & Olivia 기능 실행이 공유하는 단일 소스 */
export const TOOLS_WORK: ToolDef[] = [
  { title: "메모", desc: "일반 텍스트, 펜 템플릿, AI 음성 요약으로 기록을 정리합니다.", href: "/memo", icon: NotebookPen, meta: "Memo", orange: true, category: "dashboard", aliases: ["메모", "메모장", "노트"] },
  { title: "팀 채팅", desc: "스튜디오 팀원들과 채팅방을 만들어 대화하고 파일을 주고받습니다.", href: "/team-chat", icon: MessageCircle, meta: "Team Chat", orange: false, category: "dashboard", aliases: ["팀채팅", "팀 채팅", "팀 대화"] },
  { title: "업무 캘린더", desc: "날짜별 촬영·미팅·행정 할일을 한 화면에서 관리합니다.", href: "/calendar", icon: Calendar, meta: "Task Calendar", orange: false, category: "dashboard", aliases: ["캘린더", "일정", "달력", "스케줄"] },
  { title: "업무일지", desc: "촬영 일정별 To-do와 장비·렌탈 준비사항을 관리합니다.", href: "/work-journal", icon: ClipboardList, meta: "Shoot Log", orange: false, category: "dashboard", aliases: ["업무일지", "촬영 준비"] },
  { title: "워크스페이스", desc: "팀 채팅·목표·프로젝트·리포트를 한 곳에서 관리합니다.", href: "/team", icon: LayoutGrid, meta: "Workspace", orange: false, category: "dashboard", aliases: ["워크스페이스"] },
  { title: "마케팅 대시보드", desc: "채널별 마케팅 전략과 지식 베이스를 관리합니다.", href: "/marketing", icon: Megaphone, meta: "Marketing", orange: false, category: "tools", aliases: ["마케팅", "마케팅 대시보드"] },
  // 카카오 AI 비서(/admin/kakao-assistant)는 2026-08-14 요청으로 앱 내 네비게이션(사이드바/더보기/
  // 빠른실행/Olivia open_feature)에서만 숨겼다 — 웹훅·백엔드는 그대로 동작하니 실제 카카오 채널
  // 사용에는 영향 없다. 필요해지면 이 줄만 다시 추가하면 된다.
  { title: "견적서 생성", desc: "촬영 패키지와 옵션을 선택해 견적서 PDF를 생성합니다.", href: "/quote", icon: ClipboardList, meta: "Quote Builder", orange: false, category: "tools", aliases: ["견적서", "견적", "견적서 생성", "견적 만들어줘"] },
  // /contract 페이지는 있었지만(app/contract/page.tsx) 이 레지스트리에 등록이 안 돼 있어
  // "계약서 페이지 열어줘"조차 열리지 않았다(2026-08-30, PHASE 3 조사로 확인) — 견적과 동일한
  // 패턴으로 등록한다.
  { title: "계약서 생성", desc: "견적 데이터를 이어받아 계약서 PDF를 생성하고 서명을 받습니다.", href: "/contract", icon: FileSignature, meta: "Contract Builder", orange: false, category: "tools", aliases: ["계약서", "계약서 작성", "계약", "계약서 만들어줘"] },
  { title: "콘티/초상권 작성", desc: "사진 콘티(체크리스트·타임테이블)와 영상 콘티(씬·컷·손그림 스토리보드), 초상권 동의서를 한 화면에서 생성합니다.", href: "/conti", icon: FileVideo, meta: "Storyboard Studio", orange: false, category: "tools", aliases: ["콘티", "콘티/초상권", "초상권"] },
  { title: "고객 관리", desc: "병원별 상담→견적→계약→촬영→전달 단계를 관리하고 업무 현황을 추적합니다.", href: "/clients", icon: Users, meta: "Client Management", orange: true, category: "crm", aliases: ["고객관리", "고객 관리", "고객", "고객 목록", "고객리스트", "CRM", "클라이언트"] },
  { title: "셀렉 갤러리", desc: "고객에게 촬영본을 전달하고 셀렉을 받는 갤러리를 관리합니다.", href: "/select-galleries", icon: Images, meta: "Select Gallery", orange: false, category: "crm", aliases: ["셀렉갤러리", "셀렉 갤러리", "갤러리"] },
  { title: "PER 리워드", desc: "고객 추천 리워드 적립·신청·후속 관리를 처리합니다.", href: "/per", icon: Trophy, meta: "PER Reward", orange: false, category: "crm", aliases: ["PER", "리워드"] },
  { title: "고객 포털 관리", desc: "병원 고객에게 전달할 고객 전용 포털 링크를 생성하고 수정 요청·리뷰를 관리합니다.", href: "/portal-admin", icon: Link2, meta: "Client Portal", orange: false, category: "crm", aliases: ["고객포털", "고객 포털"] },
  { title: "통합 메일링", desc: "견적서·계약서·갤러리 등 메일 초안을 한 곳에서 확인·발송합니다.", href: "/mailing", icon: Mail, meta: "Unified Mailing", orange: false, category: "dashboard", aliases: ["메일링", "메일함"] },
  { title: "사진 작업실", desc: "사진 분류·색감 체크·피부톤 DNA 비교·Photoshop 보정 가이드를 한 화면에서 관리합니다.", href: "/photo-sorting", icon: Wand2, meta: "Photo Studio", orange: false, category: "tools", aliases: ["사진 작업실", "사진분류", "사진 분류"] },
  { title: "셀렉 & 매칭", desc: "고객이 선택한 사진 파일명을 RAW 원본과 자동으로 매칭해 Selected_RAW 폴더에 정리합니다.", href: "/select-match", icon: Target, meta: "Select & Match", orange: false, category: "tools", aliases: ["셀렉매칭", "셀렉 매칭", "RAW매칭", "RAW 매칭", "원본매칭", "원본 매칭", "사진셀렉", "사진 셀렉", "셀렉하기", "고객셀렉", "매칭", "파일명으로 찾기", "파일 순서 검토"] },
  { title: "메타데이터 셀렉", desc: "파일명이 바뀐 선택본을 촬영시간(EXIF)으로 원본 JPG·RAW와 매칭합니다.", href: "/metadata-select", icon: Clock, meta: "Metadata Select", orange: false, category: "tools", aliases: ["메타데이터셀렉", "메타데이터 셀렉", "촬영시간매칭", "촬영시간 매칭", "EXIF매칭", "EXIF 매칭", "파일명 변경 매칭"] },
  { title: "AI 컷 정리 & RAW 셀렉", desc: "촬영 JPG를 품질·중복도로 필터링하고 선택된 사진과 매칭하는 RAW 파일을 자동으로 결과 폴더에 정리합니다.", href: "/raw-select", icon: Scissors, meta: "RAW Select", orange: false, category: "tools", aliases: ["RAW셀렉", "RAW 셀렉", "컷정리", "컷 정리", "AI 컷 정리", "씬 분석", "RAW 복사"] },
  { title: "영상 분류", desc: "영상 파일을 AI가 카테고리별로 자동 분류하거나 촬영 시간 간격으로 Scene 폴더로 나누어 정리합니다.", href: "/video-sorting", icon: Film, meta: "Video Sorting", orange: false, category: "tools", aliases: ["영상분류", "영상 분류", "비디오 분류", "AI 영상 분류", "시간차 분류", "영상 정렬"] },
  { title: "4K→FHD 변환", desc: "4K·고해상도 영상을 브라우저 내에서 FHD(1920×1080)로 변환하고 결과를 폴더에 저장합니다.", href: "/video-convert", icon: Video, meta: "Video Convert", orange: false, category: "tools", aliases: ["영상변환", "화질변환", "4K변환", "FHD변환", "영상 해상도 변환", "영상 인코딩"] },
  { title: "사진 보정", desc: "사진을 업로드해 AI로 피부톤 또는 가운 색을 기준과 비교하고 Photoshop·Camera Raw 보정값을 제공합니다.", href: "/photo-retouching", icon: Palette, meta: "Photo Retouching", orange: false, category: "tools", aliases: ["사진보정", "색감보정", "리터칭", "포토샵 보정", "색감 체크", "피부톤 분석", "가운 색 보정", "색감 동기화"] },
  { title: "B롤 이미지 프롬프트", desc: "유튜브 대본에서 구간을 골라 이미지 생성 AI에 바로 쓸 영문 프롬프트를 만듭니다.", href: "/broll-prompt", icon: ImagePlus, meta: "B-roll Prompt", orange: false, category: "tools", aliases: ["B롤", "비롤"] },
  { title: "유튜브 편집 콘티", desc: "대본을 장면별로 나누고 손글씨로 카메라, 자막, 자료화면과 편집 효과를 설계합니다.", href: "/youtube-editing-conti", icon: PenTool, meta: "Editing Storyboard", orange: false, category: "tools", aliases: ["유튜브 편집 콘티", "편집 콘티"] },
  { title: "프롬프터", desc: "대본을 입력해 반전·자동스크롤·타이머와 함께 읽으며 동시 녹화합니다.", href: "/prompter", icon: Mic, meta: "Teleprompter", orange: false, category: "tools", aliases: ["프롬프터", "텔레프롬프터", "대본 띄워줘", "대본 화면", "프롬프터 실행", "프롬프터 열어줘"] },
  { title: "업무 리포트", desc: "AI 활동 기록, 병원별 통계, 일별 차트를 한눈에 확인합니다.", href: "/report", icon: BarChart2, meta: "Weekly Report", orange: false, category: "tools", aliases: ["업무 리포트", "리포트", "주간 리포트"] },
  { title: "외부 공유 링크", desc: "비밀번호 없는 외부인에게 특정 기능 하나만 열어주는 링크를 생성·관리합니다.", href: "/link-generator", icon: Share2, meta: "Share Links", orange: false, category: "dashboard", aliases: ["공유 링크", "외부 공유"] },
  { title: "휴지통", desc: "삭제한 상담·일정·고객·콘티를 30일 동안 확인하고 복원합니다.", href: "/trash", icon: Trash2, meta: "Recovery Bin", orange: false, category: "dashboard", aliases: ["휴지통"] },
];

export const TOOLS_CONTENT: ToolDef[] = [
  { title: "아이디어 제안", desc: "오늘 제작할 클라이언트 홍보 콘텐츠 아이디어를 AI가 매일 제안합니다.", href: "/daily-ideas", icon: Lightbulb, meta: "Idea Proposal", orange: true, category: "tools", aliases: ["아이디어 제안", "콘텐츠 아이디어"] },
  { title: "홍보 콘텐츠 제작", desc: "블로그·인스타·네이버 플레이스 홍보 콘텐츠를 클라이언트별로 제작합니다.", href: "/sns-manager", icon: CalendarCheck, meta: "Content Production", orange: false, category: "tools", aliases: ["홍보 콘텐츠", "SNS 관리"] },
  { title: "리뷰컨텐츠", desc: "클라이언트 반응을 수집해 포토클리닉 홍보 인스타 콘텐츠로 만듭니다.", href: "/review-studio", icon: Sparkles, meta: "Review Content", orange: false, category: "tools", aliases: ["리뷰 콘텐츠", "리뷰컨텐츠"] },
  { title: "홈페이지 브랜드 분석", desc: "병원 홈페이지 URL만 입력하면 브랜드 키워드·촬영 방향·브랜드필름 문장·콘티를 자동 분석합니다.", href: "/brand-analysis", icon: ScanSearch, meta: "Brand Analysis", orange: true, category: "tools", aliases: ["브랜드 분석", "홈페이지 브랜드 분석"] },
  { title: "AI 추천 병원 역분석", desc: "AI가 반복 추천하는 병원군의 증거와 패턴을 분석해 신뢰 격차와 촬영 기획으로 연결합니다.", href: "/ai-trust-gap", icon: ShieldCheck, meta: "AI Trust Gap", orange: true, category: "tools", aliases: ["AI 추천 병원 역분석", "신뢰 격차"] },
  { title: "병원이미지 진단", desc: "병원 현황에 맞는 사진 콘텐츠 방향을 AI가 진단합니다.", href: "/diagnosis", icon: ImageDown, meta: "Clinic Diagnosis", orange: false, category: "tools", aliases: ["병원이미지 진단", "이미지 진단"] },
  { title: "병원브랜드이미지 진단", desc: "홈페이지·플레이스·블로그·인스타그램에서 환자에게 전달되는 병원의 전체 인상을 진단합니다.", href: "/hospital-brand-image-diagnosis", icon: Fingerprint, meta: "Brand Image Diagnosis", orange: false, category: "tools", aliases: ["병원브랜드이미지 진단", "브랜드 이미지 진단"] },
  { title: "병원 채널 분석", desc: "인스타그램·홈페이지·네이버 플레이스·블로그를 함께 분석합니다.", href: "/channel-analyzer", icon: Activity, meta: "Channel Analysis", orange: false, category: "tools", aliases: ["채널 분석", "병원 채널 분석"] },
  { title: "병원 트렌드 분석", desc: "SNS·키워드 검색량·경쟁사 현황을 업종별로 수집해 AI 인사이트와 함께 보여줍니다.", href: "/trend-dashboard", icon: TrendingUp, meta: "Trend Dashboard", orange: true, category: "tools", aliases: ["트렌드 분석", "트렌드 대시보드"] },
  { title: "리얼 이미지 디렉터", desc: "올리비아가 촬영 디렉팅하고 OpenAI gpt-image-1로 실사 병원 이미지를 생성합니다.", href: "/image-generator", icon: Sparkles, meta: "Real Image Director", orange: true, category: "tools", aliases: ["이미지 디렉터", "이미지 생성"] },
  { title: "홈페이지 제작", desc: "병원 홈페이지 제작 요청과 기획 정보를 정리합니다.", href: "/website-builder", icon: Globe2, meta: "Website Builder", orange: false, category: "tools", aliases: ["홈페이지 제작", "웹사이트 제작"] },
  { title: "AI 검색 최적화", desc: "납품 사진의 SEO 파일명·ALT·캡션·메타데이터를 자동 생성합니다.", href: "/seo-delivery", icon: Search, meta: "SEO Delivery", orange: true, category: "tools", aliases: ["SEO", "검색 최적화"] },
  { title: "라이브러리", desc: "명언·비즈니스 영어·마케팅 사례·컨설팅 프레임워크·세계 이슈를 모아둔 개인 지식창고입니다.", href: "/library", icon: Library, meta: "Reference Library", orange: false, category: "tools", aliases: ["라이브러리"] },
];

/* 전역 사이드바용 — 대시보드 항목까지 포함한 순서 있는 전체 목록 */
export const ALL_TOOLS: ToolDef[] = [...TOOLS_WORK, ...TOOLS_CONTENT];

/* 전역 사이드바가 /admin과 같은 3분류로 그룹핑해 보여줄 때 쓰는 헬퍼 */
export function groupToolsByCategory(tools: ToolDef[] = ALL_TOOLS): { category: NavCategory; label: string; items: ToolDef[] }[] {
  const order: NavCategory[] = ["dashboard", "crm", "tools"];
  return order.map((category) => ({
    category,
    label: NAV_CATEGORY_LABEL[category],
    items: tools.filter((t) => t.category === category),
  }));
}
