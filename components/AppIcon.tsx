import type { SVGProps } from 'react';
import { ICON_NAMES, ICON_LABELS, ICON_GROUPS } from './Icon';
import type { IconName } from './Icon';

export { ICON_NAMES, ICON_LABELS, ICON_GROUPS };
export type { IconName };

export const APP_ICON_BG: Record<IconName, string> = {
  'today': '#155855',
  'olivia': '#6B4E96',
  'memo': '#B87512',
  'team-chat': '#2E6F9E',
  'work-calendar': '#245F8C',
  'work-log': '#3F8A4E',
  'workspace': '#155855',
  'mailing': '#C24468',
  'share-link': '#6B4E96',
  'trash': '#5A6B69',
  'clients': '#E85D2C',
  'select-gallery': '#1C7268',
  'per-reward': '#B87512',
  'client-portal': '#2E6F9E',
  'marketing-dashboard': '#E85D2C',
  'quote': '#3F8A4E',
  'contract': '#2E6F9E',
  'storyboard': '#6B4E96',
  'photo-studio': '#155855',
  'select-match': '#C24468',
  'metadata-select': '#3D8FB8',
  'raw-select': '#155855',
  'video-sort': '#6B4E96',
  'resolution-convert': '#2E6F9E',
  'retouch': '#E85D2C',
  'broll-prompt': '#1C7268',
  'youtube-storyboard': '#C24468',
  'prompter': '#6B4E96',
  'work-report': '#2E6F9E',
  'idea': '#B87512',
  'promo-content': '#3F8A4E',
  'review-content': '#B87512',
  'brand-audit': '#3D8FB8',
  'reverse-analysis': '#155855',
  'image-diagnosis': '#C24468',
  'brand-image-diagnosis': '#6B4E96',
  'channel-analysis': '#C24468',
  'trend-analysis': '#3F8A4E',
  'image-director': '#1C7268',
  'website-build': '#3D8FB8',
  'seo': '#155855',
  'library': '#E85D2C',
};

