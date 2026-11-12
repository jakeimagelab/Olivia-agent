"use client";

import { useCallback, useEffect, useState } from "react";

import type { PersonSelectAdminData } from "@/lib/person-select/adminData";
import { readApiResponse } from "@/lib/http/apiResponse";

export function usePersonSelectProjectActions({
  eventId,
  data,
  assignments,
  load,
  navigate,
  setMessage,
}: {
  eventId: string;
  data: PersonSelectAdminData | null;
  assignments: Record<string, string>;
  load: () => Promise<void>;
  navigate: (href: string) => void;
  setMessage: (message: string) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!deleteOpen || deleting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeleteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, deleting]);

  const saveGroups = useCallback(async () => {
    if (!data) return;
    try {
      const response = await fetch(`/api/person-select/${eventId}/groups`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: data.groups.map((group) => ({
            group: group.label,
            person_id: assignments[group.label] || null,
          })),
        }),
      });
      await readApiResponse(response, "인원 연결 저장");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "인원 연결을 저장하지 못했습니다.");
    }
  }, [assignments, data, eventId, load, setMessage]);

  const saveSettings = useCallback(async (patch: Record<string, unknown>) => {
    if (!data) return;
    if (patch.status === "open") {
      const unassigned = data.groups.filter((group) => !assignments[group.label]);
      if (unassigned.length && !window.confirm(`담임 선생님이 연결되지 않은 반이 ${unassigned.length}개 있습니다. 그래도 행사를 열까요?`)) return;
    }
    setMessage("");
    const requestSave = async (confirmed = false): Promise<void> => {
      const payload = confirmed ? { ...patch, confirm_access_mode_impact: true } : patch;
      const response = await fetch(`/api/person-select/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({})) as {
        code?: string;
        error?: string;
        warning?: string;
      };
      if (response.ok) {
        await load();
        return;
      }
      if (body.code === "ACCESS_MODE_CONFIRMATION_REQUIRED") {
        if (window.confirm(body.warning || body.error || "공용 링크 전환의 영향을 확인하고 계속할까요?")) {
          await requestSave(true);
        }
        return;
      }
      setMessage(body.error || "설정을 저장하지 못했습니다.");
    };
    await requestSave();
  }, [assignments, data, eventId, load, setMessage]);

  const openDeleteDialog = useCallback(() => {
    setDeleteConfirmTitle("");
    setDeleteOpen(true);
  }, []);

  const deleteProject = useCallback(async () => {
    if (!data || deleteConfirmTitle.trim() !== data.event.title) return;
    setDeleting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/person-select/${eventId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmTitle: deleteConfirmTitle.trim() }),
      });
      const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "프로젝트를 삭제하지 못했습니다.");
      setDeleteOpen(false);
      navigate("/person-select");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "프로젝트를 삭제하지 못했습니다.");
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }, [data, deleteConfirmTitle, eventId, navigate, setMessage]);

  return {
    deleteOpen,
    setDeleteOpen,
    deleteConfirmTitle,
    setDeleteConfirmTitle,
    deleting,
    saveGroups,
    saveSettings,
    openDeleteDialog,
    deleteProject,
  };
}
