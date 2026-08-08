"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEditSource } from "../_components/ClientFormModal";

type FormModalState = { mode: "create" | "edit"; client: ClientEditSource | null } | null;

export function useClientRoster() {
  const [clients, setClients] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [projectDialogFor, setProjectDialogFor] = useState<{ id: string; name: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const load = useCallback(async (showSpinner = true) => {
    const requestId = ++loadRequestRef.current;
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch("/api/clients", { cache: "no-store" });
      // 서버가 500 등으로 죽으면 응답 본문이 JSON이 아닐 수 있다 — res.json()이 그대로 던지면
      // 처리되지 않은 예외로 화면에 노출된다.
      const d = await res.json().catch(() => null);
      if (requestId === loadRequestRef.current && d?.ok) {
        setClients(d.clients || []);
        setDashboard(d.dashboard || null);
      }
    } catch {
      /* 목록 로드 실패 — 목록은 빈 상태로 유지되고 로딩만 풀린다 */
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onOliviaDataChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ domain?: string }>).detail;
      if (detail?.domain === "client" || detail?.domain === "workflow") void load(false);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    window.addEventListener("olivia-data-changed", onOliviaDataChanged);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("olivia-data-changed", onOliviaDataChanged);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      loadRequestRef.current += 1;
    };
  }, [load]);

  const deleteClient = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`'${name}' 고객을 삭제할까요? 휴지통으로 이동되며 30일 안에 복원할 수 있습니다.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "삭제 실패");
      setClients((cur) => cur.filter((c) => c.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = clients.filter((c) =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.department || "").toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => setFormModal({ mode: "create", client: null });
  const openEdit = (client: ClientEditSource) => setFormModal({ mode: "edit", client });
  const closeForm = () => setFormModal(null);

  return {
    clients, filtered, dashboard, loading, search, setSearch,
    formModal, openCreate, openEdit, closeForm,
    projectDialogFor, setProjectDialogFor,
    deletingId, deleteClient, load,
  };
}