const glyphs: Record<IconName, JSX.Element> = {
  'today': (
    <>
      <rect x="2.5" y="3.5" width="19" height="18" rx="4.5" fill="#fff"/>
      <rect x="8.5" y="10.5" width="7" height="7" rx="2" fill="#E85D2C"/>
    </>
  ),
  'olivia': (
    <>
      <path d="M12 2.5l2.6 6.9 6.9 2.6-6.9 2.6L12 21.5l-2.6-6.9L2.5 12l6.9-2.6z" fill="#fff"/>
    </>
  ),
  'memo': (
    <>
      <rect x="3.5" y="2.5" width="17" height="19" rx="3.5" fill="#fff"/>
      <rect x="3.5" y="2.5" width="4.5" height="19" rx="2.2" fill="#ffffff8c"/>
      <rect x="10.5" y="8" width="7" height="2" rx="1" fill="#B87512"/>
      <rect x="10.5" y="13" width="7" height="2" rx="1" fill="#B87512"/>
    </>
  ),
  'team-chat': (
    <>
      <path d="M2 7a3.5 3.5 0 013.5-3.5h8A3.5 3.5 0 0117 7v2.5a3.5 3.5 0 01-3.5 3.5H8l-6 4V7z" fill="#fff"/>
      <path d="M22 14.5a3.5 3.5 0 00-3.5-3.5v.5A5.5 5.5 0 0113 17h-2.5v.5A3.5 3.5 0 0014 21h2.5l5.5 3.5z" fill="#ffffff8c"/>
    </>
  ),
  'work-calendar': (
    <>
      <rect x="2.5" y="3.5" width="19" height="18" rx="4.5" fill="#fff"/>
      <rect x="2.5" y="3.5" width="19" height="5.5" rx="2.7" fill="#ffffff8c"/>
      <rect x="6.5" y="12.5" width="4" height="4" rx="1.3" fill="#245F8C"/>
      <rect x="13.5" y="12.5" width="4" height="4" rx="1.3" fill="#245F8C"/>
    </>
  ),
  'work-log': (
    <>
      <rect x="3.5" y="3.5" width="17" height="18" rx="3.5" fill="#fff"/>
      <rect x="7.5" y="1.5" width="9" height="4.5" rx="2.2" fill="#ffffff8c"/>
      <rect x="7.5" y="11" width="9" height="2" rx="1" fill="#3F8A4E"/>
      <rect x="7.5" y="15.5" width="6" height="2" rx="1" fill="#3F8A4E"/>
    </>
  ),
  'workspace': (
    <>
      <rect x="2.5" y="2.5" width="8.5" height="8.5" rx="2.6" fill="#fff"/>
      <rect x="13" y="2.5" width="8.5" height="8.5" rx="2.6" fill="#fff"/>
      <rect x="2.5" y="13" width="8.5" height="8.5" rx="2.6" fill="#fff"/>
      <rect x="13" y="13" width="8.5" height="8.5" rx="2.6" fill="#E85D2C"/>
    </>
  ),
  'mailing': (
    <>
      <rect x="1.5" y="4.5" width="21" height="15" rx="3.5" fill="#fff"/>
      <path d="M3.5 7.5l7.2 5.2a2.2 2.2 0 002.6 0l7.2-5.2" stroke="#C24468" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    </>
  ),
  'share-link': (
    <>
      <path d="M8 12l8-4.5M8 12l8 4.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
      <circle cx="6" cy="12" r="4.2" fill="#fff"/>
      <circle cx="17.5" cy="6" r="4.2" fill="#fff"/>
      <circle cx="17.5" cy="18" r="4.2" fill="#E85D2C"/>
    </>
  ),
  'trash': (
    <>
      <path d="M5 8.5h14l-1.1 11.2a2.5 2.5 0 01-2.5 2.3H8.6a2.5 2.5 0 01-2.5-2.3z" fill="#fff"/>
      <rect x="2.5" y="4" width="19" height="4" rx="2" fill="#fff"/>
      <rect x="9" y="1.5" width="6" height="3" rx="1.5" fill="#ffffff8c"/>
    </>
  ),
  'clients': (
    <>
      <circle cx="16" cy="8" r="4" fill="#ffffff8c"/>
      <path d="M9 21.5c0-4 3.1-6.8 7-6.8s7 2.8 7 6.8z" fill="#ffffff8c"/>
      <circle cx="8.5" cy="7.5" r="4.8" fill="#fff"/>
      <path d="M0.5 21.5c0-4.6 3.6-7.8 8-7.8s8 3.2 8 7.8z" fill="#fff"/>
    </>
  ),
  'select-gallery': (
    <>
      <rect x="6.5" y="2.5" width="15.5" height="13" rx="3.2" fill="#ffffff8c"/>
      <rect x="2" y="7" width="15.5" height="14.5" rx="3.2" fill="#fff"/>
      <circle cx="9.7" cy="14.2" r="2.4" fill="#1C7268"/>
    </>
  ),
  'per-reward': (
    <>
      <path d="M5.5 2.5h13v6.5a6.5 6.5 0 01-13 0z" fill="#fff"/>
      <rect x="10.3" y="14.5" width="3.4" height="3.5" fill="#fff"/>
      <rect x="6" y="18" width="12" height="3.5" rx="1.7" fill="#fff"/>
    </>
  ),
  'client-portal': (
    <>
      <rect x="1" y="8.5" width="12.5" height="7" rx="3.5" fill="#fff"/>
      <rect x="10.5" y="8.5" width="12.5" height="7" rx="3.5" fill="#ffffff8c"/>
      <rect x="8" y="10.8" width="8" height="2.4" rx="1.2" fill="#2E6F9E"/>
    </>
  ),
  'marketing-dashboard': (
    <>
      <path d="M2.5 9.5L17 3.5v17L2.5 14.5z" fill="#fff"/>
      <path d="M5 15l1.6 6.2 3.6-.9L8.6 15.6z" fill="#fff"/>
      <path d="M20 8.5a5.5 5.5 0 010 7" stroke="#ffffff8c" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    </>
  ),
  'quote': (
    <>
      <rect x="4" y="2.5" width="16" height="19" rx="3.5" fill="#fff"/>
      <path d="M9 10.5h6M9 14h6M12 10.5v6.5" stroke="#3F8A4E" strokeWidth="2" strokeLinecap="round"/>
    </>
  ),
  'contract': (
    <>
      <rect x="3.5" y="2.5" width="15" height="19" rx="3.5" fill="#fff"/>
      <path d="M20.5 10l2.5 2.5-6 6-3.2.7.7-3.2z" fill="#E85D2C"/>
    </>
  ),
  'storyboard': (
    <>
      <rect x="4" y="2.5" width="16" height="19" rx="3.5" fill="#fff"/>
      <path d="M10 8.5l6 3.5-6 3.5z" fill="#6B4E96"/>
    </>
  ),
  'photo-studio': (
    <>
      <rect x="2" y="4.5" width="20" height="15.5" rx="4" fill="#fff"/>
      <path d="M2 16l5-4.5 4 3.5 3.5-3 7.5 6.5v.5a2 2 0 01-2 2H4a2 2 0 01-2-2z" fill="#155855"/>
      <circle cx="7.5" cy="9.5" r="2.2" fill="#E9A227"/>
    </>
  ),
  'select-match': (
    <>
      <circle cx="12" cy="12" r="10" fill="#fff"/>
      <circle cx="12" cy="12" r="6" fill="#C24468"/>
      <circle cx="12" cy="12" r="2.8" fill="#fff"/>
    </>
  ),
  'metadata-select': (
    <>
      <path d="M2.5 5a2.5 2.5 0 012.5-2.5h5.6a3 3 0 012.1.9l8 8a2.5 2.5 0 010 3.5l-5.8 5.8a2.5 2.5 0 01-3.5 0l-8-8a3 3 0 01-.9-2.1z" fill="#fff"/>
      <circle cx="8" cy="8" r="2.4" fill="#3D8FB8"/>
    </>
  ),
  'raw-select': (
    <>
      <path d="M6.5 5.5L18 17.5M17.5 5.5L6 17.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"/>
      <circle cx="5.5" cy="19" r="3.4" fill="#E85D2C"/>
      <circle cx="18.5" cy="19" r="3.4" fill="#E85D2C"/>
    </>
  ),
  'video-sort': (
    <>
      <rect x="2" y="4" width="20" height="16" rx="4" fill="#fff"/>
      <rect x="4.2" y="7" width="2.6" height="3.4" rx="1.1" fill="#6B4E96"/>
      <rect x="4.2" y="13.6" width="2.6" height="3.4" rx="1.1" fill="#6B4E96"/>
      <rect x="17.2" y="7" width="2.6" height="3.4" rx="1.1" fill="#6B4E96"/>
      <rect x="17.2" y="13.6" width="2.6" height="3.4" rx="1.1" fill="#6B4E96"/>
    </>
  ),
  'resolution-convert': (
    <>
      <rect x="1.5" y="5.5" width="14.5" height="13" rx="3.5" fill="#fff"/>
      <path d="M17.5 10l5-3.5v11l-5-3.5z" fill="#ffffff8c"/>
    </>
  ),
  'retouch': (
    <>
      <path d="M12 2c5.5 0 9.8 3.9 9.8 8.6 0 3.4-2.8 4.7-4.9 4.7h-2c-1.2 0-2 .8-2 1.9 0 .6.3 1 .3 1.7 0 1.5-1 2.6-2.7 2.6C6.2 21.5 2.2 17.3 2.2 12S6.5 2 12 2z" fill="#fff"/>
      <circle cx="8" cy="8.5" r="2.1" fill="#E85D2C"/>
      <circle cx="15" cy="7.5" r="2.1" fill="#E85D2C"/>
      <circle cx="7" cy="14.5" r="2.1" fill="#E85D2C"/>
    </>
  ),
  'broll-prompt': (
    <>
      <rect x="1.5" y="3.5" width="16.5" height="16.5" rx="4" fill="#fff"/>
      <circle cx="18.5" cy="18" r="5" fill="#E85D2C"/>
      <path d="M18.5 15.5v5M16 18h5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    </>
  ),
  'youtube-storyboard': (
    <>
      <path d="M21 2l1.8 9.5-4.8-2-3.8 3.6.6-7.4z" fill="#fff"/>
      <path d="M4 21.5c0-6.5 3.5-12.5 9.5-16" stroke="#ffffff8c" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
    </>
  ),
  'prompter': (
    <>
      <rect x="8" y="1.5" width="8" height="13" rx="4" fill="#fff"/>
      <path d="M4.5 11.5a7.5 7.5 0 0015 0" stroke="#ffffff8c" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      <rect x="10.7" y="18.5" width="2.6" height="4.5" rx="1.3" fill="#ffffff8c"/>
    </>
  ),
  'work-report': (
    <>
      <rect x="2.5" y="12.5" width="5" height="9" rx="2.4" fill="#fff"/>
      <rect x="9.5" y="6" width="5" height="15.5" rx="2.4" fill="#fff"/>
      <rect x="16.5" y="9.5" width="5" height="12" rx="2.4" fill="#E9A227"/>
    </>
  ),
  'idea': (
    <>
      <path d="M12 1.5a7.8 7.8 0 014.7 14v1.8a1.6 1.6 0 01-1.6 1.6H8.9a1.6 1.6 0 01-1.6-1.6v-1.8A7.8 7.8 0 0112 1.5z" fill="#fff"/>
      <rect x="8.5" y="20" width="7" height="3" rx="1.5" fill="#ffffff8c"/>
    </>
  ),
  'promo-content': (
    <>
      <path d="M6 12.5l4 4 8-8" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'review-content': (
    <>
      <path d="M12 1.5l3.1 6.6 7.2 1-5.2 5 1.3 7.2-6.4-3.5-6.4 3.5 1.3-7.2-5.2-5 7.2-1z" fill="#fff"/>
    </>
  ),
  'brand-audit': (
    <>
      <rect x="1.5" y="3" width="17.5" height="15" rx="3.5" fill="#fff"/>
      <circle cx="13" cy="13" r="5.2" fill="#3D8FB8"/>
      <circle cx="13" cy="13" r="5.2" fill="none" stroke="#fff" strokeWidth="2.6"/>
      <path d="M16.9 16.9l4.6 4.6" stroke="#fff" strokeWidth="2.8" strokeLinecap="round"/>
    </>
  ),
  'reverse-analysis': (
    <>
      <path d="M12 1.5l9 3.4v6.8c0 5.2-3.8 9.8-9 11.3-5.2-1.5-9-6.1-9-11.3V4.9z" fill="#fff"/>
      <path d="M8 12l3.2 3.2 5.3-5.6" stroke="#155855" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'image-diagnosis': (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" fill="#fff"/>
      <circle cx="12" cy="12" r="3.6" fill="#C24468"/>
      <path d="M1.5 7.5V4a2.5 2.5 0 012.5-2.5h3.5M22.5 7.5V4A2.5 2.5 0 0020 1.5h-3.5M1.5 16.5V20A2.5 2.5 0 004 22.5h3.5M22.5 16.5V20a2.5 2.5 0 01-2.5 2.5h-3.5" stroke="#ffffff8c" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </>
  ),
  'brand-image-diagnosis': (
    <>
      <path d="M2.5 11.5a9.5 9.5 0 0119 0v3.5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M6.8 12a5.2 5.2 0 0110.4 0v5.5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M12 12v8.5" stroke="#E85D2C" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    </>
  ),
  'channel-analysis': (
    <>
      <path d="M2.5 12h3.2l2.3-6 3.2 12 2.3-7 1.6 1h6.4" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'trend-analysis': (
    <>
      <path d="M3 17.5l6-6 4 4 7.5-8" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15 7.5h5.5V13" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'image-director': (
    <>
      <path d="M12 1.5l2.9 6.8 6.8 2.9-6.8 2.9L12 21l-2.9-6.9L2.3 11.2l6.8-2.9z" fill="#fff"/>
    </>
  ),
  'website-build': (
    <>
      <circle cx="12" cy="12" r="10" fill="#fff"/>
      <path d="M2 12h20M12 2c2.7 2.7 4.2 6.2 4.2 10S14.7 19.3 12 22c-2.7-2.7-4.2-6.2-4.2-10S9.3 4.7 12 2z" stroke="#3D8FB8" strokeWidth="2" fill="none"/>
    </>
  ),
  'seo': (
    <>
      <circle cx="10.5" cy="10.5" r="8" fill="#fff"/>
      <circle cx="10.5" cy="10.5" r="3.6" fill="#155855"/>
      <path d="M16.5 16.5l5 5" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
    </>
  ),
  'library': (
    <>
      <rect x="2.5" y="4" width="5" height="17" rx="2" fill="#fff"/>
      <rect x="9.5" y="6.5" width="5" height="14.5" rx="2" fill="#ffffffb3"/>
      <rect x="16.5" y="3" width="5" height="18" rx="2" fill="#ffffff73"/>
    </>
  ),
};

export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  title?: string;
}

export function AppIcon({ name, size = 48, title, ...rest }: AppIconProps) {
  const label = title ?? ICON_LABELS[name];
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      {...rest}
    >
      <rect width="48" height="48" rx="11" fill={APP_ICON_BG[name]} />
      <g transform="translate(9 9) scale(1.25)">{glyphs[name]}</g>
    </svg>
  );
}

export default AppIcon;
