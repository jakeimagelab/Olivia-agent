"use client";

import { usePathname } from "next/navigation";
import OliviaChat from "@/components/OliviaChat";

const localContextPages = ["/conti", "/photoclinic", "/prompter", "/team"];

export default function GlobalOliviaChat() {
  const pathname = usePathname();
  const hasLocalOlivia = localContextPages.some((path) => pathname?.startsWith(path));

  if (hasLocalOlivia) return null;

  return <OliviaChat pageContext="월간 포토클리닉 구독 콘텐츠 운영 시스템" />;
}
