"use client";

import { useState } from "react";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { DesktopShortcut } from "./DesktopShortcut";
import { AppWindow } from "./window/AppWindow";
import styles from "./OliviaDesktop.module.css";

// 초기 Desktop Shortcut 6개(스펙 1-4) — Registry 순서 그대로.
export function DesktopSurface() {
  const windows = useOliviaDesktopStore((state) => state.windows);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const [selectedShortcut, setSelectedShortcut] = useState<string | null>(null);

  return (
    <div className={styles.surface} onPointerDown={(event) => { if (event.currentTarget === event.target) setSelectedShortcut(null); }}>
      <div className={styles.shortcutLayer}>
        {oliviaAppRegistry.map((app) => (
          <DesktopShortcut
            key={app.id}
            app={app}
            selected={selectedShortcut === app.id}
            onSelect={() => setSelectedShortcut(app.id)}
            onOpen={() => openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height })}
          />
        ))}
      </div>
      <div className={styles.windowLayer}>
        {Object.values(windows).map((win) => {
          const app = oliviaAppRegistry.find((candidate) => candidate.id === win.appId);
          if (!app) return null;
          const Content = app.component;
          return (
            <AppWindow key={win.id} windowId={win.id} minWidth={app.minSize?.width} minHeight={app.minSize?.height}>
              <Content />
            </AppWindow>
          );
        })}
      </div>
    </div>
  );
}
