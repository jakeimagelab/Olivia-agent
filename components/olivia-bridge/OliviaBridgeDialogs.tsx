"use client";

import {
  ChevronRight,
  CircleAlert,
  FolderOpen,
  HardDrive,
  Images,
  LoaderCircle,
  Monitor,
  ScanSearch,
  Users,
  X,
} from "lucide-react";

import type { PersonSelectImportMatch } from "@/lib/photo-bridge/personSelectImport";
import type { CustomerSelectionMatchResult } from "@/lib/select-gallery/customerBridge";
import styles from "./OliviaBridgeWorkspace.module.css";

export type PersonSelectEventSummary = {
  id: string;
  title: string;
  people_count: number;
  submitted_count: number;
  access_mode?: "individual" | "project_shared";
  shared_submitted_at?: string | null;
};

export type PersonSelectImportResult = PersonSelectImportMatch & { eventTitle: string };

export type SelectGallerySummary = {
  id: string;
  title: string;
  hospital_name?: string | null;
  shooting_name?: string | null;
  status: string;
  selected_count?: number | null;
  submitted_at?: string | null;
  bridge_source?: "local" | "remote" | null;
  bridge_folder_display_path?: string | null;
};

export type GalleryCustomerSelectionResult = {
  gallery: SelectGallerySummary;
  total: number;
  match: CustomerSelectionMatchResult;
  imageMatch?: CustomerSelectionMatchResult;
  personSelectEventId?: string;
};

export function BridgeFolderSourceDialog({
  onClose,
  onPickLocal,
  onPickNas,
}: {
  onClose: () => void;
  onPickLocal: () => void;
  onPickNas: () => void;
}) {
  return (
    <div className={styles.folderSourceOverlay} onClick={onClose}>
      <section className={styles.folderSourceChooser} role="dialog" aria-modal="true" aria-labelledby="bridge-folder-source-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div><strong id="bridge-folder-source-title">폴더 선택</strong><span>사진이 있는 위치를 선택해 주세요.</span></div>
          <button type="button" onClick={onClose} aria-label="폴더 선택 닫기"><X size={18} /></button>
        </header>
        <div>
          <button type="button" onClick={onPickLocal}><Monitor size={19} /><span><strong>이 Mac의 폴더</strong><small>현재 기기에 있는 폴더를 엽니다.</small></span></button>
          <button type="button" onClick={onPickNas}><HardDrive size={19} /><span><strong>NAS 폴더</strong><small>Mac Studio에서 NAS 폴더를 엽니다.</small></span></button>
        </div>
      </section>
    </div>
  );
}

export function BridgeRawRootPromptDialog({
  error,
  onClose,
  onPickRoot,
  onUseCurrent,
}: {
  error: string;
  onClose: () => void;
  onPickRoot: () => void;
  onUseCurrent: () => void;
}) {
  return (
    <div className={styles.folderSourceOverlay} onClick={onClose}>
      <section className={styles.folderSourceChooser} role="dialog" aria-modal="true" aria-labelledby="bridge-raw-root-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div><strong id="bridge-raw-root-title">RAW 파일을 어디서 찾을까요?</strong><span>촬영 폴더 전체 또는 지금 폴더만 선택할 수 있습니다.</span></div>
          <button type="button" onClick={onClose} aria-label="RAW 검색 기준 폴더 닫기"><X size={18} /></button>
        </header>
        {error ? <p className={styles.rawRootPromptAlert} role="alert">{error}</p> : null}
        <div>
          <button type="button" onClick={onPickRoot}><FolderOpen size={19} /><span><strong>촬영 폴더 전체에서 찾기</strong><small>JPG와 RAW 폴더가 함께 들어 있는 촬영 폴더를 한 번 골라 주세요.</small></span></button>
          <button type="button" onClick={onUseCurrent}><ScanSearch size={19} /><span><strong>지금 폴더에서만 찾기</strong><small>RAW와 JPG가 같은 폴더에 있을 때 선택하세요.</small></span></button>
        </div>
      </section>
    </div>
  );
}

