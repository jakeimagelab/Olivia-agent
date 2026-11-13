import type { ShellSelection } from "@/lib/olivia/desktop/shellSelection";
import type { PersonSelectAdminData } from "./adminData";
import type { PersonSelectAdminPerson } from "./adminPerson";
import { formatSeoulDeadline } from "./date";
import { formatWon } from "./format";
import type { PersonSelectImportLayout } from "./localImportRecords";

export function personSelectSourceFolderName(value: string | null | undefined) {
  if (!value) return "";
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

export function buildPersonSelectAdminPresentation({
  data,
  layout,
  selectedReviewerId,
  selectedPersonId,
  origin,
}: {
  data: PersonSelectAdminData;
  layout: PersonSelectImportLayout | null;
  selectedReviewerId: string | null;
  selectedPersonId: string | null;
  origin: string;
}) {
  const isShared = data.event.access_mode === "project_shared";
  const currentLayout: PersonSelectImportLayout = layout
    ?? (isShared ? "project" : data.people.length && data.event.source_layout === "school" ? "school" : "person-folders");
  const sharedReviewers = data.shared?.reviewers ?? [];
  const selectedReviewer = sharedReviewers.find((reviewer) => reviewer.id === selectedReviewerId) ?? sharedReviewers[0] ?? null;
  const selectedPerson = data.people.find((person) => person.id === selectedPersonId) ?? null;
  const categories = data.event.categories ?? [];
  const isSchool = currentLayout === "school";
  const totalPhotos = isShared
    ? Number(data.shared?.image_count ?? 0)
    : data.people.reduce((sum, person) => sum + Object.entries(person.image_counts ?? {})
      .filter(([key]) => key !== "homeroom")
      .reduce((acc, [, value]) => acc + value, 0), 0);
  const pickText = isShared
    ? `프로젝트 공용 셀렉 · 검토자 ${sharedReviewers.filter((reviewer) => !reviewer.is_legacy).length}명`
    : categories.length === 1
      ? `한 사람당 ${categories[0].pick}장`
      : categories.map((item) => `${item.label} ${item.pick}장`).join(" · ");
  const sourceFolder = personSelectSourceFolderName(data.event.source_relative_path);
  const loginGuide = isShared
    ? "공용 링크에서 프로젝트 사진을 함께 선택해 주세요"
    : isSchool
      ? "이름과 학교에서 받은 비밀번호 4자리로 들어오세요"
      : "이름과 포토클리닉에서 받은 비밀번호 4자리로 들어오세요";
  const publicPath = isShared && data.event.shared_token
    ? `/pick/shared/${data.event.shared_token}`
    : `/pick/${data.event.slug}`;
  return {
    isShared,
    currentLayout,
    sharedReviewers,
    selectedReviewer,
    selectedSharedSelection: selectedReviewer?.selection ?? null,
    selectedPerson,
    isSchool,
    categories,
    categoryLabels: new Map(categories.map((item) => [item.key, item.label])),
    totalPhotos,
    pickText,
    sourceFolder,
    labels: new Map(data.event.retouch_options.map((item) => [item.key, item.label])),
    loginGuide,
    publicPath,
    notice: `주소: ${origin}${publicPath} / ${loginGuide} / 마감: ${formatSeoulDeadline(data.event.deadline_at)}`,
  };
}

export function buildPersonSelectShellSelection(
  data: PersonSelectAdminData,
  selectedPerson: PersonSelectAdminPerson | null,
): ShellSelection {
  const need = selectedPerson
    ? Object.values(selectedPerson.need_counts ?? {}).reduce((sum, value) => sum + value, 0)
    : 0;
  const retouch = selectedPerson?.choices.reduce((sum, choice) => sum + choice.retouch_keys.length, 0) ?? 0;
  const memos = selectedPerson?.choices
    .filter((choice) => choice.memo)
    .map((choice) => `${choice.person_select_images?.original_file_name ?? ""}: ${choice.memo}`) ?? [];
  const itemId = selectedPerson?.id ?? data.event.id;
  return {
    sourceAppId: "person-select",
    sourceWindowId: "person-select",
    itemId,
    title: data.event.title,
    subtitle: selectedPerson
      ? `${selectedPerson.display_name} · ${selectedPerson.status_label} · 고른 사진 ${selectedPerson.choices.length} / ${need}장 · 보정 요청 ${retouch}개${selectedPerson.order?.total ? ` · 추가 주문 ${formatWon(selectedPerson.order.total)}` : ""}`
      : `마감 ${formatSeoulDeadline(data.event.deadline_at)} · ${data.people.length}명`,
    next: memos.length ? memos.join(" / ") : "행사 진행 현황과 고객 선택을 확인합니다.",
    context: {
      contextScope: "none",
      routeHref: `/person-select/${data.event.id}`,
      resourceId: data.event.id,
      resourceType: "person-select-event",
      documentTitle: data.event.title,
      featureItemId: itemId,
    },
    featureItemId: itemId,
  };
}
