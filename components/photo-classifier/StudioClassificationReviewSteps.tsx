"use client";

import {
  buildPersonFeatureTags,
  type PersonGroup,
  type StudioGroup,
  type StudioStats,
  type StudioSubMode,
} from "@/lib/photo-classifier/studioGrouping";
import { downloadCSV, makeCSV } from "@/lib/photo-classifier/workspaceFormatting";
import { StudioClassificationCompleteView } from "./StudioClassificationCompleteView";
import { StudioGroupConfirmationView } from "./StudioGroupConfirmationView";
import { StudioGroupEditView } from "./StudioGroupEditView";
import { C } from "./PhotoSortingUi";

export function StudioConceptEditStep({
  groups,
  onFolderNameChange,
  onBack,
  onApprove,
}: {
  groups: StudioGroup[];
  onFolderNameChange: (groupId: string, value: string) => void;
  onBack: () => void;
  onApprove: () => void;
}) {
  const etcGroup = groups.find((group) => group.isEtc);
  const normalGroups = groups.filter((group) => !group.isEtc);

  return (
    <StudioGroupEditView
      description={<>AI가 의상·포즈 기준으로 그룹을 분류했습니다. 폴더명을 수정한 후 <strong>승인</strong>해주세요.</>}
      groupHeading="의상·포즈 그룹"
      groupCountUnit="개"
      etcFiles={etcGroup?.files ?? []}
      groups={normalGroups.map((group) => ({
        id: group.key,
        kind: "concept" as const,
        editedFolderName: group.editedFolderName,
        files: group.files,
        poseType: group.poseType,
        confidence: group.files.reduce((sum, file) => sum + file.confidence, 0) / group.files.length,
      }))}
      onFolderNameChange={onFolderNameChange}
      onBack={onBack}
      onApprove={onApprove}
    />
  );
}

export function StudioPersonEditStep({
  groups,
  onFolderNameChange,
  onBack,
  onApprove,
}: {
  groups: PersonGroup[];
  onFolderNameChange: (groupId: string, value: string) => void;
  onBack: () => void;
  onApprove: () => void;
}) {
  const etcGroup = groups.find((group) => group.isEtc);
  const normalGroups = groups.filter((group) => !group.isEtc);

  return (
    <StudioGroupEditView
      description={<>AI가 얼굴 특징(성별·연령·헤어·안경)을 기준으로 인물별 그룹을 분류했습니다. 폴더명을 수정한 후 <strong>승인</strong>해주세요.</>}
      groupHeading="인물 그룹"
      groupCountUnit="명"
      etcFiles={etcGroup?.files ?? []}
      groups={normalGroups.map((group) => ({
        id: group.id,
        kind: "person" as const,
        editedFolderName: group.editedFolderName,
        files: group.files,
        sampleThumb: group.sampleThumb,
        tags: buildPersonFeatureTags(group.features, { includeHairLength: true }),
        index: group.index,
      }))}
      onFolderNameChange={onFolderNameChange}
      onBack={onBack}
      onApprove={onApprove}
    />
  );
}

export function StudioPersonConfirmationStep({
  groups,
  activeIndex,
  rawCount,
  onActiveIndexChange,
  onBack,
  onStart,
}: {
  groups: PersonGroup[];
  activeIndex: number;
  rawCount: number;
  onActiveIndexChange: (index: number) => void;
  onBack: () => void;
  onStart: () => void | Promise<void>;
}) {
  const etcGroup = groups.find((group) => group.isEtc);
  const normalGroups = groups.filter((group) => !group.isEtc);

  return (
    <StudioGroupConfirmationView
      groups={groups.map((group) => ({
        id: group.id,
        tabLabel: group.editedFolderName,
        editedFolderName: group.editedFolderName,
        isEtc: group.isEtc,
        files: group.files,
        tags: buildPersonFeatureTags(group.features).map((label) => ({ label })),
      }))}
      activeIndex={activeIndex}
      stats={[
        { label: "인물 수", value: normalGroups.length, color: C.purple },
        { label: "전체 JPG", value: normalGroups.reduce((sum, group) => sum + group.files.length, 0), color: C.txt },
        { label: "ETC", value: etcGroup?.files.length ?? 0, color: C.red },
        { label: "RAW 파일", value: rawCount, color: C.muted },
      ]}
      onActiveIndexChange={onActiveIndexChange}
      onBack={onBack}
      onStart={onStart}
    />
  );
}

export function StudioConceptConfirmationStep({
  groups,
  activeIndex,
  rawCount,
  onActiveIndexChange,
  onBack,
  onStart,
}: {
  groups: StudioGroup[];
  activeIndex: number;
  rawCount: number;
  onActiveIndexChange: (index: number) => void;
  onBack: () => void;
  onStart: () => void | Promise<void>;
}) {
  const etcGroup = groups.find((group) => group.isEtc);
  const normalGroups = groups.filter((group) => !group.isEtc);

  return (
    <StudioGroupConfirmationView
      groups={groups.map((group) => ({
        id: group.key,
        tabLabel: group.editedFolderName.split("_").slice(1).join("_"),
        editedFolderName: group.editedFolderName,
        isEtc: group.isEtc,
        files: group.files,
        tags: [
          { label: group.clothingLabel },
          { label: group.poseType, tone: "orange" as const },
        ],
      }))}
      activeIndex={activeIndex}
      stats={[
        { label: "전체 그룹", value: normalGroups.length, color: C.purple },
        { label: "전체 JPG", value: normalGroups.reduce((sum, group) => sum + group.files.length, 0), color: C.txt },
        { label: "ETC", value: etcGroup?.files.length ?? 0, color: C.red },
        { label: "RAW 파일", value: rawCount, color: C.muted },
      ]}
      onActiveIndexChange={onActiveIndexChange}
      onBack={onBack}
      onStart={onStart}
    />
  );
}

export function StudioClassificationCompletionStep({
  stats,
  subMode,
  rootFolderName,
  personGroups,
  conceptGroups,
  onReset,
}: {
  stats: StudioStats;
  subMode: StudioSubMode;
  rootFolderName: string;
  personGroups: PersonGroup[];
  conceptGroups: StudioGroup[];
  onReset: () => void;
}) {
  const isGroup = subMode === "group";

  return (
    <StudioClassificationCompleteView
      stats={[
        { label: isGroup ? "인물 그룹" : "의상·포즈 그룹", value: stats.totalGroups, color: C.purple },
        { label: "정상 JPG", value: stats.totalNormal, color: C.teal },
        { label: "ETC 분리", value: stats.totalEtc, color: C.red },
        { label: "원본 RAW", value: stats.totalRaw, color: C.muted },
      ]}
      rootFolderName={rootFolderName}
      groupDescription={isGroup ? "인물별" : "의상·포즈별"}
      downloadLabel={isGroup ? "↓ 인물 요약 CSV" : "↓ 그룹 요약 CSV"}
      onDownload={() => {
        if (isGroup) {
          downloadCSV(
            makeCSV(["인물", "폴더명", "장수"], personGroups.filter((group) => !group.isEtc).map((group) => [group.label, group.editedFolderName, String(group.files.length)])),
            "person_group_summary.csv",
          );
          return;
        }
        downloadCSV(
          makeCSV(["그룹", "폴더명", "의상", "포즈", "장수"], conceptGroups.filter((group) => !group.isEtc).map((group) => [String(group.index), group.editedFolderName, group.clothingLabel, group.poseType, String(group.files.length)])),
          "studio_group_summary.csv",
        );
      }}
      onReset={onReset}
    />
  );
}