export function BridgeGallerySelectionDialog({
  result,
  loading,
  error,
  galleries,
  sharedProjects,
  importingId,
  onClose,
  onAddToAdmin,
  onChooseAnother,
  onRetry,
  onImportGallery,
  onImportShared,
}: {
  result: GalleryCustomerSelectionResult | null;
  loading: boolean;
  error: string;
  galleries: SelectGallerySummary[];
  sharedProjects: PersonSelectEventSummary[];
  importingId: string;
  onClose: () => void;
  onAddToAdmin: () => void;
  onChooseAnother: () => void;
  onRetry: () => void;
  onImportGallery: (gallery: SelectGallerySummary) => void;
  onImportShared: (project: PersonSelectEventSummary) => void;
}) {
  return (
    <div className={`${styles.folderSourceOverlay} ${styles.customerSelectionOverlay}`} onClick={onClose}>
      <section className={`${styles.folderSourceChooser} ${styles.customerSelectionChooser}`} role="dialog" aria-modal="true" aria-labelledby="bridge-gallery-select-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div><strong id="bridge-gallery-select-title">갤러리 고객 셀렉 비교</strong><span>현재 폴더와 연결할 갤러리를 직접 선택합니다. 내 셀렉과 고객 셀렉은 서로 바뀌지 않습니다.</span></div>
          <button type="button" onClick={onClose} aria-label="갤러리 고객 셀렉 닫기"><X size={18} /></button>
        </header>
        <div className={styles.customerSelectionBody}>
          {result ? (
            <section className={styles.customerSelectionResult} aria-live="polite">
              <strong>{result.gallery.title}</strong>
              <p>고객 선택 {result.total.toLocaleString("ko-KR")}장 중 현재 폴더에서 {result.match.matchedBridgeIds.size.toLocaleString("ko-KR")}장을 정확히 찾았습니다. · 누락 {result.match.missing.length.toLocaleString("ko-KR")}장 · 중복 확인 {result.match.ambiguous.length.toLocaleString("ko-KR")}장</p>
              {result.match.missing.length ? <div><span>못 찾은 파일</span><ul>{result.match.missing.map((item) => <li key={item.imageId}>{item.relativePath || item.fileName}</li>)}</ul></div> : null}
              {result.match.ambiguous.length ? <div><span>동명 파일이라 확인이 필요한 항목</span><ul>{result.match.ambiguous.map((item) => <li key={item.imageId}>{item.relativePath || item.fileName} · 후보 {item.candidateIds.length}개</li>)}</ul></div> : null}
              {!result.match.missing.length && !result.match.ambiguous.length ? <small>모든 고객 선택 사진을 정확히 찾았습니다.</small> : <small>누락 또는 중복 파일은 자동 선택하지 않았습니다.</small>}
              <div className={styles.customerSelectionResultActions}>
                <button type="button" disabled={!result.match.matchedBridgeIds.size} onClick={onAddToAdmin}>찾은 사진을 내 셀렉에 추가</button>
                <button type="button" onClick={onChooseAnother}>다른 갤러리 고르기</button>
              </div>
            </section>
          ) : loading ? (
            <div className={styles.customerSelectionState}><LoaderCircle className={styles.spin} size={17} />갤러리 목록을 불러오는 중입니다.</div>
          ) : error ? (
            <div className={styles.customerSelectionState} role="alert"><CircleAlert size={17} />{error}<button type="button" onClick={onRetry}>다시 불러오기</button></div>
          ) : galleries.length || sharedProjects.length ? (
            <div className={styles.customerSelectionSources}>
              {galleries.length ? <section><strong>셀렉 갤러리</strong><div className={styles.customerSelectionEvents}>{galleries.map((gallery) => <button key={gallery.id} type="button" disabled={Boolean(importingId) || !gallery.submitted_at} onClick={() => onImportGallery(gallery)}><Images size={17} /><span><strong>{gallery.title}</strong><small>{gallery.hospital_name || gallery.shooting_name || "고객 미연결"} · {gallery.submitted_at ? `고객 제출 ${Number(gallery.selected_count ?? 0).toLocaleString("ko-KR")}장` : "제출 전"}{gallery.bridge_folder_display_path ? ` · 연결 ${gallery.bridge_folder_display_path}` : ""}</small></span>{importingId === gallery.id ? <LoaderCircle className={styles.spin} size={16} /> : <ChevronRight size={16} />}</button>)}</div></section> : null}
              {sharedProjects.length ? <section><strong>공유 사진선택 프로젝트</strong><div className={styles.customerSelectionEvents}>{sharedProjects.map((project) => <button key={project.id} type="button" disabled={Boolean(importingId) || !project.shared_submitted_at} onClick={() => onImportShared(project)}><Users size={17} /><span><strong>{project.title}</strong><small>{project.shared_submitted_at ? "공동 셀렉 제출 완료" : "제출 전"}</small></span>{importingId === project.id ? <LoaderCircle className={styles.spin} size={16} /> : <ChevronRight size={16} />}</button>)}</div></section> : null}
            </div>
          ) : <div className={styles.customerSelectionState}>등록된 사진선택 갤러리나 공유 프로젝트가 없습니다.</div>}
        </div>
      </section>
    </div>
  );
}

