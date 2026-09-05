import type { ReactElement, SVGProps } from "react";

export const ICON_NAMES = [
  'today',
  'olivia',
  'memo',
  'team-chat',
  'work-calendar',
  'work-log',
  'workspace',
  'mailing',
  'share-link',
  'trash',
  'clients',
  'select-gallery',
  'per-reward',
  'client-portal',
  'marketing-dashboard',
  'quote',
  'contract',
  'storyboard',
  'photo-studio',
  'select-match',
  'metadata-select',
  'raw-select',
  'video-sort',
  'resolution-convert',
  'retouch',
  'broll-prompt',
  'youtube-storyboard',
  'prompter',
  'work-report',
  'idea',
  'promo-content',
  'review-content',
  'brand-audit',
  'reverse-analysis',
  'image-diagnosis',
  'brand-image-diagnosis',
  'channel-analysis',
  'trend-analysis',
  'image-director',
  'website-build',
  'seo',
  'library',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const ICON_LABELS: Record<IconName, string> = {
  'today': '오늘',
  'olivia': 'Olivia',
  'memo': '메모',
  'team-chat': '팀 채팅',
  'work-calendar': '업무 캘린더',
  'work-log': '업무일지',
  'workspace': '워크스페이스',
  'mailing': '통합 메일링',
  'share-link': '외부 공유 링크',
  'trash': '휴지통',
  'clients': '고객 관리',
  'select-gallery': '셀렉 갤러리',
  'per-reward': 'PER 리워드',
  'client-portal': '고객 포털 관리',
  'marketing-dashboard': '마케팅 대시보드',
  'quote': '견적서 생성',
  'contract': '계약서 생성',
  'storyboard': '콘티/초상권 작성',
  'photo-studio': '사진 작업실',
  'select-match': '셀렉 & 매칭',
  'metadata-select': '메타데이터 셀렉',
  'raw-select': 'AI 컷 정리 & RAW 셀렉',
  'video-sort': '영상 분류',
  'resolution-convert': '4K→FHD 변환',
  'retouch': '사진 보정',
  'broll-prompt': 'B롤 이미지 프롬프트',
  'youtube-storyboard': '유튜브 편집 콘티',
  'prompter': '프롬프터',
  'work-report': '업무 리포트',
  'idea': '아이디어 제안',
  'promo-content': '홍보 콘텐츠 제작',
  'review-content': '리뷰컨텐츠',
  'brand-audit': '홈페이지 브랜드 분석',
  'reverse-analysis': 'AI 추천 병원 역분석',
  'image-diagnosis': '병원이미지 진단',
  'brand-image-diagnosis': '병원브랜드이미지 진단',
  'channel-analysis': '병원 채널 분석',
  'trend-analysis': '병원 트렌드 분석',
  'image-director': '리얼 이미지 디렉터',
  'website-build': '홈페이지 제작',
  'seo': 'AI 검색 최적화',
  'library': '라이브러리',
};

export const ICON_GROUPS: Record<string, IconName[]> = {
  'Desktop': ['today', 'olivia'],
  '관리자 대시보드': ['memo', 'team-chat', 'work-calendar', 'work-log', 'workspace', 'mailing', 'share-link', 'trash'],
  '고객관리 CRM': ['clients', 'select-gallery', 'per-reward', 'client-portal'],
  'AI Assistant': ['marketing-dashboard', 'quote', 'contract', 'storyboard', 'photo-studio', 'select-match', 'metadata-select', 'raw-select', 'video-sort', 'resolution-convert', 'retouch', 'broll-prompt', 'youtube-storyboard', 'prompter', 'work-report', 'idea', 'promo-content', 'review-content', 'brand-audit', 'reverse-analysis', 'image-diagnosis', 'brand-image-diagnosis', 'channel-analysis', 'trend-analysis', 'image-director', 'website-build', 'seo', 'library'],
};

const paths: Record<IconName, ReactElement> = {
  'today': (
    <>
      <rect x="2.5" y="3.5" width="19" height="18" rx="4.5" fill="#155855"/>
      <rect x="8.5" y="10.5" width="7" height="7" rx="2" fill="#E85D2C"/>
    </>
  ),
  'olivia': (
    <>
      <circle cx="12" cy="12" r="9.5" fill="#7C5CA8"/>
      <path d="M12 5.5l1.7 3.8 3.8 1.7-3.8 1.7L12 16.5l-1.7-3.8L6.5 11l3.8-1.7z" fill="#fff"/>
    </>
  ),
  'memo': (
    <>
      <rect x="3.5" y="2.5" width="17" height="19" rx="3.5" fill="#E9A227"/>
      <rect x="3.5" y="2.5" width="4.5" height="19" rx="2.2" fill="#BA7517"/>
      <rect x="10.5" y="8" width="7" height="2" rx="1" fill="#fff"/>
      <rect x="10.5" y="13" width="7" height="2" rx="1" fill="#fff"/>
    </>
  ),
  'team-chat': (
    <>
      <path d="M2 7a3.5 3.5 0 013.5-3.5h8A3.5 3.5 0 0117 7v2.5a3.5 3.5 0 01-3.5 3.5H8l-6 4V7z" fill="#2E6F9E"/>
      <path d="M22 14.5a3.5 3.5 0 00-3.5-3.5v.5A5.5 5.5 0 0113 17h-2.5v.5A3.5 3.5 0 0014 21h2.5l5.5 3.5z" fill="#4BA3C7"/>
    </>
  ),
  'work-calendar': (
    <>
      <rect x="2.5" y="3.5" width="19" height="18" rx="4.5" fill="#2E6F9E"/>
      <rect x="2.5" y="3.5" width="19" height="5.5" rx="2.7" fill="#144A75"/>
      <rect x="6.5" y="12.5" width="4" height="4" rx="1.3" fill="#fff"/>
      <rect x="13.5" y="12.5" width="4" height="4" rx="1.3" fill="#fff"/>
    </>
  ),
  'work-log': (
    <>
      <rect x="3.5" y="3.5" width="17" height="18" rx="3.5" fill="#4C9A5C"/>
      <rect x="7.5" y="1.5" width="9" height="4.5" rx="2.2" fill="#2C6B33"/>
      <rect x="7.5" y="11" width="9" height="2" rx="1" fill="#fff"/>
      <rect x="7.5" y="15.5" width="6" height="2" rx="1" fill="#fff"/>
    </>
  ),
  'workspace': (
    <>
      <rect x="2.5" y="2.5" width="8.5" height="8.5" rx="2.6" fill="#155855"/>
      <rect x="13" y="2.5" width="8.5" height="8.5" rx="2.6" fill="#155855"/>
      <rect x="2.5" y="13" width="8.5" height="8.5" rx="2.6" fill="#155855"/>
      <rect x="13" y="13" width="8.5" height="8.5" rx="2.6" fill="#E85D2C"/>
    </>
  ),
  'mailing': (
    <>
      <rect x="1.5" y="4.5" width="21" height="15" rx="3.5" fill="#D4547A"/>
      <path d="M3.5 7.5l7.2 5.2a2.2 2.2 0 002.6 0l7.2-5.2" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    </>
  ),
  'share-link': (
    <>
      <path d="M8 12l8-4.5M8 12l8 4.5" stroke="#7C5CA8" strokeWidth="2.4" strokeLinecap="round"/>
      <circle cx="6" cy="12" r="4.2" fill="#7C5CA8"/>
      <circle cx="17.5" cy="6" r="4.2" fill="#7C5CA8"/>
      <circle cx="17.5" cy="18" r="4.2" fill="#E85D2C"/>
    </>
  ),
  'trash': (
    <>
      <path d="M5 8.5h14l-1.1 11.2a2.5 2.5 0 01-2.5 2.3H8.6a2.5 2.5 0 01-2.5-2.3z" fill="#6B7A78"/>
      <rect x="2.5" y="4" width="19" height="4" rx="2" fill="#D4547A"/>
      <rect x="9" y="1.5" width="6" height="3" rx="1.5" fill="#D4547A"/>
    </>
  ),
  'clients': (
    <>
      <circle cx="16" cy="8" r="4" fill="#2E9186"/>
      <path d="M9 21.5c0-4 3.1-6.8 7-6.8s7 2.8 7 6.8z" fill="#2E9186"/>
      <circle cx="8.5" cy="7.5" r="4.8" fill="#E85D2C"/>
      <path d="M0.5 21.5c0-4.6 3.6-7.8 8-7.8s8 3.2 8 7.8z" fill="#E85D2C"/>
    </>
  ),
  'select-gallery': (
    <>
      <rect x="6.5" y="2.5" width="15.5" height="13" rx="3.2" fill="#4BA3C7"/>
      <rect x="2" y="7" width="15.5" height="14.5" rx="3.2" fill="#155855"/>
      <circle cx="9.7" cy="14.2" r="2.4" fill="#fff"/>
    </>
  ),
  'per-reward': (
    <>
      <path d="M5.5 2.5h13v6.5a6.5 6.5 0 01-13 0z" fill="#E9A227"/>
      <rect x="10.3" y="14.5" width="3.4" height="3.5" fill="#155855"/>
      <rect x="6" y="18" width="12" height="3.5" rx="1.7" fill="#155855"/>
    </>
  ),
  'client-portal': (
    <>
      <rect x="1" y="8.5" width="12.5" height="7" rx="3.5" fill="#2E6F9E"/>
      <rect x="10.5" y="8.5" width="12.5" height="7" rx="3.5" fill="#4BA3C7"/>
      <rect x="8" y="10.8" width="8" height="2.4" rx="1.2" fill="#fff"/>
    </>
  ),
  'marketing-dashboard': (
    <>
      <path d="M2.5 9.5L17 3.5v17L2.5 14.5z" fill="#E85D2C"/>
      <path d="M5 15l1.6 6.2 3.6-.9L8.6 15.6z" fill="#155855"/>
      <path d="M20 8.5a5.5 5.5 0 010 7" stroke="#155855" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    </>
  ),
  'quote': (
    <>
      <rect x="4" y="2.5" width="16" height="19" rx="3.5" fill="#4C9A5C"/>
      <path d="M9 10.5h6M9 14h6M12 10.5v6.5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    </>
  ),
  'contract': (
    <>
      <rect x="3.5" y="2.5" width="15" height="19" rx="3.5" fill="#2E6F9E"/>
      <path d="M20.5 10l2.5 2.5-6 6-3.2.7.7-3.2z" fill="#E85D2C"/>
    </>
  ),
  'storyboard': (
    <>
      <rect x="4" y="2.5" width="16" height="19" rx="3.5" fill="#7C5CA8"/>
      <path d="M10 8.5l6 3.5-6 3.5z" fill="#fff"/>
    </>
  ),
  'photo-studio': (
    <>
      <rect x="2" y="4.5" width="20" height="15.5" rx="4" fill="#155855"/>
      <path d="M2 16l5-4.5 4 3.5 3.5-3 7.5 6.5v.5a2 2 0 01-2 2H4a2 2 0 01-2-2z" fill="#2E9186"/>
      <circle cx="7.5" cy="9.5" r="2.2" fill="#E9A227"/>
    </>
  ),
  'select-match': (
    <>
      <circle cx="12" cy="12" r="10" fill="#D4547A"/>
      <circle cx="12" cy="12" r="6" fill="#fff"/>
      <circle cx="12" cy="12" r="2.8" fill="#D4547A"/>
    </>
  ),
  'metadata-select': (
    <>
      <path d="M2.5 5a2.5 2.5 0 012.5-2.5h5.6a3 3 0 012.1.9l8 8a2.5 2.5 0 010 3.5l-5.8 5.8a2.5 2.5 0 01-3.5 0l-8-8a3 3 0 01-.9-2.1z" fill="#4BA3C7"/>
      <circle cx="8" cy="8" r="2.4" fill="#fff"/>
    </>
  ),
  'raw-select': (
    <>
      <path d="M6.5 5.5L18 17.5M17.5 5.5L6 17.5" stroke="#155855" strokeWidth="2.6" strokeLinecap="round"/>
      <circle cx="5.5" cy="19" r="3.4" fill="#E85D2C"/>
      <circle cx="18.5" cy="19" r="3.4" fill="#E85D2C"/>
    </>
  ),
  'video-sort': (
    <>
      <rect x="2" y="4" width="20" height="16" rx="4" fill="#7C5CA8"/>
      <rect x="4.2" y="7" width="2.6" height="3.4" rx="1.1" fill="#fff"/>
      <rect x="4.2" y="13.6" width="2.6" height="3.4" rx="1.1" fill="#fff"/>
      <rect x="17.2" y="7" width="2.6" height="3.4" rx="1.1" fill="#fff"/>
      <rect x="17.2" y="13.6" width="2.6" height="3.4" rx="1.1" fill="#fff"/>
    </>
  ),
  'resolution-convert': (
    <>
      <rect x="1.5" y="5.5" width="14.5" height="13" rx="3.5" fill="#2E6F9E"/>
      <path d="M17.5 10l5-3.5v11l-5-3.5z" fill="#4C9A5C"/>
    </>
  ),
  'retouch': (
    <>
      <path d="M12 2c5.5 0 9.8 3.9 9.8 8.6 0 3.4-2.8 4.7-4.9 4.7h-2c-1.2 0-2 .8-2 1.9 0 .6.3 1 .3 1.7 0 1.5-1 2.6-2.7 2.6C6.2 21.5 2.2 17.3 2.2 12S6.5 2 12 2z" fill="#E85D2C"/>
      <circle cx="8" cy="8.5" r="2.1" fill="#fff"/>
      <circle cx="15" cy="7.5" r="2.1" fill="#fff"/>
      <circle cx="7" cy="14.5" r="2.1" fill="#fff"/>
    </>
  ),
  'broll-prompt': (
    <>
      <rect x="1.5" y="3.5" width="16.5" height="16.5" rx="4" fill="#2E9186"/>
      <circle cx="18.5" cy="18" r="5" fill="#E85D2C"/>
      <path d="M18.5 15.5v5M16 18h5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    </>
  ),
  'youtube-storyboard': (
    <>
      <path d="M21 2l1.8 9.5-4.8-2-3.8 3.6.6-7.4z" fill="#D4547A"/>
      <path d="M4 21.5c0-6.5 3.5-12.5 9.5-16" stroke="#155855" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
    </>
  ),
  'prompter': (
    <>
      <rect x="8" y="1.5" width="8" height="13" rx="4" fill="#7C5CA8"/>
      <path d="M4.5 11.5a7.5 7.5 0 0015 0" stroke="#155855" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      <rect x="10.7" y="18.5" width="2.6" height="4.5" rx="1.3" fill="#155855"/>
    </>
  ),
  'work-report': (
    <>
      <rect x="2.5" y="12.5" width="5" height="9" rx="2.4" fill="#2E6F9E"/>
      <rect x="9.5" y="6" width="5" height="15.5" rx="2.4" fill="#2E6F9E"/>
      <rect x="16.5" y="9.5" width="5" height="12" rx="2.4" fill="#E9A227"/>
    </>
  ),
  'idea': (
    <>
      <path d="M12 1.5a7.8 7.8 0 014.7 14v1.8a1.6 1.6 0 01-1.6 1.6H8.9a1.6 1.6 0 01-1.6-1.6v-1.8A7.8 7.8 0 0112 1.5z" fill="#E9A227"/>
      <rect x="8.5" y="20" width="7" height="3" rx="1.5" fill="#155855"/>
    </>
  ),
  'promo-content': (
    <>
      <rect x="2.5" y="3.5" width="19" height="18" rx="4.5" fill="#4C9A5C"/>
      <path d="M7.5 12.5l3.2 3.2 6-6.2" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'review-content': (
    <>
      <path d="M12 1.5l3.1 6.6 7.2 1-5.2 5 1.3 7.2-6.4-3.5-6.4 3.5 1.3-7.2-5.2-5 7.2-1z" fill="#E9A227"/>
    </>
  ),
  'brand-audit': (
    <>
      <rect x="1.5" y="3" width="17.5" height="15" rx="3.5" fill="#4BA3C7"/>
      <circle cx="13" cy="13" r="5.2" fill="#fff"/>
      <circle cx="13" cy="13" r="5.2" fill="none" stroke="#E85D2C" strokeWidth="2.6"/>
      <path d="M16.9 16.9l4.6 4.6" stroke="#E85D2C" strokeWidth="2.8" strokeLinecap="round"/>
    </>
  ),
  'reverse-analysis': (
    <>
      <path d="M12 1.5l9 3.4v6.8c0 5.2-3.8 9.8-9 11.3-5.2-1.5-9-6.1-9-11.3V4.9z" fill="#155855"/>
      <path d="M8 12l3.2 3.2 5.3-5.6" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'image-diagnosis': (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" fill="#D4547A"/>
      <circle cx="12" cy="12" r="3.6" fill="#fff"/>
      <path d="M1.5 7.5V4a2.5 2.5 0 012.5-2.5h3.5M22.5 7.5V4A2.5 2.5 0 0020 1.5h-3.5M1.5 16.5V20A2.5 2.5 0 004 22.5h3.5M22.5 16.5V20a2.5 2.5 0 01-2.5 2.5h-3.5" stroke="#155855" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </>
  ),
  'brand-image-diagnosis': (
    <>
      <path d="M2.5 11.5a9.5 9.5 0 0119 0v3.5" stroke="#7C5CA8" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M6.8 12a5.2 5.2 0 0110.4 0v5.5" stroke="#7C5CA8" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M12 12v8.5" stroke="#E85D2C" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    </>
  ),
  'channel-analysis': (
    <>
      <rect x="2" y="4" width="20" height="16" rx="4" fill="#D4547A"/>
      <path d="M5.5 12.5h2.8l2-4.5 2.8 8.5 2-5 1.4 1h2" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'trend-analysis': (
    <>
      <path d="M3 17.5l6-6 4 4 7.5-8" stroke="#4C9A5C" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15 7.5h5.5V13" stroke="#4C9A5C" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'image-director': (
    <>
      <path d="M12 1.5l2.9 6.8 6.8 2.9-6.8 2.9L12 21l-2.9-6.9L2.3 11.2l6.8-2.9z" fill="#2E9186"/>
    </>
  ),
  'website-build': (
    <>
      <circle cx="12" cy="12" r="10" fill="#4BA3C7"/>
      <path d="M2 12h20M12 2c2.7 2.7 4.2 6.2 4.2 10S14.7 19.3 12 22c-2.7-2.7-4.2-6.2-4.2-10S9.3 4.7 12 2z" stroke="#fff" strokeWidth="2" fill="none"/>
    </>
  ),
  'seo': (
    <>
      <circle cx="10.5" cy="10.5" r="8" fill="#155855"/>
      <circle cx="10.5" cy="10.5" r="3.6" fill="#fff"/>
      <path d="M16.5 16.5l5 5" stroke="#155855" strokeWidth="3" strokeLinecap="round"/>
    </>
  ),
  'library': (
    <>
      <rect x="2.5" y="4" width="5" height="17" rx="2" fill="#E85D2C"/>
      <rect x="9.5" y="6.5" width="5" height="14.5" rx="2" fill="#E9A227"/>
      <rect x="16.5" y="3" width="5" height="18" rx="2" fill="#155855"/>
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  title?: string;
}

export function Icon({ name, size = 24, title, ...rest }: IconProps) {
  const label = title ?? ICON_LABELS[name];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

export default Icon;
