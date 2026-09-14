"use client";

import { CalendarDays, Check, LayoutGrid, ListTodo, Palette, Plus, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TabletAppId, TabletNavigationContext } from "@/lib/olivia/tablet/navigation";
import TabletAppIcon from "./TabletAppIcon";
import { TABLET_APPS } from "./tabletApps";
import styles from "./OliviaTabletShell.module.css";

type HomeWidget = "todos" | "schedule";
type Wallpaper = "mint" | "ivory" | "green" | "sunset";
type CalendarItem = { id: string; title: string; time?: string | null; location?: string | null };
type TodoItem = { id: string; title: string; completed: boolean };

const HOME_WIDGETS: Array<{ id: HomeWidget; label: string; description: string }> = [
  { id: "schedule", label: "오늘 일정", description: "오늘 등록된 일정" },
  { id: "todos", label: "해야 할 일", description: "기존 할 일 목록" },
];

// 앱 목록 자체는 TABLET_APPS를 source of truth로 유지하고, 홈에서만 보기 좋게 묶는다.
const APP_GROUPS: Array<{ label: string; ids: TabletAppId[] }> = [
  { label: "업무 관리", ids: ["customer", "calendar", "documents", "memo", "olivia-chat"] },
  { label: "콘텐츠 제작", ids: ["conti", "review-studio", "quote-contract", "photo-workspace"] },
  { label: "분석 및 도구", ids: ["channel-analysis", "brand-image", "voice"] },
];

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function readCalendarItems(value: unknown): CalendarItem[] {
  const root = asRecord(value);
  const rows = Array.isArray(root?.tasks) ? root.tasks : [];
  return rows.flatMap((row, index) => {
    const item = asRecord(row);
    if (!item) return [];
    return [{
      id: String(item.id ?? index),
      title: String(item.title ?? "제목 없는 일정"),
      time: typeof item.time === "string" ? item.time : null,
      location: typeof item.location === "string" ? item.location : null,
    }];
  });
}

function readTodoItems(value: unknown): TodoItem[] {
  const root = asRecord(value);
  const rows = Array.isArray(root?.todos) ? root.todos : [];
  return rows.flatMap((row, index) => {
    const item = asRecord(row);
    if (!item) return [];
    return [{ id: String(item.id ?? index), title: String(item.title ?? "제목 없는 할 일"), completed: item.completed === true }];
  });
}

