"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";

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
