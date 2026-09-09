"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Star } from "lucide-react";
import { ALL_TOOLS, groupToolsByCategory, type NavCategory, type ToolDef } from "@/lib/toolNav";
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
import { getOliviaApp, type OliviaAppDefinition } from "../../registry/oliviaAppRegistry";
import styles from "./AllAppsWindowContent.module.css";

const TOOL_ICON_BY_HREF: Record<string, IconName> = {
  "/memo": "memo", "/team-chat": "team-chat", "/calendar": "work-calendar",
  "/work-journal": "work-log", "/team": "workspace", "/marketing": "marketing-dashboard",
  "/quote": "quote", "/contract": "contract", "/conti": "storyboard",
  "/portrait-consent": "contract", "/clients": "clients", "/select-galleries": "select-gallery",
  "/per": "per-reward", "/portal-admin": "client-portal", "/mailing": "mailing",
  "/photo-sorting": "photo-studio", "/select-match": "select-match",
  "/metadata-select": "metadata-select", "/raw-select": "raw-select",
  "/video-sorting": "video-sort", "/video-convert": "resolution-convert",
  "/photo-retouching": "retouch", "/broll-prompt": "broll-prompt",
  "/youtube-editing-conti": "youtube-storyboard", "/prompter": "prompter",
  "/report": "work-report", "/link-generator": "share-link", "/trash": "trash",
  "/daily-ideas": "idea", "/sns-manager": "promo-content", "/review-studio": "review-content",
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
  "/photo-sorting": "사진 작업실",
  "/memo": "메모",
  "/clients": "고객 관리",
};

const TOOL_BY_HREF = new Map(ALL_TOOLS.map((tool) => [tool.href, tool]));
const DESKTOP_APP_IDS = ["today", "olivia-chat"] as const;

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
  onLaunch,
  onOpenMenu,
}: {
  entry: DisplayEntry;
  favorite: boolean;
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

  return (
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
        onLaunch();
      }}
      title={entry.description}
      aria-haspopup="menu"
    >
      <span className={styles.iconWrap}>
        {entry.kind === "desktop" ? (
          <AppIcon icon={entry.app.icon} size={42} />
        ) : (
          <AppIcon
            icon={<ColorAppIcon name={TOOL_ICON_BY_HREF[entry.tool.href] ?? "workspace"} size={24} aria-hidden focusable={false} />}
            size={42}
          />
        )}
        {favorite ? <Star className={styles.favoriteMark} size={12} fill="currentColor" aria-label="즐겨찾기" /> : null}
      </span>
      <span>{entry.title}</span>
    </button>
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
  const groups = useMemo(() => groupToolsByCategory(ALL_TOOLS).filter((group) => group.items.length > 0), []);
  const desktop = useMemo(desktopEntries, []);
  const desktopByKey = useMemo(() => new Map(desktop.map((entry) => [entry.key, entry])), [desktop]);
  const [activeCategory, setActiveCategory] = useState<AppTab>("favorites");
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([...DEFAULT_DESKTOP_FAVORITE_KEYS]);
  const [menu, setMenu] = useState<MenuState>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const favoriteSet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);

  useEffect(() => {
    let active = true;
    try {
      const cached = window.localStorage.getItem(DESKTOP_FAVORITES_CACHE_KEY);
      if (cached) setFavoriteKeys(normalizeDesktopFavoriteKeys(JSON.parse(cached)));
    } catch { /* DB 조회 전 기본 목록을 유지한다. */ }

    fetch("/api/desktop-settings")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "즐겨찾기를 불러오지 못했습니다.");
        return normalizeDesktopFavoriteKeys(payload.settings?.favorite_app_keys);
      })
      .then((keys) => {
        if (!active) return;
        setFavoriteKeys(keys);
        try { window.localStorage.setItem(DESKTOP_FAVORITES_CACHE_KEY, JSON.stringify(keys)); } catch { /* optional cache */ }
      })
      .catch(() => { /* DB 미연결 시 로컬 캐시 또는 기본 목록으로 계속 동작한다. */ });

    return () => { active = false; };
  }, []);

  const entries = useMemo(() => {
    if (activeCategory === "favorites") {
      return favoriteKeys.flatMap((key) => {
        const desktopEntry = desktopByKey.get(key);
        if (desktopEntry) return [desktopEntry];
        const tool = TOOL_BY_HREF.get(key);
        return tool ? [toolEntry(tool, FAVORITE_LABEL_BY_KEY[key] ?? tool.title)] : [];
      });
    }
    if (activeCategory === "all") return [...desktop, ...ALL_TOOLS.map((tool) => toolEntry(tool))];
    if (activeCategory === "desktop") return desktop;
    const group = groups.find((candidate) => candidate.category === activeCategory);
    return group?.items.map((tool) => toolEntry(tool)) ?? [];
  }, [activeCategory, desktop, desktopByKey, favoriteKeys, groups]);

  const launchEntry = useCallback((entry: DisplayEntry) => {
    if (entry.kind === "tool") {
      launchHref(entry.tool.href, entry.tool.title);
      return;
    }
    openApp({ appId: entry.app.id, title: entry.app.title, width: entry.app.defaultSize.width, height: entry.app.defaultSize.height });
  }, [launchHref, openApp]);

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
    try { window.localStorage.setItem(DESKTOP_FAVORITES_CACHE_KEY, JSON.stringify(next)); } catch { /* optional cache */ }

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
      try { window.localStorage.setItem(DESKTOP_FAVORITES_CACHE_KEY, JSON.stringify(previous)); } catch { /* optional cache */ }
    } finally {
      setSaving(false);
    }
  }, [favoriteKeys, favoriteSet, menu, saving]);

  return (
    <div ref={rootRef} className={styles.root} onPointerDown={() => { if (menu) setMenu(undefined); }}>
      <SegmentedTabs ariaLabel="앱 분류" value={activeCategory} onChange={setActiveCategory} items={APP_TABS} style={{ marginBottom: 16 }} />

      {error ? <p className={styles.error} role="status">{error}</p> : null}
      {entries.length > 0 ? (
        <div className={styles.grid} role="tabpanel">
          {entries.map((entry) => (
            <FavoriteAppButton
              key={entry.key}
              entry={entry}
              favorite={favoriteSet.has(entry.key)}
              onLaunch={() => launchEntry(entry)}
              onOpenMenu={(x, y) => openFavoriteMenu(entry, x, y)}
            />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>앱 아이콘을 우클릭하거나 길게 눌러 즐겨찾기에 추가하세요.</div>
      )}

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
