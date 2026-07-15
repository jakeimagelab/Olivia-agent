import type { ComponentType } from "react";
import {
  NotebookPen, Calendar, ClipboardList, FileVideo, Users, Link2, Mail, Wand2,
  BarChart2, Share2, Lightbulb, CalendarCheck, Sparkles, ScanSearch, ShieldCheck,
  ImageDown, Activity, TrendingUp, Globe2, Search, Trash2,
} from "lucide-react";

export type ToolDef = {
  title: string; desc: string; href: string;
  icon: ComponentType<{ size?: number }>; meta: string; orange: boolean;
};

/* 업무 도구 — 대시보드 왼쪽 그리드 & 전역 사이드바가 공유하는 단일 소스 */
export const TOOLS_WORK: ToolDef[] = [
  { title: "상담 메모", desc: "상담 내용을 빠르게 기록하고 병원 DB로 등록합니다. 고객 관리와 자동 연결됩니다.", href: "/memo", icon: NotebookPen, meta: "Consult Memo", orange: true },
  { title: "업무 캘린더", desc: "날짜별 촬영·미팅·행정 할일을 한 화면에서 관리합니다.", href: "/calendar", icon: Calendar, meta: "Task Calendar", orange: false },
  { title: "견적서 생성", desc: "촬영 패키지와 옵션을 선택해 견적서 PDF를 생성합니다.", href: "/quote", icon: ClipboardList, meta: "Quote Builder", orange: false },
  { title: "콘티생성", desc: "사진 콘티(체크리스트·타임테이블)와 영상 콘티(씬·컷·손그림 스토리보드)를 한 화면에서 생성합니다.", href: "/conti", icon: FileVideo, meta: "Storyboard Studio", orange: false },
  { title: "고객 관리", desc: "병원별 상담→견적→계약→촬영→전달 단계를 관리하고 업무 현황을 추적합니다.", href: "/clients", icon: Users, meta: "Client Management", orange: true },
  { title: "고객 포털 관리", desc: "병원 고객에게 전달할 고객 전용 포털 링크를 생성하고 수정 요청·리뷰를 관리합니다.", href: "/portal-admin", icon: Link2, meta: "Client Portal", orange: false },
  { title: "통합 메일링", desc: "견적서·계약서·갤러리 등 메일 초안을 한 곳에서 확인·발송합니다.", href: "/mailing", icon: Mail, meta: "Unified Mailing", orange: false },
  { title: "사진 작업실", desc: "사진 분류·색감 체크·피부톤 DNA 비교·Photoshop 보정 가이드를 한 화면에서 관리합니다.", href: "/photo-sorting", icon: Wand2, meta: "Photo Studio", orange: false },
  { title: "업무 리포트", desc: "AI 활동 기록, 병원별 통계, 일별 차트를 한눈에 확인합니다.", href: "/report", icon: BarChart2, meta: "Weekly Report", orange: false },
  { title: "외부 공유 링크", desc: "비밀번호 없는 외부인에게 특정 기능 하나만 열어주는 링크를 생성·관리합니다.", href: "/link-generator", icon: Share2, meta: "Share Links", orange: false },
  { title: "휴지통", desc: "삭제한 상담·일정·고객·콘티를 30일 동안 확인하고 복원합니다.", href: "/trash", icon: Trash2, meta: "Recovery Bin", orange: false },
];

export const TOOLS_CONTENT: ToolDef[] = [
  { title: "아이디어 제안", desc: "오늘 제작할 클라이언트 홍보 콘텐츠 아이디어를 AI가 매일 제안합니다.", href: "/daily-ideas", icon: Lightbulb, meta: "Idea Proposal", orange: true },
  { title: "홍보 콘텐츠 제작", desc: "블로그·인스타·네이버 플레이스 홍보 콘텐츠를 클라이언트별로 제작합니다.", href: "/sns-manager", icon: CalendarCheck, meta: "Content Production", orange: false },
  { title: "클라이언트 후기 콘텐츠", desc: "클라이언트 반응을 수집해 포토클리닉 홍보 인스타 콘텐츠로 만듭니다.", href: "/review-studio", icon: Sparkles, meta: "Review Studio", orange: false },
  { title: "홈페이지 브랜드 분석", desc: "병원 홈페이지 URL만 입력하면 브랜드 키워드·촬영 방향·브랜드필름 문장·콘티를 자동 분석합니다.", href: "/brand-analysis", icon: ScanSearch, meta: "Brand Analysis", orange: true },
  { title: "AI 추천 병원 역분석", desc: "AI가 반복 추천하는 병원군의 증거와 패턴을 분석해 신뢰 격차와 촬영 기획으로 연결합니다.", href: "/ai-trust-gap", icon: ShieldCheck, meta: "AI Trust Gap", orange: true },
  { title: "병원이미지 진단", desc: "병원 현황에 맞는 사진 콘텐츠 방향을 AI가 진단합니다.", href: "/diagnosis", icon: ImageDown, meta: "Clinic Diagnosis", orange: false },
  { title: "병원 채널 분석", desc: "인스타그램·홈페이지·네이버 플레이스·블로그를 함께 분석합니다.", href: "/channel-analyzer", icon: Activity, meta: "Channel Analysis", orange: false },
  { title: "병원 트렌드 분석", desc: "SNS·키워드 검색량·경쟁사 현황을 업종별로 수집해 AI 인사이트와 함께 보여줍니다.", href: "/trend-dashboard", icon: TrendingUp, meta: "Trend Dashboard", orange: true },
  { title: "리얼 이미지 디렉터", desc: "올리비아가 촬영 디렉팅하고 OpenAI gpt-image-1로 실사 병원 이미지를 생성합니다.", href: "/image-generator", icon: Sparkles, meta: "Real Image Director", orange: true },
  { title: "홈페이지 제작", desc: "병원 홈페이지 제작 요청과 기획 정보를 정리합니다.", href: "/website-builder", icon: Globe2, meta: "Website Builder", orange: false },
  { title: "AI 검색 최적화", desc: "납품 사진의 SEO 파일명·ALT·캡션·메타데이터를 자동 생성합니다.", href: "/seo-delivery", icon: Search, meta: "SEO Delivery", orange: true },
];

/* 전역 사이드바용 — 대시보드 항목까지 포함한 순서 있는 전체 목록 */
export const ALL_TOOLS: ToolDef[] = [...TOOLS_WORK, ...TOOLS_CONTENT];