export function BridgePersonSelectionDialog({
  result,
  loading,
  error,
  events,
  importingId,
  onClose,
  onChooseAnother,
  onRetry,
  onImport,
}: {
  result: PersonSelectImportResult | null;
  loading: boolean;
  error: string;
  events: PersonSelectEventSummary[];
  importingId: string;
  onClose: () => void;
  onChooseAnother: () => void;
  onRetry: () => void;
  onImport: (event: PersonSelectEventSummary) => void;
}) {
  return (
    <div className={`${styles.folderSourceOverlay} ${styles.customerSelectionOverlay}`} onClick={onClose}>
      <section className={`${styles.folderSourceChooser} ${styles.customerSelectionChooser}`} role="dialog" aria-modal="true" aria-labelledby="bridge-person-select-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div><strong id="bridge-person-select-title">개인별 사진선택 행사 불러오기</strong><span>개인별 사진 셀렉 행사를 고르면 현재 폴더에서 같은 파일명을 찾습니다.</span></div>
          <button type="button" onClick={onClose} aria-label="개인별 사진선택 행사 닫기"><X size={18} /></button>
        </header>
        <div className={styles.customerSelectionBody}>
          {result ? (
            <section className={styles.customerSelectionResult} aria-live="polite">
              <strong>{result.eventTitle}</strong>
              <p>고객 선택 {result.total.toLocaleString("ko-KR")}장 중 지금 폴더에서 {result.found.toLocaleString("ko-KR")}장을 찾았습니다. ({result.missing.length.toLocaleString("ko-KR")}장 못 찾음)</p>
              {result.missing.length ? <div><span>못 찾은 파일</span><ul>{result.missing.map((name) => <li key={name}>{name}</li>)}</ul></div> : <small>모든 고객 선택 사진을 찾았습니다.</small>}
              <button type="button" onClick={onChooseAnother}>다른 행사 고르기</button>
            </section>
          ) : loading ? (
            <div className={styles.customerSelectionState}><LoaderCircle className={styles.spin} size={17} />행사 목록을 불러오는 중입니다.</div>
          ) : error ? (
            <div className={styles.customerSelectionState} role="alert"><CircleAlert size={17} />{error}<button type="button" onClick={onRetry}>다시 불러오기</button></div>
          ) : events.length ? (
            <div className={styles.customerSelectionEvents}>{events.map((event) => <button key={event.id} type="button" disabled={Boolean(importingId)} onClick={() => onImport(event)}><Users size={17} /><span><strong>{event.title}</strong><small>인원 {event.people_count.toLocaleString("ko-KR")}명 · 제출 {event.submitted_count.toLocaleString("ko-KR")}명</small></span>{importingId === event.id ? <LoaderCircle className={styles.spin} size={16} /> : <ChevronRight size={16} />}</button>)}</div>
          ) : <div className={styles.customerSelectionState}>등록된 개인별 사진 셀렉 행사가 없습니다.</div>}
        </div>
      </section>
    </div>
  );
}
