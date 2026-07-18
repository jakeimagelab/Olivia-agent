"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FolderKanban, Search, Sparkles, UserRound, X } from "lucide-react";
import { ALL_TOOLS } from "@/lib/toolNav";
import { filterAdminTools, type AdminSearchResult } from "@/lib/adminSearch";

type SearchMode = "global" | "tools";
type SearchResponse = { customers: AdminSearchResult[]; projects: AdminSearchResult[]; tools: AdminSearchResult[]; partial?: boolean };

const EMPTY_RESULTS: SearchResponse = { customers: [], projects: [], tools: [] };
const KIND_ICON = { customer: UserRound, project: FolderKanban, tool: Sparkles } as const;

export default function AdminHeaderSearch({ mode }: { mode: SearchMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || "";
  const initialQuery = mode === "tools" ? urlQuery : "";
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query.trim());
  const [results, setResults] = useState<SearchResponse>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const localTools = useMemo(() => filterAdminTools(ALL_TOOLS, deferredQuery).slice(0, 8), [deferredQuery]);
  const groups = mode === "global" ? [
    { label: "고객", items: results.customers },
    { label: "프로젝트", items: results.projects },
    { label: "기능", items: results.tools.length ? results.tools : localTools },
  ] : [];
  const flatResults = groups.flatMap((group) => group.items);
  const showResults = mode === "global" && focused && deferredQuery.length > 0;

  useEffect(() => {
    if (mode === "tools") setQuery((current) => current === urlQuery ? current : urlQuery);
  }, [mode, urlQuery]);

  useEffect(() => {
    if (mode !== "tools") return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (deferredQuery) params.set("q", deferredQuery);
      else params.delete("q");
      const next = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      const current = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
      if (next !== current) router.replace(next, { scroll: false });
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [deferredQuery, mode, pathname, router, searchParams]);

  useEffect(() => {
    if (mode !== "global") return;
    if (deferredQuery.length < 2) {
      setResults({ ...EMPTY_RESULTS, tools: localTools });
      setError("");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(deferredQuery)}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "검색 실패");
        setResults({ customers: data.customers || [], projects: data.projects || [], tools: data.tools || localTools, partial: data.partial });
        if (data.partial) setError("일부 고객 데이터는 현재 조회할 수 없습니다.");
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setResults({ ...EMPTY_RESULTS, tools: localTools });
          setError("고객·프로젝트 검색 연결이 원활하지 않습니다. 기능 검색은 계속 사용할 수 있습니다.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 240);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [deferredQuery, localTools, mode]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const clear = () => {
    setQuery("");
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setFocused(false);
      setMobileOpen(false);
      return;
    }
    if (!flatResults.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => (index + 1) % flatResults.length); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => (index <= 0 ? flatResults.length - 1 : index - 1)); }
    if (event.key === "Enter" && activeIndex >= 0) { event.preventDefault(); router.push(flatResults[activeIndex].href); setFocused(false); }
  };

  return (
    <div ref={rootRef} className={`oa-header-search${mobileOpen ? " is-mobile-open" : ""}`}>
      <button className="oa-header-search__mobile-trigger" type="button" aria-label="검색 열기" onClick={() => { setMobileOpen(true); window.setTimeout(() => inputRef.current?.focus(), 0); }}>
        <Search size={17} strokeWidth={1.8}/>
      </button>
      <div className="oa-header-search__field">
        <Search size={15} strokeWidth={1.8} aria-hidden="true"/>
        <label className="oa-visually-hidden" htmlFor={`oa-header-search-${mode}`}>{mode === "global" ? "고객, 프로젝트, 기능 통합검색" : "기능 검색"}</label>
        <input
          ref={inputRef}
          id={`oa-header-search-${mode}`}
          type="search"
          role="combobox"
          aria-expanded={showResults}
          aria-controls={mode === "global" ? "oa-header-search-results" : undefined}
          aria-activedescendant={activeIndex >= 0 ? `oa-search-result-${activeIndex}` : undefined}
          value={query}
          placeholder={mode === "global" ? "고객 · 프로젝트 · 기능 검색" : "AI 기능 검색"}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
        />
        {loading ? <span className="oa-header-search__loader" aria-label="검색 중"/> : query ? <button type="button" onClick={clear} aria-label="검색어 지우기"><X size={14}/></button> : null}
      </div>
      {showResults ? (
        <div className="oa-header-search__popover" id="oa-header-search-results" role="listbox">
          {error ? <p className="oa-header-search__notice">{error}</p> : null}
          {groups.map((group) => group.items.length ? (
            <section key={group.label} className="oa-header-search__group">
              <h2>{group.label}</h2>
              {group.items.map((item) => {
                const index = flatResults.findIndex((result) => result.kind === item.kind && result.id === item.id);
                const Icon = KIND_ICON[item.kind];
                return <Link id={`oa-search-result-${index}`} role="option" aria-selected={activeIndex === index} className={activeIndex === index ? "is-active" : ""} key={`${item.kind}-${item.id}`} href={item.href} onClick={() => setFocused(false)}>
                  <span><Icon size={15} strokeWidth={1.7}/></span><div><strong>{item.title}</strong><small>{item.subtitle}</small></div>
                </Link>;
              })}
            </section>
          ) : null)}
          {!loading && !flatResults.length ? <div className="oa-header-search__empty">일치하는 검색 결과가 없습니다.</div> : null}
        </div>
      ) : null}
    </div>
  );
}
