"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowUpRight, Search, Star } from "lucide-react";
import { ALL_TOOLS, groupToolsByCategory, type NavCategory, type ToolDef } from "@/lib/toolNav";
import { WORKSPACE_GROUPS, isIntegratedToolHref } from "@/lib/workspaceGroups";
import type { IconName } from "@/components/Icon";
import { AppIcon as ColorAppIcon } from "@/components/AppIcon";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import {
  DEFAULT_DESKTOP_FAVORITE_KEYS,
  DESKTOP_FAVORITES_CACHE_KEY,
  normalizeDesktopFavoriteKeys,
} from "@/lib/olivia/desktopFavorites";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import { useDesktopAppLauncher } from "../../useDesktopAppLauncher";
import { AppIcon } from "../../AppIcon";
import { getOliviaApp, resolveOliviaAppRoute, type OliviaAppDefinition } from "../../registry/oliviaAppRegistry";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import styles from "./AllAppsWindowContent.module.css";

const TOOL_ICON_BY_HREF: Record<string, IconName> = {
  "/memo": "memo", "/team-chat": "team-chat", "/calendar": "work-calendar",
  "/work-journal": "work-log", "/team": "workspace", "/marketing": "marketing-dashboard",
  "/quote": "quote", "/contract": "contract", "/clients": "clients", "/select-galleries": "select-gallery", "/person-select": "select-gallery",
  "/conti": "storyboard",
  "/portrait-consent": "contract",
  "/per": "per-reward", "/portal-admin": "client-portal", "/mailing": "mailing",
  "/photo-sorting": "photo-studio", "/olivia-bridge": "photo-studio", "/select-match": "select-match",
  "/metadata-select": "metadata-select", "/raw-select": "raw-select",
  "/video-studio": "video-studio", "/video-convert": "resolution-convert",
  "/photo-retouching": "retouch",
  "/report": "work-report", "/monthly-report": "work-report", "/link-generator": "share-link", "/trash": "trash",
  "/daily-ideas": "idea", "/sns-manager": "promo-content", "/review-studio": "review-content", "/clients/reviews": "review-content",
  "/brand-analysis": "brand-audit", "/ai-trust-gap": "reverse-analysis",
  "/diagnosis": "image-diagnosis", "/hospital-brand-image-diagnosis": "brand-image-diagnosis",
  "/channel-analyzer": "channel-analysis", "/trend-dashboard": "trend-analysis",
  "/image-generator": "image-director", "/website-builder": "website-build",
  "/seo-delivery": "seo", "/library": "library",
};

const FAVORITE_LABEL_BY_KEY: Record<string, string> = {
  "/calendar": "일정",
  "/quote": "견적서 생성",
  "/conti": "콘티",
  "/photo-sorting": "사진작업실",
  "/olivia-bridge": "Olivia Bridge",
  "/video-studio": "영상작업실",
  "/memo": "메모",
  "/clients": "고객 관리",
};

const WORKSPACE_APP_TOOLS: ToolDef[] = WORKSPACE_GROUPS.map((group) => ({
  title: group.title,
  desc: group.description,
  href: group.href,
  icon: group.icon,
  meta: "Workspace",
  orange: false,
  category: "tools",
  aliases: group.aliases,
}));
const APP_TOOLS: ToolDef[] = [
  ...WORKSPACE_APP_TOOLS,
  ...ALL_TOOLS.filter((tool) => !isIntegratedToolHref(tool.href)),
];
const WORKSPACE_SUBTOOLS: ToolDef[] = WORKSPACE_GROUPS.flatMap((group) => group.tools.map((tool) => ({
  title: tool.title,
  desc: group.description,
  href: tool.href,
  icon: group.icon,
  meta: group.title,
  orange: false,
  category: "tools" as const,
  aliases: tool.aliases,
})));
// 전체/카테고리는 APP_TOOLS만 써서 묶음 카드 구성을 유지한다. 저장된 즐겨찾기 복원만
// 숨김 전 목록과 묶음 하위 기능 전체를 조회한다.
const FAVORITE_TOOL_BY_HREF = new Map(
  [...WORKSPACE_SUBTOOLS, ...ALL_TOOLS].map((tool) => [tool.href, tool]),
);
const DESKTOP_APP_IDS = ["today", "olivia-chat"] as const;

