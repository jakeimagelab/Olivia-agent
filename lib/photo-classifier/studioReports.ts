import { makeCSV } from "./workspaceFormatting";
import type { PersonGroup, StudioGroup, StudioStats } from "./studioGrouping";

export type StudioReportFile = {
  name: string;
  content: string;
};

export type StudioReportBundle = {
  files: StudioReportFile[];
  stats: StudioStats;
};

type StudioReportContext = {
  totalJpg: number;
  totalRaw: number;
  rootName: string;
  createdAt?: string;
};

export function buildStudioConceptReportBundle(
  groups: StudioGroup[],
  context: StudioReportContext,
): StudioReportBundle {
  const classRows: string[][] = [];
  const groupRows: string[][] = [];
  const etcRows: string[][] = [];
  for (const group of groups) {
    const folderName = group.editedFolderName || group.suggestedFolderName;
    for (const file of group.files) {
      classRows.push([
        file.name,
        "",
        folderName,
        file.clothingLabel,
        file.poseType,
        file.lightingStatus,
        String(Math.round(file.confidence * 100) / 100),
        "",
      ]);
      if (group.isEtc) {
        etcRows.push([file.name, file.lightingStatus, String(Math.round(file.brightness ?? 0)), "", "", ""]);
      }
    }
    if (!group.isEtc && group.files.length > 0) {
      const first = group.files[0];
      const last = group.files[group.files.length - 1];
      const averageConfidence = group.files.reduce((sum, file) => sum + file.confidence, 0) / group.files.length;
      groupRows.push([
        String(group.index),
        folderName,
        group.clothingLabel,
        group.poseType,
        String(group.files.length),
        first.name,
        last.name,
        String(Math.round(averageConfidence * 100) / 100),
      ]);
    }
  }

  const stats = buildStudioStats(groups, context);
  const summary = {
    mode: "studio",
    total_jpg: stats.totalJpg,
    total_raw: stats.totalRaw,
    total_groups: stats.totalGroups,
    total_etc: stats.totalEtc,
    total_normal: stats.totalNormal,
    output_path: `분류_${context.rootName}/`,
    created_at: context.createdAt ?? new Date().toISOString(),
  };
  return {
    stats,
    files: [
      {
        name: "studio_classification_report.csv",
        content: makeCSV(["file_name", "original_path", "assigned_folder", "clothing_label", "pose_type", "lighting_status", "confidence", "note"], classRows),
      },
      {
        name: "studio_group_report.csv",
        content: makeCSV(["group_id", "folder_name", "clothing_label", "pose_type", "file_count", "first_file", "last_file", "confidence"], groupRows),
      },
      {
        name: "studio_etc_report.csv",
        content: makeCSV(["file_name", "reason", "brightness_score", "face_brightness_score", "previous_frame_delta", "ai_comment"], etcRows),
      },
      { name: "summary.json", content: JSON.stringify(summary, null, 2) },
    ],
  };
}

export function buildStudioPersonReportBundle(
  groups: PersonGroup[],
  context: StudioReportContext,
): StudioReportBundle {
  const classRows: string[][] = [];
  const groupRows: string[][] = [];
  const etcRows: string[][] = [];
  for (const group of groups) {
    const folderName = group.editedFolderName;
    for (const file of group.files) {
      const features = group.features;
      classRows.push([
        file.name,
        folderName,
        group.label,
        features.gender,
        features.ageBand,
        features.hairColor,
        features.hairLength,
        String(features.hasGlasses),
        file.lightingStatus,
      ]);
      if (group.isEtc) {
        etcRows.push([file.name, file.lightingStatus, String(Math.round(file.brightness ?? 0)), ""]);
      }
    }
    if (!group.isEtc && group.files.length > 0) {
      groupRows.push([
        String(group.index),
        folderName,
        group.label,
        String(group.files.length),
        group.files[0].name,
        group.files[group.files.length - 1].name,
      ]);
    }
  }

  const stats = buildStudioStats(groups, context);
  const summary = {
    mode: "studio_group",
    total_jpg: stats.totalJpg,
    total_raw: stats.totalRaw,
    total_persons: stats.totalGroups,
    total_etc: stats.totalEtc,
    total_normal: stats.totalNormal,
    output_path: `분류_${context.rootName}/`,
    created_at: context.createdAt ?? new Date().toISOString(),
  };
  return {
    stats,
    files: [
      {
        name: "group_person_report.csv",
        content: makeCSV(["group_id", "folder_name", "label", "file_count", "first_file", "last_file"], groupRows),
      },
      {
        name: "classification_detail.csv",
        content: makeCSV(["file_name", "assigned_folder", "person_label", "gender", "age_band", "hair_color", "hair_length", "has_glasses", "lighting_status"], classRows),
      },
      {
        name: "etc_report.csv",
        content: makeCSV(["file_name", "reason", "brightness", "note"], etcRows),
      },
      { name: "summary.json", content: JSON.stringify(summary, null, 2) },
    ],
  };
}

function buildStudioStats(
  groups: Array<{ isEtc: boolean; files: unknown[] }>,
  context: Pick<StudioReportContext, "totalJpg" | "totalRaw">,
): StudioStats {
  const normalGroups = groups.filter((group) => !group.isEtc);
  const etcGroup = groups.find((group) => group.isEtc);
  return {
    totalJpg: context.totalJpg,
    totalRaw: context.totalRaw,
    totalGroups: normalGroups.length,
    totalEtc: etcGroup?.files.length ?? 0,
    totalNormal: normalGroups.reduce((sum, group) => sum + group.files.length, 0),
  };
}
