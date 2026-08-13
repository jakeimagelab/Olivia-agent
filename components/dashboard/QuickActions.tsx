"use client";

import { Clapperboard, FileText, FolderOpen, Grid2X2 } from "lucide-react";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { openOliviaFeature } from "@/lib/olivia/features/executor";

// 견적/콘티/자료는 "현재 고객·프로젝트"라는 맥락 해석이 필요해서 채팅(Olivia 판단)으로 처리한다.
// 더보기는 단순 화면 이동이라 맥락 해석이 필요 없다 — openOliviaFeature로 바로 연다(채팅에 맡기면
// "사용할 수 있는 기능"을 텍스트로 설명만 하고 끝나서 클릭해도 아무 화면도 안 열리는 것처럼 보였다).
const CHAT_ACTIONS = [
  { label: "견적", prompt: "현재 고객 견적서 만들어줘", icon: FileText },
  { label: "콘티", prompt: "현재 프로젝트 콘티 보여줘", icon: Clapperboard },
  { label: "자료", prompt: "현재 프로젝트 자료 보여줘", icon: FolderOpen },
] as const;

export default function QuickActions() {
  const sendMessage = useOliviaConversationStore((state) => state.sendMessage);
  return (
    <section className="pc-panel pc-quick-panel">
      <div className="pc-panel__header">
        <h3>빠른 실행</h3>
        <span className="pc-text-button">리모컨</span>
      </div>

      <div className="pc-quick-actions">
        {CHAT_ACTIONS.map(({ label, prompt, icon: Icon }) => (
          <button key={label} type="button" className="pc-quick-action" onClick={() => void sendMessage(prompt)}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
        <button type="button" className="pc-quick-action" onClick={() => openOliviaFeature("/admin/tools")}>
          <Grid2X2 aria-hidden="true" />
          <span>더보기</span>
        </button>
      </div>
    </section>
  );
}
