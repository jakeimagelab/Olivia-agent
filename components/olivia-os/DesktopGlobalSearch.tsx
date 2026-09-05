"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FileText, FolderKanban, LoaderCircle, Search, Sparkles, UserRound, X } from "lucide-react";
import { filterAdminTools, type AdminSearchResult } from "@/lib/adminSearch";
import { ALL_TOOLS } from "@/lib/toolNav";
import type { OliviaDocumentRef } from "@/lib/olivia/documents/types";
import { getOliviaApp } from "./registry/oliviaAppRegistry";
import { useDesktopAppLauncher } from "./useDesktopAppLauncher";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import styles from "./OliviaDesktop.module.css";

type SearchPayload = {
  customers: AdminSearchResult[];
  projects: AdminSearchResult[];
  tools: AdminSearchResult[];
  documents: OliviaDocumentRef[];
};

const EMPTY_RESULTS: SearchPayload = { customers: [], projects: [], tools: [], documents: [] };

export function DesktopGlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchPayload>(EMPTY_RESULTS);
  const [activeIndex, setActiveIndex] = useState(-1);
  const deferredQuery = useDeferredValue(query.trim());
  const inputRef = useRef<HTMLInputElement>(null);
  const launchHref = useDesktopAppLauncher();
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const localTools = useMemo(() => filterAdminTools(ALL_TOOLS, deferredQuery).slice(0, 8), [deferredQuery]);
  const groups = [
    { key: "customer", label: "고객", icon: UserRound, items: results.customers },
    { key: "project", label: "프로젝트", icon: FolderKanban, items: results.projects },
    { key: "document", label: "자료", icon: FileText, items: results.documents },
    { key: "tool", label: "기능", icon: Sparkles, items: results.tools.length ? results.tools : localTools },
  ];
  const flatResults = groups.flatMap((group) => group.items.map((item) => ({ group: group.key, item })));

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setOpen(true);
        window.requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  useEffect(() => {
    if (deferredQuery.length < 2) {
      setResults({ ...EMPTY_RESULTS, tools: localTools });
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const [adminResult, documentResult] = await Promise.allSettled([
          fetch(`/api/admin/search?q=${encodeURIComponent(deferredQuery)}`, { signal: controller.signal, cache: "no-store" }).then((response) => response.json()),
          fetch(`/api/documents/search?q=${encodeURIComponent(deferredQuery)}&limit=8`, { signal: controller.signal, cache: "no-store" }).then((response) => response.json()),
        ]);
        if (controller.signal.aborted) return;
        const admin = adminResult.status === "fulfilled" ? adminResult.value : {};
        const documents = documentResult.status === "fulfilled" ? documentResult.value : {};
        setResults({
          customers: admin.customers ?? [],
          projects: admin.projects ?? [],
          tools: admin.tools?.length ? admin.tools : localTools,
          documents: documents.documents ?? [],
        });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [deferredQuery, localTools]);

  const launchDocument = (document: OliviaDocumentRef) => {
    const appId = document.type === "quote" ? "quote"
      : document.type === "contract" ? "contract"
      : document.type === "storyboard" ? "conti"
      : document.type === "memo" ? "memo" : undefined;
    const app = appId ? getOliviaApp(appId) : undefined;
    if (app) {
      openApp({
        appId: app.id,
        title: `${app.title} · ${document.title}`,
        width: app.defaultSize.width,
        height: app.defaultSize.height,
        context: {
          clientId: document.clientId ?? undefined,
          clientName: document.clientName ?? undefined,
          projectId: document.projectId ?? undefined,
          projectName: document.projectName ?? undefined,
          resourceId: document.sourceId,
          resourceType: document.type,
          documentId: document.sourceId,
          documentType: document.type,
        },
      });
    } else if (document.route) {
      launchHref(document.route, document.title);
    } else {
      const documentsApp = getOliviaApp("documents");
      if (documentsApp) openApp({ appId: documentsApp.id, title: documentsApp.title, width: documentsApp.defaultSize.width, height: documentsApp.defaultSize.height });
    }
    setOpen(false);
  };

  const launchResult = (group: string, item: AdminSearchResult | OliviaDocumentRef) => {
    if (group === "document") launchDocument(item as OliviaDocumentRef);
    else launchHref((item as AdminSearchResult).href, (item as AdminSearchResult).title);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!flatResults.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => (index + 1) % flatResults.length); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => index <= 0 ? flatResults.length - 1 : index - 1); }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = flatResults[Math.max(0, activeIndex)];
      if (selected) launchResult(selected.group, selected.item);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.desktopSearchOverlay} onPointerDown={() => setOpen(false)}>
      <div className={styles.desktopSearch} role="dialog" aria-modal="true" aria-label="통합검색" onPointerDown={(event) => event.stopPropagation()}>
        <Search size={20} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-controls="olivia-desktop-search-results"
          value={query}
          placeholder="고객 · 프로젝트 · 자료 · 기능 검색"
          aria-label="통합검색"
          aria-expanded={Boolean(deferredQuery)}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); }}
          onKeyDown={onKeyDown}
        />
      {loading ? <LoaderCircle className={styles.desktopSearchSpinner} size={13} aria-label="검색 중" /> : query ? (
        <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="검색어 지우기"><X size={13} /></button>
      ) : <kbd>⌘F</kbd>}
      {deferredQuery ? (
        <div id="olivia-desktop-search-results" className={styles.desktopSearchResults} role="listbox">
          {groups.map((group) => group.items.length ? (
            <section key={group.key}>
              <h2>{group.label}</h2>
              {group.items.map((item, itemIndex) => {
                const index = flatResults.findIndex((entry) => entry.group === group.key && entry.item === item);
                const Icon = group.icon;
                const title = item.title;
                const subtitle = "sourceType" in item
                  ? [item.clientName, item.projectName, item.status].filter(Boolean).join(" · ")
                  : item.subtitle;
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    className={activeIndex === index ? styles.desktopSearchResultActive : ""}
                    key={`${group.key}:${"id" in item ? item.id : itemIndex}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => launchResult(group.key, item)}
                  >
                    <span><Icon size={14} /></span><div><strong>{title}</strong><small>{subtitle || group.label}</small></div>
                  </button>
                );
              })}
            </section>
          ) : null)}
          {!loading && !flatResults.length ? <p>일치하는 검색 결과가 없습니다.</p> : null}
        </div>
      ) : null}
      </div>
    </div>
  );
}