export function resolveFavoriteWorkspaceTools(keys: readonly string[]): ToolDef[] {
  return keys.flatMap((key) => {
    const tool = FAVORITE_TOOL_BY_HREF.get(key);
    return tool ? [tool] : [];
  });
}

type AppTab = "favorites" | "all" | "desktop" | NavCategory;
type MenuState = { key: string; title: string; x: number; y: number };
type DisplayEntry =
  | { kind: "tool"; key: string; title: string; description: string; tool: ToolDef }
  | { kind: "desktop"; key: string; title: string; description: string; app: OliviaAppDefinition };

const APP_TABS: { value: AppTab; label: string }[] = [
  { value: "favorites", label: "즐겨찾기" },
  { value: "all", label: "전체" },
  { value: "desktop", label: "Desktop" },
  { value: "dashboard", label: "관리자 대시보드" },
  { value: "crm", label: "고객관리 CRM" },
  { value: "tools", label: "AI Assistant" },
];

function FavoriteAppButton({
  entry,
  favorite,
  selected,
  onSelect,
  onLaunch,
  onOpenMenu,
}: {
  entry: DisplayEntry;
  favorite: boolean;
  selected: boolean;
  onSelect: () => void;
  onLaunch: () => void;
  onOpenMenu: (clientX: number, clientY: number) => void;
}) {
  const timerRef = useRef<number>(undefined);
  const originRef = useRef<{ x: number; y: number }>(undefined);
  const suppressClickRef = useRef(false);

  const cancelLongPress = () => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    originRef.current = undefined;
  };

  useEffect(() => cancelLongPress, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    cancelLongPress();
    originRef.current = { x: event.clientX, y: event.clientY };
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      suppressClickRef.current = true;
      onOpenMenu(event.clientX, event.clientY);
    }, 550);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const origin = originRef.current;
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) cancelLongPress();
  };

  const category = entry.kind === "desktop" ? "Olivia" : entry.tool.meta || "기능";

  return (
    <article className={styles.appCard} data-selected={selected}>
      <button
        type="button"
        className={styles.appButton}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onContextMenu={(event) => {
          event.preventDefault();
          cancelLongPress();
          onOpenMenu(event.clientX, event.clientY);
        }}
        onClick={(event) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            return;
          }
          onSelect();
        }}
        onDoubleClick={onLaunch}
        title={entry.description}
        aria-haspopup="menu"
        aria-pressed={selected}
      >
        <span className={styles.cardMeta}>{category}</span>
        <span className={styles.iconWrap}>
          {entry.kind === "desktop" ? (
            <AppIcon icon={entry.app.icon} size={30} />
          ) : (
            <AppIcon
              icon={<ColorAppIcon name={TOOL_ICON_BY_HREF[entry.tool.href] ?? "workspace"} size={19} aria-hidden focusable={false} />}
              size={30}
            />
          )}
        </span>
        <strong>{entry.title}</strong>
        <small>{entry.description}</small>
      </button>
      <footer>
        <button type="button" onClick={(event) => { event.stopPropagation(); onOpenMenu(event.clientX, event.clientY); }} aria-label={`${entry.title} 즐겨찾기 설정`}>
          <Star size={12} fill={favorite ? "currentColor" : "none"} />
          {favorite ? "즐겨찾기" : "즐겨찾기 추가"}
        </button>
        <button type="button" className={styles.launchButton} onClick={onLaunch} aria-label={`${entry.title} 열기`}><ArrowUpRight size={13} /></button>
      </footer>
    </article>
  );
}

function desktopEntries(): DisplayEntry[] {
  return DESKTOP_APP_IDS.flatMap((id) => {
    const app = getOliviaApp(id);
    return app ? [{ kind: "desktop" as const, key: `app:${app.id}`, title: app.title, description: `${app.title} 앱`, app }] : [];
  });
}

