"use client";
/* eslint-disable @next/next/no-img-element -- The viewer renders local blob/data URLs from File System Access handles. */

import { ChevronLeft, ChevronRight, Scissors, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadThumb } from "@/lib/photo-classifier/browserProcessing";
import {
  canSplitSceneAt,
  createSceneViewerObjectUrl,
  formatSceneViewerTime,
  moveSceneViewerIndex,
} from "@/lib/photo-classifier/sceneViewer";
import type { FieldScene, SceneFile } from "@/lib/photo-classifier/types";
import styles from "./SceneImageViewer.module.css";

type SceneImageViewerProps = {
  scene: FieldScene;
  currentIndex: number;
  recommendedSplitPosition?: number;
  onCurrentIndexChange: (index: number) => void;
  onClose: () => void;
  onSplit: (offset: number) => void;
};

const filmThumbnailCache = new WeakMap<FileSystemFileHandle, Promise<string | null>>();

function getFilmThumbnail(file: SceneFile): Promise<string | null> {
  if (file.thumbUrl) return Promise.resolve(file.thumbUrl);
  const cached = filmThumbnailCache.get(file.handle);
  if (cached) return cached;
  const next = file.handle.getFile().then((source) => loadThumb(source, 180));
  filmThumbnailCache.set(file.handle, next);
  return next;
}

export function SceneImageViewer({
  scene,
  currentIndex,
  recommendedSplitPosition,
  onCurrentIndexChange,
  onClose,
  onSplit,
}: SceneImageViewerProps) {
  const currentFile = scene.files[currentIndex];
  const [mounted, setMounted] = useState(false);
  const [source, setSource] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!currentFile) return undefined;
    let cancelled = false;
    let resource: Awaited<ReturnType<typeof createSceneViewerObjectUrl>> | undefined;
    setSource("");
    setLoadError("");

    void createSceneViewerObjectUrl(currentFile.handle)
      .then((next) => {
        if (cancelled) {
          next.revoke();
          return;
        }
        resource = next;
        setSource(next.objectUrl);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "원본 이미지를 열지 못했습니다.");
      });

    return () => {
      cancelled = true;
      resource?.revoke();
    };
  }, [currentFile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      onCurrentIndexChange(moveSceneViewerIndex(currentIndex, direction, scene.files.length));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, onClose, onCurrentIndexChange, scene.files.length]);

  const title = scene.editedName.trim() || scene.folderName;
  const splitEnabled = canSplitSceneAt(currentIndex);
  const splitHint = splitEnabled ? "" : "첫 사진 앞에서는 분할할 수 없어요.";

  if (!mounted) return null;

  const content = (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.viewer} role="dialog" aria-modal="true" aria-label={`${title} 장면 사진 보기`}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <strong className={styles.sceneName}>{title}</strong>
            <span className={styles.position}>{currentIndex + 1} / {scene.files.length}</span>
            <span className={styles.fileName} title={currentFile?.name}>{currentFile?.name}</span>
            <span className={styles.time}>{currentFile ? formatSceneViewerTime(currentFile.mtime) : ""}</span>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.splitButton}
              disabled={!splitEnabled}
              title={splitHint || `${currentFile?.name ?? "현재 사진"} 앞에서 분할`}
              onClick={() => onSplit(currentIndex)}
            >
              <Scissors size={15} aria-hidden="true" /> 이 사진 앞에서 분할
            </button>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="뷰어 닫기">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={styles.stage}>
          <button
            type="button"
            className={`${styles.arrowButton} ${styles.arrowPrevious}`}
            disabled={currentIndex <= 0}
            onClick={() => onCurrentIndexChange(moveSceneViewerIndex(currentIndex, -1, scene.files.length))}
            aria-label="이전 사진"
          >
            <ChevronLeft size={26} aria-hidden="true" />
          </button>

          {loadError ? (
            <div className={styles.error}>원본 이미지를 열지 못했습니다. {loadError}</div>
          ) : source ? (
            <img className={styles.image} src={source} alt={currentFile?.name ?? "장면 사진"} />
          ) : (
            <div className={styles.loading}>원본 이미지를 불러오는 중…</div>
          )}

          <button
            type="button"
            className={`${styles.arrowButton} ${styles.arrowNext}`}
            disabled={currentIndex >= scene.files.length - 1}
            onClick={() => onCurrentIndexChange(moveSceneViewerIndex(currentIndex, 1, scene.files.length))}
            aria-label="다음 사진"
          >
            <ChevronRight size={26} aria-hidden="true" />
          </button>
        </div>

        <footer className={styles.footer}>
          <div className={styles.filmHeader}>
            <span>장면 전체 {scene.files.length}장</span>
            {recommendedSplitPosition != null ? (
              <span className={styles.recommendedLegend}>민트 선 = 추천 분할 위치</span>
            ) : (
              <span className={styles.splitHint}>{splitHint}</span>
            )}
          </div>
          <div className={styles.filmstrip} aria-label="장면 사진 목록">
            {scene.files.map((file, fileIndex) => (
              <LazyFilmThumbnail
                key={`${file.name}-${fileIndex}`}
                file={file}
                index={fileIndex}
                current={fileIndex === currentIndex}
                recommendedSplit={fileIndex === recommendedSplitPosition}
                onSelect={() => onCurrentIndexChange(fileIndex)}
              />
            ))}
          </div>
        </footer>
      </section>
    </div>
  );

  return createPortal(content, document.body);
}

const LazyFilmThumbnail = memo(function LazyFilmThumbnail({
  file,
  index,
  current,
  recommendedSplit,
  onSelect,
}: {
  file: SceneFile;
  index: number;
  current: boolean;
  recommendedSplit: boolean;
  onSelect: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [visible, setVisible] = useState(current || Boolean(file.thumbUrl));
  const [thumbnail, setThumbnail] = useState(file.thumbUrl ?? "");

  useEffect(() => {
    if (visible || current) return undefined;
    const element = buttonRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "0px 160px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [current, visible]);

  useEffect(() => {
    if (!current) return;
    buttonRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);

  useEffect(() => {
    if (!visible && !current) return undefined;
    let cancelled = false;
    void getFilmThumbnail(file).then((next) => {
      if (!cancelled && next) setThumbnail(next);
    });
    return () => {
      cancelled = true;
    };
  }, [current, file, visible]);

  const label = useMemo(() => `${index + 1}. ${file.name}`, [file.name, index]);
  return (
    <button
      ref={buttonRef}
      type="button"
      className={styles.filmItem}
      data-current={current}
      data-recommended-split={recommendedSplit}
      onClick={onSelect}
      title={label}
      aria-label={label}
      aria-current={current ? "true" : undefined}
    >
      {thumbnail ? (
        <img className={styles.filmImage} src={thumbnail} alt="" />
      ) : (
        <span className={styles.filmPlaceholder}>{visible ? "불러오는 중" : index + 1}</span>
      )}
      <span className={styles.filmIndex}>{index + 1}</span>
    </button>
  );
});
