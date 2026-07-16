import type { CSSProperties } from 'react';
import { C, R, FS } from './theme';

// 소형 버튼 (필터, 옵션)
export const btnSm: CSSProperties = {
  height: 32, padding: '0 12px',
  border: `1px solid ${C.border}`,
  borderRadius: R.sm,
  background: C.white,
  color: C.muted,
  fontSize: FS.sm,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'all 150ms',
};

// 주요 CTA 버튼
export const btnPrimary: CSSProperties = {
  height: 44, padding: '0 20px',
  border: 'none',
  borderRadius: R.md,
  background: C.orange,
  color: '#fff',
  fontSize: FS.md,
  fontWeight: 900,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// 아웃라인 버튼
export const btnGhost: CSSProperties = {
  ...btnPrimary,
  background: 'transparent',
  border: `1.5px solid ${C.teal}`,
  color: C.teal,
};

// 공통 인풋
export const inputBase: CSSProperties = {
  width: '100%',
  height: 42,
  border: `1.5px solid ${C.border}`,
  borderRadius: R.sm,
  padding: '0 12px',
  fontSize: FS.md,
  fontFamily: 'inherit',
  outline: 'none',
  background: C.white,
  color: C.ink,
};
