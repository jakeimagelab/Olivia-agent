"use client";

import { FileVideo, ImagePlus, Music2, Plus, Trash2, Upload } from "lucide-react";
import type { MediaRole } from "@/lib/higgsfield/vendor/template/catalog/types";
import { ROLE_KIND, ROLE_LABEL, type MediaDraft } from "./types";
import styles from "./VideoProductionWorkspace.module.css";

type Props = {
  roles: Partial<Record<MediaRole, number>>;
  media: MediaDraft[];
  onAdd: (role: MediaRole, files: FileList | File[]) => void;
  onRemove: (id: string) => void;
};

function acceptFor(role: MediaRole): string {
  const kind = ROLE_KIND[role];
  if (kind === "image") return "image/jpeg,image/png,image/webp,image/gif";
  if (kind === "video") return "video/mp4";
  return "audio/wav,audio/x-wav";
}

function IconForRole({ role }: { role: MediaRole }) {
  const kind = ROLE_KIND[role];
  if (kind === "image") return <ImagePlus size={17} />;
  if (kind === "video") return <FileVideo size={17} />;
  return <Music2 size={17} />;
}

export function VideoInputPanel({ roles, media, onAdd, onRemove }: Props) {
  const entries = (Object.entries(roles) as Array<[MediaRole, number]>).filter(([, limit]) => Boolean(limit));
  if (!entries.length) {
    return <section className={styles.formSection}><div className={styles.sectionKicker}><ImagePlus size={15} /> 입력 미디어</div><p className={styles.mutedCopy}>이 모델은 텍스트 프롬프트로 영상을 생성합니다.</p></section>;
  }

  return (
    <section className={styles.formSection}>
      <div className={styles.sectionKicker}><ImagePlus size={15} /> 입력 미디어</div>
      <p className={styles.mutedCopy}>지원하는 슬롯에만 파일을 추가합니다. 업로드는 생성 직전에 Higgsfield에 안전하게 전달됩니다.</p>
      <div className={styles.mediaSlots}>
        {entries.map(([role, limit]) => {
          const items = media.filter((item) => item.role === role);
          const canAdd = items.length < limit;
          return (
            <div className={styles.mediaSlot} key={role} onPaste={(event) => {
              if (ROLE_KIND[role] !== "image") return;
              const files = event.clipboardData.files;
              if (files.length) {
                event.preventDefault();
                onAdd(role, files);
              }
            }}>
              <div className={styles.mediaSlotHead}><span><IconForRole role={role} /> {ROLE_LABEL[role]}</span><em>{items.length}/{limit}</em></div>
              <div className={styles.mediaList}>
                {items.map((item) => (
                  <div key={item.id} className={styles.mediaItem}>
                    {item.previewUrl && ROLE_KIND[role] === "image" ? <>
                      {/* Blob object URLs are short-lived local previews; Next's remote image loader cannot own their lifecycle. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.previewUrl} alt="선택한 입력 미리보기" />
                    </> : <IconForRole role={role} />}
                    <span>{item.name}</span>
                    <button type="button" aria-label={`${item.name} 삭제`} onClick={() => onRemove(item.id)}><Trash2 size={13} /></button>
                  </div>
                ))}
                {canAdd ? (
                  <label className={styles.uploadSlot}>
                    <Upload size={16} /><span>{items.length ? "추가" : "파일 추가"}</span><Plus size={13} />
                    <input type="file" accept={acceptFor(role)} multiple={limit > 1} onChange={(event) => {
                      if (event.target.files?.length) onAdd(role, event.target.files);
                      event.currentTarget.value = "";
                    }} />
                  </label>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
