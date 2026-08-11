"use client";

import { usePathname } from "next/navigation";
import OliviaChat from "@/components/OliviaChat";

// 홈(/admin/dashboard/home)은 자체 큰 임베드 채팅(OliviaHeroChat)을 쓰므로 플로팅 위젯을 겹쳐
// 띄우지 않는다 — 두 채팅 다 같은 /api/olivia 대화 스레드를 공유하니 데이터가 갈리진 않는다.
const localContextPages = ["/photoclinic", "/client-portal", "/admin/dashboard/home"];

export default function GlobalOliviaChat() {
  const pathname = usePathname();
  const hasLocalOlivia = localContextPages.some((path) => pathname?.startsWith(path));

  if (hasLocalOlivia) return null;

  return <OliviaChat pageContext="월간 포토클리닉 구독 콘텐츠 운영 시스템" />;
}