export default function TabletHome({ onNavigate }: {
  onNavigate: (app: TabletAppId, context?: TabletNavigationContext) => void;
}) {
  const apps = TABLET_APPS.filter((app) => app.id !== "home");
  const [grouped, setGrouped] = useState(false);
  const [openPanel, setOpenPanel] = useState<"widgets" | "wallpaper" | null>(null);
  const [enabledWidgets, setEnabledWidgets] = useState<HomeWidget[]>([]);
  const [wallpaper, setWallpaper] = useState<Wallpaper>("mint");
  const [schedule, setSchedule] = useState<CalendarItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);

  useEffect(() => {
    try {
      const savedWidgets = JSON.parse(localStorage.getItem("olivia:tablet:home-widgets") ?? "[]") as unknown;
      if (Array.isArray(savedWidgets)) setEnabledWidgets(savedWidgets.filter((item): item is HomeWidget => item === "todos" || item === "schedule"));
      const savedWallpaper = localStorage.getItem("olivia:tablet:wallpaper");
      if (savedWallpaper === "mint" || savedWallpaper === "ivory" || savedWallpaper === "green" || savedWallpaper === "sunset") setWallpaper(savedWallpaper);
      setGrouped(localStorage.getItem("olivia:tablet:home-grouped") === "true");
    } catch {
      // localStorage가 제한된 브라우저에서도 런처는 기본값으로 사용할 수 있다.
    }
  }, []);

  useEffect(() => {
    if (!enabledWidgets.length) return;
    const controller = new AbortController();
    if (enabledWidgets.includes("schedule")) {
      fetch(`/api/calendar?date=${todayIso()}`, { signal: controller.signal, cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((value: unknown) => setSchedule(readCalendarItems(value)))
        .catch(() => undefined);
    }
    if (enabledWidgets.includes("todos")) {
      fetch("/api/calendar/todos", { signal: controller.signal, cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((value: unknown) => setTodos(readTodoItems(value)))
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [enabledWidgets]);

  const groupedApps = useMemo(() => APP_GROUPS.map((group) => ({
    ...group,
    apps: group.ids.map((id) => apps.find((app) => app.id === id)).filter((app): app is (typeof apps)[number] => Boolean(app)),
  })).filter((group) => group.apps.length > 0), [apps]);

  const updateWidgets = (widget: HomeWidget) => {
    const next = enabledWidgets.includes(widget) ? enabledWidgets.filter((item) => item !== widget) : [...enabledWidgets, widget];
    setEnabledWidgets(next);
    localStorage.setItem("olivia:tablet:home-widgets", JSON.stringify(next));
  };

  const updateWallpaper = (value: Wallpaper) => {
    setWallpaper(value);
    localStorage.setItem("olivia:tablet:wallpaper", value);
    setOpenPanel(null);
  };

  const setGrouping = () => {
    setGrouped((value) => {
      const next = !value;
      localStorage.setItem("olivia:tablet:home-grouped", String(next));
      return next;
    });
  };

  const wallpaperClass = wallpaper === "ivory" ? styles.wallpaperIvory
    : wallpaper === "green" ? styles.wallpaperGreen
      : wallpaper === "sunset" ? styles.wallpaperSunset : styles.wallpaperMint;

  const renderApp = (app: (typeof apps)[number]) => (
    <button
      key={app.id}
      type="button"
      className={styles.homeAppButton}
      onClick={() => onNavigate(app.id)}
      disabled={app.disabled}
      aria-label={`${app.title}${app.disabled ? ", 준비 중" : ""}`}
    >
      <TabletAppIcon appId={app.id} size={62} fullBleed />
      <span>{app.title}</span>
    </button>
  );

  return (
    <section className={`${styles.tabletHome} ${wallpaperClass}`} aria-label="Olivia 앱 홈">
      <header className={styles.homeLauncherHeader}>
        <div className={styles.homeLauncherIdentity}><span>OLIVIA</span><strong>앱 보관함</strong></div>
        <div className={styles.homeControls}>
          <button type="button" className={styles.homeControlButton} onClick={setGrouping} aria-pressed={grouped}><LayoutGrid size={16} strokeWidth={1.8} />{grouped ? "전체 보기" : "그룹화"}</button>
          <button type="button" className={styles.homeControlButton} onClick={() => setOpenPanel((value) => value === "widgets" ? null : "widgets")} aria-expanded={openPanel === "widgets"}><Plus size={16} strokeWidth={1.8} /> 위젯</button>
          <button type="button" className={styles.homeControlButton} onClick={() => setOpenPanel((value) => value === "wallpaper" ? null : "wallpaper")} aria-expanded={openPanel === "wallpaper"}><Palette size={16} strokeWidth={1.8} /> 배경</button>
        </div>
        {openPanel === "widgets" ? (
          <div className={styles.homePopover} role="dialog" aria-label="홈 위젯 선택">
            <strong>홈 위젯</strong><span>필요한 정보만 홈에 놓을 수 있어요.</span>
            {HOME_WIDGETS.map((widget) => {
              const checked = enabledWidgets.includes(widget.id);
              return <button key={widget.id} type="button" className={styles.homePopoverOption} onClick={() => updateWidgets(widget.id)} aria-pressed={checked}><span className={`${styles.homePopoverCheck} ${checked ? styles.homePopoverCheckActive : ""}`}>{checked ? <Check size={13} /> : null}</span><span><strong>{widget.label}</strong><small>{widget.description}</small></span></button>;
            })}
          </div>
        ) : null}
        {openPanel === "wallpaper" ? (
          <div className={`${styles.homePopover} ${styles.wallpaperPopover}`} role="dialog" aria-label="홈 배경 선택">
            <strong>배경 선택</strong>
            <div className={styles.wallpaperOptions}>
              {(["mint", "ivory", "green", "sunset"] as Wallpaper[]).map((option) => {
                const swatchClass = option === "mint" ? styles.wallpaperSwatchMint : option === "ivory" ? styles.wallpaperSwatchIvory : option === "green" ? styles.wallpaperSwatchGreen : styles.wallpaperSwatchSunset;
                return <button key={option} type="button" className={`${styles.wallpaperOption} ${swatchClass} ${wallpaper === option ? styles.wallpaperOptionActive : ""}`} onClick={() => updateWallpaper(option)} aria-label={`${option} 배경`} aria-pressed={wallpaper === option} />;
              })}
            </div>
          </div>
        ) : null}
      </header>

      {grouped ? (
        <div className={styles.homeAppGroups}>{groupedApps.map((group) => <section key={group.label} className={styles.homeAppGroup} aria-label={group.label}><h2>{group.label}</h2><div className={styles.homeAppGrid}>{group.apps.map(renderApp)}</div></section>)}</div>
      ) : <div className={styles.homeAppGrid}>{apps.map(renderApp)}</div>}

      {enabledWidgets.length > 0 ? (
        <section className={styles.homeWidgets} aria-label="홈 위젯">
          {enabledWidgets.includes("schedule") ? <article className={styles.homeWidgetCard}><header><span className={styles.homeWidgetIcon}><CalendarDays size={18} /></span><div><small>TODAY</small><h2>오늘 일정</h2></div><span className={styles.homeWidgetCount}>{schedule.length}</span></header>{schedule.length ? <div className={styles.homeWidgetList}>{schedule.slice(0, 3).map((item) => <div key={item.id}><time>{item.time || "종일"}</time><span>{item.title}</span></div>)}</div> : <p>오늘 등록된 일정이 없습니다.</p>}</article> : null}
          {enabledWidgets.includes("todos") ? <article className={styles.homeWidgetCard}><header><span className={styles.homeWidgetIcon}><ListTodo size={18} /></span><div><small>TO-DO</small><h2>해야 할 일</h2></div><span className={styles.homeWidgetCount}>{todos.filter((item) => !item.completed).length}</span></header>{todos.length ? <div className={styles.homeWidgetList}>{todos.slice(0, 3).map((item) => <div key={item.id}><span className={`${styles.todoBullet} ${item.completed ? styles.todoBulletDone : ""}`}>{item.completed ? <Check size={12} /> : null}</span><span className={item.completed ? styles.todoDone : ""}>{item.title}</span></div>)}</div> : <p>등록된 할 일이 없습니다.</p>}</article> : null}
        </section>
      ) : null}
      <div className={styles.homeHint}><Settings2 size={13} /> 홈 설정은 이 기기에 저장됩니다.</div>
    </section>
  );
}
