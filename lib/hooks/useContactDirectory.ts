"use client";

import { useEffect, useRef, useState } from "react";

export interface DirectoryContact {
  name: string;
  email: string;
  phone: string;
  org: string;
  source: "client" | "google" | "gmail_history";
}

/**
 * 메일링 "받는 분" 자동완성용 통합 주소록.
 * 고객관리(clients)에 등록된 고객은 등록 즉시 자동 반영되고,
 * Google 계정이 연동돼 있으면 Google 연락처도 함께 검색된다.
 */
export function useContactDirectory() {
  const [session, setSession] = useState<{ name: string; email: string; accessToken: string } | null>(null);
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [gmailHistoryState, setGmailHistoryState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(d => { if (d.ok) setSession(d.session); }).catch(() => {});
  }, []);

  // Google 연락처 연동(OAuth) 후 돌아왔을 때 — 어느 탭이 열려 있든 세션을 갱신한다.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("auth") === "success") {
      fetch("/api/auth/session").then(r => r.json()).then(d => { if (d.ok) setSession(d.session); });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const load = async () => {
    if (loaded) return;
    setLoaded(true);
    const clientsPromise = fetch("/api/clients/directory")
      .then(r => r.json())
      .then((d): DirectoryContact[] => d.ok
        ? d.clients
            .map((c: any) => ({ name: c.hospital_name || "", email: c.email ?? "", phone: c.phone ?? "", org: c.contact_name ?? "", source: "client" as const }))
        : [])
      .catch(() => []);
    const googlePromise = session
      ? fetch("/api/contacts")
          .then(r => r.json())
          .then((d): DirectoryContact[] => d.ok ? d.contacts.map((c: any) => ({ ...c, source: "google" as const })) : [])
          .catch(() => [])
      : Promise.resolve([]);
    const [clientContacts, googleContacts] = await Promise.all([clientsPromise, googlePromise]);
    setContacts([...clientContacts, ...googleContacts]);
  };

  // Google "다른 연락처"는 Google이 "자주 연락한 사람"으로 판단한 상대만 잡아준다 — 가끔
  // 주고받는 상대는 빠질 수 있다. 이 함수는 실제 보낸 메일함(Sent) 헤더를 직접 읽어오는
  // 무거운 동작이라(최대 300통 스캔, 수 초~수십 초 소요) 자동 실행하지 않고 버튼으로만 호출한다.
  const loadGmailHistory = async () => {
    if (gmailHistoryState === "loading" || !session) return;
    setGmailHistoryState("loading");
    try {
      const res = await fetch("/api/contacts/gmail-history");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "조회 실패");
      const historyContacts: DirectoryContact[] = data.contacts.map((c: any) => ({ ...c, source: "gmail_history" as const }));
      setContacts(prev => {
        const seen = new Set(prev.map(c => c.email.toLowerCase()));
        return [...prev, ...historyContacts.filter(c => !seen.has(c.email.toLowerCase()))];
      });
      setGmailHistoryState("done");
    } catch {
      setGmailHistoryState("error");
    }
  };

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.org.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  return {
    session, contacts, loaded, load, search, setSearch, filtered,
    showDropdown, setShowDropdown, dropdownRef,
    gmailHistoryState, loadGmailHistory,
  };
}
