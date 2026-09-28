"use client";

import { forwardRef, useRef, type KeyboardEvent, type TextareaHTMLAttributes } from "react";
import { applyAutoBullet, changeIndent, continueList } from "@/lib/memo/listEditing";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** To do처럼 Enter를 부모가 새 행 추가로 처리할 때 쓴다. */
  onEnter?: () => void;
  /** 비어 있는 행의 Backspace를 부모가 이전 행 삭제/포커스로 처리할 때 쓴다. */
  onEmptyBackspace?: () => void;
  /** 콘티처럼 Tab을 다음 입력칸으로 넘길 때 쓴다. */
  onTabNavigate?: (direction: 1 | -1) => void;
};

function lineBounds(value: string, position: number) {
  const start = value.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const nextBreak = value.indexOf("\n", position);
  return { start, end: nextBreak === -1 ? value.length : nextBreak };
}

function withLineReplaced(value: string, start: number, end: number, replacement: string) {
  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}

const MemoTextArea = forwardRef<HTMLTextAreaElement, Props>(function MemoTextArea(
  { value, onChange, onEnter, onEmptyBackspace, onTabNavigate, onKeyDown, ...props }, forwardedRef,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const automaticRef = useRef<{ start: number; original: string; replacement: string } | null>(null);
  const setRef = (node: HTMLTextAreaElement | null) => {
    localRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const moveCaret = (position: number) => requestAnimationFrame(() => {
    localRef.current?.setSelectionRange(position, position);
  });

  const handleChange = (nextValue: string, cursor: number) => {
    const { start, end } = lineBounds(nextValue, cursor);
    const line = nextValue.slice(start, end);
    const converted = applyAutoBullet(line, cursor - start);
    if (converted.text !== line) {
      automaticRef.current = { start, original: line, replacement: converted.text };
      onChange(withLineReplaced(nextValue, start, end, converted.text));
      moveCaret(start + converted.cursor);
      return;
    }
    automaticRef.current = null;
    onChange(nextValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const element = event.currentTarget;
    const cursor = element.selectionStart;
    const { start, end } = lineBounds(value, cursor);
    const line = value.slice(start, end);

    if (event.key === "Backspace") {
      const automatic = automaticRef.current;
      if (automatic && automatic.start === start && cursor === start + automatic.replacement.length && line === automatic.replacement) {
        event.preventDefault();
        onChange(withLineReplaced(value, start, end, automatic.original));
        moveCaret(start + automatic.original.length);
        automaticRef.current = null;
        return;
      }
      if (onEmptyBackspace && !line && cursor === start) {
        event.preventDefault();
        onEmptyBackspace();
      }
      return;
    }

    if (event.key === "Enter" && onEnter) {
      event.preventDefault();
      onEnter();
      return;
    }

    if (event.key === "Enter") {
      const nextLine = continueList(line);
      if (!nextLine && !/^( *)(•|◦|▪|☐|\d+\.)\s?$/.test(line)) return;
      event.preventDefault();
      const nextValue = `${value.slice(0, cursor)}\n${nextLine}${value.slice(element.selectionEnd)}`;
      onChange(nextValue);
      moveCaret(cursor + 1 + nextLine.length);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      if (onTabNavigate) {
        onTabNavigate(event.shiftKey ? -1 : 1);
        return;
      }
      const replacement = changeIndent(line, event.shiftKey ? -1 : 1);
      if (replacement === line) return;
      onChange(withLineReplaced(value, start, end, replacement));
      moveCaret(start + replacement.length);
      return;
    }

    if (event.metaKey && (event.key === "]" || event.key === "[")) {
      event.preventDefault();
      const replacement = changeIndent(line, event.key === "]" ? 1 : -1);
      onChange(withLineReplaced(value, start, end, replacement));
      moveCaret(start + replacement.length);
    }
  };

  return (
    <textarea
      {...props}
      ref={setRef}
      value={value}
      onChange={(event) => handleChange(event.target.value, event.target.selectionStart)}
      onKeyDown={handleKeyDown}
    />
  );
});

export default MemoTextArea;
