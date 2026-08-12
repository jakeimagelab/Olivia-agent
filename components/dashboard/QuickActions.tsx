"use client";

import { Clapperboard, FileText, FolderOpen, Grid2X2 } from "lucide-react";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";

const ACTIONS = [
  { label: "견적", prompt: "현재 고객 견적서 만들어줘", icon: FileText },
  { label: "콘티", prompt: "현재 프로젝트 콘티 보여줘", icon: Clapperboard },
  { label: "자료", prompt: "현재 프로젝트 자료 보여줘", icon: FolderOpen },
  { label: "더보기", prompt: "사용할 수 있는 기능 보여줘", icon: Grid2X2 },
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
        {ACTIONS.map(({ label, prompt, icon: Icon }) => (
          <button key={label} type="button" className="pc-quick-action" onClick={() => void sendMessage(prompt)}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
