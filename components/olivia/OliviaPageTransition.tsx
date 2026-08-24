"use client";

import { Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useSearchParams } from "next/navigation";
import { prefersReducedMotion } from "@/lib/motion/presets";

// 코드 요청서 — Olivia UX/Motion Core(2026-08-16), 섹션 10/43/44. AppShell(사이드바, 채팅
// 패널)은 그대로 두고 라우트가 바뀔 때 main content만 opacity/y로 이어붙인다. 리소스 정체성이
// 바뀌는 라우트(/clients?id=A → ?id=B)만 그 파라미터를 key에 포함시킨다 — 그 외 쿼리스트링
// 변화(정렬, 필터 등)마다 전체 페이지 애니메이션이 튀는 걸 막는다(섹션 44 예외 조항).
const RESOURCE_IDENTITY_PARAMS: Record<string, string[]> = {
  "/clients": ["id", "clientId"],
};

export default function OliviaPageTransition({ children }: { children: React.ReactNode }) {
  // useSearchParams()는 Suspense 경계가 필요하다 — 여기서 감싸서 호출부(app/layout.tsx)가
  // 신경 쓰지 않게 한다. fallback은 children을 애니메이션 없이 그대로 보여준다(첫 렌더 한정).
  return (
    <Suspense fallback={<div>{children}</div>}>
      <OliviaPageTransitionInner>{children}</OliviaPageTransitionInner>
    </Suspense>
  );
}

function OliviaPageTransitionInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reduceMotion = prefersReducedMotion();

  const identityParams = RESOURCE_IDENTITY_PARAMS[pathname ?? ""] ?? [];
  const identityValue = identityParams.map((name) => searchParams.get(name)).find(Boolean);
  const transitionKey = identityValue ? `${pathname}?${identityValue}` : pathname;

  if (reduceMotion) {
    return <div key={transitionKey}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: [.32, .72, 0, 1] } }}
        exit={{ opacity: 0.92, y: 4, transition: { duration: 0.14, ease: [.32, .72, 0, 1] } }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
