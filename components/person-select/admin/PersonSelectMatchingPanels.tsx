"use client";

import type { ReactNode } from "react";
import { Folder, Info, Link2, UsersRound } from "lucide-react";

import CustomerBridgeSelect from "@/components/select-gallery/CustomerBridgeSelect";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";
import type { PersonSelectAdminPerson } from "@/lib/person-select/adminPerson";
import type { PersonSelectSharedReviewer, PersonSelectSharedSelection } from "@/lib/person-select/adminData";
import type { SelectionMediaVariant } from "@/lib/select-gallery/mediaLoading";

function matchingFolderName(value: string | null | undefined) {
  if (!value) return "폴더 확인 필요";
  return value.split("/").filter(Boolean)[0] ?? "폴더 확인 필요";
}

function personPhotoCount(person: PersonSelectAdminPerson) {
  return Object.entries(person.image_counts ?? {}).filter(([key]) => key !== "homeroom").reduce((sum, [, count]) => sum + count, 0);
}

export function PersonSelectSharedMatchingPanel({
  eventId,
  eventTitle,
  images,
  reviewers,
  selectedReviewer,
  selectedSelection,
  totalPhotos,
  loadImageUrls,
  rawBusy,
  rawDisabled,
  rawDisabledReason,
  rawAction,
  rawStatus,
  onReviewerChange,
  onRawMatchOpen,
  onNext,
}: {
  eventId: string;
  eventTitle: string;
  images: CustomerBridgeImage[];
  reviewers: PersonSelectSharedReviewer[];
  selectedReviewer: PersonSelectSharedReviewer | null;
  selectedSelection: PersonSelectSharedSelection | null;
  totalPhotos: number;
  loadImageUrls: (imageIds: string[], options?: { variant: SelectionMediaVariant }) => Promise<Record<string, Pick<CustomerBridgeImage, "image_url" | "thumbnail_url">>>;
  rawBusy: boolean;
  rawDisabled: boolean;
  rawDisabledReason: string;
  rawAction: ReactNode;
  rawStatus: ReactNode;
  onReviewerChange: (reviewerId: string) => void;
  onRawMatchOpen: () => void;
  onNext: () => void;
}) {
  return <section className={styles.matchingPanel}>
    <div className={styles.matchingHeader}><div><h2>프로젝트 사진 확인</h2><p>검토자별 셀렉은 서로 독립적으로 보존되며 오른쪽 대화 탭은 모든 참여자가 함께 사용합니다.</p></div><div className={styles.actions}>{reviewers.length ? <select className={styles.select} aria-label="확인할 검토자" value={selectedReviewer?.id ?? ""} onChange={(event) => onReviewerChange(event.target.value)}>{reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.display_name}{reviewer.role_label ? ` · ${reviewer.role_label}` : ""}</option>)}</select> : null}<button className={styles.primary} onClick={onNext}>{totalPhotos ? "고객 셀렉 보기" : "사진 올리기"}</button></div></div>
    <div className={`${styles.rawMatchToolbar} ${styles.mobileSharedRawMatchToolbar}`}><div><strong>고객 셀렉 RAW 매칭</strong><span>{rawDisabledReason || "최종 제출본 또는 현재 고른 상태를 기준으로 실행할 수 있어요."}</span></div><button className={styles.primary} disabled={rawDisabled} title={rawDisabledReason || "RAW 매칭 기준을 확인합니다."} onClick={onRawMatchOpen}><Link2 size={15} />{rawBusy ? "RAW 매칭 중" : "RAW 매칭"}</button></div>
    {images.length ? <CustomerBridgeSelect
      key={`${selectedReviewer?.id ?? "project"}:${selectedSelection?.id ?? "draft"}`}
      shareToken=""
      apiBase={`/api/person-select/${eventId}`}
      storageScope={`person-select-admin:${eventId}:${selectedReviewer?.id ?? "project"}`}
      gallery={{ id: eventId, title: eventTitle, total_jpg_count: images.length, allow_resubmit: false }}
      images={images}
      initialDraft={selectedReviewer?.draft ?? null}
      initialSelection={selectedSelection}
      reviewer={selectedReviewer}
      messagesEnabled
      loadImageUrls={loadImageUrls}
      qualityApi={`/api/person-select/${eventId}/quality`}
      canManageQuality
      adminToolbarAction={rawAction}
      adminToolbarStatus={rawStatus}
      onSubmitted={() => undefined}
      readOnly
      embedded
    /> : <div className={styles.matchingEmpty}><Info size={28} /><strong>등록된 사진이 없어요.</strong><span>사진 올리기에서 프로젝트 폴더를 선택해 주세요.</span></div>}
  </section>;
}

export function PersonSelectIndividualMatchingPanel({
  people,
  onProgress,
  onUpload,
}: {
  people: PersonSelectAdminPerson[];
  onProgress: () => void;
  onUpload: () => void;
}) {
  return <section className={styles.matchingPanel}>
    <div className={styles.matchingHeader}>
      <div><h2>인원 매칭 확인</h2><p>원본 폴더별 등록 인원과 사진 수를 확인하세요.</p></div>
      {people.length ? <button className={styles.primary} onClick={onProgress}>확인하고 진행 현황 보기</button> : <button className={styles.primary} onClick={onUpload}>사진 올리기</button>}
    </div>
    {people.length ? <div className={styles.matchingGrid}>{people.map((person) => {
      const representative = person.representative_image;
      const photoCount = personPhotoCount(person);
      return <article className={styles.matchingCard} key={person.id}>
        <div className={styles.matchingFolder} aria-hidden="true"><Folder size={56} strokeWidth={1.35} /></div>
        <div className={styles.matchingMeta}><div><strong>{person.display_name}</strong><span>{photoCount.toLocaleString()}장</span></div><p>원본 폴더 · {matchingFolderName(representative?.source_rel_path)}</p></div>
      </article>;
    })}</div> : <div className={styles.matchingEmpty}><UsersRound size={28} /><strong>매칭할 사람이 아직 없어요.</strong><span>사진을 올리면 폴더 이름으로 사람을 만들고 등록 수를 보여드려요.</span></div>}
  </section>;
}
