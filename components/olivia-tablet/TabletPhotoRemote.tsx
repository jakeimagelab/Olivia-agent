"use client";

import { useState } from "react";
import { CircleDot, FolderOpen, MonitorUp, Radio, Send } from "lucide-react";
import { AppIcon, type IconName } from "@/components/AppIcon";
import styles from "./OliviaTabletShell.module.css";

const REMOTE_TOOLS: Array<{ id: string; title: string; description: string; icon: IconName }> = [
  { id: "metadata-select", title: "메타데이터 셀렉", description: "촬영 시간과 EXIF 기준으로 후보를 정리합니다.", icon: "metadata-select" },
  { id: "raw-match", title: "AI 컷 정리 / RAW 매칭", description: "기존 AI 컷 정리와 RAW 원본 연결 작업입니다.", icon: "raw-select" },
  { id: "classification", title: "사진 분류", description: "Scene과 촬영 유형 기준으로 분류합니다.", icon: "photo-studio" },
  { id: "retouch", title: "사진 보정", description: "기존 색감·톤 보정 작업을 요청합니다.", icon: "retouch" },
  { id: "resize", title: "사진 리사이즈", description: "기존 일괄 해상도·품질 변환 작업입니다.", icon: "resolution-convert" },
];

export default function TabletPhotoRemote() {
  const [selectedTool, setSelectedTool] = useState(REMOTE_TOOLS[0].id);
  const selected = REMOTE_TOOLS.find((tool) => tool.id === selectedTool) ?? REMOTE_TOOLS[0];

  return (
    <div className={styles.remoteScroll}>
      <section className={styles.remoteStatusBar}>
        <span className={styles.remoteBadge}><Radio size={13} /> 리모트</span>
        <span className={styles.connectionIcon}><MonitorUp size={22} strokeWidth={1.6} /></span>
        <div className={styles.remoteMachine}>
          <strong>Mac Studio — 압구정 스튜디오</strong>
          <span>선택과 지시는 아이패드에서, 실제 처리는 Mac Studio에서 실행됩니다.</span>
        </div>
        <span className={styles.connectionPending}><CircleDot size={12} /> 연결 준비 중</span>
      </section>

      <section className={styles.remoteWorkspace}>
        <div className={styles.remoteTools}>
          <header><span>작업 종류</span><small>Mac Studio에 요청할 작업을 선택하세요.</small></header>
          <div className={styles.remoteToolGrid}>
            {REMOTE_TOOLS.map((tool) => (
              <button type="button" key={tool.id} className={selectedTool === tool.id ? styles.remoteToolActive : ""} onClick={() => setSelectedTool(tool.id)}>
                <AppIcon name={tool.icon} size={39} /><span><strong>{tool.title}</strong><small>{tool.description}</small></span>
              </button>
            ))}
          </div>
        </div>
        <aside className={styles.remoteRequest}>
          <header><small>REMOTE REQUEST</small><h3>{selected.title}</h3></header>
          <div className={styles.folderPreview}>
            <FolderOpen size={23} strokeWidth={1.6} />
            <span><small>작업 폴더</small><strong>폴더를 선택하지 않았습니다.</strong></span>
          </div>
          <label><span>작업 옵션</span><select defaultValue="default" disabled><option value="default">Mac Studio 연결 후 선택</option></select></label>
          <label><span>작업 메모</span><textarea placeholder="Mac Studio에 전달할 지시사항" disabled /></label>
          <button type="button" className={styles.remoteSend} disabled><Send size={17} /> Mac Studio로 보내기</button>
          <p>Mac Studio 연결이 준비되면 전송할 수 있습니다.</p>
        </aside>
      </section>
    </div>
  );
}
