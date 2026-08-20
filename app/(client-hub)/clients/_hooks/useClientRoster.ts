"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEditSource } from "../_components/ClientFormModal";

type FormModalState = { mode: "create" | "edit"; client: ClientEditSource | null } | null;

// 모듈 레벨 stale-while-revalidate 캐시 — /clients와 /clients/list가 같은 훅을 쓰므로 탭을
// 옮겨 다녀도 한 번 받은 목록을 재사용한다. React Query/SWR을 새로 추가하는 대신, 이 화면
// 하나에만 필요한 최소 캐시를 직접 구현했다(코드 요청서: "새 dependency 꼭 필요하지 않으면
// 추가하지 말 것").
const STALE_MS = 45_000; // 30~60초 권장 범위의 중간값
let cachedClients: any[] | null = null;
let cachedDashboard: any = null;
let cachedAt = 0;
let inflightRequest: Promise<{ ok: boolean; clients?: any[]; dashboard?: any }> | null = null;

function fetchRoster() {
  // 같은 순간에 여러 컴포넌트가 load()를 부르면(mount + olivia-data-changed 등) fetch를
  // 하나로 합친다 — 중복 요청 방지(코드 요청서 22절).
  if (inflightRequest) return inflightRequest;
  inflightRequest = fetch("/api/clients?scope=list", { cache: "no-store" })
    .then((res) => res.json())
    .catch(() => null)
    .then((d) => {
      inflightRequest = null;
      if (d?.ok) {
        cachedClients = d.clients || [];
        cachedDashboard = d.dashboard || null;
        cachedAt = Date.now();
      }
      return d;
    });
  return inflightRequest;
}

export function useClientRoster() {
  const [clients, setClients] = useState<any[]>(() => cachedClients ?? []);
  const [dashboard, setDashboard] = useState<any>(() => cachedDashboard);
  // 캐시가 이미 있으면 화면을 빈 상태 + 스피너로 리셋하지 않는다 — 그대로 보여주고 뒤에서만 갱신.
  const [loading, setLoading] = useState(() => cachedClients === null);
  const [search, setSearch] = useState("");
  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [projectDialogFor, setProjectDialogFor] = useState<{ id: string; name: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const lastVisibilityRefreshRef = useRef(cachedAt);

  const load = useCallback(async (showSpinner = true) => {
    const requestId = ++loadRequestRef.current;
    if (showSpinner && cachedClients === null) setLoading(true);
    try {
      const d = await fetchRoster();
      if (requestId === loadRequestRef.current && d?.ok) {
        setClients(d.clients || []);
        setDashboard(d.dashboard || null);
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 캐시가 신선하면(45초 이내) 다시 받아올 필요 없이 그대로 두고, 오래됐으면 조용히
    // background revalidate만 한다 — 화면은 이미 캐시된 데이터로 즉시 그려진 상태다.
    if (cachedClients === null || Date.now() - cachedAt > STALE_MS) void load(cachedClients === null);
    const onOliviaDataChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ domain?: string }>).detail;
      // 실제 변경 신호는 스로틀 없이 바로 백그라운드 재조회 — 화면은 새 데이터가 올 때까지 유지.
      if (detail?.domain === "client" || detail?.domain === "workflow") void load(false);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      // 탭만 갔다 왔다고 매번 전체 재조회하지 않는다 — 마지막 조회 후 STALE_MS 이상 지났을 때만.
      if (Date.now() - lastVisibilityRefreshRef.current < STALE_MS) return;
      lastVisibilityRefreshRef.current = Date.now();
      void load(false);
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
      setClients((cur) => {
        const next = cur.filter((c) => c.id !== id);
        cachedClients = next; // 캐시도 같이 갱신 — 다음 mount에서 삭제된 고객이 다시 안 보이게.
        return next;
      });
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
