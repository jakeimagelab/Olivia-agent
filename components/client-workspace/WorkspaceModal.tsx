"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useOliviaChatModeStore } from "@/lib/store/useOliviaChatModeStore";

// 고객관리 3열 복귀 + Workspace Modal(2026-08-10) — 견적서 등 업무를 페이지 이동 없이
// 고객관리 화면 위 대형 모달에서 처리하기 위한 공통 셸.
// 문서 작업 도중 실수로 사라지는 걸 막기 위해 ESC/backdrop 클릭으로는 닫히지 않는다 —
// 오직 헤더의 [X] 버튼(을 통해 호출되는 onClose)으로만 닫힌다.
export default function WorkspaceModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // 이 모달은 94vw짜리 대형 오버레이라 영구 채팅 패널(OliviaWorkspaceShell의 플로팅 토글)과 겹친다 — 열려있는
  // 동안만 패널을 rail로 접어두고 닫히면 원래 모드로 되돌린다. 견적/계약/콘티 빌더가 전부
  // 이 셸 하나를 공유하므로 여기 한 곳에서만 처리한다.
  const registerModalOpen = useOliviaChatModeStore((state) => state.registerModalOpen);
  const registerModalClose = useOliviaChatModeStore((state) => state.registerModalClose);
  useEffect(() => {
    if (!open) return;
    registerModalOpen();
    return () => registerModalClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="workspace-modal-backdrop">
      <div className="workspace-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="workspace-modal__header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="workspace-modal__close">
            <X size={18} />
          </button>
        </header>
        <div className="workspace-modal__body">{children}</div>
        {footer ? <footer className="workspace-modal__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
