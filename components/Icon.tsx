import type { ReactElement, SVGProps } from "react";

// 포토클리닉 OS 컬러 아이콘 세트 중 Desktop Registry와 Dock에서 사용하는 아이콘.
// 원본: /Users/jakembpm2/Downloads/Icon.tsx
export const ICON_NAMES = [
  "today",
  "olivia",
  "memo",
  "workspace",
  "trash",
  "clients",
  "work-calendar",
  "quote",
  "contract",
  "storyboard",
  "photo-studio",
  "review-content",
  "image-director",
  "library",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const ICON_LABELS: Record<IconName, string> = {
  today: "오늘",
  olivia: "Olivia",
  memo: "메모",
  workspace: "워크스페이스",
  trash: "휴지통",
  clients: "고객 관리",
  "work-calendar": "업무 캘린더",
  quote: "견적서 생성",
  contract: "계약서 생성",
  storyboard: "콘티/초상권 작성",
  "photo-studio": "사진 작업실",
  "review-content": "리뷰콘텐츠",
  "image-director": "리얼 이미지 디렉터",
  library: "라이브러리",
};

const paths: Record<IconName, ReactElement> = {
  today: <><rect x="2.5" y="3.5" width="19" height="18" rx="4.5" fill="#155855"/><rect x="8.5" y="10.5" width="7" height="7" rx="2" fill="#E85D2C"/></>,
  olivia: <><circle cx="12" cy="12" r="9.5" fill="#7C5CA8"/><path d="M12 5.5l1.7 3.8 3.8 1.7-3.8 1.7L12 16.5l-1.7-3.8L6.5 11l3.8-1.7z" fill="#fff"/></>,
  memo: <><rect x="3.5" y="2.5" width="17" height="19" rx="3.5" fill="#E9A227"/><rect x="3.5" y="2.5" width="4.5" height="19" rx="2.2" fill="#BA7517"/><rect x="10.5" y="8" width="7" height="2" rx="1" fill="#fff"/><rect x="10.5" y="13" width="7" height="2" rx="1" fill="#fff"/></>,
  workspace: <><rect x="2.5" y="2.5" width="8.5" height="8.5" rx="2.6" fill="#155855"/><rect x="13" y="2.5" width="8.5" height="8.5" rx="2.6" fill="#155855"/><rect x="2.5" y="13" width="8.5" height="8.5" rx="2.6" fill="#155855"/><rect x="13" y="13" width="8.5" height="8.5" rx="2.6" fill="#E85D2C"/></>,
  trash: <><path d="M5 8.5h14l-1.1 11.2a2.5 2.5 0 01-2.5 2.3H8.6a2.5 2.5 0 01-2.5-2.3z" fill="#6B7A78"/><rect x="2.5" y="4" width="19" height="4" rx="2" fill="#D4547A"/><rect x="9" y="1.5" width="6" height="3" rx="1.5" fill="#D4547A"/></>,
  clients: <><circle cx="16" cy="8" r="4" fill="#2E9186"/><path d="M9 21.5c0-4 3.1-6.8 7-6.8s7 2.8 7 6.8z" fill="#2E9186"/><circle cx="8.5" cy="7.5" r="4.8" fill="#E85D2C"/><path d="M.5 21.5c0-4.6 3.6-7.8 8-7.8s8 3.2 8 7.8z" fill="#E85D2C"/></>,
  "work-calendar": <><rect x="2.5" y="3.5" width="19" height="18" rx="4.5" fill="#2E6F9E"/><rect x="2.5" y="3.5" width="19" height="5.5" rx="2.7" fill="#144A75"/><rect x="6.5" y="12.5" width="4" height="4" rx="1.3" fill="#fff"/><rect x="13.5" y="12.5" width="4" height="4" rx="1.3" fill="#fff"/></>,
  quote: <><rect x="4" y="2.5" width="16" height="19" rx="3.5" fill="#4C9A5C"/><path d="M9 10.5h6M9 14h6M12 10.5v6.5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></>,
  contract: <><rect x="3.5" y="2.5" width="15" height="19" rx="3.5" fill="#2E6F9E"/><path d="M20.5 10l2.5 2.5-6 6-3.2.7.7-3.2z" fill="#E85D2C"/></>,
  storyboard: <><rect x="4" y="2.5" width="16" height="19" rx="3.5" fill="#7C5CA8"/><path d="M10 8.5l6 3.5-6 3.5z" fill="#fff"/></>,
  "photo-studio": <><rect x="2" y="4.5" width="20" height="15.5" rx="4" fill="#155855"/><path d="M2 16l5-4.5 4 3.5 3.5-3 7.5 6.5v.5a2 2 0 01-2 2H4a2 2 0 01-2-2z" fill="#2E9186"/><circle cx="7.5" cy="9.5" r="2.2" fill="#E9A227"/></>,
  "review-content": <path d="M12 1.5l3.1 6.6 7.2 1-5.2 5 1.3 7.2-6.4-3.5-6.4 3.5 1.3-7.2-5.2-5 7.2-1z" fill="#E9A227"/>,
  "image-director": <path d="M12 1.5l2.9 6.8 6.8 2.9-6.8 2.9L12 21l-2.9-6.9L2.3 11.2l6.8-2.9z" fill="#2E9186"/>,
  library: <><rect x="2.5" y="4" width="5" height="17" rx="2" fill="#E85D2C"/><rect x="9.5" y="6.5" width="5" height="14.5" rx="2" fill="#E9A227"/><rect x="16.5" y="3" width="5" height="18" rx="2" fill="#155855"/></>,
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  title?: string;
}

export function Icon({ name, size = 24, title, ...rest }: IconProps) {
  const label = title ?? ICON_LABELS[name];
  return <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={label} {...rest}>{paths[name]}</svg>;
}

export default Icon;
