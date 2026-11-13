"use client";

import type {
  ComponentProps,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";
import { CustomerBridgeBrowserPanel } from "./CustomerBridgeBrowserPanel";
import { CustomerBridgeFolderPanel } from "./CustomerBridgeFolderPanel";
import { CustomerBridgeFooter } from "./CustomerBridgeFooter";
import { CustomerBridgeHeader } from "./CustomerBridgeHeader";
import { CustomerBridgeOverlayLayer } from "./CustomerBridgeOverlayLayer";
import { CustomerBridgeSidePanel } from "./CustomerBridgeSidePanel";
import styles from "./CustomerBridgeSelect.module.css";

type CustomerBridgeWorkspaceViewProps = {
  embedded: boolean;
  readOnly: boolean;
  hasAdminToolbarStatus: boolean;
  workspaceStyle: CSSProperties;
  compactFoldersOpen: boolean;
  onCloseCompactFolders: () => void;
  onBeginResize: (
    pane: "folder" | "preview",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  headerProps: ComponentProps<typeof CustomerBridgeHeader>;
  folderPanelProps: ComponentProps<typeof CustomerBridgeFolderPanel>;
  browserPanelProps: ComponentProps<typeof CustomerBridgeBrowserPanel>;
  sidePanelProps: ComponentProps<typeof CustomerBridgeSidePanel>;
  footerProps: ComponentProps<typeof CustomerBridgeFooter>;
  overlayProps: ComponentProps<typeof CustomerBridgeOverlayLayer>;
};

export function CustomerBridgeWorkspaceView({
  embedded,
  readOnly,
  hasAdminToolbarStatus,
  workspaceStyle,
  compactFoldersOpen,
  onCloseCompactFolders,
  onBeginResize,
  headerProps,
  folderPanelProps,
  browserPanelProps,
  sidePanelProps,
  footerProps,
  overlayProps,
}: CustomerBridgeWorkspaceViewProps) {
  return <main className={`${styles.page} ${embedded ? styles.embedded : ""} ${readOnly ? styles.readOnly : ""} ${hasAdminToolbarStatus ? styles.withAdminToolbarStatus : ""}`}>
    <CustomerBridgeHeader {...headerProps} />

    <section className={styles.workspace} style={workspaceStyle}>
      {compactFoldersOpen ? <button type="button" className={styles.folderBackdrop} aria-label="폴더 닫기" onClick={onCloseCompactFolders} /> : null}
      <CustomerBridgeFolderPanel {...folderPanelProps} />

      <button
        type="button"
        className={styles.paneDivider}
        aria-label="폴더 패널 너비 조절"
        onPointerDown={(event) => onBeginResize("folder", event)}
      />

      <CustomerBridgeBrowserPanel {...browserPanelProps} />

      <button
        type="button"
        className={styles.paneDivider}
        aria-label="미리보기 패널 너비 조절"
        onPointerDown={(event) => onBeginResize("preview", event)}
      />

      <CustomerBridgeSidePanel {...sidePanelProps} />
    </section>

    <CustomerBridgeFooter {...footerProps} />
    <CustomerBridgeOverlayLayer {...overlayProps} />
  </main>;
}
