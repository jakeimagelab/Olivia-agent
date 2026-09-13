"use client";

import { useState } from "react";
import { ChevronDown, CircleDot, FolderOpen, MonitorUp, Radio, Send } from "lucide-react";
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
  const [connected, setConnected] = useState(true);
  const selected = REMOTE_TOOLS.find((tool) => tool.id === selectedTool) ?? REMOTE_TOOLS[0];

  return (
    <div className={styles.remoteScroll}>
      <section className={styles.remoteHero}>
        <div>
          <span className={styles.remoteBadge}><Radio size={13} /> 리모트 · UI PREVIEW</span>
          <h2>선택과 지시는 아이패드에서,<br />실제 처리는 Mac Studio에서.</h2>
          <p>이번 V1은 Remote Controller 화면만 제공합니다. 실제 폴더 전송과 처리는 아직 실행하지 않습니다.</p>
        </div>
        <button type="button" className={`${styles.connectionCard} ${connected ? styles.connectionOn : styles.connectionOff}`} onClick={() => setConnected((value) => !value)} aria-pressed={connected}>
          <span className={styles.connectionIcon}><MonitorUp size={25} strokeWidth={1.6} /></span>
          <span><small>MAC STUDIO</small><strong>압구정 스튜디오</strong><em><CircleDot size={12} /> {connected ? "연결 상태 예시" : "연결 안 됨 예시"}</em></span>
          <ChevronDown size={17} />
        </button>
      </section>

      <section className={styles.remoteWorkspace}>
        <div className={styles.remoteTools}>
          <header><span>작업 종류</span><small>Desktop의 실제 기능만 표시합니다.</small></header>
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
          <p>Remote API와 실행기는 V1 범위에 포함되지 않아 전송 버튼을 비활성화했습니다.</p>
        </aside>
      </section>
    </div>
  );
}
