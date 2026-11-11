"use client";

import { useCallback, type RefObject } from "react";

import {
  bridgeLabelFilterCommandFromShortcutCode,
  type BridgeLabelFilterCommand,
} from "@/lib/photo-bridge/labels";

type BridgeShortcutEvent = {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  isComposing?: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useBridgeSearchFilterShortcuts({
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onFilterCommand,
}: {
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onFilterCommand: (command: BridgeLabelFilterCommand) => void;
}) {
  return useCallback((event: BridgeShortcutEvent) => {
    if (event.isComposing) return false;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === "KeyF") {
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
      return true;
    }
    if (event.key === "Escape" && searchQuery) {
      event.preventDefault();
      onSearchQueryChange("");
      return true;
    }
    if (isEditableTarget(event.target)) return false;
    if (event.altKey && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
      const command = bridgeLabelFilterCommandFromShortcutCode(event.code);
      if (!command) return false;
      event.preventDefault();
      onFilterCommand(command);
      return true;
    }
    return false;
  }, [onFilterCommand, onSearchQueryChange, searchInputRef, searchQuery]);
}