function toolEntry(tool: ToolDef, title = tool.title): DisplayEntry {
  return { kind: "tool", key: tool.href, title, description: tool.desc, tool };
}

export function AllAppsWindowContent() {
  const rootRef = useRef<HTMLDivElement>(null);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const launchHref = useDesktopAppLauncher();
  const groups = useMemo(() => groupToolsByCategory(APP_TOOLS).filter((group) => group.items.length > 0), []);
  const desktop = useMemo(desktopEntries, []);
  const desktopByKey = useMemo(() => new Map(desktop.map((entry) => [entry.key, entry])), [desktop]);
  const [activeCategory, setActiveCategory] = useState<AppTab>("all");
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([...DEFAULT_DESKTOP_FAVORITE_KEYS]);
  const [menu, setMenu] = useState<MenuState>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string>();
  const favoriteSet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);

  useEffect(() => {
    let active = true;
    try {
      const cached = window.localStorage.getItem(DESKTOP_FAVORITES_CACHE_KEY);
      if (cached) setFavoriteKeys(normalizeDesktopFavoriteKeys(JSON.parse(cached)));
    } catch (error) { console.error("[OLIVIA] Suppressed error", error); }

    fetch("/api/desktop-settings")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "즐겨찾기를 불러오지 못했습니다.");
        return normalizeDesktopFavoriteKeys(payload.settings?.favorite_app_keys);
      })
      .then((keys) => {
        if (!active) return;
        setFavoriteKeys(keys);
        try { window.localStorage.setItem(DESKTOP_FAVORITES_CACHE_KEY, JSON.stringify(keys)); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
      })
      .catch((error) => { console.error("[OLIVIA] Suppressed promise rejection", error); });

    return () => { active = false; };
  }, []);

  const entries = useMemo(() => {
    if (activeCategory === "favorites") {
      return favoriteKeys.flatMap((key) => {
        const desktopEntry = desktopByKey.get(key);
        if (desktopEntry) return [desktopEntry];
        const tool = FAVORITE_TOOL_BY_HREF.get(key);
        return tool ? [toolEntry(tool, FAVORITE_LABEL_BY_KEY[key] ?? tool.title)] : [];
      });
    }
    if (activeCategory === "all") return [...desktop, ...APP_TOOLS.map((tool) => toolEntry(tool))];
    if (activeCategory === "desktop") return desktop;
    const group = groups.find((candidate) => candidate.category === activeCategory);
    return group?.items.map((tool) => toolEntry(tool)) ?? [];
  }, [activeCategory, desktop, desktopByKey, favoriteKeys, groups]);

  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return entries;
    return entries.filter((entry) => `${entry.title} ${entry.description}`.toLocaleLowerCase("ko-KR").includes(normalized));
  }, [entries, query]);

  useEffect(() => {
    const preferred = visibleEntries.find((entry) => entry.title === "Olivia Bridge") ?? visibleEntries[0];
    if (!preferred) {
      setSelectedKey(undefined);
      return;
    }
    if (!selectedKey || !visibleEntries.some((entry) => entry.key === selectedKey)) setSelectedKey(preferred.key);
  }, [selectedKey, visibleEntries]);

  const launchEntry = useCallback((entry: DisplayEntry) => {
    if (entry.kind === "tool") {
      launchHref(entry.tool.href, entry.tool.title);
      return;
    }
    openApp({ appId: entry.app.id, title: entry.app.title, width: entry.app.defaultSize.width, height: entry.app.defaultSize.height });
  }, [launchHref, openApp]);

  const selectEntry = useCallback((entry: DisplayEntry) => {
    setSelectedKey(entry.key);
    emitShellSelection({
      sourceAppId: "all-apps",
      sourceWindowId: "all-apps",
      itemId: entry.key,
      title: entry.title,
      subtitle: entry.description,
      next: "선택한 앱을 현재 작업 화면으로 엽니다.",
      href: entry.kind === "tool" ? entry.tool.href : undefined,
      appId: entry.kind === "desktop" ? entry.app.id : resolveOliviaAppRoute(entry.tool.href)?.app.id,
      context: entry.kind === "tool" ? { routeHref: entry.tool.href, featureItemId: entry.key } : { featureItemId: entry.key },
      featureItemId: entry.key,
    });
  }, []);

  useEffect(() => {
    const selected = visibleEntries.find((entry) => entry.key === selectedKey);
    if (selected) selectEntry(selected);
    else emitShellSelection({ clear: true, sourceAppId: "all-apps", sourceWindowId: "all-apps" });
  }, [selectEntry, selectedKey, visibleEntries]);

  const openFavoriteMenu = useCallback((entry: DisplayEntry, clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    setMenu({
      key: entry.key,
      title: entry.title,
      x: Math.max(8, Math.min(clientX - bounds.left + root.scrollLeft, root.clientWidth - 190)),
      y: Math.max(8, Math.min(clientY - bounds.top + root.scrollTop, root.clientHeight - 58)),
    });
  }, []);

  const toggleFavorite = useCallback(async () => {
    if (!menu || saving) return;
    const previous = favoriteKeys;
    const next = favoriteSet.has(menu.key)
      ? favoriteKeys.filter((key) => key !== menu.key)
      : [...favoriteKeys, menu.key];
    setMenu(undefined);
    setError(undefined);
    setSaving(true);
    setFavoriteKeys(next);
    try { window.localStorage.setItem(DESKTOP_FAVORITES_CACHE_KEY, JSON.stringify(next)); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }

    try {
      const response = await fetch("/api/desktop-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteAppKeys: next }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "저장하지 못했습니다.");
    } catch {
      setFavoriteKeys(previous);
      setError("즐겨찾기를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      try { window.localStorage.setItem(DESKTOP_FAVORITES_CACHE_KEY, JSON.stringify(previous)); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
    } finally {
      setSaving(false);
    }
  }, [favoriteKeys, favoriteSet, menu, saving]);

  return (
    <div ref={rootRef} className={styles.root} onPointerDown={() => { if (menu) setMenu(undefined); }}>
      <header className={styles.pageHeader}>
        <div><h1>{activeCategory === "favorites" ? "즐겨찾기" : "모든 앱"}</h1><p>{activeCategory === "favorites" ? "자주 사용하는 작업을 가까이 둡니다." : "등록된 기능 전체를 한곳에서 찾습니다."}</p></div>
        <SegmentedTabs ariaLabel="앱 분류" value={activeCategory} onChange={setActiveCategory} items={APP_TABS.slice(0, 2)} />
      </header>
      <label className={styles.searchField}>
        <Search size={16} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="앱 이름이나 필요한 기능 검색" />
      </label>

      {error ? <p className={styles.error} role="status">{error}</p> : null}
      {visibleEntries.length > 0 ? (
        <div className={styles.grid} role="tabpanel">
          {visibleEntries.map((entry) => (
            <FavoriteAppButton
              key={entry.key}
              entry={entry}
              favorite={favoriteSet.has(entry.key)}
              selected={selectedKey === entry.key}
              onSelect={() => selectEntry(entry)}
              onLaunch={() => launchEntry(entry)}
              onOpenMenu={(x, y) => openFavoriteMenu(entry, x, y)}
            />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>{query ? "검색과 맞는 앱이 없습니다." : "앱 아이콘을 우클릭하거나 길게 눌러 즐겨찾기에 추가하세요."}</div>
      )}
      <footer className={styles.countFooter}>{visibleEntries.length.toLocaleString("ko-KR")}개 앱</footer>

      {menu ? (
        <div
          className={styles.favoriteMenu}
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          aria-label={`${menu.title} 즐겨찾기`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={toggleFavorite} disabled={saving}>
            <Star size={14} fill={favoriteSet.has(menu.key) ? "currentColor" : "none"} />
            {favoriteSet.has(menu.key) ? "즐겨찾기에서 제거" : "즐겨찾기에 추가"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
