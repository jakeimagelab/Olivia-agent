"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import styles from "./CustomerBridgeSelect.module.css";

export function CustomerBridgeResetDialog({ selectedCount, resetting, onCancel, onConfirm }: {
  selectedCount: number;
  resetting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirmButtonRef.current?.focus(); }, []);

  return <div className={styles.resetBackdrop} onMouseDown={(event) => { if (!resetting && event.currentTarget === event.target) onCancel(); }}>
    <section ref={dialogRef} className={styles.resetDialog} role="alertdialog" aria-modal="true" aria-labelledby="customer-bridge-reset-title" aria-describedby="customer-bridge-reset-description" onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const first = cancelButtonRef.current;
      const last = confirmButtonRef.current;
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }}>
      <header><RotateCcw size={18} /><strong id="customer-bridge-reset-title">고객 셀렉을 초기화할까요?</strong></header>
      <p id="customer-bridge-reset-description">현재 선택한 {selectedCount.toLocaleString("ko-KR")}장의 별점·컬러와 사진별 보정 메모가 모두 지워지고 즉시 저장됩니다.</p>
      <small>기존 최종 제출 기록과 프로젝트 사진은 삭제하지 않습니다.</small>
      <footer><button ref={cancelButtonRef} type="button" disabled={resetting} onClick={onCancel}>취소</button><button ref={confirmButtonRef} type="button" disabled={resetting} onClick={onConfirm}>{resetting ? "초기화 중" : "셀렉 초기화"}</button></footer>
    </section>
  </div>;
}

export function CustomerBridgeGuideDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <div className={styles.guideBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div ref={dialogRef} className={styles.guideDialog} role="dialog" aria-modal="true" aria-labelledby="customer-bridge-guide-title" onKeyDown={trapFocus}>
      <header className={styles.guideHeader}>
        <div><strong id="customer-bridge-guide-title">Olivia Bridge 사진 선택 가이드</strong><span>사진을 확인하고 마음에 드는 사진을 별점으로 선택해 주세요.</span></div>
        <button ref={closeButtonRef} type="button" aria-label="이용 가이드 닫기" onClick={onClose}><X size={19} /></button>
      </header>
      <div className={styles.guideBody}>
        <p className={styles.guideImportant}><AlertTriangle size={18} /><span><strong>사진을 클릭하는 것만으로는 최종 선택되지 않습니다.</strong> 사진을 작업 대상으로 지정한 다음 별점이나 컬러를 적용해야 고객 셀렉에 포함됩니다.</span></p>
        <ol className={styles.guideSteps}>
          <li><b>1</b><div><strong>폴더에서 사진 찾기</strong><p>왼쪽에서 촬영 폴더를 선택하세요. 모든 폴더의 사진을 함께 보려면 <em>전체 사진</em>을 누릅니다.</p></div></li>
          <li><b>2</b><div><strong>사진 확인하기</strong><p>사진을 클릭하면 오른쪽 미리보기에 크게 표시됩니다. 썸네일 크기 조절과 전체화면을 함께 사용할 수 있습니다.</p></div></li>
          <li><b>3</b><div><strong>별점과 컬러로 셀렉하기</strong><p><kbd>1</kbd>–<kbd>5</kbd>는 별점 셀렉, <kbd>6</kbd>–<kbd>9</kbd>는 컬러 셀렉입니다. 같은 컬러 키를 한 번 더 누르거나 <kbd>0</kbd>을 누르면 해당 표시가 해제됩니다.</p></div></li>
          <li><b>4</b><div><strong>여러 장 한 번에 작업하기</strong><p><kbd>Shift</kbd> 클릭은 연속 범위, <kbd>⌘ / Ctrl</kbd> 클릭은 떨어진 사진 추가, 빈 공간에서 드래그하면 여러 사진을 작업 대상으로 지정합니다. 이후 숫자 키를 누르면 같은 표시가 일괄 적용됩니다.</p></div></li>
          <li><b>5</b><div><strong>리뷰로 최종 확인하기</strong><p><kbd>⌘ / Ctrl + B</kbd>로 고객 셀렉만 모아 봅니다. 방향키로 이동하고, 아래 방향키로 제외하며 위 방향키로 직전 제외를 복원합니다. <kbd>Space</kbd>는 전체화면, <kbd>Esc</kbd>는 닫기입니다.</p></div></li>
          <li><b>6</b><div><strong>사진별 보정 메모 남기기</strong><p>오른쪽 미리보기에서 현재 사진에 필요한 보정 요청을 입력합니다. 메모는 해당 사진과 함께 저장됩니다.</p></div></li>
          <li><b>7</b><div><strong>저장 후 최종 제출하기</strong><p>별점·컬러·메모는 자동 저장됩니다. 검토가 끝나면 <em>제출하기</em>를 누르고 최종 확인까지 완료해 주세요.</p></div></li>
          <li><b>8</b><div><strong>대화·다운로드·모바일 사용</strong><p>프로젝트 대화에서 담당자와 의견을 주고받을 수 있습니다. 권한이 허용된 프로젝트는 원본을 내려받을 수 있으며, 모바일에서는 사진을 눌러 크게 본 뒤 별점 버튼으로 선택합니다.</p></div></li>
        </ol>
      </div>
      <footer className={styles.guideFooter}><button type="button" onClick={onClose}>가이드 닫기</button></footer>
    </div>
  </div>;
}
