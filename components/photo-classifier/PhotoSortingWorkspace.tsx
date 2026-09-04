"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { FieldScene, FieldStats, MedicalDepartment, SceneFile } from "@/lib/photo-classifier/types";
import { DEPARTMENT_DISPLAY } from "@/lib/photo-classifier/types";
import { buildMergeCandidates } from "@/lib/photo-classifier/scene-merge-candidate";
import type { SceneMergeCandidate, MergeDecision } from "@/lib/photo-classifier/scene-merge-types";
import { getClassificationSettings } from "@/lib/photo-classifier/classification-settings";
import { buildCandidateSegments, buildVisualBoundaryCandidates, sortTimestampedFiles } from "@/lib/photo-classifier/candidate-builder";
import { decideBoundary } from "@/lib/photo-classifier/boundary-score";
import { stabilizeBoundaries } from "@/lib/photo-classifier/boundary-stabilizer";
import { buildFieldScenesFromBoundaries, simpleSceneFolderName } from "@/lib/photo-classifier/scene-builder";
import { extractFeaturesWithWorkers } from "@/lib/photo-classifier/feature-worker-client";
import { buildPurposeSampleIndices, findPurposeTransitions } from "@/lib/photo-classifier/purpose-scan";
import {
  clearClassificationCheckpoint, featureCacheKey, folderFingerprint, getCachedFeature, getCachedPattern,
  getClassificationCheckpoint, setCachedFeature, setCachedPattern, setClassificationCheckpoint,
} from "@/lib/photo-classifier/scene-cache";
import { readPhotoTimestamp } from "@/lib/photo-classifier/timestamp";
import { evaluateSceneBoundaries } from "@/lib/photo-classifier/evaluation/metrics";
import { usePhotoClassificationHandoffStore } from "@/lib/store/usePhotoClassificationHandoffStore";
import { usePhotoClassificationActionsStore } from "@/lib/store/usePhotoClassificationActionsStore";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import type {
  AccuracyReport, ClassificationJobState, HybridSceneType, LocalVisualFeatures, SceneBoundaryDecision,
  SceneCorrection, SceneFrameAnalysis, TimestampSource,
} from "@/lib/photo-classifier/hybrid-types";
import {
  applyOverrides, adjustGranularity, computeFolderStats, sceneProposalFromFieldScene,
  DEFAULT_WEIGHT_PROFILE,
  type FolderShootingPattern, type SceneWeightProfile, type SceneProposal, type ClassificationOverrides,
} from "@/lib/photo-classifier/pattern-analysis";
import ClassificationModeToggle, { type ClassificationUiMode } from "./ai-auto/ClassificationModeToggle";
import FolderAnalysisSummary from "./ai-auto/FolderAnalysisSummary";
import ClassificationPrompt from "./ai-auto/ClassificationPrompt";
import SceneProposalList from "./ai-auto/SceneProposalList";
import ClassificationProfilePanel from "./ai-auto/ClassificationProfilePanel";

/* ════════════════════════════════════════════════
   SHARED TYPES
═══════════════════════════════════════════════ */
type PhotoMode = "field" | "studio";

/* ── Studio-mode types ── */
type StudioLightingStatus = "normal" | "etc_dark" | "etc_black" | "etc_test";
type StudioPoseType       = "Standing" | "Sitting" | "Unknown";
type StudioInnerWear      = "셔츠" | "넥타이셔츠" | "스크럽" | "블라우스" | "탑" | "기타";
type LightingSensitivity  = "loose" | "medium" | "strict";

interface StudioOptions { lightingSensitivity: LightingSensitivity; }

interface StudioPhotoFile {
  name: string; basename: string;
  handle: FileSystemFileHandle; mtime: number;
  thumbUrl: string | null; brightness: number | null;
  fileSize: number;
  lightingStatus: StudioLightingStatus;
  hasGown: boolean; innerWear: StudioInnerWear;
  clothingLabel: string; poseType: StudioPoseType;
  isFamilyProfile: boolean; confidence: number;
  analyzed: boolean; groupKey: string;
  personFeatures?: PersonFeatures;
}

interface StudioGroup {
  key: string; clothingLabel: string; poseType: StudioPoseType;
  isFamilyProfile: boolean; files: StudioPhotoFile[];
  suggestedFolderName: string; editedFolderName: string;
  index: number; isEtc: boolean;
}

interface StudioStats {
  totalJpg: number; totalRaw: number; totalGroups: number;
  totalEtc: number; totalNormal: number;
}

/* ── Studio Group-mode types ── */
type StudioSubMode = "concept" | "group";
type StudioGroupSortMode = "gap" | "gap_ai" | "ai";

interface PersonFeatures {
  gender: "male" | "female" | "unknown";
  ageBand: "20s" | "30s" | "40s" | "50s" | "60s+" | "unknown";
  hairColor: "black" | "brown" | "blonde" | "white_gray" | "other" | "unknown";
  hairLength: "short" | "medium" | "long" | "bald" | "unknown";
  hasGlasses: boolean;
  hasBeard: boolean;
  faceShape: "oval" | "round" | "square" | "heart" | "unknown";
}

interface PersonGroup {
  id: string; label: string;
  features: PersonFeatures; sampleThumb: string;
  files: StudioPhotoFile[];
  suggestedFolderName: string; editedFolderName: string;
  index: number; isEtc: boolean;
}

/* ════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const RAW_EXTS = new Set(["arw","cr3","cr2","nef","raf","dng","orf","rw2"]);
const JPG_EXTS = new Set(["jpg","jpeg"]);
// 우상단 전역 작업 팝업(BackgroundJobsWidget)에 등록할 때 쓰는 고정 job id — handleFieldSort만
// 이 id로 startJob을 부른다(스튜디오 모드 handleStudioSort는 범위 밖, 이 id로 등록 안 함).
const PHOTO_CLASSIFY_JOB_ID = "photo-classify";
const EMPTY_BOUNDARY_FEATURES = {
  timeGapScore: 0, personChangeScore: 0, locationChangeScore: 0, equipmentChangeScore: 0,
  poseChangeScore: 0, sceneTypeChangeScore: 0, visualChangeScore: 0, shotDistanceChangeScore: 0,
};

const FIELD_STEPS  = ["설정","파일 분류","씬 검토","분석 중","선택 안내","RAW SELECT","완료"];
const STUDIO_STEPS       = ["폴더 선택","파일 분류","AI 분석","그룹 검토","그룹 확인","파일 정리","완료"];
const STUDIO_GROUP_STEPS = ["폴더 선택","파일 분류","AI 분석","인물 검토","인물 확인","파일 정리","완료"];

const DEPARTMENTS: { value: MedicalDepartment; label: string }[] = [
  { value:"dermatology",            label:"피부과" },
  { value:"dentistry",              label:"치과" },
  { value:"ophthalmology",          label:"안과" },
  { value:"orthopedics_neurosurgery", label:"정형외과/신경외과" },
  { value:"pediatrics",             label:"소아과" },
  { value:"korean_medicine",        label:"한의원" },
  { value:"plastic_surgery",        label:"성형외과" },
  { value:"obgyn",                  label:"산부인과" },
  { value:"internal_medicine_checkup", label:"내과/검진센터" },
  { value:"general",                label:"기타" },
];

const GAP_OPTIONS = [3, 3.5, 5, 7, 10];

// AI 사진 분류 2.0의 새 ai-auto/ 하위 컴포넌트들이 기존과 똑같은 톤을 쓰도록 export한다
// (값 변경 없음, 이 파일 안에서의 기존 사용은 전부 그대로).
export const C = {
  teal:"#155855", orange:"#E85D2C", green:"#22876A",
  white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470",
  hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2", bg:"#EDF5F3",
  red:"#DC2626", yellow:"#D97706", purple:"#7C3AED",
};

const STUDIO_LIGHTING_SENSITIVITY: Record<LightingSensitivity, string> = {
  loose:  "느슨함 — 거의 시꺼먼 컷만 ETC",
  medium: "보통 — 얼굴이 명확히 어두운 컷 ETC (권장)",
  strict: "강함 — 얼굴 밝기가 조금만 낮아도 ETC",
};

/* ════════════════════════════════════════════════
   SHARED HELPERS
═══════════════════════════════════════════════ */
async function loadThumb(file: File, size = 120): Promise<string | null> {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(size / img.width, size / img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

// AI 사진 분류 2.0 — Step0 "AI 자동 분류" 화면의 즉석 미리보기. 실제 boundary AI 검증(Vision
// API)은 전혀 쓰지 않고, 이미 스캔해둔 시간(mtime)만으로 기존 fast-mode와 동일한 하드갭 규칙을
// 적용한다 — 그래서 이 미리보기는 무료지만 근사치다(실제 분류는 handleFieldSort가 다시 돈다).
const AI_PREVIEW_MAX_SCENES = 24;
async function buildQuickProposals(entries: { name: string; mtime: number; file: File }[], gapMinutes: number): Promise<SceneProposal[]> {
  if (!entries.length) return [];
  const gapMs = gapMinutes * 60 * 1000;
  const groups: (typeof entries)[] = [[entries[0]]];
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index].mtime - entries[index - 1].mtime > gapMs) groups.push([entries[index]]);
    else groups[groups.length - 1].push(entries[index]);
  }
  const limited = groups.slice(0, AI_PREVIEW_MAX_SCENES);
  return Promise.all(limited.map(async (group, index) => ({
    id: `quick-${index}`,
    startIndex: index,
    endIndex: index,
    fileCount: group.length,
    startTime: new Date(group[0].mtime).toISOString(),
    endTime: new Date(group[group.length - 1].mtime).toISOString(),
    representativeFiles: [await loadThumb(group[0].file, 80)].filter((url): url is string => Boolean(url)),
    reasons: ["시간 간격 기준(예상)"],
  })));
}

// 영상 파일과 마찬가지로 RAW도 수십~수백 MB일 수 있어 arrayBuffer()로 전체를 메모리에
// 올리지 않고 스트리밍으로 복사한다.
async function copyFileHandle(src: FileSystemFileHandle, dest: FileSystemDirectoryHandle, name: string) {
  // iCloud/OneDrive 온라인 전용 파일은 getFile()이 실제 다운로드가 끝날 때까지 멈출 수 있어
  // 제한 시간을 둔다 — 그래야 한 파일 때문에 전체 배치가 영영 멈추지 않는다.
  await withTimeout((async () => {
    const file = await src.getFile();
    const fh   = await (dest as any).getFileHandle(name, { create: true });
    const wr   = await fh.createWritable();
    await file.stream().pipeTo(wr);
    const copied = await fh.getFile();
    if (copied.size !== file.size) throw new Error(`${name} 복사 검증 실패 (${file.size} → ${copied.size})`);
  })(), 120000, `${name} 복사`);
}

// 클라우드 동기화 폴더(iCloud/OneDrive 등)의 온라인 전용 파일이나 네트워크 문제로 파일 읽기·API
// 호출이 무한정 멈추면 CONCURRENCY 워커 하나가 영영 안 끝나 Promise.all 전체가 멈춘다.
// 개별 작업에 제한 시간을 둬서 그 한 파일만 실패 처리하고 나머지는 계속 진행되게 한다.
function withTimeout<T>(promise: Promise<T>, ms: number, label = "작업"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 시간 초과 (${Math.round(ms / 1000)}초)`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function renameDirHandle(parentDir: any, oldName: string, newName: string, srcDir: any): Promise<FileSystemDirectoryHandle> {
  if (oldName === newName) return srcDir as FileSystemDirectoryHandle;
  const newDir = await parentDir.getDirectoryHandle(newName, { create: true });
  const entries: [string, FileSystemFileHandle][] = [];
  for await (const [fname, fhandle] of srcDir.entries()) {
    if (fhandle.kind === "file") entries.push([fname, fhandle as FileSystemFileHandle]);
  }
  for (const [fname, fhandle] of entries) {
    await copyFileHandle(fhandle, newDir as FileSystemDirectoryHandle, fname);
    await srcDir.removeEntry(fname);
  }
  try { await parentDir.removeEntry(oldName); } catch {}
  return newDir as FileSystemDirectoryHandle;
}

function makeCSV(headers: string[], rows: string[][]): string {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  return [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function estimatedRemaining(completed: number, total: number, startedAt: number) {
  if (completed <= 0 || completed >= total) return "";
  const remainingMs = ((Date.now() - startedAt) / completed) * (total - completed);
  const seconds = Math.max(1, Math.round(remainingMs / 1000));
  return seconds >= 60 ? ` · 약 ${Math.ceil(seconds / 60)}분 남음` : ` · 약 ${seconds}초 남음`;
}

/* ════════════════════════════════════════════════
   FIELD-MODE HELPERS
═══════════════════════════════════════════════ */
async function analyzeJpg(file: File): Promise<{ blurScore: number; brightness: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const MAX = 280;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d")!; ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const gray = new Float32Array(w * h); let brightSum = 0;
      for (let i = 0; i < gray.length; i++) {
        const v = 0.299*data[i*4]+0.587*data[i*4+1]+0.114*data[i*4+2];
        gray[i] = v; brightSum += v;
      }
      const brightness = brightSum / gray.length;
      let lapSum = 0, lapCount = 0;
      for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++) {
        const c = y*w+x;
        const lap = gray[c]*4-gray[(y-1)*w+x]-gray[(y+1)*w+x]-gray[y*w+(x-1)]-gray[y*w+(x+1)];
        lapSum += lap*lap; lapCount++;
      }
      const blurScore = lapCount > 0 ? Math.sqrt(lapSum/lapCount) : 0;
      URL.revokeObjectURL(url);
      resolve({ blurScore, brightness });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load fail")); };
    img.src = url;
  });
}

async function getApiThumb(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(480/img.width, 480/img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(); };
    img.src = url;
  });
}

async function getBoundaryApiImage(file: File, maxSize = 1080, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(maxSize / Math.max(image.width, image.height), 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} 이미지 읽기 실패`)); };
    image.src = url;
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const consume = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, consume));
  return results;
}

/* ════════════════════════════════════════════════
   STUDIO-MODE HELPERS
═══════════════════════════════════════════════ */
async function getStudioThumb(file: File, maxSize = 480): Promise<string> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(maxSize/img.width, maxSize/img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("load")); };
    img.src = url;
  });
}

async function quickBrightness(file: File): Promise<number> {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 64; c.height = 64;
      c.getContext("2d")!.drawImage(img, 0, 0, 64, 64);
      const d = c.getContext("2d")!.getImageData(0, 0, 64, 64).data;
      let sum = 0;
      for (let i = 0; i < d.length; i+=4) sum += 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
      URL.revokeObjectURL(url); res(sum/(64*64));
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(128); };
    img.src = url;
  });
}

function computeClothingLabel(hasGown: boolean, innerWear: StudioInnerWear, isFamilyProfile: boolean): string {
  if (isFamilyProfile) return "가족프로필";
  return hasGown ? `가운+${innerWear}` : innerWear;
}

function computeGroupKey(hasGown: boolean, innerWear: StudioInnerWear, poseType: StudioPoseType, isFamilyProfile: boolean): string {
  if (isFamilyProfile) return `가족프로필_${poseType}`;
  return `${hasGown ? "가운" : "노가운"}_${innerWear}_${poseType}`;
}

function createStudioFolderName(index: number, clothingLabel: string, poseType: StudioPoseType, isFamilyProfile: boolean): string {
  const prefix = String(index).padStart(2, "0");
  const type = isFamilyProfile ? "가족프로필" : "프로필";
  const clean = clothingLabel.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, "");
  return poseType === "Unknown" ? `${prefix}_${type}_${clean}` : `${prefix}_${type}_${clean}_${poseType}`;
}

function buildStudioGroups(files: StudioPhotoFile[]): StudioGroup[] {
  const etcFiles    = files.filter(f => f.groupKey === "__ETC__");
  const normalFiles = files.filter(f => f.groupKey !== "__ETC__");
  const groupMap = new Map<string, StudioPhotoFile[]>();
  const keyOrder: string[] = [];
  for (const f of normalFiles) {
    if (!groupMap.has(f.groupKey)) { groupMap.set(f.groupKey, []); keyOrder.push(f.groupKey); }
    groupMap.get(f.groupKey)!.push(f);
  }
  const groups: StudioGroup[] = [];
  let idx = 1;
  for (const key of keyOrder) {
    const groupFiles = groupMap.get(key)!;
    const first = groupFiles[0];
    const isFamily = groupFiles.some(f => f.isFamilyProfile);
    const folderName = createStudioFolderName(idx, first.clothingLabel, first.poseType, isFamily);
    groups.push({ key, clothingLabel: first.clothingLabel, poseType: first.poseType, isFamilyProfile: isFamily, files: groupFiles, suggestedFolderName: folderName, editedFolderName: folderName, index: idx, isEtc: false });
    idx++;
  }
  if (etcFiles.length > 0) {
    groups.unshift({ key: "__ETC__", clothingLabel: "조명불량", poseType: "Unknown", isFamilyProfile: false, files: etcFiles, suggestedFolderName: "00_ETC_조명불량", editedFolderName: "00_ETC_조명불량", index: 0, isEtc: true });
  }
  return groups;
}

function personMatchScore(a: PersonFeatures, b: PersonFeatures): number {
  // Gender: 가장 강한 식별자 (0.35점, 불일치 시 즉시 0)
  if (a.gender !== "unknown" && b.gender !== "unknown" && a.gender !== b.gender) return 0;
  let score = (a.gender === "unknown" || b.gender === "unknown") ? 0.15 : 0.35;

  // Glasses: 매우 강한 식별자 (0.20점, 불일치 시 즉시 0)
  if (a.hasGlasses !== b.hasGlasses) return 0;
  score += 0.20;

  // Age band (0.18점)
  const BANDS = ["20s","30s","40s","50s","60s+","unknown"];
  const ai = BANDS.indexOf(a.ageBand), bi = BANDS.indexOf(b.ageBand);
  if (ai === 5 || bi === 5) score += 0.08;
  else {
    const diff = Math.abs(ai - bi);
    if (diff === 0) score += 0.18;
    else if (diff === 1) score += 0.09;
    else return 0; // 2단계 이상 차이 → 다른 사람
  }

  // Hair color (0.13점)
  if (a.hairColor !== "unknown" && b.hairColor !== "unknown") {
    if (a.hairColor === b.hairColor) {
      score += 0.13;
    } else {
      const CLOSE: Record<string, string[]> = { black:["brown"], brown:["black","blonde"], blonde:["brown"], white_gray:[], other:[] };
      if ((CLOSE[a.hairColor]??[]).includes(b.hairColor)) score += 0.06;
      else score -= 0.08; // 확실히 다른 머리색 = 패널티
    }
  } else {
    score += 0.05;
  }

  // Hair length (0.08점)
  const LENS = ["bald","short","medium","long","unknown"];
  const ali = LENS.indexOf(a.hairLength), bli = LENS.indexOf(b.hairLength);
  if (ali === 4 || bli === 4) score += 0.03;
  else {
    const diff = Math.abs(ali - bli);
    if (diff === 0) score += 0.08;
    else if (diff === 1) score += 0.03;
    else score -= 0.05;
  }

  // Beard (0.04점)
  if (a.hasBeard === b.hasBeard) score += 0.04;
  else score -= 0.04;

  // Face shape (0.02점, 보조)
  if (a.faceShape !== "unknown" && b.faceShape !== "unknown") {
    if (a.faceShape === b.faceShape) score += 0.02;
    else score -= 0.01;
  }

  return score;
}

function personSoftMatch(a: PersonFeatures, b: PersonFeatures): boolean {
  return personMatchScore(a, b) >= 0.62;
}

function buildPersonGroups(files: StudioPhotoFile[]): PersonGroup[] {
  const etcFiles    = files.filter(f => f.groupKey === "__ETC__");
  const normalFiles = files.filter(f => f.groupKey !== "__ETC__" && f.groupKey !== "PENDING");
  const keyOrder: string[] = [];
  const groupMap = new Map<string, StudioPhotoFile[]>();
  for (const f of normalFiles) {
    if (!groupMap.has(f.groupKey)) { groupMap.set(f.groupKey, []); keyOrder.push(f.groupKey); }
    groupMap.get(f.groupKey)!.push(f);
  }
  const BLANK_FEATURES: PersonFeatures = { gender:"unknown", ageBand:"unknown", hairColor:"unknown", hairLength:"unknown", hasGlasses:false, hasBeard:false, faceShape:"unknown" };
  const groups: PersonGroup[] = [];
  let idx = 1;
  for (const key of keyOrder) {
    const gFiles = groupMap.get(key)!;
    const first = gFiles[0];
    const folderName = `${String(idx).padStart(2,"0")}_인물${idx}`;
    groups.push({ id:key, label:`인물 ${idx}`, features:first.personFeatures ?? BLANK_FEATURES, sampleThumb:first.thumbUrl ?? "", files:gFiles, suggestedFolderName:folderName, editedFolderName:folderName, index:idx, isEtc:false });
    idx++;
  }
  if (etcFiles.length > 0) {
    groups.unshift({ id:"__ETC__", label:"조명불량", features:BLANK_FEATURES, sampleThumb:etcFiles[0]?.thumbUrl ?? "", files:etcFiles, suggestedFolderName:"00_ETC_조명불량", editedFolderName:"00_ETC_조명불량", index:0, isEtc:true });
  }
  return groups;
}

/* ════════════════════════════════════════════════
   SHARED UI COMPONENTS
═══════════════════════════════════════════════ */
export function Btn({ onClick, disabled, children, variant="primary", style: s }: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger"; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = { height:42, padding:"0 22px", border:"none", borderRadius:10, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.5:1, transition:"opacity .15s" };
  const v = { primary:{background:C.teal,color:"#fff"}, secondary:{background:C.white,color:C.teal,border:`1.5px solid ${C.border}`}, danger:{background:C.red,color:"#fff"} };
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant],...s}}>{children}</button>;
}

export function Card({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",...s}}>{children}</div>;
}

function ProgressBar({ cur, total, msg }: { cur: number; total: number; msg: string }) {
  const pct = total > 0 ? Math.round((cur/total)*100) : 0;
  return (
    <Card>
      <div style={{padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:13,fontWeight:700}}>{cur} / {total}</span>
          <span style={{fontSize:13,fontWeight:900,color:C.teal}}>{pct}%</span>
        </div>
        <div style={{height:8,background:C.border,borderRadius:4,overflow:"hidden",marginBottom:12}}>
          <div style={{height:"100%",width:`${pct}%`,background:C.teal,borderRadius:4,transition:"width .2s"}}/>
        </div>
        <div style={{fontSize:11,color:C.hint,wordBreak:"break-all"}}>{msg}</div>
      </div>
    </Card>
  );
}

function SectionPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:color+"18",borderRadius:20,border:`1px solid ${color}30`}}>
      <span style={{fontSize:11,fontWeight:800,color}}>{label}</span>
      <span style={{fontSize:11,fontWeight:700,color:C.muted}}>{count}장</span>
    </div>
  );
}

export function Toggle({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
      <div>
        <div style={{fontSize:12,fontWeight:700,color:C.txt}}>{label}</div>
        {desc && <div style={{fontSize:10,color:C.hint,marginTop:2,lineHeight:1.5}}>{desc}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{flexShrink:0,width:44,height:24,borderRadius:12,border:"none",cursor:"pointer",background:value?C.teal:C.border,position:"relative",transition:"background .2s",fontFamily:"inherit"}}>
        <span style={{position:"absolute",top:2,left:value?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",display:"block"}}/>
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════
   SESSION PERSISTENCE
═══════════════════════════════════════════════ */
const SESSION_KEY = "photoclinic-sorting-session-v1";

interface SavedSortingSession {
  version: 1 | 2;
  savedAt: string;
  step: number;
  rootDirName: string;
  department: MedicalDepartment;
  gapMinutes: number;
  fastAnalyzeMode: boolean;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  rawSelectMode: "move" | "copy";
  fieldRawCount: number;
  fieldStats: FieldStats | null;
  classificationJobState?: ClassificationJobState;
  boundaryDecisions?: SceneBoundaryDecision[];
  sceneCorrections?: SceneCorrection[];
  sceneSummary: {
    index: number;
    folderName: string;
    editedName: string;
    startTime: number;
    endTime: number;
    fileCount: number;
    sceneType: string | null;
    suggestedName: string | null;
    aiConfidence: number | null;
    aiReason: string | null;
    fileNames?: string[];
    boundaryBefore?: SceneBoundaryDecision;
    approved?: boolean;
  }[];
}

/* ════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
// PHASE 4(사진 분류 Chat-native Workflow, 2026-08-30) — 원래 app/(photo-studio)/photo-sorting/page.tsx의
// 전체 내용을 그대로 옮긴 파일이다(로직 무변경, 기계적 이동). QuoteBuilder.tsx/ContractBuilder.tsx와
// 동일한 mode="page"|"modal" 패턴을 얹어 워크스페이스(Split Layout) 안에서도 재사용한다 —
// 분류 알고리즘(handleFieldSort/handleStudioSort 등)은 컴포넌트 로컬 state에 강하게 결합돼 있어
// 별도 모듈로 추출하지 않고, "같은 컴포넌트를 두 곳에서 마운트"하는 전략을 쓴다.
export default function PhotoSortingWorkspace({
  mode = "page",
  clientId: modalClientId,
  workflowRunId: modalWorkflowRunId,
}: {
  mode?: "page" | "modal" | "embedded";
  clientId?: string;
  workflowRunId?: string;
  resourceId?: string;
  onClose?: () => void;
} = {}) {
  return (
    <Suspense fallback={null}>
      <PhotoSortingInner mode={mode} modalClientId={modalClientId} modalWorkflowRunId={modalWorkflowRunId} />
    </Suspense>
  );
}

function PhotoSortingInner({
  mode = "page",
  modalClientId,
  modalWorkflowRunId,
}: {
  mode?: "page" | "modal" | "embedded";
  modalClientId?: string;
  modalWorkflowRunId?: string;
}) {
  const isModal = mode === "modal";
  const isEmbedded = mode === "embedded";
  const sp = useSearchParams();
  const router = useRouter();
  const clientId = isModal ? (modalClientId ?? "") : (sp.get("clientId") ?? sp.get("client_id") ?? "");
  const workflowRunId = isModal ? (modalWorkflowRunId ?? "") : (sp.get("workflowRunId") ?? "");

  /* ── shared state ── */
  const [photoMode,  setPhotoMode]  = useState<PhotoMode>("field");
  const [step,       setStep]       = useState(0);
  const [rootDir,    setRootDir]    = useState<FileSystemDirectoryHandle | null>(null);
  const [progress,   setProgressState] = useState({ cur:0, total:0, msg:"" });
  const cancelRef = useRef(false);
  // 사진 분류(handleFieldSort)가 다른 페이지로 이동해도 우상단 팝업에 계속 보이게
  // (BackgroundJobsWidget) — 로컬 state는 그대로 두고 전역 스토어에도 같이 반영만 한다.
  // handleFieldSort 안의 기존 setProgress(...) 호출부는 이름이 그대로라 하나도 안 건드려도 된다.
  // (스튜디오 모드 handleStudioSort는 startJob을 안 부르므로 이 미러링은 조용히 no-op된다.)
  const setProgress = useCallback((next: { cur: number; total: number; msg: string }) => {
    setProgressState(next);
    useBackgroundJobsStore.getState().updateJob(PHOTO_CLASSIFY_JOB_ID, next);
  }, []);
  // 마운트 전엔 false — 서버 렌더와 클라이언트 첫 렌더를 동일하게 유지해 hydration mismatch를 피한다
  const [hasFS, setHasFS] = useState(false);
  useEffect(() => { setHasFS("showDirectoryPicker" in window); }, []);

  /* ── field state ── */
  const [department,                 setDepartment]                 = useState<MedicalDepartment>("dermatology");
  const [gapMinutes,                 setGapMinutes]                 = useState(3.5);
  const [fastAnalyzeMode,            setFastAnalyzeMode]            = useState(false);
  const [departmentLogicEnabled,     setDepartmentLogicEnabled]     = useState(true);
  const [aiNamingEnabled,            setAiNamingEnabled]            = useState(false);
  const [qualityAnalysisEnabled,     setQualityAnalysisEnabled]     = useState(false);
  const [profileClassificationEnabled, setProfileClassificationEnabled] = useState(true);
  const [rawSelectMode,              setRawSelectMode]              = useState<"move"|"copy">("move");
  const [fieldScenes,                setFieldScenes]                = useState<FieldScene[]>([]);
  const [fieldRawCount,              setFieldRawCount]              = useState(0);
  const [fieldRawHandles,            setFieldRawHandles]            = useState<{ name: string; handle: FileSystemFileHandle }[]>([]);
  const [fieldJpgBaseDir,            setFieldJpgBaseDir]            = useState<FileSystemDirectoryHandle | null>(null);
  const [fieldRawBaseDir,            setFieldRawBaseDir]            = useState<FileSystemDirectoryHandle | null>(null);
  const [fieldStats,                 setFieldStats]                 = useState<FieldStats | null>(null);
  const [copyLog,                    setCopyLog]                    = useState<string[]>([]);
  const [classificationJobState,     setClassificationJobState]     = useState<ClassificationJobState>("IDLE");
  const [boundaryDecisions,          setBoundaryDecisions]          = useState<SceneBoundaryDecision[]>([]);
  const [sceneCorrections,           setSceneCorrections]           = useState<SceneCorrection[]>([]);
  const [splitPositions,             setSplitPositions]             = useState<Record<number, number>>({});
  const [evaluationMode,             setEvaluationMode]             = useState(false);
  const [groundTruthBoundaries,      setGroundTruthBoundaries]      = useState<number[]>([]);
  const [groundTruthSelection,       setGroundTruthSelection]       = useState(1);
  const [accuracyReport,             setAccuracyReport]             = useState<AccuracyReport | null>(null);
  const classificationAbortRef = useRef<AbortController | null>(null);
  const [savedSession,               setSavedSession]               = useState<SavedSortingSession | null>(null);
  const [mergeCandidates,            setMergeCandidates]            = useState<SceneMergeCandidate[]>([]);
  const [dismissedCandidates,        setDismissedCandidates]        = useState<Set<string>>(new Set());
  const [mergeDecisions,             setMergeDecisions]             = useState<MergeDecision[]>([]);

  /* ── AI 사진 분류 2.0 — Step0의 "AI 자동 분류" 탭 상태(기존 필드 분류 엔진은 그대로,
     이 상태들은 그 엔진에 넘길 동적 weights/threshold만 들고 있다) ── */
  const [classificationUiMode, setClassificationUiMode] = useState<ClassificationUiMode>("ai-auto");
  const [aiWeightProfile,      setAiWeightProfile]      = useState<SceneWeightProfile | null>(null);
  const [aiShootingPattern,    setAiShootingPattern]    = useState<FolderShootingPattern | null>(null);
  const [aiAnalyzing,          setAiAnalyzing]          = useState(false);
  const [aiRefining,           setAiRefining]           = useState(false);
  const [aiRefinementHistory,  setAiRefinementHistory]  = useState<string[]>([]);
  const [aiSceneProposals,     setAiSceneProposals]     = useState<SceneProposal[]>([]);
  const [aiScanFileCount,      setAiScanFileCount]      = useState(0);
  // NL 재조정 시 폴더를 다시 스캔하지 않고 미리보기만 재계산하기 위한 스캔 결과 캐시(ref라 리렌더 유발 안 함)
  const aiScanEntriesRef = useRef<{ name: string; mtime: number; file: File }[]>([]);
  // Olivia Chat이 "분류했어요"라고 말해도 되는 시점을 정직하게 판단하려고(스펙 §37/44) fieldScenes를
  // 그대로 미러링한다 — handleFieldSort는 비동기라 await 직후 클로저의 fieldScenes가 아니라
  // 이 ref로 최신 값을 읽어야 한다.
  const fieldScenesRef = useRef<FieldScene[]>([]);
  useEffect(() => { fieldScenesRef.current = fieldScenes; }, [fieldScenes]);

  /* ── 셀렉 & 매칭 탭 state ── */
  const [selectTabView,          setSelectTabView]          = useState<"guide"|"select">("guide");
  const [inAppSelected,          setInAppSelected]          = useState<Set<string>>(new Set());
  const [selectExpandedScenes,   setSelectExpandedScenes]   = useState<Set<number>>(new Set());

  const [creatingGallery, setCreatingGallery] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState<{ step: string; cur: number; total: number } | null>(null);

  /* ── studio state ── */
  const [studioOpts,          setStudioOpts]          = useState<StudioOptions>({ lightingSensitivity:"medium" });
  const [studioFileMode,      setStudioFileMode]      = useState<"copy"|"move">("copy");
  const [studioFiles,         setStudioFiles]         = useState<StudioPhotoFile[]>([]);
  const [studioGroups,        setStudioGroups]        = useState<StudioGroup[]>([]);
  const [studioRawCount,      setStudioRawCount]      = useState(0);
  const [studioCopyLog,       setStudioCopyLog]       = useState<string[]>([]);
  const [studioStats,         setStudioStats]         = useState<StudioStats | null>(null);
  const [activeGroup,         setActiveGroup]         = useState(0);
  const [studioSubMode,       setStudioSubMode]       = useState<StudioSubMode>("concept");
  const [studioGroupSortMode, setStudioGroupSortMode] = useState<StudioGroupSortMode>("gap_ai");
  const [studioGapMinutes,    setStudioGapMinutes]    = useState(3);
  const [personGroups,   setPersonGroups]   = useState<PersonGroup[]>([]);
  const [activePersonGroup, setActivePersonGroup] = useState(0);

  /* ── session persistence ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as SavedSortingSession;
      if ((data.version === 1 || data.version === 2) && data.step >= 2) setSavedSession(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (step < 2) return;
    try {
      const data: SavedSortingSession = {
        version: 2, savedAt: new Date().toISOString(),
        step, rootDirName: rootDir?.name ?? "",
        department, gapMinutes, fastAnalyzeMode,
        departmentLogicEnabled, aiNamingEnabled, qualityAnalysisEnabled,
        profileClassificationEnabled, rawSelectMode,
        fieldRawCount, fieldStats, classificationJobState, boundaryDecisions, sceneCorrections,
        sceneSummary: fieldScenes.map(s => ({
          index: s.index, folderName: s.folderName, editedName: s.editedName,
          startTime: s.startTime, endTime: s.endTime, fileCount: s.fileCount,
          sceneType: s.sceneType, suggestedName: s.suggestedName,
          aiConfidence: s.aiConfidence, aiReason: s.aiReason,
          fileNames: s.files.map((file) => file.name), boundaryBefore: s.boundaryBefore, approved: s.approved,
        })),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch {}
  }, [step, rootDir, department, gapMinutes, fastAnalyzeMode, departmentLogicEnabled, aiNamingEnabled, qualityAnalysisEnabled, profileClassificationEnabled, rawSelectMode, fieldRawCount, fieldStats, fieldScenes, classificationJobState, boundaryDecisions, sceneCorrections]);

  const clearSession = () => {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    setSavedSession(null);
  };

  const handleRestore = async (saved: SavedSortingSession) => {
    try {
      const h = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      const jpgBase = await (h as FileSystemDirectoryHandle).getDirectoryHandle("JPG").catch(() => null);
      const rawBase = await (h as FileSystemDirectoryHandle).getDirectoryHandle("RAW").catch(() => null);

      setRootDir(h);
      setDepartment(saved.department);
      setGapMinutes(saved.gapMinutes);
      setFastAnalyzeMode(saved.fastAnalyzeMode);
      setDepartmentLogicEnabled(saved.departmentLogicEnabled);
      setAiNamingEnabled(saved.aiNamingEnabled);
      setQualityAnalysisEnabled(saved.qualityAnalysisEnabled);
      setProfileClassificationEnabled(saved.profileClassificationEnabled);
      setRawSelectMode(saved.rawSelectMode);
      setFieldRawCount(saved.fieldRawCount);
      setClassificationJobState(saved.classificationJobState ?? "WAITING_REVIEW");
      setBoundaryDecisions(saved.boundaryDecisions ?? []);
      setSceneCorrections(saved.sceneCorrections ?? []);
      if (rawBase) setFieldRawBaseDir(rawBase);
      setFieldStats(saved.fieldStats);

      // JPG/ 폴더가 있으면 씬까지 복원, 없으면 설정(step 0)으로만 복원
      if (jpgBase) {
        setFieldJpgBaseDir(jpgBase);

        // Reconstruct scenes by re-scanning JPG/SceneXX/ directories
        if (saved.sceneSummary.length > 0) {
          const scenes: FieldScene[] = [];
          for (const s of saved.sceneSummary) {
            const sceneDir = await jpgBase.getDirectoryHandle(s.folderName).catch(() => null);
            const files: SceneFile[] = [];
            if (sceneDir) {
              for await (const [fname, fh] of (sceneDir as any).entries()) {
                const ext = (fname as string).split(".").pop()?.toLowerCase() ?? "";
                if ((fh as FileSystemHandle).kind === "file" && ["jpg","jpeg"].includes(ext)) {
                  files.push({ name: fname as string, basename: (fname as string).replace(/\.[^.]+$/, ""), handle: fh as FileSystemFileHandle, mtime: s.startTime });
                }
              }
              files.sort((a,b) => a.name.localeCompare(b.name));
            }
            scenes.push({
              index: s.index, folderName: s.folderName, editedName: s.editedName,
              startTime: s.startTime, endTime: s.endTime,
              fileCount: files.length || s.fileCount, files, sceneDir,
              sceneType: (s.sceneType as any) ?? null, suggestedName: s.suggestedName,
              aiConfidence: s.aiConfidence, aiReason: s.aiReason,
              subScenes: [], profileCount: 0, qualityRejectCount: 0, nameLoading: false,
              boundaryBefore: s.boundaryBefore, approved: s.approved,
            });
          }
          setFieldScenes(scenes);
        }

        setSavedSession(null);
        const targetStep = saved.step === 3 ? 2 : saved.step;
        setStep(targetStep);
      } else {
        // v2 정밀 분류는 승인 전 파일을 이동하지 않으므로 원본 폴더에서 Scene 계획을 복원한다.
        if (saved.version === 2 && saved.sceneSummary.every((scene) => Array.isArray(scene.fileNames))) {
          const handles = new Map<string, { handle: FileSystemFileHandle; file: File }>();
          const restoredRaw: { name: string; handle: FileSystemFileHandle }[] = [];
          for await (const [name, entry] of (h as any).entries()) {
            if (entry.kind !== "file") continue;
            const extension = String(name).split(".").pop()?.toLowerCase() ?? "";
            if (RAW_EXTS.has(extension)) restoredRaw.push({ name: String(name), handle: entry as FileSystemFileHandle });
            if (JPG_EXTS.has(extension)) handles.set(String(name), { handle: entry as FileSystemFileHandle, file: await (entry as FileSystemFileHandle).getFile() });
          }
          const restoredScenes: FieldScene[] = saved.sceneSummary.map((scene) => {
            const files: SceneFile[] = (scene.fileNames ?? []).flatMap((name) => {
              const found = handles.get(name);
              return found ? [{ name, basename: name.replace(/\.[^.]+$/, ""), handle: found.handle, mtime: found.file.lastModified, thumbUrl: null }] : [];
            });
            return {
              index: scene.index, folderName: scene.folderName, editedName: scene.editedName,
              startTime: scene.startTime, endTime: scene.endTime, fileCount: files.length, files, sceneDir: null,
              sceneType: (scene.sceneType as any) ?? null, suggestedName: scene.suggestedName,
              aiConfidence: scene.aiConfidence, aiReason: scene.aiReason, subScenes: [], profileCount: 0,
              qualityRejectCount: 0, nameLoading: false, boundaryBefore: scene.boundaryBefore, approved: scene.approved,
            };
          });
          setFieldRawHandles(restoredRaw);
          setFieldRawCount(restoredRaw.length);
          setFieldScenes(restoredScenes);
          setSavedSession(null);
          setStep(2);
        } else {
          setSavedSession(null);
          setStep(0);
        }
      }
    } catch {}
  };

  const pickDir = async () => {
    try { const h = await (window as any).showDirectoryPicker({ mode:"readwrite" }); setRootDir(h); }
    catch (_) {}
  };

  // AI 사진 분류 2.0 — 폴더를 고르면 실제 정밀 분류(handleFieldSort, Vision 호출 포함)를 돌리기
  // 전에 먼저 가볍게 "이번 촬영엔 뭐가 중요한지" 물어본다. 이미지 전송 없음(메타데이터+이미
  // 캐시된 시각 feature만) — 새 Vision 호출·새 feature 추출 전부 안 함(스펙 §6/§29/§30).
  // 결과(weights/threshold)는 handleFieldSort가 그대로 받아쓸 뿐, 엔진 자체는 그대로다.
  const runAiFolderAnalysis = useCallback(async () => {
    if (!rootDir) return;
    setAiAnalyzing(true);
    setAiShootingPattern(null);
    setAiSceneProposals([]);
    try {
      const entries: { name: string; mtime: number; file: File }[] = [];
      for await (const [name, handle] of (rootDir as any).entries()) {
        if (handle.kind !== "file") continue;
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        if (!JPG_EXTS.has(ext)) continue;
        const file = await (handle as FileSystemFileHandle).getFile();
        const exif = await readPhotoTimestamp(file);
        entries.push({ name, mtime: exif?.timestamp ?? file.lastModified, file });
      }
      entries.sort((a, b) => a.mtime - b.mtime);
      aiScanEntriesRef.current = entries;
      setAiScanFileCount(entries.length);
      if (!entries.length) return;

      const fingerprint = folderFingerprint(rootDir.name, entries.map((entry) => ({ name: entry.name, size: entry.file.size, lastModified: entry.file.lastModified })));
      const cachedPattern = await getCachedPattern<FolderShootingPattern>(fingerprint);
      if (cachedPattern) {
        setAiShootingPattern(cachedPattern);
        setAiWeightProfile(cachedPattern.profile);
        setAiSceneProposals(await buildQuickProposals(entries, cachedPattern.profile.absoluteTimeGapMinutes ?? gapMinutes));
        return;
      }

      const cachedFeatures = (await Promise.all(
        entries.map((entry) => getCachedFeature(featureCacheKey(rootDir.name, entry.file))),
      )).filter((feature): feature is LocalVisualFeatures => Boolean(feature));
      const stats = computeFolderStats(entries.map((entry) => entry.mtime), cachedFeatures, 1);

      const response = await fetch("/api/photo-classification-pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department, stats }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "폴더 분석 실패");
      const pattern = data.pattern as FolderShootingPattern;
      setAiShootingPattern(pattern);
      setAiWeightProfile(pattern.profile);
      await setCachedPattern(fingerprint, pattern);
      setAiSceneProposals(await buildQuickProposals(entries, pattern.profile.absoluteTimeGapMinutes ?? gapMinutes));
    } catch (error) {
      console.error("[ai-folder-analysis]", error);
    } finally {
      setAiAnalyzing(false);
    }
  }, [rootDir, department, gapMinutes]);

  useEffect(() => {
    if (!rootDir || photoMode !== "field" || classificationUiMode !== "ai-auto") return;
    runAiFolderAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootDir, photoMode, classificationUiMode]);

  // 자연어 재조정 — 화이트리스트 필드(ClassificationOverrides)만 파싱해 현재 profile에 머지한다
  // (스펙 §20, 임의 코드 실행 없음). Step0에서 아직 분류 전이면 미리보기만 갱신하고, 이미 결과를
  // 검토 중이면(step>=1) handleFieldSort를 다시 돌린다 — 체크포인트 캐시가 이전 AI 분석 결과를
  // weights만 바꿔 재사용하므로(boundary-score.ts) 이 재실행은 새 Vision 호출을 만들지 않는다.
  const submitAiNlRequest = useCallback(async (message: string) => {
    setAiRefining(true);
    try {
      const response = await fetch("/api/photo-classification-nl-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context: aiRefinementHistory.length ? aiRefinementHistory.join(" / ") : undefined }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "요청을 이해하지 못했습니다.");
      const base = aiWeightProfile ?? DEFAULT_WEIGHT_PROFILE;
      const overrides = data.overrides as ClassificationOverrides;
      let next = applyOverrides(base, overrides);
      if (data.granularity === "coarser" || data.granularity === "finer") next = adjustGranularity(next, data.granularity);
      setAiWeightProfile(next);
      setAiRefinementHistory((previous) => [...previous, message]);
      if (aiScanEntriesRef.current.length) {
        setAiSceneProposals(await buildQuickProposals(aiScanEntriesRef.current, next.absoluteTimeGapMinutes ?? gapMinutes));
      }
      if (step >= 1) await handleFieldSort();
    } catch (error) {
      console.error("[ai-nl-override]", error);
    } finally {
      setAiRefining(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiWeightProfile, aiRefinementHistory, gapMinutes, step]);

  const stepLabels = photoMode === "studio"
    ? (studioSubMode === "group" ? STUDIO_GROUP_STEPS : STUDIO_STEPS)
    : FIELD_STEPS;

  /* ════════════════════════════════════════════
     FIELD-MODE HANDLERS
  ═══════════════════════════════════════════ */
  const handleFieldSort = useCallback(async () => {
    if (!rootDir) return;
    setStep(1); cancelRef.current = false; setCopyLog([]); setBoundaryDecisions([]); setSceneCorrections([]);
    useBackgroundJobsStore.getState().startJob({
      id: PHOTO_CLASSIFY_JOB_ID, label: "사진 분류 중",
      cur: 0, total: 0, status: "running",
      returnPath: "/photo-sorting?mode=classification", cancelRef,
    });
    classificationAbortRef.current?.abort();
    const abortController = new AbortController();
    classificationAbortRef.current = abortController;
    // AI 사진 분류 2.0 — aiWeightProfile이 있으면(=Step0에서 AI 자동 분류로 폴더를 분석했으면)
    // 하드갭 분/threshold를 그 프로필로 덮어쓴다. 없으면(고급 설정 모드거나 아직 분석 전) 기존
    // 그대로 gapMinutes/부서 프리셋만 사용 — 동작이 100% 예전과 같다(회귀 없음).
    const effectiveGapMinutes = aiWeightProfile?.absoluteTimeGapMinutes ?? gapMinutes;
    const preciseSettings = {
      ...getClassificationSettings(department === "dermatology" ? "dermatology" : "default", "precise"),
      hardGapMinutes: effectiveGapMinutes,
      ...(aiWeightProfile ? { splitThreshold: aiWeightProfile.splitThreshold, reviewThreshold: aiWeightProfile.reviewThreshold } : {}),
    };

    // ① 스캔
    const rawFiles: { name: string; handle: FileSystemFileHandle }[] = [];
    const jpgEntries: { name: string; handle: FileSystemFileHandle; file: File; mtime: number; timestampSource: TimestampSource; warning?: string }[] = [];
    setClassificationJobState("SCANNING_FILES");
    setProgress({ cur:0, total:0, msg:"폴더 스캔 중..." });
    let lastUpdate = Date.now();

    for await (const [name, handle] of (rootDir as any).entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (RAW_EXTS.has(ext)) {
        rawFiles.push({ name, handle: handle as FileSystemFileHandle });
      } else if (JPG_EXTS.has(ext)) {
        const file = await (handle as FileSystemFileHandle).getFile();
        if (fastAnalyzeMode) {
          // 빠른 모드: lastModified 사용, EXIF 건너뜀
          jpgEntries.push({ name, handle: handle as FileSystemFileHandle, file, mtime: file.lastModified, timestampSource: "mtime" });
        } else {
          // 정밀 모드: EXIF 읽기
          setClassificationJobState("READING_EXIF");
          const exif = await readPhotoTimestamp(file);
          jpgEntries.push({
            name,
            handle: handle as FileSystemFileHandle,
            file,
            mtime: exif?.timestamp ?? file.lastModified,
            timestampSource: exif?.source ?? "mtime",
            warning: exif ? undefined : "EXIF 촬영시간 없음 — mtime 사용",
          });
        }
        if (Date.now() - lastUpdate > 300) {
          setProgress({ cur:0, total:0, msg:`스캔: ${name}` });
          lastUpdate = Date.now();
        }
      }
    }
    setFieldRawCount(rawFiles.length);
    setFieldRawHandles(rawFiles);

    // ③ JPG → 시간순 정렬 → Scene 분리
    const sortedEntries = sortTimestampedFiles(jpgEntries);
    jpgEntries.splice(0, jpgEntries.length, ...sortedEntries);
    const gapMs = effectiveGapMinutes * 60 * 1000;
    const groups: typeof jpgEntries[] = jpgEntries.length > 0 ? [[jpgEntries[0]]] : [];
    for (let i = 1; i < jpgEntries.length; i++) {
      if (jpgEntries[i].mtime - jpgEntries[i-1].mtime > gapMs) groups.push([jpgEntries[i]]);
      else groups[groups.length-1].push(jpgEntries[i]);
    }

    const total = jpgEntries.length; let done = 0;
    const newScenes: FieldScene[] = [];

    if (fastAnalyzeMode) {
      // ═══ 빠른 분석 모드: 파일을 이동하지 않고 Scene 계획만 생성 ═══
      for (let si = 0; si < groups.length; si++) {
        if (cancelRef.current) break;
        const sceneNum = String(si+1).padStart(2,"0");
        const folderName = `Scene${sceneNum}`;
        const sceneFiles: SceneFile[] = [];

        for (const entry of groups[si]) {
          if (cancelRef.current) break;
          done++;
          if (done % 20 === 0 || Date.now() - lastUpdate > 300) {
            setProgress({ cur:done, total, msg:`씬 계획 생성: ${folderName} (${done}/${total})` });
            lastUpdate = Date.now();
          }
          // 파일 이동 없음, 썸네일 생성 없음
          sceneFiles.push({
            name: entry.name,
            basename: entry.name.replace(/\.[^.]+$/, ""),
            handle: entry.handle,
            mtime: entry.mtime,
            thumbUrl: null,
          });
        }

        newScenes.push({
          index: si+1, folderName, editedName: folderName,
          startTime: groups[si][0].mtime,
          endTime: groups[si][groups[si].length-1].mtime,
          fileCount: sceneFiles.length, files: sceneFiles, sceneDir: null,
          sceneType: null, suggestedName: null, aiConfidence: null, aiReason: null,
          subScenes: [], profileCount: 0, qualityRejectCount: 0,
          nameLoading: aiNamingEnabled || departmentLogicEnabled,
        });
      }
      setCopyLog([
        `✅ 빠른 분석 완료 — JPG ${total}장 / RAW ${rawFiles.length}개 / Scene ${newScenes.length}개`,
        `📋 파일 이동 없음 — Scene 계획만 생성됨 (RAW 원본 위치 유지)`,
        `👆 씬 검토 후 [폴더 정리 실행]을 눌러 실제 파일을 정리하세요`,
      ]);

    } else {
      // ═══ 정밀 분류 모드: 승인 전에는 파일을 이동하지 않음 ═══
      setClassificationJobState("EXTRACTING_FEATURES");
      setProgress({ cur: 0, total, msg: "저비용 시각 특징 추출 준비 중..." });
      const cacheKeys = jpgEntries.map((entry) => featureCacheKey(rootDir.name, entry.file));
      const cached = await Promise.all(cacheKeys.map((key) => getCachedFeature(key)));
      const missingIndices = cached.flatMap((feature, index) => feature ? [] : [index]);
      const missingFiles = missingIndices.map((index) => jpgEntries[index].file);
      const featureStartedAt = Date.now();
      const extracted = await extractFeaturesWithWorkers({
        files: missingFiles,
        concurrency: preciseSettings.maxConcurrentJobs,
        signal: abortController.signal,
        onProgress: (completed) => setProgress({
          cur: cached.filter(Boolean).length + completed,
          total,
          msg: `시각 특징 추출 ${cached.filter(Boolean).length + completed}/${total}${estimatedRemaining(completed, missingFiles.length, featureStartedAt)}`,
        }),
      });
      const features = [...cached] as Array<LocalVisualFeatures | null>;
      await Promise.all(extracted.map(async (result, offset) => {
        const originalIndex = missingIndices[offset];
        features[originalIndex] = result.features;
        if (result.features) await setCachedFeature(cacheKeys[originalIndex], result.features);
      }));
      const blankFeature: LocalVisualFeatures = { dHash: "0".repeat(64), colorHistogram: new Array(64).fill(0), backgroundGrid: new Array(24).fill(0), compositionGrid: new Array(16).fill(0), brightness: 0 };
      const firstValid = features.find((feature): feature is LocalVisualFeatures => Boolean(feature)) ?? blankFeature;
      const safeFeatures = features.map((feature, index) => feature ?? features[index - 1] ?? firstValid);
      const failedImages = extracted.filter((result) => !result.features).length;

      if (abortController.signal.aborted || cancelRef.current) {
        setClassificationJobState("CANCELLED");
        setCopyLog((previous) => [...previous, "⏸ 정밀 분류가 중단되었습니다. 원본 파일은 이동되지 않았습니다."]);
        useBackgroundJobsStore.getState().finishJob(PHOTO_CLASSIFY_JOB_ID, "cancelled");
        return;
      }

      setClassificationJobState("DETECTING_BOUNDARIES");
      const candidates = buildVisualBoundaryCandidates(jpgEntries, safeFeatures, preciseSettings);

      // ── 2차 Scene 분석: 하드갭 기준 임시 Scene(구간) 내부에서 촬영목적 전환 지점을 찾는다.
      // buildVisualBoundaryCandidates는 시각적 diff가 큰 지점만 후보로 잡으므로, 상담→시술처럼
      // 같은 공간·비슷한 톤으로 이어지는 목적 전환은 후보 자체가 안 생겨 놓치는 문제가 있었다.
      // 여기서는 구간을 촘촘히(6장 고정이 아니라 크기 비례) 샘플링해 목적 라벨을 매기고,
      // 라벨이 바뀌는 지점을 새 경계 후보로 추가한다 — 정확한 사진 단위 위치는 기존 검증 루프가
      // (아래 mapWithConcurrency) 3장 윈도우 AI 검증으로 다시 확인하므로 근사치면 충분하다.
      const purposeSegments = buildCandidateSegments(jpgEntries, preciseSettings.hardGapMinutes);
      const existingBoundaryIndexes = new Set(candidates.map((candidate) => candidate.boundaryIndex));
      setProgress({ cur: 0, total: purposeSegments.length, msg: "촬영목적 전환 스캔 준비" });
      let scannedSegments = 0;
      for (const segment of purposeSegments) {
        scannedSegments += 1;
        const segmentLength = segment.endIndex - segment.startIndex + 1;
        if (segmentLength < 8 || cancelRef.current || abortController.signal.aborted) continue;
        setProgress({ cur: scannedSegments, total: purposeSegments.length, msg: `촬영목적 전환 스캔 ${scannedSegments}/${purposeSegments.length}` });
        const localIndices = buildPurposeSampleIndices(segmentLength);
        try {
          const images = await Promise.all(localIndices.map(async (localIndex) => {
            const entry = jpgEntries[segment.startIndex + localIndex];
            return { fileName: entry.name, base64: await getApiThumb(entry.file), index: localIndex };
          }));
          const response = await withTimeout(fetch("/api/photo-scene-purpose-scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ department, images }),
            signal: abortController.signal,
          }), 60_000, "AI 목적 스캔");
          const data = await response.json();
          if (!response.ok || !data.ok) continue;
          const samples = (data.labels ?? []) as { index: number; purpose: HybridSceneType }[];
          const localTransitions = findPurposeTransitions(samples);
          for (const localTransition of localTransitions) {
            const globalIndex = segment.startIndex + localTransition;
            if (globalIndex <= 0 || globalIndex >= jpgEntries.length || existingBoundaryIndexes.has(globalIndex)) continue;
            existingBoundaryIndexes.add(globalIndex);
            const timeGapMs = Math.max(0, jpgEntries[globalIndex].mtime - jpgEntries[globalIndex - 1].mtime);
            candidates.push({ boundaryIndex: globalIndex, timeGapMs, visualChangeScore: 0, hardGap: false, requiresAi: true });
          }
        } catch {
          // 목적 스캔 실패는 치명적이지 않음 — 시각적 경계 후보만으로 계속 진행
        }
      }
      candidates.sort((left, right) => left.boundaryIndex - right.boundaryIndex);
      setProgress({ cur: 0, total: candidates.length, msg: `경계 후보 ${candidates.length}개 분석 준비(목적 전환 포함)` });

      const analyzeBoundary = async (boundaryIndex: number, windowSize: number, useHighModel: boolean): Promise<SceneFrameAnalysis> => {
        const beforeEntries = jpgEntries.slice(Math.max(0, boundaryIndex - windowSize), boundaryIndex);
        const afterEntries = jpgEntries.slice(boundaryIndex, Math.min(jpgEntries.length, boundaryIndex + windowSize));
        const [before, after] = await Promise.all([
          Promise.all(beforeEntries.map(async (entry) => ({ fileName: entry.name, base64: await getBoundaryApiImage(entry.file) }))),
          Promise.all(afterEntries.map(async (entry) => ({ fileName: entry.name, base64: await getBoundaryApiImage(entry.file) }))),
        ]);
        let lastError = "AI 경계 분석 실패";
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await withTimeout(fetch("/api/photo-scene-boundary-analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ department, boundaryIndex, before, after, options: { useHighModel } }),
              signal: abortController.signal,
            }), 60_000, "AI 경계 분석");
            const data = await response.json();
            if (response.ok && data.ok && data.analysis) return data.analysis as SceneFrameAnalysis;
            lastError = data.error ?? lastError;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
          if (attempt === 0 && !abortController.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error(lastError);
      };

      setClassificationJobState("VERIFYING_BOUNDARIES");
      const checkpointId = `${rootDir.name}:${department}:${effectiveGapMinutes}:precise-v2`;
      const checkpoint = await getClassificationCheckpoint<{ decisions: Record<string, SceneBoundaryDecision> }>(checkpointId);
      const checkpointDecisions: Record<string, SceneBoundaryDecision> = { ...(checkpoint?.decisions ?? {}) };
      const boundaryStartedAt = Date.now();
      const weights = aiWeightProfile?.weights;
      let verified = 0;
      const rawDecisions = await mapWithConcurrency(candidates, preciseSettings.maxConcurrentAiJobs, async (candidate) => {
        const beforeFileName = jpgEntries[candidate.boundaryIndex - 1]?.name ?? "";
        const afterFileName = jpgEntries[candidate.boundaryIndex]?.name ?? "";
        const checkpointKey = `${beforeFileName}→${afterFileName}`;
        if (checkpointDecisions[checkpointKey]) {
          verified += 1;
          setProgress({ cur: verified, total: candidates.length, msg: `경계 검증 복원 ${verified}/${candidates.length}${estimatedRemaining(verified, candidates.length, boundaryStartedAt)}` });
          const cachedDecision = checkpointDecisions[checkpointKey];
          // weights가 있으면(=AI 자동 분류 프로필 적용 중) Vision을 다시 부르지 않고 캐시된
          // aiAnalysis에 새 weights만 다시 적용한다 — 자연어로 가중치만 바꿨을 때 즉시 반영되면서도
          // 새 API 호출은 0번(스펙 §29/30). weights가 없으면(고급 설정) 예전처럼 그대로 반환.
          return weights
            ? decideBoundary({ candidate, analysis: cachedDecision.aiAnalysis ?? null, settings: preciseSettings, beforeFileName, afterFileName, weights })
            : cachedDecision;
        }
        if (candidate.hardGap) {
          verified += 1;
          setProgress({ cur: verified, total: candidates.length, msg: `경계 검증 ${verified}/${candidates.length}${estimatedRemaining(verified, candidates.length, boundaryStartedAt)}` });
          const hardDecision = decideBoundary({ candidate, analysis: null, settings: preciseSettings, beforeFileName, afterFileName, weights });
          checkpointDecisions[checkpointKey] = hardDecision;
          await setClassificationCheckpoint(checkpointId, { decisions: checkpointDecisions });
          return hardDecision;
        }
        try {
          let analysis = await analyzeBoundary(candidate.boundaryIndex, 3, false);
          let decision = decideBoundary({ candidate, analysis, settings: preciseSettings, beforeFileName, afterFileName, weights });
          if (decision.decision === "review") {
            analysis = await analyzeBoundary(candidate.boundaryIndex, 5, true);
            decision = decideBoundary({ candidate, analysis, settings: preciseSettings, beforeFileName, afterFileName, weights });
          }
          checkpointDecisions[checkpointKey] = decision;
          await setClassificationCheckpoint(checkpointId, { decisions: checkpointDecisions });
          return decision;
        } catch {
          const fallbackDecision = decideBoundary({ candidate, analysis: null, settings: preciseSettings, beforeFileName, afterFileName, aiFailed: true, weights });
          checkpointDecisions[checkpointKey] = fallbackDecision;
          await setClassificationCheckpoint(checkpointId, { decisions: checkpointDecisions });
          return fallbackDecision;
        } finally {
          verified += 1;
          setProgress({ cur: verified, total: candidates.length, msg: `경계 검증 ${verified}/${candidates.length}${estimatedRemaining(verified, candidates.length, boundaryStartedAt)}` });
        }
      });
      const stabilized = stabilizeBoundaries(rawDecisions, total, preciseSettings.minimumSceneImages);
      setBoundaryDecisions(stabilized);

      setClassificationJobState("CREATING_SCENES");
      const sceneFiles: SceneFile[] = jpgEntries.map((entry, index) => ({
        name: entry.name,
        basename: entry.name.replace(/\.[^.]+$/, ""),
        handle: entry.handle,
        mtime: entry.mtime,
        timestampSource: entry.timestampSource,
        thumbUrl: null,
        visualFeatures: safeFeatures[index],
      }));
      const preciseScenes = buildFieldScenesFromBoundaries(sceneFiles, stabilized);
      await mapWithConcurrency(preciseScenes, 3, async (scene) => {
        const thumbIndexes = Array.from(new Set([0, scene.files.length - 1]));
        await Promise.all(thumbIndexes.map(async (index) => {
          try { scene.files[index].thumbUrl = await loadThumb(await scene.files[index].handle.getFile(), 160); } catch {}
        }));
        return scene;
      });
      newScenes.push(...preciseScenes);
      const fallbackCount = jpgEntries.filter((entry) => entry.timestampSource === "mtime").length;
      setCopyLog([
        `✅ 하이브리드 분류 완료 — JPG ${total}장 / RAW ${rawFiles.length}개 / Scene ${newScenes.length}개`,
        `🧭 경계 후보 ${candidates.length}개 / AI 검토 필요 ${stabilized.filter((decision) => decision.needsReview).length}개`,
        `🕒 EXIF 없음·mtime 대체 ${fallbackCount}장 / 손상·특징 실패 ${failedImages}장`,
        `🔒 승인 전 파일 이동 없음 — 씬 검토 후 폴더 정리를 실행하세요`,
      ]);
      setProgress({ cur: total, total, msg: "하이브리드 Scene 계획 생성 완료" });
      setClassificationJobState("WAITING_REVIEW");
    }

    setFieldScenes(newScenes);
    setStep(2);
    useBackgroundJobsStore.getState().finishJob(PHOTO_CLASSIFY_JOB_ID, "done");

    // PHASE 4(2026-08-30) — 채팅/OS 창에서 시작했을 때만(isModal || isEmbedded) 결과 요약을
    // 채팅에 남긴다. 실제 newScenes/jpgEntries 결과가 나온 뒤에만 부르므로 "성공했다"는 거짓
    // 보고가 아니다(스펙 §44).
    if (isModal || isEmbedded) {
      const needsReviewCount = newScenes.filter((scene) => scene.boundaryBefore?.needsReview).length;
      const summary = `사진 분류 완료\n\n총 사진 ${total}장\n분류 Scene ${newScenes.length}개${needsReviewCount > 0 ? `\n확인 필요 ${needsReviewCount}개` : ""}`;
      useOliviaConversationStore.getState().appendMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: summary,
        blocks: [{ type: "text", text: summary }],
        createdAt: new Date().toISOString(),
        status: "complete",
      });
    }

    // ⑤ 백그라운드: AI 씬 분석 (옵션)
    if (fastAnalyzeMode && (aiNamingEnabled || departmentLogicEnabled) && newScenes.length > 0) {
      runSceneAiAnalysis(newScenes);
    }
  }, [rootDir, gapMinutes, aiNamingEnabled, departmentLogicEnabled, department, fastAnalyzeMode, isModal, isEmbedded, aiWeightProfile]);

  // 피부과 2차 분리: 강한 전환 신호 감지
  const isDermatologyStrongTransition = (
    prevType: string, nextType: string,
    prevPosture?: string, nextPosture?: string,
    prevHandpiece?: boolean, nextHandpiece?: boolean,
    prevDevice?: boolean, nextDevice?: boolean,
  ): boolean => {
    const consultTypes = new Set(["doctor_consultation", "manager_consultation", "skin_care"]);
    const treatTypes   = new Set(["device_treatment", "lifting_laser_treatment", "laser_treatment", "injection_treatment"]);
    if (consultTypes.has(prevType) && treatTypes.has(nextType)) return true;
    if (prevPosture === "seated" && nextPosture === "lying_down") return true;
    if (!prevHandpiece && nextHandpiece) return true;
    if (!prevDevice && nextDevice) return true;
    return false;
  };

  const runSceneAiAnalysis = async (scenes: FieldScene[]) => {
    const updated = scenes.map(s => ({...s}));
    // 피부과 2차 분리를 위한 AI 응답 캐시
    const aiResults: Record<number, { sceneType: string; patientPosture?: string; hasHandpiece?: boolean; hasTreatmentDevice?: boolean; confidence: number }> = {};

    for (let i = 0; i < updated.length; i++) {
      try {
        const files = updated[i].files;
        const n = files.length;
        const idxSet = new Set([0, Math.min(1,n-1), Math.floor(n/2), Math.min(Math.floor(n/2)+1,n-1), Math.max(0,n-2), n-1]);
        const images: { fileName: string; base64: string }[] = [];
        for (const idx of idxSet) {
          try {
            const f = await files[idx].handle.getFile();
            images.push({ fileName: files[idx].name, base64: await getApiThumb(f) });
          } catch {}
          if (images.length >= 6) break;
        }
        const sceneId = updated[i].folderName;
        const data = await withTimeout((async () => {
          const res = await fetch("/api/photo-scene-analyze", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ department, sceneId, images, options: { useHighModel: false } }),
          });
          return res.json();
        })(), 45000, "AI 씬 분석");
        if (data.ok) {
          const num = String(updated[i].index).padStart(2,"0");
          const suggested = aiNamingEnabled && data.suggestedFolderName
            ? `Scene${num}_${data.suggestedFolderName}` : null;
          updated[i] = {
            ...updated[i],
            sceneType: data.sceneType ?? null,
            suggestedName: suggested,
            aiConfidence: data.confidence ?? null,
            aiReason: data.reason ?? null,
            editedName: aiNamingEnabled && suggested ? suggested : updated[i].editedName,
            nameLoading: false,
            aiPatientPosture: data.patientPosture ?? null,
            aiHasHandpiece: data.hasHandpiece ?? null,
            aiHasTreatmentDevice: data.hasTreatmentDevice ?? null,
            aiHasTreatmentBed: data.hasTreatmentBed ?? null,
            aiHasConsultationDesk: data.hasConsultationDesk ?? null,
          };
          aiResults[i] = {
            sceneType: data.sceneType ?? "etc",
            patientPosture: data.patientPosture,
            hasHandpiece: data.hasHandpiece,
            hasTreatmentDevice: data.hasTreatmentDevice,
            confidence: data.confidence ?? 0,
          };
        } else {
          updated[i] = { ...updated[i], nameLoading: false };
        }
      } catch {
        updated[i] = { ...updated[i], nameLoading: false };
      }
      setFieldScenes([...updated]);
    }

    // 피부과 2차 분리 후보 감지
    if (department === "dermatology" && Object.keys(aiResults).length >= 2) {
      const keys = Object.keys(aiResults).map(Number).sort((a,b)=>a-b);
      for (let k = 1; k < keys.length; k++) {
        const prev = aiResults[keys[k-1]];
        const curr = aiResults[keys[k]];
        if (!prev || !curr) continue;
        const isStrong = isDermatologyStrongTransition(
          prev.sceneType, curr.sceneType,
          prev.patientPosture, curr.patientPosture,
          prev.hasHandpiece, curr.hasHandpiece,
          prev.hasTreatmentDevice, curr.hasTreatmentDevice,
        );
        if (isStrong && curr.confidence >= 0.72) {
          const sceneIdx = keys[k];
          updated[sceneIdx] = {
            ...updated[sceneIdx],
            aiReason: `⚠️ 2차 분리 후보: 이전 씬(${updated[keys[k-1]].editedName})과 장면 전환 감지 — ${updated[sceneIdx].aiReason ?? ""}`,
          };
        }
      }
      setFieldScenes([...updated]);
    }

    // 병합/분리 후보 생성 (전 진료과 적용)
    if (updated.length >= 2) {
      const snapshots = updated.map(sc => ({
        folderName: sc.folderName,
        editedName: sc.editedName,
        sceneType: sc.sceneType ?? "",
        patientPosture: sc.aiPatientPosture,
        hasHandpiece: sc.aiHasHandpiece,
        hasTreatmentDevice: sc.aiHasTreatmentDevice,
        hasTreatmentBed: sc.aiHasTreatmentBed,
        hasConsultationDesk: sc.aiHasConsultationDesk,
      }));
      const candidates = buildMergeCandidates(snapshots, department);
      setMergeCandidates(candidates);
      setDismissedCandidates(new Set());
      setMergeDecisions([]);
    }
  };

  const mergeFieldScenes = useCallback(async (i: number, j: number, candidateId?: string) => {
    const si = fieldScenes[i];
    const sj = fieldScenes[j];

    // 병합 결정 기록
    if (candidateId) {
      const cand = mergeCandidates.find(c => c.id === candidateId);
      if (cand) {
        setMergeDecisions(prev => [...prev, {
          candidateId: cand.id,
          userAction: "merge",
          fromFolderName: cand.fromFolderName,
          toFolderName: cand.toFolderName,
          fromSceneType: cand.fromSceneType,
          toSceneType: cand.toSceneType,
          mergeScore: cand.mergeScore,
          matchedSignals: cand.matchedSignals,
          blockedSignals: cand.blockedSignals,
          recommendedAction: cand.recommendedAction,
        }]);
      }
    }

    // 병합된 두 씬과 관련된 candidate를 모두 dismiss (stale 방지)
    const affectedNames = new Set([si.folderName, sj.folderName]);
    setDismissedCandidates(prev => {
      const next = new Set([...prev]);
      for (const cand of mergeCandidates) {
        if (affectedNames.has(cand.fromFolderName) || affectedNames.has(cand.toFolderName)) {
          next.add(cand.id);
        }
      }
      return next;
    });

    if (!si.sceneDir || !sj.sceneDir) {
      // 승인 전 검토 모드: 메모리상 Scene 계획만 변경
      if (sj.boundaryBefore) {
        setSceneCorrections((previous) => [...previous, {
          projectId: rootDir?.name ?? "local",
          boundaryIndex: sj.boundaryBefore!.boundaryIndex,
          boundaryFileName: sj.boundaryBefore!.afterFileName,
          previousDecision: "split",
          correctedDecision: "merge",
          action: "merge",
          features: sj.boundaryBefore!.features,
          createdAt: new Date().toISOString(),
        }]);
        setBoundaryDecisions((previous) => previous.map((decision) => decision.boundaryIndex === sj.boundaryBefore!.boundaryIndex
          ? { ...decision, decision: "merge", source: "user", needsReview: false, reasons: [...decision.reasons, "사용자가 병합함"] }
          : decision));
      }
      setFieldScenes(prev => {
        const copy = [...prev];
        copy[i] = {
          ...si,
          files: [...si.files, ...sj.files],
          fileCount: si.fileCount + sj.fileCount,
          endTime: sj.endTime,
          approved: false,
        };
        return copy.filter((_, idx) => idx !== j).map((scene, index) => ({ ...scene, index: index + 1 }));
      });
      return;
    }

    // 정밀 정리 모드: 실제 파일 이동
    if (!fieldJpgBaseDir || !si.sceneDir || !sj.sceneDir) return;
    for (const f of sj.files) {
      try {
        await copyFileHandle(f.handle, si.sceneDir as FileSystemDirectoryHandle, f.name);
        await (sj.sceneDir as any).removeEntry(f.name);
      } catch {}
    }
    try { await (fieldJpgBaseDir as any).removeEntry(sj.folderName); } catch {}
    setFieldScenes(prev => {
      const copy = [...prev];
      copy[i] = {
        ...si,
        files: [...si.files, ...sj.files],
        fileCount: si.fileCount + sj.fileCount,
        endTime: sj.endTime,
      };
      return copy.filter((_, idx) => idx !== j);
    });
  }, [fieldScenes, fieldJpgBaseDir, mergeCandidates, rootDir]);

  const splitFieldScene = useCallback((sceneIndex: number, offset: number) => {
    setFieldScenes((previous) => {
      const scene = previous[sceneIndex];
      if (!scene || scene.sceneDir || offset <= 0 || offset >= scene.files.length) return previous;
      const boundaryIndex = previous.slice(0, sceneIndex).reduce((sum, item) => sum + item.files.length, 0) + offset;
      const beforeFile = scene.files[offset - 1];
      const afterFile = scene.files[offset];
      const decision: SceneBoundaryDecision = {
        boundaryIndex,
        beforeFileName: beforeFile.name,
        afterFileName: afterFile.name,
        score: 1,
        decision: "split",
        forced: false,
        source: "user",
        reasons: ["사용자가 직접 경계를 추가함"],
        features: EMPTY_BOUNDARY_FEATURES,
        needsReview: false,
      };
      setBoundaryDecisions((items) => [...items.filter((item) => item.boundaryIndex !== boundaryIndex), decision].sort((a, b) => a.boundaryIndex - b.boundaryIndex));
      setSceneCorrections((items) => [...items, {
        projectId: rootDir?.name ?? "local",
        boundaryIndex,
        boundaryFileName: afterFile.name,
        previousDecision: "merge",
        correctedDecision: "split",
        action: "split",
        features: EMPTY_BOUNDARY_FEATURES,
        createdAt: new Date().toISOString(),
      }]);
      const left: FieldScene = {
        ...scene,
        files: scene.files.slice(0, offset),
        fileCount: offset,
        endTime: beforeFile.mtime,
        approved: false,
      };
      const rightIndex = sceneIndex + 2;
      const rightName = simpleSceneFolderName(rightIndex);
      const right: FieldScene = {
        ...scene,
        index: rightIndex,
        folderName: rightName,
        editedName: rightName,
        suggestedName: rightName,
        files: scene.files.slice(offset),
        fileCount: scene.files.length - offset,
        startTime: afterFile.mtime,
        boundaryBefore: decision,
        approved: false,
      };
      return [...previous.slice(0, sceneIndex), left, right, ...previous.slice(sceneIndex + 1)]
        .map((item, index) => ({ ...item, index: index + 1 }));
    });
  }, [rootDir]);

  // PHASE 4(2026-08-30) — 아래 씬 검토 화면의 이름 입력칸(onChange+onBlur)이 하던 것과 정확히
  // 같은 일을 하나의 호출 가능한 함수로 뽑았다(로직 변경 없음, 이름만 붙임) — 채팅에서 "3번 씬
  // 이름 상담으로 바꿔"를 처리하려면 부를 수 있는 함수가 필요했다. 기존 입력칸 동작은 그대로 둔다.
  const renameFieldScene = useCallback((sceneIndex: number, newName: string) => {
    const scene = fieldScenes[sceneIndex];
    if (!scene || !newName.trim()) return false;
    setFieldScenes((previous) => previous.map((s, j) => (j === sceneIndex ? { ...s, editedName: newName } : s)));
    if (newName !== scene.folderName) {
      setSceneCorrections((previous) => [...previous, {
        projectId: rootDir?.name ?? "local",
        boundaryIndex: scene.boundaryBefore?.boundaryIndex ?? 0,
        boundaryFileName: scene.files[0]?.name ?? "",
        previousDecision: "split",
        correctedDecision: "split",
        action: "rename",
        features: scene.boundaryBefore?.features ?? EMPTY_BOUNDARY_FEATURES,
        reason: `${scene.folderName} → ${newName}`,
        createdAt: new Date().toISOString(),
      }]);
    }
    return true;
  }, [fieldScenes, rootDir]);

  // AI 사진 분류 2.0 — Olivia Chat이 "지금 열려 있는 화면"에서 AI 자동 분류를 실행/재조정하게
  // 하는 채팅 전용 래퍼(스펙 §35/36). rename/merge/splitFieldScene과 달리 둘 다 비동기라(네트워크
  // 호출 포함) 완료를 기다렸다가 실제 결과(fieldScenesRef)를 함께 돌려준다 — 그래야 채팅이
  // "분류했습니다"를 실제 grouping 결과가 있을 때만 말할 수 있다(스펙 §37/44).
  const startAiClassificationForChat = useCallback(async (): Promise<{ ok: boolean; reason?: string; sceneCount?: number }> => {
    if (!rootDir) return { ok: false, reason: "먼저 화면에서 폴더를 선택해주세요." };
    await handleFieldSort();
    return { ok: true, sceneCount: fieldScenesRef.current.length };
  }, [rootDir, handleFieldSort]);

  const submitAiNlRequestForChat = useCallback(async (message: string): Promise<{ ok: boolean; sceneCount?: number }> => {
    await submitAiNlRequest(message);
    return { ok: true, sceneCount: fieldScenesRef.current.length };
  }, [submitAiNlRequest]);

  // PHASE 4(2026-08-30) — 채팅 도구(rename/merge/split_photo_scene)가 이 Workspace가 실제로
  // 열려 있을 때만 씬 편집을 실행할 수 있게, 지금 마운트된 인스턴스의 최신 함수를 등록해둔다
  // (useContractPdfHandlerStore와 동일 패턴). 언마운트되면 등록을 해제한다.
  // OLIVIA OS Phase 3 — isEmbedded(OS 창/PhotoWorkspace.tsx 탭)도 등록 대상에 추가했다. 원래
  // isModal(채팅→모달 플로우)만 체크해서, OS Desktop 창 안에서는(PhotoWorkspaceWindowContent가
  // mode="embedded"로 렌더) "이 폴더 분류해줘" 같은 RUN 액션이 조용히 실행할 대상을 못 찾는
  // 버그가 있었다.
  useEffect(() => {
    if (isModal || isEmbedded) {
      const bundle = {
        renameScene: renameFieldScene, mergeScenes: mergeFieldScenes, splitScene: splitFieldScene,
        startAiClassification: startAiClassificationForChat, submitNlRequest: submitAiNlRequestForChat,
      };
      usePhotoClassificationActionsStore.getState().registerActions(bundle);
      console.log("[QA-TEMP] photo classification actions registered", { isModal, isEmbedded });
      return () => {
        if (usePhotoClassificationActionsStore.getState().actions === bundle) {
          usePhotoClassificationActionsStore.getState().registerActions(null);
        }
      };
    }
  }, [isModal, isEmbedded, renameFieldScene, mergeFieldScenes, splitFieldScene, startAiClassificationForChat, submitAiNlRequestForChat]);

  const approveFieldScene = useCallback((sceneIndex: number) => {
    setFieldScenes((previous) => previous.map((scene, index) => index === sceneIndex ? { ...scene, approved: true } : scene));
    const scene = fieldScenes[sceneIndex];
    if (!scene || scene.approved) return;
    setSceneCorrections((previous) => [...previous, {
      projectId: rootDir?.name ?? "local",
      boundaryIndex: scene.boundaryBefore?.boundaryIndex ?? 0,
      boundaryFileName: scene.files[0]?.name ?? "",
      previousDecision: scene.boundaryBefore?.decision === "merge" ? "merge" : "split",
      correctedDecision: scene.boundaryBefore?.decision === "merge" ? "merge" : "split",
      action: "approve",
      features: scene.boundaryBefore?.features ?? EMPTY_BOUNDARY_FEATURES,
      createdAt: new Date().toISOString(),
    }]);
  }, [fieldScenes, rootDir]);

  const approveAllFieldScenes = useCallback(() => {
    const pending = fieldScenes.filter((scene) => !scene.approved);
    setFieldScenes((previous) => previous.map((scene) => ({ ...scene, approved: true })));
    setSceneCorrections((previous) => [...previous, ...pending.map((scene) => ({
      projectId: rootDir?.name ?? "local",
      boundaryIndex: scene.boundaryBefore?.boundaryIndex ?? 0,
      boundaryFileName: scene.files[0]?.name ?? "",
      previousDecision: (scene.boundaryBefore?.decision === "merge" ? "merge" : "split") as "split" | "merge",
      correctedDecision: (scene.boundaryBefore?.decision === "merge" ? "merge" : "split") as "split" | "merge",
      action: "approve" as const,
      features: scene.boundaryBefore?.features ?? EMPTY_BOUNDARY_FEATURES,
      createdAt: new Date().toISOString(),
    }))]);
  }, [fieldScenes, rootDir]);

  const handleConfirmScenes = useCallback(async () => {
    if (!rootDir) return;
    setStep(3);
    setClassificationJobState("APPROVED");
    let lastUpdate = Date.now();

    if (fastAnalyzeMode || fieldScenes.some((scene) => !scene.sceneDir)) {
      // 승인 전 계획 모드: 씬 검토 확정 후에만 실제 파일 이동 실행
      setProgress({ cur:0, total:0, msg:"폴더 정리 중..." });
      const totalFiles = fieldScenes.reduce((s,sc)=>s+sc.fileCount,0);
      let done = 0;
      const reportDir = await (rootDir as any).getDirectoryHandle("REPORT", { create: true }) as FileSystemDirectoryHandle;
      const operations: Array<{ type: "copy_remove"; category: "RAW" | "JPG"; source: string; destination: string; status: "completed" | "failed"; error?: string; at: string }> = [];
      const writeReport = async (name: string, content: string) => {
        const handle = await (reportDir as any).getFileHandle(name, { create: true });
        const writer = await handle.createWritable();
        await writer.write("﻿" + content);
        await writer.close();
      };
      const flushJournal = async () => writeReport("file_operation_journal.json", JSON.stringify({ version: 1, root: rootDir.name, operations, updatedAt: new Date().toISOString() }, null, 2));

      // RAW → RAW/
      const rawBase = await (rootDir as any).getDirectoryHandle("RAW", { create:true }) as FileSystemDirectoryHandle;
      setFieldRawBaseDir(rawBase);
      for (let i = 0; i < fieldRawHandles.length; i++) {
        if (cancelRef.current) break;
        if (i % 10 === 0 || Date.now() - lastUpdate > 300) {
          setProgress({ cur:i, total:fieldRawHandles.length, msg:`RAW 이동: ${fieldRawHandles[i].name}` });
          lastUpdate = Date.now();
        }
        try {
          await copyFileHandle(fieldRawHandles[i].handle, rawBase, fieldRawHandles[i].name);
          try { await (rootDir as any).removeEntry(fieldRawHandles[i].name); } catch {}
          operations.push({ type: "copy_remove", category: "RAW", source: fieldRawHandles[i].name, destination: `RAW/${fieldRawHandles[i].name}`, status: "completed", at: new Date().toISOString() });
        } catch (error) {
          operations.push({ type: "copy_remove", category: "RAW", source: fieldRawHandles[i].name, destination: `RAW/${fieldRawHandles[i].name}`, status: "failed", error: error instanceof Error ? error.message : String(error), at: new Date().toISOString() });
        }
        if (i % 10 === 0) await flushJournal();
      }

      // JPG → 씬별 폴더로 이동
      const jpgBase = await (rootDir as any).getDirectoryHandle("JPG", { create:true }) as FileSystemDirectoryHandle;
      setFieldJpgBaseDir(jpgBase);
      try {
        const selectDir = await (rootDir as any).getDirectoryHandle("SELECT", { create:true });
        await (selectDir as any).getDirectoryHandle("JPG_SELECT", { create:true });
      } catch {}

      const updated = fieldScenes.map(sc => ({...sc}));
      for (let si = 0; si < updated.length; si++) {
        if (cancelRef.current) break;
        const sc = updated[si];
        const targetName = sc.editedName;
        const sceneDir = await (jpgBase as any).getDirectoryHandle(targetName, { create:true }) as FileSystemDirectoryHandle;
        const newFiles: SceneFile[] = [];

        for (const entry of sc.files) {
          if (cancelRef.current) break;
          if (done % 20 === 0 || Date.now() - lastUpdate > 300) {
            setProgress({ cur:done, total:totalFiles, msg:`${targetName}: ${entry.name}` });
            lastUpdate = Date.now();
          }
          try {
            await copyFileHandle(entry.handle, sceneDir, entry.name);
            const destHandle = await (sceneDir as any).getFileHandle(entry.name) as FileSystemFileHandle;
            try { await (rootDir as any).removeEntry(entry.name); } catch {}
            // 썸네일 lazy: 앞 4장만
            let thumbUrl: string | null = null;
            if (newFiles.length < 4) thumbUrl = await loadThumb(await destHandle.getFile(), 120);
            newFiles.push({ ...entry, handle: destHandle, thumbUrl });
            operations.push({ type: "copy_remove", category: "JPG", source: entry.name, destination: `JPG/${targetName}/${entry.name}`, status: "completed", at: new Date().toISOString() });
          } catch (error) {
            newFiles.push(entry);
            operations.push({ type: "copy_remove", category: "JPG", source: entry.name, destination: `JPG/${targetName}/${entry.name}`, status: "failed", error: error instanceof Error ? error.message : String(error), at: new Date().toISOString() });
          }
          done++;
          if (done % 10 === 0) await flushJournal();
        }
        updated[si] = { ...sc, folderName: targetName, sceneDir, files: newFiles };
      }
      setFieldScenes(updated);
      await flushJournal();
      await clearClassificationCheckpoint(`${rootDir.name}:${department}:${gapMinutes}:precise-v2`);
      await Promise.all([
        writeReport("scene_boundaries.json", JSON.stringify({ version: 1, boundaries: boundaryDecisions, createdAt: new Date().toISOString() }, null, 2)),
        writeReport("scene_corrections.json", JSON.stringify({ version: 1, corrections: sceneCorrections, createdAt: new Date().toISOString() }, null, 2)),
        writeReport("scene_corrections.csv", makeCSV(
          ["project_id", "boundary_index", "boundary_file", "previous_decision", "corrected_decision", "action", "reason", "created_at"],
          sceneCorrections.map((item) => [item.projectId, String(item.boundaryIndex), item.boundaryFileName, item.previousDecision, item.correctedDecision, item.action, item.reason ?? "", item.createdAt]),
        )),
        ...(accuracyReport ? [writeReport("scene_accuracy_report.json", JSON.stringify({ ...accuracyReport, createdAt: new Date().toISOString() }, null, 2))] : []),
      ]);

      if (qualityAnalysisEnabled || profileClassificationEnabled) {
        await runSecondaryAnalysis(updated);
      } else {
        setFieldStats({
          totalJpg: totalFiles, totalRaw: fieldRawCount,
          totalScenes: updated.length, totalSubScenes: 0,
          totalProfile: 0, totalQualityReject: 0,
          selectedJpg: 0, selectedRawMoved: 0, rawMissing: 0,
        });
        setStep(4);
      }
      return;
    }

    // 정밀 정리 모드: 폴더 이름 변경만 적용
    if (!fieldJpgBaseDir) return;
    const updated = [...fieldScenes];
    for (let i = 0; i < updated.length; i++) {
      const sc = updated[i];
      if (sc.editedName !== sc.folderName && sc.sceneDir) {
        try {
          const newDir = await renameDirHandle(fieldJpgBaseDir as any, sc.folderName, sc.editedName, sc.sceneDir);
          const newFiles = sc.files.map(f => ({...f}));
          for (const pf of newFiles) {
            try { pf.handle = await (newDir as any).getFileHandle(pf.name) as FileSystemFileHandle; } catch {}
          }
          updated[i] = { ...sc, folderName:sc.editedName, sceneDir:newDir, files:newFiles };
        } catch {}
      }
    }
    setFieldScenes(updated);

    if (qualityAnalysisEnabled || profileClassificationEnabled) {
      await runSecondaryAnalysis(updated);
    } else {
      setStep(4);
      setFieldStats({
        totalJpg: updated.reduce((s,sc)=>s+sc.fileCount,0),
        totalRaw: fieldRawCount,
        totalScenes: updated.length,
        totalSubScenes: 0, totalProfile: 0, totalQualityReject: 0,
        selectedJpg: 0, selectedRawMoved: 0, rawMissing: 0,
      });
    }
  }, [fieldScenes, fieldJpgBaseDir, fieldRawHandles, qualityAnalysisEnabled, profileClassificationEnabled, fieldRawCount, fastAnalyzeMode, rootDir, boundaryDecisions, sceneCorrections, accuracyReport, department, gapMinutes]);

  // 프로필 제외 장면 타입 (이 타입이면 절대 프로필로 보내지 않음)
  const PROFILE_EXCLUDE_TYPES = new Set([
    "injection_treatment","laser_treatment","device_treatment","lifting_laser_treatment",
    "doctor_treatment","surgery_scene","implant_surgery","dental_treatment",
    "doctor_consultation","manager_consultation","skin_care","physical_therapy",
    "c_arm_procedure","ultrasound_procedure","xray","shockwave_manual_therapy",
  ]);

  const runSecondaryAnalysis = async (scenes: FieldScene[]) => {
    const total = scenes.reduce((s,sc)=>s+sc.fileCount,0);
    let done = 0, qualityRejectTotal = 0, profileTotal = 0;
    const qualityRows: string[][] = [];
    const profileRows: string[][] = [];
    let qualityExcDir: FileSystemDirectoryHandle | null = null;
    let profileDir: FileSystemDirectoryHandle | null = null;
    const updated = scenes.map(s => ({...s}));
    let lastUpdate = Date.now();

    for (let si = 0; si < updated.length; si++) {
      if (cancelRef.current) break;
      const sceneType = updated[si].sceneType ?? "";
      // 시술/상담 장면은 프로필 검사 자체를 건너뜀
      const skipProfile = PROFILE_EXCLUDE_TYPES.has(sceneType);

      for (let fi = 0; fi < updated[si].files.length; fi++) {
        if (cancelRef.current) break;
        const pf = updated[si].files[fi];

        // 진행률 throttle: 20장 단위 또는 300ms마다
        if (done % 20 === 0 || Date.now() - lastUpdate > 300) {
          setProgress({ cur:done, total, msg:`분석: ${pf.name}` });
          lastUpdate = Date.now();
        }

        try {
          const file = await pf.handle.getFile();

          if (qualityAnalysisEnabled) {
            const { blurScore, brightness } = await analyzeJpg(file);
            let rejectReason = "";
            if (blurScore < 18) rejectReason = "흔들림";
            else if (brightness < 38) rejectReason = "조명불량";
            else if (brightness > 230) rejectReason = "확인필요";

            if (rejectReason && updated[si].sceneDir && fieldJpgBaseDir) {
              if (!qualityExcDir) qualityExcDir = await (fieldJpgBaseDir as any).getDirectoryHandle("00_QUALITY_EXCLUDED", { create:true }) as FileSystemDirectoryHandle;
              const subDir = await (qualityExcDir as any).getDirectoryHandle(rejectReason, { create:true }) as FileSystemDirectoryHandle;
              await copyFileHandle(pf.handle, subDir, pf.name);
              try { await (updated[si].sceneDir as any).removeEntry(pf.name); } catch {}
              qualityRows.push([pf.name, updated[si].editedName, rejectReason, ""]);
              qualityRejectTotal++;
              updated[si].qualityRejectCount++;
            }
          }

          if (profileClassificationEnabled && !skipProfile) {
            // 절대 기준: (1) 사람이 정확히 1명 AND (2) 정면 응시 또는 팔짱/손깍지 등 의도된 정지 포즈.
            // 픽셀 대칭성/중앙정렬만 보던 예전 휴리스틱은 인원수·시선·포즈를 전혀 판단하지 못해
            // AI 비전 판정(/api/portrait-check)으로 교체했다.
            let personCount = 0, facingForward = false, intentionalPose = false, isProfileCandidate = false, confidence = 0;
            try {
              const data = await withTimeout((async () => {
                const thumb = await getApiThumb(file);
                const res = await fetch("/api/portrait-check", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ thumbnail: thumb }),
                });
                return res.json();
              })(), 45000, "프로필 판정");
              if (data.ok) {
                personCount = data.personCount ?? 0;
                facingForward = data.facingForward === true;
                intentionalPose = data.intentionalPose === true;
                isProfileCandidate = data.isProfile === true;
                confidence = data.confidence ?? 0;
              }
            } catch { /* 판정 실패 시 프로필로 보내지 않고 기존 씬에 남김 */ }

            let movedTo = "";
            let rejectReason = "";

            if (isProfileCandidate && updated[si].sceneDir && rootDir) {
              if (!profileDir) profileDir = await (rootDir as any).getDirectoryHandle("PROFILE", { create:true }) as FileSystemDirectoryHandle;
              await copyFileHandle(pf.handle, profileDir, pf.name);
              try { await (updated[si].sceneDir as any).removeEntry(pf.name); } catch {}
              movedTo = "PROFILE/";
              profileTotal++;
              updated[si].profileCount++;
            } else if (!isProfileCandidate) {
              rejectReason = personCount !== 1
                ? `인원수 불일치(${personCount}명) — 1인이 아님`
                : `정면 응시·의도된 포즈 아님 (facingForward:${facingForward}, intentionalPose:${intentionalPose})`;
            }

            profileRows.push([
              pf.name,
              updated[si].editedName,
              confidence.toFixed(2),
              isProfileCandidate ? "true" : "false",
              String(personCount), "",
              facingForward ? "true" : "false",
              intentionalPose ? "true" : "false",
              "", "", "", "", "", "", "", "",
              rejectReason || (isProfileCandidate ? "프로필 조건 충족" : ""),
              movedTo,
            ]);
          } else if (profileClassificationEnabled && skipProfile) {
            // 시술/상담 장면 — 프로필 제외 기록
            profileRows.push([
              pf.name, updated[si].editedName, "0.00", "false",
              "", "", "", "", "", "", "", "", "", "", "", "",
              `${sceneType} 장면이므로 프로필 제외`,
              "",
            ]);
          }
        } catch {}
        done++;
      }
      setFieldScenes([...updated]);
    }

    // 리포트 생성 (REPORT/ 폴더)
    try {
      const reportDir = await (rootDir as any).getDirectoryHandle("REPORT", { create:true });
      const wr = async (name: string, content: string) => {
        const fh = await (reportDir as any).getFileHandle(name, { create:true });
        const w = await fh.createWritable();
        await w.write("﻿" + content); await w.close();
      };
      if (qualityRows.length > 0)
        await wr("quality_report.csv", makeCSV(["file_name","scene","reason","note"], qualityRows));
      if (profileRows.length > 0)
        await wr("profile_report.csv", makeCSV([
          "file_name","original_scene","profile_confidence","is_profile",
          "main_person_count","has_patient","is_looking_at_camera","has_intentional_pose",
          "has_tool","has_medical_device","has_handpiece","has_syringe",
          "has_consultation_object","is_consultation","is_treatment","is_procedure",
          "reason","moved_to",
        ], profileRows));

      // scene_merge_report.csv
      if (mergeCandidates.length > 0) {
        const allDecisions = [...mergeDecisions];
        // 미결 후보도 기록
        for (const cand of mergeCandidates) {
          if (!allDecisions.find(d => d.candidateId === cand.id)) {
            allDecisions.push({
              candidateId: cand.id,
              userAction: dismissedCandidates.has(cand.id) ? "keep_split" : "keep_split",
              fromFolderName: cand.fromFolderName,
              toFolderName: cand.toFolderName,
              fromSceneType: cand.fromSceneType,
              toSceneType: cand.toSceneType,
              mergeScore: cand.mergeScore,
              matchedSignals: cand.matchedSignals,
              blockedSignals: cand.blockedSignals,
              recommendedAction: cand.recommendedAction,
            });
          }
        }
        const mergeRows = allDecisions.map(d => [
          d.candidateId,
          d.fromFolderName,
          d.toFolderName,
          d.fromSceneType,
          d.toSceneType,
          d.mergeScore.toFixed(2),
          d.recommendedAction,
          d.userAction,
          d.matchedSignals.join("|"),
          d.blockedSignals.join("|"),
        ]);
        await wr("scene_merge_report.csv", makeCSV([
          "candidate_id","from_scene","to_scene","from_scene_type","to_scene_type",
          "merge_score","recommended_action","user_action","matched_signals","blocked_signals",
        ], mergeRows));
      }

      // summary.json
      const summary = {
        mode: "field",
        fastAnalyzeMode,
        classificationMode: fastAnalyzeMode ? "fast" : "precise",
        rawInitialMoveEnabled: false,
        exifMode: fastAnalyzeMode ? "fast" : "precise",
        thumbnailMode: "lazy",
        profileStrictMode: true,
        dermatologySecondPassEnhanced: department === "dermatology",
        department,
        departmentDisplayName: DEPARTMENT_DISPLAY[department],
        gapMinutes,
        timeGapBuildsCandidatesOnly: !fastAnalyzeMode,
        departmentLogicEnabled,
        aiNamingEnabled,
        qualityAnalysisEnabled,
        profileClassificationEnabled,
        rawSelectMode,
        strongTransitionDetectionEnabled: true,
        mergeCandidateEnabled: true,
        reviewRequiredBeforeMove: true,
        totalJpg: total,
        totalRaw: fieldRawCount,
        totalInitialScenes: updated.length,
        totalMergeCandidates: mergeCandidates.filter(c => c.recommendedAction === "merge").length,
        totalKeepSplitRecommendations: mergeCandidates.filter(c => c.recommendedAction === "keep_split").length,
        totalFinalScenes: updated.length,
        totalProfile: profileTotal,
        totalQualityReject: qualityRejectTotal,
        createdAt: new Date().toISOString(),
      };
      await wr("summary.json", JSON.stringify(summary, null, 2));
    } catch {}

    setFieldStats({
      totalJpg: total, totalRaw: fieldRawCount,
      totalScenes: updated.length, totalSubScenes: 0,
      totalProfile: profileTotal, totalQualityReject: qualityRejectTotal,
      selectedJpg: 0, selectedRawMoved: 0, rawMissing: 0,
    });
    setStep(4);
  };

  const runRawSelect = useCallback(async () => {
    if (!rootDir || !fieldRawBaseDir) return;
    setClassificationJobState("RAW_MATCHING");
    setStep(5); cancelRef.current = false;
    const log: string[] = [];

    // SELECT/JPG_SELECT/ 스캔 → 선택된 JPG basename 수집
    const selectedBasenames = new Set<string>();
    try {
      const selectDir = await (rootDir as any).getDirectoryHandle("SELECT");
      const jpgSelectDir = await (selectDir as any).getDirectoryHandle("JPG_SELECT");
      for await (const [name] of (jpgSelectDir as any).entries()) {
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        if (JPG_EXTS.has(ext)) selectedBasenames.add(name.replace(/\.[^.]+$/,"").toLowerCase());
      }
    } catch {
      log.push("⚠️ SELECT/JPG_SELECT/ 폴더를 찾을 수 없습니다. 폴더에 선택 JPG를 넣어주세요.");
      setCopyLog([...log]); return;
    }

    // RAW/ 인덱스 생성 (RAW/ 폴더 또는 원본 위치에서 스캔)
    const rawIndex = new Map<string, FileSystemFileHandle>();
    const rawScanDir = fieldRawBaseDir ?? rootDir;
    for await (const [name, handle] of (rawScanDir as any).entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (RAW_EXTS.has(ext)) rawIndex.set(name.replace(/\.[^.]+$/,"").toLowerCase(), handle as FileSystemFileHandle);
    }

    // SELECT/RAW_SELECT/ 생성
    const selectDir = await (rootDir as any).getDirectoryHandle("SELECT", { create:true });
    const rawSelectDir = await (selectDir as any).getDirectoryHandle("RAW_SELECT", { create:true }) as FileSystemDirectoryHandle;

    let rawMoved = 0, rawMissing = 0; let processed = 0;
    const rawRows: string[][] = [];

    for (const basename of selectedBasenames) {
      if (cancelRef.current) break;
      setProgress({ cur:processed, total:selectedBasenames.size, msg:`RAW 매칭: ${basename}` });
      const handle = rawIndex.get(basename);
      if (handle) {
        const rawFile = await handle.getFile();
        try {
          if (rawSelectMode === "move") {
            await copyFileHandle(handle, rawSelectDir, rawFile.name);
            try { await (fieldRawBaseDir as any).removeEntry(rawFile.name); } catch {}
            log.push(`✅ 이동: ${rawFile.name}`);
          } else {
            await copyFileHandle(handle, rawSelectDir, rawFile.name);
            log.push(`✅ 복사: ${rawFile.name}`);
          }
          rawRows.push([`${basename}.jpg`, rawFile.name, "완료", `RAW/${rawFile.name}`, `SELECT/RAW_SELECT/${rawFile.name}`, "basename"]);
          rawMoved++;
        } catch {
          log.push(`❌ 실패: ${rawFile.name}`);
          rawRows.push([`${basename}.jpg`, rawFile.name, "실패", "", "", ""]);
        }
      } else {
        log.push(`⚠️ RAW 없음: ${basename}`);
        rawRows.push([`${basename}.jpg`, "", "누락", "", "", ""]);
        rawMissing++;
      }
      processed++; setCopyLog([...log]);
    }

    // REPORT 생성
    try {
      const reportDir = await (rootDir as any).getDirectoryHandle("REPORT", { create:true });
      const wr = async (name: string, content: string) => {
        const fh = await (reportDir as any).getFileHandle(name, { create:true });
        const w = await fh.createWritable();
        await w.write("﻿" + content); await w.close();
      };
      await wr("raw_select_report.csv", makeCSV(["jpg_file","raw_file","status","source_path","destination_path","matched_by"], rawRows));
      const summary = {
        mode:"field", fastAnalyzeMode, rawInitialMoveEnabled: !fastAnalyzeMode,
        exifMode: fastAnalyzeMode ? "fast" : "precise", thumbnailMode: "lazy",
        profileStrictMode: true, dermatologySecondPassEnhanced: department === "dermatology",
        department, departmentDisplayName:DEPARTMENT_DISPLAY[department],
        gapMinutes, departmentLogicEnabled, aiNamingEnabled, qualityAnalysisEnabled, profileClassificationEnabled,
        rawSelectMode,
        totalJpg: fieldStats?.totalJpg ?? 0, totalRaw: fieldRawCount,
        totalScenes: fieldStats?.totalScenes ?? 0, totalSubScenes: 0,
        totalProfile: fieldStats?.totalProfile ?? 0, totalQualityReject: fieldStats?.totalQualityReject ?? 0,
        selectedJpg: selectedBasenames.size, selectedRawMoved: rawMoved, rawMissing,
        createdAt: new Date().toISOString(),
      };
      await wr("summary.json", JSON.stringify(summary, null, 2));
    } catch {}

    setFieldStats(prev => prev ? { ...prev, selectedJpg:selectedBasenames.size, selectedRawMoved:rawMoved, rawMissing } : null);
    setClassificationJobState("COMPLETED");
    setStep(6);
  }, [rootDir, fieldRawBaseDir, rawSelectMode, fieldStats, fieldRawCount, department, gapMinutes, fastAnalyzeMode, departmentLogicEnabled, aiNamingEnabled, qualityAnalysisEnabled, profileClassificationEnabled]);

  /* ── 앱 내 셀렉 탭: 씬 썸네일 로딩 ── */
  const loadSceneThumbs = useCallback(async (sceneIdx: number) => {
    const scene = fieldScenes[sceneIdx];
    if (!scene) return;
    const updates = await Promise.all(
      scene.files.map(async (f) => {
        if (f.thumbUrl) return { basename: f.basename, thumbUrl: f.thumbUrl };
        try {
          const file = await f.handle.getFile();
          const url = await loadThumb(file, 120);
          return { basename: f.basename, thumbUrl: url };
        } catch { return { basename: f.basename, thumbUrl: null }; }
      })
    );
    setFieldScenes(prev => prev.map((sc, i) => {
      if (i !== sceneIdx) return sc;
      return { ...sc, files: sc.files.map(f => {
        const u = updates.find(x => x.basename === f.basename);
        return u ? { ...f, thumbUrl: u.thumbUrl } : f;
      })};
    }));
  }, [fieldScenes]);

  /* ── 앱 내 셀렉 탭: RAW 매칭 실행 ── */
  const runInAppRawMatch = useCallback(async () => {
    if (!rootDir || !fieldRawBaseDir || inAppSelected.size === 0) return;
    setStep(5); cancelRef.current = false;
    const log: string[] = [];

    // 선택된 JPG 파일 핸들 수집
    const selectedHandles = new Map<string, FileSystemFileHandle>();
    for (const scene of fieldScenes) {
      for (const f of scene.files) {
        if (inAppSelected.has(f.basename.toLowerCase())) {
          selectedHandles.set(f.basename.toLowerCase(), f.handle);
        }
      }
    }

    // SELECT/JPG_SELECT/ 에 선택 JPG 복사
    const selectDir = await (rootDir as any).getDirectoryHandle("SELECT", { create: true });
    const jpgSelectDir = await (selectDir as any).getDirectoryHandle("JPG_SELECT", { create: true });
    let done = 0;
    for (const [, handle] of selectedHandles) {
      if (cancelRef.current) break;
      const file = await handle.getFile();
      setProgress({ cur: done, total: selectedHandles.size, msg: `JPG 복사: ${file.name}` });
      try { await copyFileHandle(handle, jpgSelectDir, file.name); log.push(`📋 ${file.name}`); }
      catch { log.push(`❌ 복사 실패: ${file.name}`); }
      done++; setCopyLog([...log]);
    }

    // RAW 인덱스 생성
    const rawIndex = new Map<string, FileSystemFileHandle>();
    for await (const [name, handle] of (fieldRawBaseDir as any).entries()) {
      if ((handle as FileSystemHandle).kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (RAW_EXTS.has(ext)) rawIndex.set(name.replace(/\.[^.]+$/, "").toLowerCase(), handle as FileSystemFileHandle);
    }

    // SELECT/RAW_SELECT/ 생성 후 매칭
    const rawSelectDir = await (selectDir as any).getDirectoryHandle("RAW_SELECT", { create: true }) as FileSystemDirectoryHandle;
    let rawMoved = 0, rawMissing = 0; done = 0;
    const rawRows: string[][] = [];

    for (const basename of inAppSelected) {
      if (cancelRef.current) break;
      setProgress({ cur: done, total: inAppSelected.size, msg: `RAW 매칭: ${basename}` });
      const handle = rawIndex.get(basename);
      if (handle) {
        const rawFile = await handle.getFile();
        try {
          await copyFileHandle(handle, rawSelectDir, rawFile.name);
          if (rawSelectMode === "move") {
            try { await (fieldRawBaseDir as any).removeEntry(rawFile.name); } catch {}
            log.push(`✅ 이동: ${rawFile.name}`);
          } else {
            log.push(`✅ 복사: ${rawFile.name}`);
          }
          rawRows.push([`${basename}.jpg`, rawFile.name, "완료", `RAW/${rawFile.name}`, `SELECT/RAW_SELECT/${rawFile.name}`, "basename"]);
          rawMoved++;
        } catch { log.push(`❌ 실패: ${rawFile.name}`); }
      } else {
        log.push(`⚠️ RAW 없음: ${basename}`);
        rawMissing++;
      }
      done++; setCopyLog([...log]);
    }

    setFieldStats(prev => prev ? { ...prev, selectedJpg: inAppSelected.size, selectedRawMoved: rawMoved, rawMissing } : prev);
    setStep(6);
  }, [rootDir, fieldRawBaseDir, inAppSelected, fieldScenes, rawSelectMode]);

  /* ════════════════════════════════════════════
     STUDIO-MODE HANDLERS
  ═══════════════════════════════════════════ */
  const handleStudioSort = useCallback(async () => {
    if (!rootDir) return;
    setStep(1); cancelRef.current = false;
    setProgress({ cur:0, total:0, msg:"폴더 스캔 중..." });
    const rawFiles: {name:string,handle:FileSystemFileHandle}[] = [];
    const jpgFiles: {name:string,handle:FileSystemFileHandle,mtime:number,fileSize:number}[] = [];
    for await (const [name, handle] of (rootDir as any).entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const file = await (handle as FileSystemFileHandle).getFile();
      if (RAW_EXTS.has(ext)) rawFiles.push({ name, handle });
      else if (JPG_EXTS.has(ext)) jpgFiles.push({ name, handle, mtime:file.lastModified, fileSize:file.size });
    }
    setStudioRawCount(rawFiles.length);
    jpgFiles.sort((a,b)=>a.mtime-b.mtime);
    const total = jpgFiles.length; let done = 0;
    const files: StudioPhotoFile[] = [];
    for (const sf of jpgFiles) {
      setProgress({ cur:done, total, msg:`스캔: ${sf.name}` });
      const file = await sf.handle.getFile();
      const thumb = await loadThumb(file, 100);
      const brightness = await quickBrightness(file);
      files.push({ name:sf.name, basename:sf.name.replace(/\.[^.]+$/,""), handle:sf.handle, mtime:sf.mtime, fileSize:sf.fileSize, thumbUrl:thumb, brightness, lightingStatus:"normal", hasGown:false, innerWear:"기타", clothingLabel:"미분류", poseType:"Unknown", isFamilyProfile:false, confidence:0, analyzed:false, groupKey:"__PENDING__" });
      done++;
    }
    setStudioFiles(files);
    setProgress({ cur:total, total, msg:`파일 분류 완료 — JPG ${jpgFiles.length}장 / RAW ${rawFiles.length}개` });
    setStep(2);
    if (studioSubMode === "group") {
      if (studioGroupSortMode === "gap") await runGapSort(files);
      else if (studioGroupSortMode === "gap_ai") await runGapAiSort(files);
      else await runGroupAnalysis(files);
    } else {
      await runStudioAnalysis(files);
    }
    // PHASE 4(2026-08-30) — handleFieldSort와 동일한 원칙, isModal || isEmbedded일 때만 채팅에
    // 요약 보고. 그룹 개수는 runGapSort/runGroupAnalysis 등이 각자 비동기로 state를 채워서
    // 여기서 안전하게 읽을 수 없어(클로저가 이전 값을 참조) 확실히 아는 값(총 사진 수)만 보고한다.
    if (isModal || isEmbedded) {
      const summary = `사진 분류 완료\n\n총 사진 ${jpgFiles.length}장`;
      useOliviaConversationStore.getState().appendMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: summary,
        blocks: [{ type: "text", text: summary }],
        createdAt: new Date().toISOString(),
        status: "complete",
      });
    }
  }, [rootDir, studioOpts, studioSubMode, studioGroupSortMode, studioGapMinutes, isModal, isEmbedded]);

  // PHASE 4(채팅 핸드오프, 2026-08-30) — 채팅에서 설정을 다 모으고 [사진 분류 시작]을 누르면
  // usePhotoClassificationHandoffStore에 값이 실려 오고 이 Workspace가 열린다. 마운트 시 한 번
  // 그 값으로 로컬 state를 채우고, rootDir가 실제로 반영된 다음 렌더에서 handleFieldSort/
  // handleStudioSort를 "페이지 버튼을 누른 것과 동일하게" 호출한다 — 별도 실행 경로를
  // 만들지 않는다. setRootDir 직후 같은 tick에서 바로 호출하면 handleFieldSort/handleStudioSort
  // 클로저가 아직 이전(null) rootDir를 참조하므로, rootDir가 반영된 다음 렌더를 기다린다.
  const handoffPendingRef = useRef(false);
  useEffect(() => {
    if (!isModal) return;
    const handoff = usePhotoClassificationHandoffStore.getState().consume();
    if (!handoff) return;
    setPhotoMode(handoff.photoMode);
    setRootDir(handoff.rootDir);
    if (handoff.photoMode === "field") {
      if (handoff.department) setDepartment(handoff.department);
      if (handoff.gapMinutes != null) setGapMinutes(handoff.gapMinutes);
      if (handoff.fastAnalyzeMode != null) setFastAnalyzeMode(handoff.fastAnalyzeMode);
      if (handoff.departmentLogicEnabled != null) setDepartmentLogicEnabled(handoff.departmentLogicEnabled);
      if (handoff.aiNamingEnabled != null) setAiNamingEnabled(handoff.aiNamingEnabled);
      if (handoff.qualityAnalysisEnabled != null) setQualityAnalysisEnabled(handoff.qualityAnalysisEnabled);
      if (handoff.profileClassificationEnabled != null) setProfileClassificationEnabled(handoff.profileClassificationEnabled);
    } else {
      if (handoff.lightingSensitivity) setStudioOpts((o) => ({ ...o, lightingSensitivity: handoff.lightingSensitivity! }));
      if (handoff.studioSubMode) setStudioSubMode(handoff.studioSubMode);
    }
    handoffPendingRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal]);

  useEffect(() => {
    if (!handoffPendingRef.current || !rootDir) return;
    handoffPendingRef.current = false;
    // handleFieldSort/handleStudioSort 내부의 개별 단계는 각자 로컬 try/catch로 대체값 처리를
    // 하지만(체크포인트 복구), 폴더 접근 권한 상실처럼 그 전체를 깨는 예외는 여기서만 잡힌다 —
    // 이 경우에만 "성공했다"는 오해가 안 생기게 실패를 채팅에 알린다(스펙 §37, §44).
    const run = photoMode === "field" ? handleFieldSort() : handleStudioSort();
    run.catch((error) => {
      const message = error instanceof Error ? error.message : "사진 분류 중 오류가 발생했습니다.";
      useOliviaConversationStore.getState().appendMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `사진 분류 중 오류가 발생했습니다. (${message})`,
        blocks: [{ type: "text", text: `사진 분류 중 오류가 발생했습니다. (${message})` }],
        createdAt: new Date().toISOString(),
        status: "complete",
      });
    });
  }, [rootDir, photoMode, handleFieldSort, handleStudioSort]);

  // 파일 크기 기반 ETC 임계값 계산 (중앙값 대비 35% 이하 = 어두운 컷)
  const calcEtcSizeThreshold = (files: StudioPhotoFile[]): number => {
    const sizes = files.map(f => f.fileSize).sort((a,b) => a-b);
    const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
    return median * 0.35;
  };

  const runGapSort = async (files: StudioPhotoFile[]) => {
    const etcThreshold = calcEtcSizeThreshold(files);
    const gapMs = studioGapMinutes * 60 * 1000;
    let personCount = 0;
    const result = files.map((f, i) => {
      if (i === 0 || f.mtime - files[i-1].mtime > gapMs) personCount++;
      const isSizeEtc = f.fileSize < etcThreshold;
      return {
        ...f, analyzed: true,
        groupKey: isSizeEtc ? "__ETC__" : `person_${personCount}`,
        lightingStatus: (isSizeEtc ? "etc_dark" : "normal") as StudioLightingStatus,
      };
    });
    setStudioFiles(result);
    setPersonGroups(buildPersonGroups(result));
    setStep(3);
  };

  const runGapAiSort = async (files: StudioPhotoFile[]) => {
    // 1단계: 파일 크기로 ETC 사전 필터 + 시간차로 인물 구분
    const etcThreshold = calcEtcSizeThreshold(files);
    const gapMs = studioGapMinutes * 60 * 1000;
    let personCount = 0;
    const withGap = files.map((f, i) => {
      if (i === 0 || f.mtime - files[i-1].mtime > gapMs) personCount++;
      const isSizeEtc = f.fileSize < etcThreshold;
      return {
        ...f,
        groupKey: isSizeEtc ? "__ETC__" : `person_${personCount}`,
        lightingStatus: (isSizeEtc ? "etc_dark" : "normal") as StudioLightingStatus,
      };
    });

    // 2단계: 크기로 통과한 컷만 AI 조명 검사
    const result = [...withGap];
    const needsAI = withGap.map((f,i) => ({f,i})).filter(({f}) => f.groupKey !== "__ETC__");
    const total = needsAI.length; let done = 0;
    const CONCURRENCY = 6;
    let qi = 0;
    const worker = async () => {
      while (qi < needsAI.length) {
        const { f, i } = needsAI[qi++];
        setProgress({ cur: done, total, msg: `AI 조명 검사: ${f.name}` });
        try {
          const file = await f.handle.getFile();
          const thumb = await getStudioThumb(file);
          const res = await fetch("/api/studio-face-analysis", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ thumbnail:thumb, lightingSensitivity:studioOpts.lightingSensitivity, lightingOnly:true }),
          });
          const data = await res.json();
          if (data.ok && data.lightingStatus !== "normal") {
            result[i] = { ...result[i], analyzed:true, lightingStatus:data.lightingStatus as StudioLightingStatus, groupKey:"__ETC__" };
          } else {
            result[i] = { ...result[i], analyzed:true };
          }
        } catch {
          result[i] = { ...result[i], analyzed:true };
        }
        done++;
        setStudioFiles([...result]);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    setPersonGroups(buildPersonGroups(result));
    setStep(3);
  };

  const runStudioAnalysis = async (files: StudioPhotoFile[]) => {
    const total = files.length; let done = 0;
    const CONCURRENCY = 8;
    const result = files.map(f => ({...f}));
    const indices = Array.from({length: total}, (_, i) => i);
    let qi = 0;
    const worker = async () => {
      while (qi < indices.length) {
        const idx = indices[qi++];
        const file = result[idx];
        setProgress({ cur:done, total, msg:`AI 분석: ${file.name}` });
        try {
          const data = await withTimeout((async () => {
            const f = await file.handle.getFile();
            const thumb = await getStudioThumb(f);
            const res = await fetch("/api/studio-analysis", {
              method:"POST", headers:{"Content-Type":"application/json"},
              body:JSON.stringify({ thumbnail:thumb, lightingSensitivity:studioOpts.lightingSensitivity }),
            });
            return res.json();
          })(), 45000, "AI 분석");
          if (data.ok) {
            const isEtc = data.lightingStatus !== "normal";
            const hasGown: boolean = data.hasGown ?? false;
            const innerWear: StudioInnerWear = (["셔츠","넥타이셔츠","스크럽","블라우스","탑","기타"] as StudioInnerWear[]).includes(data.innerWear) ? data.innerWear : "기타";
            const poseType: StudioPoseType = (["Standing","Sitting","Unknown"] as StudioPoseType[]).includes(data.poseType) ? data.poseType : "Unknown";
            const isFamilyProfile: boolean = data.isFamilyProfile ?? false;
            const clothingLabel = computeClothingLabel(hasGown, innerWear, isFamilyProfile);
            const groupKey = isEtc ? "__ETC__" : computeGroupKey(hasGown, innerWear, poseType, isFamilyProfile);
            result[idx] = { ...file, lightingStatus:data.lightingStatus||"normal", hasGown, innerWear, clothingLabel, poseType, isFamilyProfile, confidence:data.confidence||0.5, analyzed:true, groupKey };
          } else {
            result[idx] = { ...file, analyzed:true, lightingStatus:"etc_test", groupKey:"__ETC__" };
          }
        } catch {
          result[idx] = { ...file, analyzed:true, lightingStatus:"etc_test", groupKey:"__ETC__" };
        }
        done++;
        setStudioFiles([...result]);
      }
    };
    await Promise.all(Array.from({length: CONCURRENCY}, () => worker()));
    const groups = buildStudioGroups(result);
    setStudioGroups(groups);
    setStep(3);
  };

  const runStudioOutput = useCallback(async () => {
    if (!rootDir || studioGroups.length === 0) return;
    setStep(5); cancelRef.current = false;
    const log: string[] = [];
    const rootName = rootDir.name;
    const selectedJpgDir = await (rootDir as any).getDirectoryHandle(`분류_${rootName}`, { create:true });
    const reportDir      = await (rootDir as any).getDirectoryHandle("AI_SELECT_REPORT", { create:true });
    const totalFiles = studioGroups.reduce((s,g)=>s+g.files.length,0);
    let processed = 0;
    const classRows: string[][] = [], groupRows: string[][] = [], etcRows: string[][] = [];
    for (const group of studioGroups) {
      const folderName = group.editedFolderName || group.suggestedFolderName;
      const groupDir = await (selectedJpgDir as any).getDirectoryHandle(folderName, { create:true });
      for (const file of group.files) {
        if (cancelRef.current) break;
        setProgress({ cur:processed, total:totalFiles, msg:`${folderName}: ${file.name}` });
        try {
          await copyFileHandle(file.handle, groupDir, file.name);
          if (studioFileMode === "move") await (rootDir as any).removeEntry(file.name).catch(() => {});
          log.push(`✅ ${file.name} → ${folderName}/`);
        } catch { log.push(`❌ ${file.name} 실패`); }
        if (group.isEtc) etcRows.push([file.name, file.lightingStatus, String(Math.round(file.brightness??0)), "", "", ""]);
        classRows.push([file.name, "", folderName, file.clothingLabel, file.poseType, file.lightingStatus, String(Math.round(file.confidence*100)/100), ""]);
        processed++; setStudioCopyLog([...log]);
      }
      if (!group.isEtc) {
        const f = group.files[0], l = group.files[group.files.length-1];
        const avgConf = group.files.reduce((s,x)=>s+x.confidence,0)/group.files.length;
        groupRows.push([String(group.index),folderName,group.clothingLabel,group.poseType,String(group.files.length),f.name,l.name,String(Math.round(avgConf*100)/100)]);
      }
    }
    const wr = async (name: string, content: string) => {
      try { const fh = await (reportDir as any).getFileHandle(name,{create:true}); const w = await fh.createWritable(); await w.write("﻿"+content); await w.close(); } catch {}
    };
    await wr("studio_classification_report.csv", makeCSV(["file_name","original_path","assigned_folder","clothing_label","pose_type","lighting_status","confidence","note"], classRows));
    await wr("studio_group_report.csv",           makeCSV(["group_id","folder_name","clothing_label","pose_type","file_count","first_file","last_file","confidence"], groupRows));
    await wr("studio_etc_report.csv",             makeCSV(["file_name","reason","brightness_score","face_brightness_score","previous_frame_delta","ai_comment"], etcRows));
    const etcGroup = studioGroups.find(g=>g.isEtc);
    const summary = { mode:"studio", total_jpg:studioFiles.length, total_raw:studioRawCount, total_groups:studioGroups.filter(g=>!g.isEtc).length, total_etc:etcGroup?.files.length??0, total_normal:studioGroups.filter(g=>!g.isEtc).reduce((s,g)=>s+g.files.length,0), output_path:`분류_${rootName}/`, created_at:new Date().toISOString() };
    await wr("summary.json", JSON.stringify(summary, null, 2));
    setStudioStats({ totalJpg:studioFiles.length, totalRaw:studioRawCount, totalGroups:studioGroups.filter(g=>!g.isEtc).length, totalEtc:etcGroup?.files.length??0, totalNormal:studioGroups.filter(g=>!g.isEtc).reduce((s,g)=>s+g.files.length,0) });
    setStep(6);
  }, [studioGroups, rootDir, studioFiles, studioRawCount, studioFileMode]);

  const runGroupAnalysis = async (files: StudioPhotoFile[]) => {
    const total = files.length; let done = 0;
    const CONCURRENCY = 8;
    const result = files.map(f => ({...f}));
    const indices = Array.from({length: total}, (_, i) => i);
    let qi = 0;
    const worker = async () => {
      while (qi < indices.length) {
        const idx = indices[qi++];
        const file = result[idx];
        setProgress({ cur:done, total, msg:`얼굴 분석: ${file.name}` });
        try {
          const data = await withTimeout((async () => {
            const f = await file.handle.getFile();
            const thumb = await getStudioThumb(f);
            const res = await fetch("/api/studio-face-analysis", {
              method:"POST", headers:{"Content-Type":"application/json"},
              body:JSON.stringify({ thumbnail:thumb, lightingSensitivity:studioOpts.lightingSensitivity }),
            });
            return res.json();
          })(), 45000, "얼굴 분석");
          if (data.ok && data.lightingStatus === "normal") {
            const GENDERS = ["male","female"], AGES = ["20s","30s","40s","50s","60s+"];
            const HCOLORS = ["black","brown","blonde","white_gray","other"], HLENS = ["short","medium","long","bald"];
            const FSHAPES = ["oval","round","square","heart"];
            const features: PersonFeatures = {
              gender:     GENDERS.includes(data.gender)     ? data.gender     : "unknown",
              ageBand:    AGES.includes(data.ageBand)        ? data.ageBand    : "unknown",
              hairColor:  HCOLORS.includes(data.hairColor)  ? data.hairColor  : "unknown",
              hairLength: HLENS.includes(data.hairLength)   ? data.hairLength : "unknown",
              hasGlasses: data.hasGlasses === true,
              hasBeard:   data.hasBeard   === true,
              faceShape:  FSHAPES.includes(data.faceShape)  ? data.faceShape  : "unknown",
            };
            result[idx] = { ...file, lightingStatus:"normal", personFeatures:features, analyzed:true, groupKey:"PENDING" };
          } else {
            result[idx] = { ...file, analyzed:true, lightingStatus:data.lightingStatus||"etc_test", groupKey:"__ETC__" };
          }
        } catch {
          result[idx] = { ...file, analyzed:true, lightingStatus:"etc_test", groupKey:"__ETC__" };
        }
        done++;
        setStudioFiles([...result]);
      }
    };
    await Promise.all(Array.from({length: CONCURRENCY}, () => worker()));

    // Client-side person matching: best-score nearest neighbor
    const knownPersons: Array<{id: string; features: PersonFeatures; scoreSum: number; count: number}> = [];
    let personCount = 0;
    const final = result.map(file => {
      if (file.groupKey === "__ETC__") return file;
      if (!file.personFeatures) return { ...file, groupKey:"__ETC__" };
      // 점수 기반 최적 매치 탐색
      let bestScore = 0, bestId: string | null = null, bestIdx = -1;
      knownPersons.forEach((p, i) => {
        const s = personMatchScore(file.personFeatures!, p.features);
        if (s > bestScore) { bestScore = s; bestId = p.id; bestIdx = i; }
      });
      if (bestScore >= 0.62 && bestId !== null) {
        // 기존 인물 특징을 지수이동평균으로 업데이트 (안정적 매칭)
        const p = knownPersons[bestIdx];
        p.scoreSum += bestScore; p.count++;
        return { ...file, groupKey: bestId };
      }
      personCount++;
      const id = `person_${personCount}`;
      knownPersons.push({ id, features: file.personFeatures, scoreSum: 1, count: 1 });
      return { ...file, groupKey: id };
    });

    setStudioFiles(final);
    setPersonGroups(buildPersonGroups(final));
    setStep(3);
  };

  const runGroupOutput = useCallback(async () => {
    if (!rootDir || personGroups.length === 0) return;
    setStep(5); cancelRef.current = false;
    const log: string[] = [];
    const rootName = rootDir.name;
    const selectedJpgDir = await (rootDir as any).getDirectoryHandle(`분류_${rootName}`, { create:true });
    const reportDir      = await (rootDir as any).getDirectoryHandle("AI_SELECT_REPORT", { create:true });
    const totalFiles = personGroups.reduce((s,g) => s+g.files.length, 0);
    let processed = 0;
    const classRows: string[][] = [], groupRows: string[][] = [], etcRows: string[][] = [];
    for (const group of personGroups) {
      const folderName = group.editedFolderName;
      const groupDir = await (selectedJpgDir as any).getDirectoryHandle(folderName, { create:true });
      for (const file of group.files) {
        if (cancelRef.current) break;
        setProgress({ cur:processed, total:totalFiles, msg:`${folderName}: ${file.name}` });
        try {
          await copyFileHandle(file.handle, groupDir, file.name);
          if (studioFileMode === "move") await (rootDir as any).removeEntry(file.name).catch(() => {});
          log.push(`✅ ${file.name} → ${folderName}/`);
        } catch { log.push(`❌ ${file.name} 실패`); }
        if (group.isEtc) etcRows.push([file.name, file.lightingStatus, String(Math.round(file.brightness??0)), ""]);
        const pf = group.features;
        classRows.push([file.name, folderName, group.label, pf.gender, pf.ageBand, pf.hairColor, pf.hairLength, String(pf.hasGlasses), file.lightingStatus]);
        processed++; setStudioCopyLog([...log]);
      }
      if (!group.isEtc) {
        const f = group.files[0], l = group.files[group.files.length-1];
        groupRows.push([String(group.index), folderName, group.label, String(group.files.length), f.name, l.name]);
      }
    }
    const wr = async (name: string, content: string) => {
      try { const fh = await (reportDir as any).getFileHandle(name,{create:true}); const w = await fh.createWritable(); await w.write("﻿"+content); await w.close(); } catch {}
    };
    await wr("group_person_report.csv",    makeCSV(["group_id","folder_name","label","file_count","first_file","last_file"], groupRows));
    await wr("classification_detail.csv", makeCSV(["file_name","assigned_folder","person_label","gender","age_band","hair_color","hair_length","has_glasses","lighting_status"], classRows));
    await wr("etc_report.csv",             makeCSV(["file_name","reason","brightness","note"], etcRows));
    const etcGroup = personGroups.find(g=>g.isEtc);
    const summary = { mode:"studio_group", total_jpg:studioFiles.length, total_raw:studioRawCount, total_persons:personGroups.filter(g=>!g.isEtc).length, total_etc:etcGroup?.files.length??0, total_normal:personGroups.filter(g=>!g.isEtc).reduce((s,g)=>s+g.files.length,0), output_path:`분류_${rootName}/`, created_at:new Date().toISOString() };
    await wr("summary.json", JSON.stringify(summary, null, 2));
    setStudioStats({ totalJpg:studioFiles.length, totalRaw:studioRawCount, totalGroups:personGroups.filter(g=>!g.isEtc).length, totalEtc:etcGroup?.files.length??0, totalNormal:personGroups.filter(g=>!g.isEtc).reduce((s,g)=>s+g.files.length,0) });
    setStep(6);
  }, [personGroups, rootDir, studioFiles, studioRawCount, studioFileMode]);

  /* ════════════════════════════════════════════
     STEP INDICATOR
  ═══════════════════════════════════════════ */
  const renderStepIndicator = () => (
    <div className="pc-workflow-bar" style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"10px 24px",overflowX:"auto"}}>
      <div className="pc-workflow-track" style={{display:"flex",gap:4,alignItems:"center"}}>
        {stepLabels.map((lbl,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
            <div style={{width:22,height:22,borderRadius:"50%",fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",background:i<step?(photoMode==="studio"?C.purple:C.green):i===step?C.teal:C.border,color:i<=step?"#fff":C.muted}}>{i<step?"✓":i+1}</div>
            <span className="ps-step-lbl" style={{fontWeight:i===step?800:500,color:i===step?C.teal:C.hint}}>{lbl}</span>
            {i<stepLabels.length-1&&<span style={{color:C.border,fontSize:10}}>›</span>}
          </div>
        ))}
      </div>
    </div>
  );

  /* ════════════════════════════════════════════
     STEP 0 — 설정 (FIELD)
  ═══════════════════════════════════════════ */
  const Step0 = () => {
    const deptInfo: Record<string, string> = {
      dermatology: "피부과 모드: 실장상담, 피부관리, 원장상담, 레이저시술, 장비시술, 주사시술, 프로필, 인테리어, 접수안내 장면을 기준으로 분류합니다.",
      general: "기타 모드: 시간차 기준 Scene 분류를 우선 적용하고, 공통 장면 기준으로 이름을 추천합니다.",
    };
    const aiAutoActive = photoMode === "field" && classificationUiMode === "ai-auto";
    return (
      <div style={{display:"flex",flexDirection:"column",gap:20,maxWidth: aiAutoActive ? 1120 : 700}}>

        {/* 이전 작업 복원 배너 */}
        {savedSession && (
          <div style={{background:"#E8F0F5",border:"1.5px solid #B8CBD8",borderRadius:12,padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>💾</span>
              <div>
                <div style={{fontSize:13,fontWeight:900,color:"#103A62"}}>이전 작업이 저장되어 있습니다</div>
                <div style={{fontSize:11,color:"#315F7F",marginTop:2}}>
                  {DEPARTMENT_DISPLAY[savedSession.department]} · {savedSession.rootDirName || "폴더"} · {savedSession.sceneSummary.length}개 씬 · {new Date(savedSession.savedAt).toLocaleDateString("ko-KR",{month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>handleRestore(savedSession)} style={{flex:1,padding:"10px 0",background:"#103A62",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>
                📂 폴더 선택 후 이어서 하기
              </button>
              <button onClick={clearSession} style={{padding:"10px 16px",background:"transparent",color:"#6B7280",border:"1px solid #D1D5DB",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                무시
              </button>
            </div>
            <div style={{fontSize:10,color:"#93C5FD",lineHeight:1.6}}>
              ※ 파일은 이미 폴더에 정리되어 있습니다. 같은 폴더를 다시 선택하면 {savedSession.step >= 4 ? "베스트컷 선택 단계" : savedSession.step >= 2 ? "씬 검토 단계" : ""}로 바로 이동합니다.
            </div>
          </div>
        )}

        {/* 촬영 모드 선택 */}
        <Card>
          <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>촬영 모드</div>
          <div className="pc-mobile-form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
            {([["field","병원 현장촬영","사람·장비·장소·시간 변화로 Scene을 분류합니다."],["studio","스튜디오 프로필촬영","의상·포즈·조명 기준으로 분류합니다."]] as const).map(([m,title,desc])=>(
              <button key={m} onClick={()=>setPhotoMode(m)} style={{padding:"16px 20px",textAlign:"left",border:"none",borderRight:m==="field"?`1px solid ${C.border}`:"none",background:photoMode===m?C.light:"transparent",cursor:"pointer",fontFamily:"inherit"}}>
                <div style={{fontSize:13,fontWeight:900,color:photoMode===m?C.teal:C.muted,marginBottom:4}}>{title}{photoMode===m&&" ✓"}</div>
                <div style={{fontSize:11,color:C.hint,lineHeight:1.6}}>{desc}</div>
              </button>
            ))}
          </div>
        </Card>

        {photoMode === "field" && (
          <>
            <ClassificationModeToggle mode={classificationUiMode} onChange={setClassificationUiMode} />

            {aiAutoActive ? (
              <div className="pc-ai-auto-grid" style={{display:"grid",gridTemplateColumns:"280px 1fr 280px",gap:16,alignItems:"start"}}>
                {/* LEFT — 폴더/진료과(간단) + 자연어 요청 */}
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  <Card>
                    <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>폴더 선택</div>
                    <div style={{padding:20}}>
                      <button onClick={pickDir} style={{width:"100%",height:52,border:`1.5px dashed ${C.border}`,borderRadius:10,background:C.white,cursor:"pointer",fontSize:13,fontWeight:700,color:rootDir?C.green:C.teal,display:"flex",alignItems:"center",gap:10,padding:"0 18px",fontFamily:"inherit"}}>
                        {rootDir ? <><span>✅</span>{rootDir.name}</> : <><span>📂</span>RAW+JPG 혼합 폴더 선택</>}
                      </button>
                    </div>
                  </Card>

                  <Card>
                    <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>진료과 선택</div>
                    <div style={{padding:"14px 20px",display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {DEPARTMENTS.map(d => (
                          <button key={d.value} onClick={()=>setDepartment(d.value)} style={{padding:"9px 10px",borderRadius:8,border:`1.5px solid ${department===d.value?C.teal:C.border}`,background:department===d.value?C.light:C.white,cursor:"pointer",fontSize:11.5,fontWeight:department===d.value?900:600,color:department===d.value?C.teal:C.muted,fontFamily:"inherit",textAlign:"left"}}>
                            {d.label}{department===d.value&&" ✓"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Card>

                  <ClassificationPrompt onSubmit={submitAiNlRequest} busy={aiRefining} history={aiRefinementHistory} />
                </div>

                {/* CENTER — AI 분석 결과 + Scene 미리보기 + 시작 버튼 */}
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  <FolderAnalysisSummary analyzing={aiAnalyzing} pattern={aiShootingPattern} fileCount={aiScanFileCount} />
                  <SceneProposalList proposals={aiSceneProposals} />
                  {!hasFS && <div style={{padding:14,background:"#FFF3CD",borderRadius:10,fontSize:12,color:"#856404",border:"1px solid #FFD980"}}>⚠️ Chrome 또는 Edge 브라우저에서만 파일 시스템 접근이 가능합니다.</div>}
                  <Btn onClick={handleFieldSort} disabled={!rootDir||!hasFS||aiAnalyzing}>AI 자동 분류 시작 →</Btn>
                </div>

                {/* RIGHT — 추천 기준(쉬운 말) + 고급 설정 진입 */}
                <ClassificationProfilePanel profile={aiWeightProfile} onOpenAdvanced={() => setClassificationUiMode("advanced")} />
              </div>
            ) : (
              <>
                {/* 폴더 선택 */}
                <Card>
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>폴더 선택</div>
                  <div style={{padding:20}}>
                    <button onClick={pickDir} style={{width:"100%",height:52,border:`1.5px dashed ${C.border}`,borderRadius:10,background:C.white,cursor:"pointer",fontSize:13,fontWeight:700,color:rootDir?C.green:C.teal,display:"flex",alignItems:"center",gap:10,padding:"0 18px",fontFamily:"inherit"}}>
                      {rootDir ? <><span>✅</span>{rootDir.name}</> : <><span>📂</span>RAW+JPG 혼합 폴더 선택</>}
                    </button>
                  </div>
                </Card>

                {/* 진료과 선택 */}
                <Card>
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>진료과 선택</div>
                  <div style={{padding:"14px 20px",display:"flex",flexDirection:"column",gap:12}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
                      {DEPARTMENTS.map(d => (
                        <button key={d.value} onClick={()=>setDepartment(d.value)} style={{padding:"10px 14px",borderRadius:8,border:`1.5px solid ${department===d.value?C.teal:C.border}`,background:department===d.value?C.light:C.white,cursor:"pointer",fontSize:12,fontWeight:department===d.value?900:600,color:department===d.value?C.teal:C.muted,fontFamily:"inherit",textAlign:"left"}}>
                          {d.label}{department===d.value&&" ✓"}
                        </button>
                      ))}
                    </div>
                    {deptInfo[department] && (
                      <div style={{padding:"10px 14px",background:"#F0FDF4",borderRadius:8,fontSize:11,color:"#166534",border:"1px solid #BBF7D0",lineHeight:1.7}}>
                        {deptInfo[department]}
                      </div>
                    )}
                  </div>
                </Card>

                {/* 강제 Scene 경계 시간 */}
                <Card>
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>강제 Scene 경계 시간</div>
                  <div style={{padding:"14px 20px"}}>
                    <div style={{display:"flex",gap:8,marginBottom:10}}>
                      {GAP_OPTIONS.map(g => (
                        <button key={g} onClick={()=>setGapMinutes(g)} style={{flex:1,padding:"10px 0",borderRadius:8,border:`1.5px solid ${gapMinutes===g?C.teal:C.border}`,background:gapMinutes===g?C.light:C.white,cursor:"pointer",fontSize:13,fontWeight:gapMinutes===g?900:600,color:gapMinutes===g?C.teal:C.muted,fontFamily:"inherit"}}>
                          {g===3.5 ? "3분30초" : `${g}분`}
                        </button>
                      ))}
                    </div>
                    <div style={{fontSize:11,color:C.hint}}>설정 시간을 넘으면 강제 분리합니다. 그 이내에서도 사람·장비·장소가 바뀌면 새 Scene으로 분리합니다.</div>
                  </div>
                </Card>

                {/* 분류 모드 */}
                <Card>
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>분류 모드</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
                    {([
                      ["fast",  "⚡ 빠른 분석",    "파일을 이동하지 않고 Scene 계획만 생성합니다.\nRAW는 원본 위치 유지. EXIF 생략. 10~30초 목표."],
                      ["precise","🔍 정밀 분류",   "EXIF + 사람·장비·장소 변화 분석.\n검토·승인 전에는 파일을 이동하지 않습니다."],
                    ] as const).map(([val, title, desc]) => (
                      <button key={val} onClick={()=>setFastAnalyzeMode(val==="fast")}
                        style={{padding:"14px 18px",textAlign:"left",border:"none",borderRight:val==="fast"?`1px solid ${C.border}`:"none",background:fastAnalyzeMode===(val==="fast")?C.light:"transparent",cursor:"pointer",fontFamily:"inherit"}}>
                        <div style={{fontSize:13,fontWeight:900,color:fastAnalyzeMode===(val==="fast")?C.teal:C.muted,marginBottom:4}}>{title}{fastAnalyzeMode===(val==="fast")&&" ✓"}</div>
                        <div style={{fontSize:10,color:C.hint,lineHeight:1.6,whiteSpace:"pre-line"}}>{desc}</div>
                      </button>
                    ))}
                  </div>
                </Card>

                {/* 옵션 */}
                <Card>
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>분류 옵션</div>
                  <div style={{padding:"14px 20px",display:"flex",flexDirection:"column",gap:18}}>
                    <Toggle label="진료과 로직 사용" desc="선택한 진료과에 맞는 장면 분류 기준을 적용합니다." value={departmentLogicEnabled} onChange={setDepartmentLogicEnabled}/>
                    <Toggle label="AI 씬 이름 추천" desc="대표 이미지를 분석해 진료과에 맞는 폴더명을 추천합니다. 자동 변경 없이 검토 화면에서 확인 후 적용합니다." value={aiNamingEnabled} onChange={setAiNamingEnabled}/>
                    <Toggle label="품질 분석" desc="흔들림, 조명불량 등 불량컷을 00_QUALITY_EXCLUDED/ 폴더로 분리합니다." value={qualityAnalysisEnabled} onChange={setQualityAnalysisEnabled}/>
                    <Toggle label="프로필 자동 분류 (엄격 모드)" desc="1인 단독·정면 응시·의도된 정지 포즈일 때만 PROFILE/ 폴더로 분류합니다. 상담/시술 장면은 제외됩니다." value={profileClassificationEnabled} onChange={setProfileClassificationEnabled}/>
                  </div>
                </Card>

                {/* RAW SELECT 방식 */}
                <Card>
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>RAW SELECT 처리 방식</div>
                  <div style={{padding:"14px 20px",display:"flex",flexDirection:"column",gap:10}}>
                    <div className="ps-btn-row">
                      {(["move","copy"] as const).map(m => (
                        <button key={m} onClick={()=>setRawSelectMode(m)} style={{flex:1,padding:"12px 0",borderRadius:8,border:`1.5px solid ${rawSelectMode===m?C.teal:C.border}`,background:rawSelectMode===m?C.light:C.white,cursor:"pointer",fontSize:13,fontWeight:rawSelectMode===m?900:600,color:rawSelectMode===m?C.teal:C.muted,fontFamily:"inherit"}}>
                          {m === "move" ? "이동 (권장)" : "복사"}
                        </button>
                      ))}
                    </div>
                    {rawSelectMode === "copy" && (
                      <div style={{padding:"10px 14px",background:"#FFF3CD",borderRadius:8,fontSize:11,color:"#856404",border:"1px solid #FFD980"}}>
                        ⚠️ RAW 파일을 복사하면 저장 용량이 크게 증가할 수 있습니다. 기본 권장 방식은 이동입니다.
                      </div>
                    )}
                    <div style={{padding:"10px 14px",background:"#F0FDF4",borderRadius:8,fontSize:11,color:"#166534",border:"1px solid #BBF7D0",lineHeight:1.9}}>
                      <strong>결과 폴더 구조</strong><br/>
                      {fastAnalyzeMode
                        ? <>⚡ 빠른 분석 모드: 씬 계획 생성 → 검토 → [폴더 정리 실행] 시 실제 이동<br/></>
                        : <>🔍 정밀 분류 모드: 하이브리드 Scene 계획 → 검토 → 승인 후 이동<br/></>
                      }
                      RAW/ — 전체 RAW 파일{fastAnalyzeMode ? " (정리 실행 후 이동)" : " (이동)"}<br/>
                      JPG/Scene01/, Scene02/... — JPG 씬별 분류<br/>
                      PROFILE/ — 프로필 사진 (1인·정면·정지 포즈만)<br/>
                      SELECT/JPG_SELECT/ — 선택한 JPG<br/>
                      SELECT/RAW_SELECT/ — 선택 RAW ({rawSelectMode === "move" ? "이동" : "복사"})<br/>
                      REPORT/ — 분류 리포트 (summary.json, profile_report.csv)
                    </div>
                  </div>
                </Card>

                {!hasFS && <div style={{padding:14,background:"#FFF3CD",borderRadius:10,fontSize:12,color:"#856404",border:"1px solid #FFD980"}}>⚠️ Chrome 또는 Edge 브라우저에서만 파일 시스템 접근이 가능합니다.</div>}
                <Btn onClick={handleFieldSort} disabled={!rootDir||!hasFS}>현장촬영 분류 시작 →</Btn>
              </>
            )}
          </>
        )}

        {photoMode === "studio" && (
          <>
            {/* 촬영 구성 탭 */}
            <Card>
              <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.purple}}>촬영 구성</div>
              <div className="pc-mobile-form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
                {([
                  ["concept","한 명 · 여러 컨셉","의상·포즈 기준 분류 (기존 모드)"],
                  ["group",  "여러 명 · 같은 컨셉","얼굴 분석으로 인물별 분류 (신규)"],
                ] as const).map(([m,title,desc])=>(
                  <button key={m} onClick={()=>setStudioSubMode(m)}
                    style={{padding:"16px 20px",textAlign:"left",border:"none",borderRight:m==="concept"?`1px solid ${C.border}`:"none",background:studioSubMode===m?"#F5F0FF":"transparent",cursor:"pointer",fontFamily:"inherit"}}>
                    <div style={{fontSize:13,fontWeight:900,color:studioSubMode===m?C.purple:C.muted,marginBottom:4}}>{title}{studioSubMode===m&&" ✓"}</div>
                    <div style={{fontSize:11,color:C.hint,lineHeight:1.6}}>{desc}</div>
                  </button>
                ))}
              </div>
            </Card>
            <div style={{padding:14,background:"#F5F0FF",borderRadius:12,fontSize:11,color:"#4C1D95",border:"1px solid #DDD6FE",lineHeight:1.8}}>
              {studioSubMode === "group" ? (
                <><strong>여러 명 · 같은 컨셉 모드</strong>: 촬영 시간차 또는 AI 얼굴 분석으로 인물별 자동 분류.<br/>
                폴더명(예: 01_인물1)은 분류 후 수정 가능. 조명 불량 컷은 <strong>00_ETC_조명불량</strong>으로 분리됩니다.</>
              ) : (
                <><strong>한 명 · 여러 컨셉 모드</strong>: 의상 변화와 포즈 변화를 기준으로 분류합니다.<br/>
                포즈는 Standing / Sitting 두 가지로만 나눕니다. 조명 불량 컷은 <strong>00_ETC_조명불량</strong> 폴더로 분리합니다.</>
              )}
            </div>

            {/* 여러 명 모드 — 분류 방식 */}
            {studioSubMode === "group" && (
              <Card>
                <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.purple}}>인물 구분 방식</div>
                <div style={{padding:"14px 20px",display:"flex",flexDirection:"column",gap:12}}>
                  {([
                    ["gap",    "⏱ 시간차로만",       "촬영 간격이 설정 시간 이상이면 다음 인물로 구분. AI 없이 즉시 처리."],
                    ["gap_ai", "⏱+🤖 시간차 + AI",   "시간차로 인물을 나눈 후, AI가 조명 불량 컷을 필터링. (권장)"],
                    ["ai",     "🤖 AI 얼굴 분석만",   "AI가 얼굴 특징(성별·나이·헤어·안경·수염)으로 인물 매칭. 느리지만 정확."],
                  ] as const).map(([m, title, desc]) => (
                    <label key={m} style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${studioGroupSortMode===m?C.purple:C.border}`,background:studioGroupSortMode===m?"#F5F0FF":"transparent"}}>
                      <input type="radio" name="groupSortMode" value={m} checked={studioGroupSortMode===m} onChange={()=>setStudioGroupSortMode(m)} style={{marginTop:2,accentColor:C.purple}}/>
                      <div>
                        <div style={{fontSize:12,fontWeight:800,color:studioGroupSortMode===m?C.purple:C.txt,marginBottom:2}}>{title}{m==="gap_ai"&&<span style={{fontSize:10,background:C.purple,color:"#fff",borderRadius:4,padding:"1px 5px",marginLeft:6}}>권장</span>}</div>
                        <div style={{fontSize:11,color:C.hint,lineHeight:1.5}}>{desc}</div>
                      </div>
                    </label>
                  ))}
                  {studioGroupSortMode !== "ai" && (
                    <div style={{padding:"10px 12px",background:C.bg,borderRadius:8,border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8}}>인물 전환 기준 시간차</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        {[1,2,3,5,7,10].map(v=>(
                          <button key={v} onClick={()=>setStudioGapMinutes(v)}
                            style={{padding:"5px 12px",borderRadius:6,border:`1.5px solid ${studioGapMinutes===v?C.purple:C.border}`,background:studioGapMinutes===v?C.purple:"transparent",color:studioGapMinutes===v?"#fff":C.muted,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                            {v}분
                          </button>
                        ))}
                      </div>
                      <div style={{fontSize:10,color:C.hint,marginTop:6}}>{studioGapMinutes}분 이상 촬영 간격 → 다음 인물로 전환</div>
                    </div>
                  )}
                </div>
              </Card>
            )}
            <Card>
              <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.purple}}>폴더 선택</div>
              <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
                <button onClick={pickDir} style={{height:52,border:`1.5px dashed ${C.border}`,borderRadius:10,background:C.white,cursor:"pointer",fontSize:13,fontWeight:700,color:rootDir?C.green:C.purple,display:"flex",alignItems:"center",gap:10,padding:"0 18px",fontFamily:"inherit"}}>
                  {rootDir ? <><span>✅</span>{rootDir.name}</> : <><span>📂</span>RAW+JPG 혼합 백업 폴더 선택</>}
                </button>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6}}>조명 불량 ETC 기준</div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {(["loose","medium","strict"] as LightingSensitivity[]).map(v=>(
                      <label key={v} style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:11,cursor:"pointer"}}>
                        <input type="radio" name="lighting" value={v} checked={studioOpts.lightingSensitivity===v} onChange={()=>setStudioOpts(o=>({...o,lightingSensitivity:v}))} style={{marginTop:1}}/>
                        <span style={{color:studioOpts.lightingSensitivity===v?C.purple:C.muted,fontWeight:studioOpts.lightingSensitivity===v?800:500}}>{STUDIO_LIGHTING_SENSITIVITY[v]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6}}>파일 처리 방식</div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {([["copy","복사 — 원본을 남기고 분류 폴더에 복사"],["move","이동 — 원본을 분류 폴더로 이동"]] as const).map(([v,label])=>(
                      <label key={v} style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:11,cursor:"pointer"}}>
                        <input type="radio" name="studioFileMode" value={v} checked={studioFileMode===v} onChange={()=>setStudioFileMode(v)} style={{marginTop:1}}/>
                        <span style={{color:studioFileMode===v?C.purple:C.muted,fontWeight:studioFileMode===v?800:500}}>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
            {!hasFS && <div style={{padding:14,background:"#FFF3CD",borderRadius:10,fontSize:12,color:"#856404",border:"1px solid #FFD980"}}>⚠️ Chrome 또는 Edge 브라우저에서만 파일 시스템 접근이 가능합니다.</div>}
            <Btn style={{background:C.purple}} onClick={handleStudioSort} disabled={!rootDir||!hasFS}>스튜디오 분류 시작 →</Btn>
          </>
        )}
      </div>
    );
  };

  /* ════════════════════════════════════════════
     FIELD STEPS
  ═══════════════════════════════════════════ */
  const FieldStep1 = () => (
    <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.teal}}>
        {fastAnalyzeMode ? "⚡ 빠른 분석 중 (파일 이동 없음)..." : "🔍 하이브리드 Scene 분석 중..."}
      </div>
      {!fastAnalyzeMode && <div style={{fontSize:11,color:C.muted}}>현재 단계: {classificationJobState}</div>}
      {progress.total > 0 && <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>}
      {progress.total === 0 && <div style={{fontSize:12,color:C.hint}}>{progress.msg || "스캔 중..."}</div>}
      <div style={{maxHeight:200,overflowY:"auto",fontSize:11,fontFamily:"monospace",background:"#F8FFFE",borderRadius:8,padding:12,border:`1px solid ${C.border}`}}>
        {copyLog.slice(-20).map((l,i)=><div key={i} style={{color:C.green}}>{l}</div>)}
      </div>
      {!fastAnalyzeMode && (
        <button onClick={()=>{ cancelRef.current=true; classificationAbortRef.current?.abort(); setClassificationJobState("CANCELLED"); }} style={{padding:"8px 16px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,cursor:"pointer",color:C.muted,fontFamily:"inherit",alignSelf:"flex-start"}}>
          분석 중단
        </button>
      )}
    </div>
  );

  const FieldStep2 = () => {
    const allLoaded = fieldScenes.every(s=>!s.nameLoading);
    const allApproved = fieldScenes.length > 0 && fieldScenes.every((scene) => scene.approved);
    const boundaryReviewCount = boundaryDecisions.filter((decision) => decision.needsReview).length;
    const totalJpg = fieldScenes.reduce((s,sc)=>s+sc.fileCount,0);
    const allFieldFiles = fieldScenes.flatMap((scene) => scene.files);
    return (
      <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:860}}>
        <div style={{padding:14,background: fastAnalyzeMode ? "#E8F0F5" : "#ECFDF5",borderRadius:10,fontSize:12,color: fastAnalyzeMode ? "#103A62" : "#166534",border:`1px solid ${fastAnalyzeMode ? "#B8CBD8" : "#A7F3D0"}`}}>
          {fastAnalyzeMode
            ? <><strong>⚡ 빠른 분석 완료</strong> — 파일이 이동되지 않았습니다. 씬 이름을 확인·수정하고 <strong>폴더 정리 실행</strong>을 눌러 실제로 파일을 이동하세요.</>
            : <><strong>🔍 하이브리드 분류 완료</strong> — 원본은 아직 이동되지 않았습니다. 경계 이유를 검토하고 Scene을 승인한 뒤 폴더 정리를 실행하세요. {boundaryReviewCount > 0 && <span style={{color:"#B45309"}}>검토 필요 {boundaryReviewCount}건</span>}</>
          }
          {(aiNamingEnabled||departmentLogicEnabled)&&!allLoaded&&<span style={{marginLeft:8,color:C.teal}}>AI 분석 중...</span>}
        </div>

        <div style={{display:"flex",gap:8,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
          <div style={{fontSize:11,color:C.muted}}>승인 {fieldScenes.filter((scene) => scene.approved).length}/{fieldScenes.length}</div>
          <button onClick={approveAllFieldScenes} style={{padding:"7px 14px",borderRadius:7,border:"none",background:C.teal,color:"#fff",fontSize:11,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>전체 승인</button>
        </div>

        <div style={{border:`1px solid ${C.border}`,borderRadius:10,background:C.white,overflow:"hidden"}}>
          <button onClick={()=>setEvaluationMode((value)=>!value)} style={{width:"100%",padding:"10px 14px",border:"none",background:"transparent",display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:900,color:C.teal,cursor:"pointer",fontFamily:"inherit"}}>
            <span>정확도 평가 모드</span><span>{evaluationMode?"접기 ▴":"열기 ▾"}</span>
          </button>
          {evaluationMode && (
            <div style={{padding:"12px 14px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:10,color:C.muted,lineHeight:1.6}}>실제 Scene이 시작되는 사진을 정답 경계로 추가하세요. 자동 경계와 ±1장 허용으로 비교합니다.</div>
              {allFieldFiles.length > 1 && (
                <div style={{display:"flex",gap:6}}>
                  <select value={groundTruthSelection} onChange={(event)=>setGroundTruthSelection(Number(event.target.value))} style={{flex:1,minWidth:0,height:30,border:`1px solid ${C.border}`,borderRadius:6,fontSize:10,fontFamily:"inherit"}}>
                    {allFieldFiles.slice(1).map((file,index)=><option key={`${file.name}-${index}`} value={index+1}>{file.name}부터 새 Scene</option>)}
                  </select>
                  <button onClick={()=>setGroundTruthBoundaries((previous)=>Array.from(new Set([...previous,groundTruthSelection])).sort((a,b)=>a-b))} style={{padding:"0 10px",border:"none",borderRadius:6,background:C.teal,color:"#fff",fontSize:10,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>정답 추가</button>
                </div>
              )}
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {groundTruthBoundaries.map((boundary)=><button key={boundary} onClick={()=>setGroundTruthBoundaries((previous)=>previous.filter((item)=>item!==boundary))} style={{border:"1px solid #BBF7D0",borderRadius:5,background:"#F0FDF4",color:"#166534",fontSize:9,padding:"3px 6px",cursor:"pointer"}}>{allFieldFiles[boundary]?.name ?? boundary} ×</button>)}
                {groundTruthBoundaries.length===0&&<span style={{fontSize:10,color:C.hint}}>정답 경계가 아직 없습니다.</span>}
              </div>
              <button disabled={groundTruthBoundaries.length===0} onClick={()=>setAccuracyReport(evaluateSceneBoundaries({predictedBoundaries:boundaryDecisions.filter((decision)=>decision.decision!=="merge").map((decision)=>decision.boundaryIndex),groundTruthBoundaries,totalImages:allFieldFiles.length,tolerance:1}))} style={{alignSelf:"flex-start",padding:"6px 10px",border:"none",borderRadius:6,background:groundTruthBoundaries.length?"#103A62":"#D1D5DB",color:"#fff",fontSize:10,fontWeight:800,cursor:groundTruthBoundaries.length?"pointer":"default",fontFamily:"inherit"}}>평가 계산</button>
              {accuracyReport && (
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:6}}>
                  {[["Precision",accuracyReport.boundaryPrecision],["Recall",accuracyReport.boundaryRecall],["Boundary F1",accuracyReport.boundaryF1],["Scene Purity",accuracyReport.scenePurity],["과분할률",accuracyReport.overSegmentationRate],["미분할률",accuracyReport.underSegmentationRate]].map(([label,value])=><div key={String(label)} style={{padding:8,borderRadius:6,background:C.bg,fontSize:9,color:C.muted}}><strong style={{display:"block",fontSize:13,color:C.teal}}>{Math.round(Number(value)*100)}%</strong>{label}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 병합/분리 후보 요약 */}
        {(() => {
          const activeMerge = mergeCandidates.filter(c => c.recommendedAction === "merge" && !dismissedCandidates.has(c.id));
          const activeSplit = mergeCandidates.filter(c => c.recommendedAction === "keep_split" && !dismissedCandidates.has(c.id));
          if (activeMerge.length === 0 && activeSplit.length === 0) return null;
          return (
            <div style={{padding:"10px 14px",background:"#F8FAFC",borderRadius:10,border:`1px solid ${C.border}`,fontSize:11,color:C.muted,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontWeight:800,color:C.txt}}>AI 씬 분석 결과</span>
              {activeMerge.length > 0 && (
                <span style={{background:"#E8F0F5",color:"#103A62",borderRadius:5,padding:"2px 8px",fontWeight:700}}>
                  🔗 병합 후보 {activeMerge.length}건
                </span>
              )}
              {activeSplit.length > 0 && (
                <span style={{background:"#FFEDD5",color:"#C2410C",borderRadius:5,padding:"2px 8px",fontWeight:700}}>
                  ✂️ 분리 유지 추천 {activeSplit.length}건
                </span>
              )}
              <span style={{color:C.hint}}>씬 사이 카드를 확인하세요</span>
            </div>
          );
        })()}

        <Card>
          <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>
            씬 검토 — JPG {totalJpg}장 / RAW {fieldRawCount}개 / {DEPARTMENT_DISPLAY[department]}
          </div>
          <div style={{padding:"8px 0"}}>
            {fieldScenes.map((sc,i)=>{
              const nextSc = fieldScenes[i+1];
              // candidate between scene[i] and scene[i+1]
              const candidate = nextSc
                ? mergeCandidates.find(c =>
                    c.fromFolderName === sc.folderName &&
                    c.toFolderName === nextSc.folderName &&
                    !dismissedCandidates.has(c.id)
                  )
                : undefined;

              const dismissCandidate = (cid: string, action: "keep_split") => {
                const cand = mergeCandidates.find(c => c.id === cid);
                if (cand) {
                  setMergeDecisions(prev => [...prev, {
                    candidateId: cand.id, userAction: action,
                    fromFolderName: cand.fromFolderName, toFolderName: cand.toFolderName,
                    fromSceneType: cand.fromSceneType, toSceneType: cand.toSceneType,
                    mergeScore: cand.mergeScore, matchedSignals: cand.matchedSignals,
                    blockedSignals: cand.blockedSignals, recommendedAction: cand.recommendedAction,
                  }]);
                }
                setDismissedCandidates(prev => new Set([...prev, cid]));
              };

              return (
                <div key={i}>
                  {sc.boundaryBefore && (
                    <div style={{margin:"8px 12px 0",padding:"9px 12px",borderRadius:8,background:sc.boundaryBefore.needsReview?"#FFF7ED":"#F0FDF4",border:`1px solid ${sc.boundaryBefore.needsReview?"#FED7AA":"#BBF7D0"}`}}>
                      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",fontSize:10}}>
                        <strong style={{color:sc.boundaryBefore.needsReview?"#C2410C":"#166534"}}>경계 {Math.round(sc.boundaryBefore.score*100)}%</strong>
                        <span style={{color:C.muted}}>{sc.boundaryBefore.source}</span>
                        {sc.boundaryBefore.forced && <span style={{padding:"1px 5px",borderRadius:4,background:"#FEE2E2",color:"#B91C1C",fontWeight:800}}>강제 분리</span>}
                        {sc.boundaryBefore.needsReview && <span style={{padding:"1px 5px",borderRadius:4,background:"#FFEDD5",color:"#C2410C",fontWeight:800}}>검토 필요</span>}
                      </div>
                      <div style={{fontSize:10,color:C.muted,lineHeight:1.6,marginTop:3}}>{sc.boundaryBefore.reasons.join(" · ")}</div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:5}}>
                        {[["인물",sc.boundaryBefore.features.personChangeScore],["장소",sc.boundaryBefore.features.locationChangeScore],["장비",sc.boundaryBefore.features.equipmentChangeScore],["의미",sc.boundaryBefore.features.sceneTypeChangeScore],["시각",sc.boundaryBefore.features.visualChangeScore],["자세",sc.boundaryBefore.features.poseChangeScore]].map(([label,value])=><span key={String(label)} style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"rgba(255,255,255,.7)",color:C.muted}}>{label} {Math.round(Number(value)*100)}</span>)}
                      </div>
                    </div>
                  )}
                  {/* Scene card */}
                  {/* PHASE 4(2026-08-30) — 씬을 클릭하면 Olivia Agent Context에 "지금 선택된 씬"으로
                      반영된다. 채팅에서 "이 씬 이름 바꿔"처럼 말할 때 몇 번 씬인지 다시 묻지
                      않기 위함(스펙 §33) — 카드 안 입력칸/버튼 클릭도 함께 선택되지만 부작용 없음. */}
                  <div onClick={()=>useOliviaContextStore.getState().setSelection("photo_scene", String(sc.index))} style={{borderBottom:`1px solid ${C.border}`,padding:"12px 20px"}}>
                    <div className="pc-mobile-form-grid" style={{display:"grid",gridTemplateColumns:"100px auto 1fr auto",gap:12,alignItems:"start"}}>
                      {/* 썸네일 */}
                      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                        {Array.from(new Set([0, sc.files.length-1])).map((fileIndex,fi)=>sc.files[fileIndex]?.thumbUrl
                          ?<img key={fi} src={sc.files[fileIndex].thumbUrl!} style={{width:44,height:32,objectFit:"cover",borderRadius:3}} alt={fi===0?"Scene 시작":"Scene 마지막"}/>
                          :<div key={fi} style={{width:44,height:32,background:C.border,borderRadius:3}}/>
                        )}
                      </div>
                      {/* 정보 */}
                      <div style={{fontSize:10,color:C.hint,fontFamily:"monospace",whiteSpace:"nowrap"}}>
                        {sc.fileCount}장<br/>
                        {formatTime(sc.startTime)}<br/>
                        {formatTime(sc.endTime)}
                      </div>
                      {/* 이름 편집 */}
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {sc.nameLoading
                          ? <div style={{height:34,display:"flex",alignItems:"center",fontSize:12,color:C.hint}}>AI 분석 중...</div>
                          : <input value={sc.editedName} onChange={e=>setFieldScenes(prev=>prev.map((s,j)=>j===i?{...s,editedName:e.target.value}:s))} onBlur={()=>{
                              if (sc.editedName === sc.folderName) return;
                              setSceneCorrections((previous)=>[...previous,{projectId:rootDir?.name??"local",boundaryIndex:sc.boundaryBefore?.boundaryIndex??0,boundaryFileName:sc.files[0]?.name??"",previousDecision:"split",correctedDecision:"split",action:"rename",features:sc.boundaryBefore?.features??EMPTY_BOUNDARY_FEATURES,reason:`${sc.folderName} → ${sc.editedName}`,createdAt:new Date().toISOString()}]);
                            }} style={{width:"100%",height:34,border:`1.5px solid ${C.border}`,borderRadius:8,padding:"0 10px",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
                        }
                        {sc.suggestedName && !sc.nameLoading && (
                          <div style={{fontSize:10,color:C.muted}}>
                            추천: <button onClick={()=>setFieldScenes(prev=>prev.map((s,j)=>j===i?{...s,editedName:sc.suggestedName!}:s))} style={{border:"none",background:"none",cursor:"pointer",color:C.teal,fontSize:10,fontFamily:"inherit",fontWeight:800}}>{sc.suggestedName}</button>
                            {sc.aiConfidence&&<span style={{marginLeft:4,color:C.hint}}>{Math.round(sc.aiConfidence*100)}%</span>}
                          </div>
                        )}
                        {sc.sceneType && !sc.nameLoading && (
                          <div style={{fontSize:9,background:C.light,color:C.teal,display:"inline-block",padding:"1px 8px",borderRadius:4,width:"fit-content"}}>
                            {sc.sceneType}{sc.aiReason&&<span style={{color:C.muted,marginLeft:4}}>{sc.aiReason}</span>}
                          </div>
                        )}
                        {!sc.sceneDir && sc.files.length > 1 && (
                          <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4}}>
                            <select value={splitPositions[sc.index] ?? 1} onChange={(event)=>setSplitPositions((previous)=>({...previous,[sc.index]:Number(event.target.value)}))} style={{minWidth:0,flex:1,height:28,border:`1px solid ${C.border}`,borderRadius:6,fontSize:9,fontFamily:"inherit"}}>
                              {sc.files.slice(1).map((file,offset)=><option key={file.name} value={offset+1}>{file.name} 앞에서 분할</option>)}
                            </select>
                            <button onClick={()=>splitFieldScene(i,splitPositions[sc.index]??1)} style={{height:28,padding:"0 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.white,color:C.teal,fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>분할</button>
                          </div>
                        )}
                      </div>
                      {/* 합치기 버튼 */}
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {i > 0 && <button onClick={()=>mergeFieldScenes(i-1,i)} style={{fontSize:9,padding:"4px 8px",borderRadius:4,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",color:C.muted,fontFamily:"inherit",whiteSpace:"nowrap"}}>↑ 합치기</button>}
                        {i < fieldScenes.length-1 && <button onClick={()=>mergeFieldScenes(i,i+1)} style={{fontSize:9,padding:"4px 8px",borderRadius:4,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",color:C.muted,fontFamily:"inherit",whiteSpace:"nowrap"}}>↓ 합치기</button>}
                        <button onClick={()=>approveFieldScene(i)} disabled={sc.approved} style={{fontSize:9,padding:"4px 8px",borderRadius:4,border:`1px solid ${sc.approved?"#BBF7D0":C.teal}`,background:sc.approved?"#F0FDF4":C.teal,cursor:sc.approved?"default":"pointer",color:sc.approved?"#166534":"#fff",fontFamily:"inherit",whiteSpace:"nowrap"}}>{sc.approved?"승인됨":"승인"}</button>
                      </div>
                    </div>
                  </div>

                  {/* Candidate card between scene[i] and scene[i+1] */}
                  {candidate && (
                    <div style={{
                      margin:"0 12px",
                      padding:"10px 14px",
                      borderRadius:8,
                      border: candidate.recommendedAction === "merge"
                        ? "1.5px solid #B8CBD8"
                        : "1.5px solid #FED7AA",
                      background: candidate.recommendedAction === "merge"
                        ? "#E8F0F5"
                        : "#FFF7ED",
                      display:"flex",flexDirection:"column",gap:6,
                    }}>
                      <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"space-between"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:13}}>
                            {candidate.recommendedAction === "merge" ? "🔗" : "✂️"}
                          </span>
                          <span style={{fontSize:11,fontWeight:900,
                            color: candidate.recommendedAction === "merge" ? "#103A62" : "#C2410C",
                          }}>
                            {candidate.recommendedAction === "merge" ? "병합 후보" : "분리 유지 추천"}
                          </span>
                          {candidate.recommendedAction === "merge" && (
                            <span style={{fontSize:10,color:"#315F7F",background:"#E8F0F5",borderRadius:4,padding:"1px 6px"}}>
                              유사도 {Math.round(candidate.mergeScore * 100)}%
                            </span>
                          )}
                          {candidate.recommendedAction === "keep_split" && (
                            <span style={{fontSize:10,color:"#C2410C",background:"#FFEDD5",borderRadius:4,padding:"1px 6px"}}>
                              전환 강도 {Math.round(candidate.transitionStrength * 100)}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 양쪽 씬 썸네일 미리보기 */}
                      {nextSc && (
                        <div style={{display:"flex",gap:6,alignItems:"stretch",background:"rgba(0,0,0,.04)",borderRadius:6,padding:"6px 8px"}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:8,color:"#6B7280",marginBottom:3,fontWeight:700}}>{sc.editedName}</div>
                            <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                              {sc.files.slice(0,5).map((f,fi)=>f.thumbUrl
                                ?<img key={fi} src={f.thumbUrl} style={{width:44,height:32,objectFit:"cover",borderRadius:3,flexShrink:0}} alt=""/>
                                :<div key={fi} style={{width:44,height:32,background:"#D1D5DB",borderRadius:3,flexShrink:0}}/>
                              )}
                            </div>
                          </div>
                          <div style={{width:1,background:"#D1D5DB",margin:"0 2px"}}/>
                          <div style={{flex:1}}>
                            <div style={{fontSize:8,color:"#6B7280",marginBottom:3,fontWeight:700}}>{nextSc.editedName}</div>
                            <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                              {nextSc.files.slice(0,5).map((f,fi)=>f.thumbUrl
                                ?<img key={fi} src={f.thumbUrl} style={{width:44,height:32,objectFit:"cover",borderRadius:3,flexShrink:0}} alt=""/>
                                :<div key={fi} style={{width:44,height:32,background:"#D1D5DB",borderRadius:3,flexShrink:0}}/>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div style={{fontSize:10,
                        color: candidate.recommendedAction === "merge" ? "#103A62" : "#9A3412",
                        lineHeight:1.6,
                      }}>
                        {candidate.reason}
                      </div>

                      {candidate.matchedSignals.length > 0 && candidate.recommendedAction === "merge" && (
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {candidate.matchedSignals.map((s,si)=>(
                            <span key={si} style={{fontSize:9,background:"#E8F0F5",color:"#103A62",borderRadius:4,padding:"1px 6px"}}>{s}</span>
                          ))}
                        </div>
                      )}

                      {candidate.blockedSignals.length > 0 && candidate.recommendedAction === "keep_split" && (
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {candidate.blockedSignals.slice(0,3).map((s,si)=>(
                            <span key={si} style={{fontSize:9,background:"#FFEDD5",color:"#9A3412",borderRadius:4,padding:"1px 6px"}}>{s}</span>
                          ))}
                        </div>
                      )}

                      <div style={{display:"flex",gap:6,marginTop:2}}>
                        {candidate.recommendedAction === "merge" ? (
                          <>
                            <button
                              onClick={()=>mergeFieldScenes(i,i+1,candidate.id)}
                              style={{padding:"5px 12px",background:"#103A62",color:"#fff",border:"none",borderRadius:6,fontSize:10,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}
                            >
                              병합하기
                            </button>
                            <button
                              onClick={()=>dismissCandidate(candidate.id,"keep_split")}
                              style={{padding:"5px 12px",background:"transparent",color:"#6B7280",border:"1px solid #D1D5DB",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                            >
                              분리 유지
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={()=>dismissCandidate(candidate.id,"keep_split")}
                              style={{padding:"5px 12px",background:"#EA580C",color:"#fff",border:"none",borderRadius:6,fontSize:10,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}
                            >
                              분리 유지
                            </button>
                            <button
                              onClick={()=>mergeFieldScenes(i,i+1,candidate.id)}
                              style={{padding:"5px 12px",background:"transparent",color:"#6B7280",border:"1px solid #D1D5DB",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                            >
                              병합하기
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <div className="ps-btn-row">
          <Btn variant="secondary" onClick={()=>setStep(0)}>← 처음으로</Btn>
          <Btn onClick={handleConfirmScenes} disabled={!allLoaded || !allApproved}>
            {!allLoaded ? "AI 분석 중..." : !allApproved ? "Scene 승인 필요" : "📁 승인 결과로 폴더 정리 →"}
          </Btn>
        </div>
      </div>
    );
  };

  const FieldStep3 = () => (
    <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.teal}}>
        {fastAnalyzeMode ? "📁 폴더 정리 실행 중..." : "분석 중..."}
      </div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
      <div style={{fontSize:11,color:C.hint,lineHeight:1.7}}>
        {fastAnalyzeMode && "• RAW 이동 → JPG 씬 폴더 정리 중\n"}
        {qualityAnalysisEnabled && "• 흔들림·조명불량 분석 중\n"}
        {profileClassificationEnabled && "• 프로필 자동 분류 중 (엄격 모드)"}
      </div>
      <button onClick={()=>{cancelRef.current=true;}} style={{padding:"8px 16px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,cursor:"pointer",color:C.muted,fontFamily:"inherit",alignSelf:"flex-start"}}>중단</button>
    </div>
  );

  const FieldStep4 = () => {
    if (!fieldStats) return null;

    /* ── 셀렉 탭: 썸네일 그리드 + 선택 UI ── */
    const SelectTab = () => {
      const totalPhotos = fieldScenes.reduce((a, s) => a + s.files.length, 0);
      const totalSelected = inAppSelected.size;
      const smallBtn: React.CSSProperties = {
        padding:"4px 10px", fontSize:11, fontWeight:700, background:C.white,
        border:`1px solid ${C.border}`, borderRadius:6, cursor:"pointer", color:C.muted, fontFamily:"inherit",
      };
      return (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* 선택 현황 헤더 */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:C.white,borderRadius:10,border:`1px solid ${C.border}`}}>
            <div>
              <span style={{fontSize:14,fontWeight:900,color:C.teal}}>{totalSelected}장 선택됨</span>
              <span style={{fontSize:11,color:C.hint,marginLeft:8}}>/ 전체 {totalPhotos}장</span>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button style={smallBtn} onClick={()=>setInAppSelected(new Set(fieldScenes.flatMap(s=>s.files.map(f=>f.basename.toLowerCase()))))}>전체 선택</button>
              <button style={smallBtn} onClick={()=>setInAppSelected(new Set())}>전체 해제</button>
            </div>
          </div>

          {/* 씬별 썸네일 그리드 */}
          {fieldScenes.map((scene, si)=>{
            const sceneSelected = scene.files.filter(f=>inAppSelected.has(f.basename.toLowerCase())).length;
            const isExpanded = selectExpandedScenes.has(si);
            return (
              <div key={si} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>
                <div
                  onClick={()=>{
                    setSelectExpandedScenes(prev=>{
                      const next = new Set(prev);
                      if (next.has(si)) { next.delete(si); }
                      else { next.add(si); loadSceneThumbs(si); }
                      return next;
                    });
                  }}
                  style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",userSelect:"none"}}
                >
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:28,height:28,borderRadius:6,background:sceneSelected>0?C.teal:C.border,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:11,fontWeight:800,transition:"background .2s"}}>{si+1}</div>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:C.txt}}>{scene.editedName}</div>
                      <div style={{fontSize:10,color:C.hint}}>{scene.fileCount}장</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {sceneSelected>0&&<span style={{fontSize:11,fontWeight:700,color:C.teal,background:C.light,padding:"2px 8px",borderRadius:10}}>✓ {sceneSelected}</span>}
                    <span style={{fontSize:10,color:C.hint}}>{isExpanded?"▲":"▼"}</span>
                  </div>
                </div>
                {isExpanded&&(
                  <div style={{borderTop:`1px solid ${C.border}`,padding:12}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:6}}>
                      {scene.files.map(f=>{
                        const k = f.basename.toLowerCase();
                        const isSel = inAppSelected.has(k);
                        return (
                          <div
                            key={f.name}
                            onClick={()=>setInAppSelected(prev=>{ const n=new Set(prev); n.has(k)?n.delete(k):n.add(k); return n; })}
                            style={{position:"relative",cursor:"pointer",borderRadius:6,overflow:"hidden",border:isSel?`2.5px solid ${C.teal}`:`1.5px solid ${C.border}`,aspectRatio:"3/2",background:C.border}}
                          >
                            {f.thumbUrl
                              ?<img src={f.thumbUrl} alt={f.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                              :<div style={{width:"100%",height:"100%",background:"#e5eeec"}}/>
                            }
                            {isSel&&<div style={{position:"absolute",top:3,right:3,width:16,height:16,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"white",fontWeight:900}}>✓</div>}
                            <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.55)",padding:"2px 4px",fontSize:7,color:"rgba(255,255,255,.85)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* 액션 버튼 */}
          <div className="ps-btn-row" style={{paddingTop:4}}>
            <Btn variant="secondary" onClick={()=>setStep(2)}>← 씬 검토</Btn>
            <Btn onClick={runInAppRawMatch} style={{opacity:totalSelected===0?0.4:1}} disabled={totalSelected===0}>
              {totalSelected>0?`${totalSelected}장 선택 → RAW 매칭`:"사진을 선택하세요"}
            </Btn>
          </div>
        </div>
      );
    };

    /* ── Bridge 가이드 탭 (기존 내용) ── */
    const GuideTab = () => (
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <div style={{background:"#F0FDF4",borderRadius:12,border:"1px solid #86EFAC",padding:20}}>
          <div style={{fontSize:13,fontWeight:800,color:"#166534",marginBottom:10}}>베스트컷 선택 방법 (Bridge/Finder)</div>
          <div style={{fontSize:12,color:"#166534",lineHeight:2}}>
            1. Finder에서 <strong>JPG/</strong> 폴더 열기<br/>
            2. 각 씬 폴더 안에서 베스트컷 선택<br/>
            3. 선택한 JPG를 <strong>SELECT/JPG_SELECT/</strong> 폴더로 복사<br/>
            4. 완료되면 아래 [RAW SELECT 시작] 클릭
          </div>
        </div>
        <div style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"14px 16px"}}>
          <div style={{fontSize:10,color:C.hint,marginBottom:6,fontWeight:700}}>폴더 구조</div>
          <div style={{fontSize:11,fontFamily:"monospace",color:C.txt,lineHeight:2}}>
            {rootDir?.name ?? "폴더명"}/<br/>
            &nbsp;&nbsp;├ RAW/ (전체 RAW)<br/>
            &nbsp;&nbsp;├ JPG/<br/>
            &nbsp;&nbsp;│&nbsp;&nbsp;├ Scene01/<br/>
            &nbsp;&nbsp;│&nbsp;&nbsp;└ Scene02/<br/>
            {fieldStats.totalProfile>0&&<>&nbsp;&nbsp;├ PROFILE/<br/></>}
            &nbsp;&nbsp;└ <strong>SELECT/</strong><br/>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├ <strong>JPG_SELECT/</strong> ← 베스트컷 여기에<br/>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└ RAW_SELECT/ (자동 생성됨)
          </div>
        </div>
        <div className="ps-btn-row">
          <Btn variant="secondary" onClick={()=>setStep(2)}>← 씬 검토</Btn>
          <Btn variant="secondary" onClick={()=>{ const a=document.createElement("a"); a.href="bridge://"; a.click(); }}>Bridge 열기</Btn>
          <Btn onClick={runRawSelect}>RAW SELECT 시작 →</Btn>
        </div>
      </div>
    );

    return (
      <div style={{maxWidth:640,display:"flex",flexDirection:"column",gap:16}}>
        {/* 통계 요약 */}
        <div style={{fontSize:14,fontWeight:800,color:C.green}}>분류 완료 — 베스트컷을 선택해주세요</div>
        <div className="pc-mobile-form-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {[
            {label:"씬",       value:fieldStats.totalScenes,       color:C.teal},
            {label:"전체 JPG", value:fieldStats.totalJpg,          color:C.txt},
            {label:"프로필",   value:fieldStats.totalProfile,      color:C.purple},
          ].concat(fieldStats.totalQualityReject>0?[{label:"품질제외",value:fieldStats.totalQualityReject,color:C.red}]:[]).map(({label,value,color})=>(
            <div key={label} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:900,color}}>{value}</div>
              <div style={{fontSize:10,color:C.hint,marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>

        {/* 내부 탭 */}
        <div style={{display:"flex",gap:0,borderBottom:`2px solid ${C.border}`,marginBottom:4}}>
          {(["guide","select"] as const).map(t=>{
            const label = t==="guide" ? "Bridge 가이드" : "앱에서 셀렉 & 매칭";
            const active = selectTabView===t;
            return (
              <button
                key={t}
                onClick={()=>setSelectTabView(t)}
                style={{
                  padding:"9px 18px", fontSize:12, fontWeight:active?800:600,
                  color:active?C.teal:C.hint, background:"none", border:"none",
                  borderBottom:active?`2.5px solid ${C.teal}`:"2.5px solid transparent",
                  cursor:"pointer", fontFamily:"inherit", marginBottom:-2, whiteSpace:"nowrap",
                }}
              >{label}</button>
            );
          })}
        </div>

        {selectTabView==="guide" ? <GuideTab/> : <SelectTab/>}
      </div>
    );
  };

  const FieldStep5 = () => (
    <div style={{maxWidth:680,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.teal}}>RAW SELECT 처리 중...</div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
      <div style={{maxHeight:260,overflowY:"auto",fontSize:11,fontFamily:"monospace",background:"#F8FFFE",borderRadius:8,padding:12,border:`1px solid ${C.border}`}}>
        {copyLog.slice(-40).map((l,i)=><div key={i} style={{color:l.startsWith("✅")?C.green:l.startsWith("❌")?C.red:C.yellow}}>{l}</div>)}
      </div>
      <div style={{fontSize:11,color:C.hint}}>원본 RAW 파일은 삭제되지 않습니다. 선택된 RAW만 SELECT/RAW_SELECT/로 이동합니다.</div>
    </div>
  );

  const FieldStep6 = () => {
    if (!fieldStats) return null;
    const rows = [
      {label:"처리된 씬",       value:fieldStats.totalScenes,         color:C.teal},
      {label:"전체 JPG",         value:fieldStats.totalJpg,            color:C.txt},
      {label:"원본 RAW",         value:fieldStats.totalRaw,            color:C.muted},
      {label:"품질 제외",        value:fieldStats.totalQualityReject,  color:C.red},
      {label:"프로필 분류",      value:fieldStats.totalProfile,        color:"#7C3AED"},
      {label:"선택 JPG",         value:fieldStats.selectedJpg,         color:C.teal},
      {label:"RAW SELECT 완료",  value:fieldStats.selectedRawMoved,    color:C.green},
      {label:"RAW 누락",         value:fieldStats.rawMissing,          color:fieldStats.rawMissing>0?C.red:C.hint},
    ];
    return (
      <Card style={{maxWidth:580}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.green}}>✅ 완료!</div>
        <div style={{padding:20}}>
          <div className="pc-mobile-form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            {rows.map(({label,value,color})=>(
              <div key={label} style={{background:C.bg,borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:20,fontWeight:900,color:color??C.txt}}>{value}</div>
                <div style={{fontSize:10,color:C.hint,marginTop:2}}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.light,borderRadius:10,padding:14,fontSize:11,color:C.muted,marginBottom:16,lineHeight:1.9}}>
            📁 <strong style={{color:C.teal}}>RAW/</strong> — 전체 RAW (이동 완료)<br/>
            📁 <strong style={{color:C.teal}}>JPG/SceneXX/</strong> — 씬별 JPG<br/>
            📁 <strong style={{color:C.teal}}>SELECT/RAW_SELECT/</strong> — 선택 RAW ({rawSelectMode==="move"?"이동":"복사"} 완료)<br/>
            📊 <strong style={{color:C.teal}}>REPORT/</strong> — scene_report, quality_report, raw_select_report, summary.json
          </div>
          <div className="ps-btn-row">
            <Btn variant="secondary" onClick={()=>downloadCSV(makeCSV(["scene","folder_name","file_count","start_time","end_time","scene_type"],fieldScenes.map(sc=>[String(sc.index),sc.editedName,String(sc.fileCount),new Date(sc.startTime).toISOString(),new Date(sc.endTime).toISOString(),sc.sceneType??""])),"scene_report.csv")}>↓ 씬 리포트 CSV</Btn>
            <Btn onClick={()=>{clearSession();setStep(0);setFieldScenes([]);setRootDir(null);setFieldRawCount(0);setCopyLog([]);setFieldStats(null);setMergeCandidates([]);setDismissedCandidates(new Set());setMergeDecisions([]);}}>처음으로</Btn>
          </div>
          {fieldScenes.length > 0 && (
            <div style={{marginTop:16,padding:16,background:"#EAF4F2",borderRadius:10,border:"1.5px solid #B2D8D4"}}>
              <div style={{fontSize:13,fontWeight:800,color:C.teal,marginBottom:4}}>📸 고객 셀렉 갤러리 자동 생성</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.7}}>
                분류된 씬의 실제 JPG를 Supabase Storage에 업로드하고 셀렉 갤러리를 만듭니다.<br/>
                업로드 후 브랜드메일 초안을 자동 생성합니다.
              </div>

              {galleryProgress && (
                <div style={{marginBottom:12,background:C.white,borderRadius:8,padding:"12px 14px",fontSize:12}}>
                  <div style={{fontWeight:700,color:C.teal,marginBottom:6}}>{galleryProgress.step}</div>
                  {galleryProgress.total > 0 && (
                    <>
                      <div style={{height:6,background:C.border,borderRadius:3,overflow:"hidden",marginBottom:4}}>
                        <div style={{height:"100%",width:`${Math.round(galleryProgress.cur/galleryProgress.total*100)}%`,background:C.teal,borderRadius:3,transition:"width .2s"}}/>
                      </div>
                      <div style={{color:C.muted}}>{galleryProgress.cur} / {galleryProgress.total}장</div>
                    </>
                  )}
                </div>
              )}

              <Btn disabled={creatingGallery} onClick={async () => {
                setCreatingGallery(true);
                setGalleryProgress({ step: "1. 갤러리 레코드 생성 중...", cur: 0, total: 0 });
                try {
                  // 1) 갤러리 생성 (파일명 메타데이터만)
                  const scenes = fieldScenes.map((sc, i) => ({
                    sceneId: `scene-${i+1}`,
                    sceneName: sc.editedName,
                    folderName: sc.folderName ?? `Scene${String(i+1).padStart(2,"0")}`,
                    images: sc.files.map((f, j) => ({
                      originalFileName: f.name,
                      basename: f.basename,
                      sortOrder: j,
                    })),
                  }));
                  const createRes = await fetch("/api/select-galleries/create-from-photo-sorting", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      clientId: clientId || undefined,
                      workflowRunId: workflowRunId || undefined,
                      title: `${rootDir?.name ?? "촬영"} 셀렉 갤러리`,
                      shootingDate: new Date().toISOString().slice(0,10),
                      scenes,
                    }),
                  });
                  const createData = await createRes.json();
                  if (!createData.ok) throw new Error(createData.error ?? "갤러리 생성 실패");
                  const galleryId = createData.gallery.id;

                  // 2) 실제 JPG 파일 업로드 (씬별, 배치 5장)
                  const allFiles: { handle: FileSystemFileHandle; name: string; sceneName: string; folderName: string; sortOrder: number }[] = [];
                  fieldScenes.forEach((sc, si) => {
                    sc.files.forEach((f, fi) => {
                      allFiles.push({ handle: f.handle, name: f.name, sceneName: sc.editedName, folderName: sc.folderName ?? `Scene${String(si+1).padStart(2,"0")}`, sortOrder: si * 10000 + fi });
                    });
                  });

                  const BATCH = 5;
                  let uploaded = 0;
                  const failed: string[] = [];

                  for (let i = 0; i < allFiles.length; i += BATCH) {
                    const batch = allFiles.slice(i, i + BATCH);
                    setGalleryProgress({ step: `2. JPG 업로드 중... (${uploaded}/${allFiles.length}장)`, cur: uploaded, total: allFiles.length });
                    const fd = new FormData();
                    for (const item of batch) {
                      try {
                        const file = await item.handle.getFile();
                        fd.append("files", file, item.name);
                      } catch { failed.push(item.name); }
                    }
                    fd.set("scene_name", batch[0]?.sceneName ?? "");
                    fd.set("folder_name", batch[0]?.folderName ?? "");
                    try {
                      const upRes = await fetch(`/api/select-galleries/${galleryId}/upload-images`, { method: "POST", body: fd });
                      const upData = await upRes.json();
                      uploaded += upData.uploaded ?? 0;
                    } catch { batch.forEach(b => failed.push(b.name)); }
                  }

                  setGalleryProgress({ step: `3. 완료! ${uploaded}장 업로드${failed.length ? ` (실패 ${failed.length}장)` : ""}`, cur: uploaded, total: allFiles.length });

                  // 3) 페이지 이동
                  await new Promise(r => setTimeout(r, 800));
                  const navParams = new URLSearchParams();
                  if (clientId) navParams.set("clientId", clientId);
                  if (workflowRunId) navParams.set("workflowRunId", workflowRunId);
                  navParams.set("stepKey", "client_selection");
                  router.push(`/select-galleries/${galleryId}?${navParams.toString()}`);
                } catch(e:any) {
                  alert("오류: " + e.message);
                  setGalleryProgress(null);
                }
                setCreatingGallery(false);
              }}>
                {creatingGallery ? "업로드 중..." : "📸 고객 셀렉 갤러리 자동 생성 →"}
              </Btn>
            </div>
          )}
        </div>
      </Card>
    );
  };

  /* ════════════════════════════════════════════
     STUDIO STEPS
  ═══════════════════════════════════════════ */
  const StudioStep1 = () => (
    <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.purple}}>파일 분류 중...</div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
    </div>
  );

  const StudioStep2 = () => {
    const analyzed = studioFiles.filter(f=>f.analyzed).length;
    const total    = studioFiles.length;
    return (
      <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:16}}>
        <div style={{fontSize:14,fontWeight:800,color:C.purple}}>
        {studioSubMode === "group" ? "AI 얼굴 분석 중..." : "AI 의상·포즈·조명 분석 중..."}
      </div>
        <ProgressBar cur={analyzed} total={total} msg={progress.msg}/>
        <div className="pc-mobile-form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[["전체 JPG",total,C.teal],["분석 완료",analyzed,C.green],["ETC 후보",studioFiles.filter(f=>f.groupKey==="__ETC__").length,C.red]].map(([l,v,c])=>(
            <div key={l as string} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"10px 14px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:900,color:c as string}}>{v}</div>
              <div style={{fontSize:10,color:C.hint}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const StudioStep3 = () => {
    const etcGroup    = studioGroups.find(g=>g.isEtc);
    const normalGroups = studioGroups.filter(g=>!g.isEtc);
    return (
      <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:820}}>
        <div style={{padding:14,background:"#F5F0FF",borderRadius:10,fontSize:12,color:C.purple,border:"1px solid #DDD6FE"}}>
          AI가 의상·포즈 기준으로 그룹을 분류했습니다. 폴더명을 수정한 후 <strong>승인</strong>해주세요.
        </div>
        {etcGroup && (
          <Card>
            <div style={{padding:"12px 18px",background:"#FEF2F2",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:12,fontWeight:900,color:C.red}}>00_ETC_조명불량</span>
              <span style={{fontSize:11,color:C.red,background:"#FEE2E2",padding:"2px 8px",borderRadius:20}}>{etcGroup.files.length}장</span>
            </div>
            <div style={{display:"flex",gap:4,padding:"10px 18px",overflowX:"auto"}}>
              {etcGroup.files.slice(0,8).map(f=>f.thumbUrl?<img key={f.name} src={f.thumbUrl} style={{width:52,height:38,objectFit:"cover",borderRadius:4,flexShrink:0}} alt=""/>:<div key={f.name} style={{width:52,height:38,background:C.border,borderRadius:4,flexShrink:0}}/>)}
            </div>
          </Card>
        )}
        <Card>
          <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>
            의상·포즈 그룹 — {normalGroups.length}개 / {normalGroups.reduce((s,g)=>s+g.files.length,0)}장
          </div>
          <div style={{padding:"8px 0"}}>
            {normalGroups.map((g,i)=>(
              <div key={g.key} style={{borderBottom:i<normalGroups.length-1?`1px solid ${C.border}`:"none",padding:"12px 20px"}}>
                <div className="pc-mobile-form-grid" style={{display:"grid",gridTemplateColumns:"100px 60px 1fr auto",gap:12,alignItems:"center"}}>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {g.files.slice(0,4).map(f=>f.thumbUrl?<img key={f.name} src={f.thumbUrl} style={{width:22,height:16,objectFit:"cover",borderRadius:2}} alt=""/>:<div key={f.name} style={{width:22,height:16,background:C.border,borderRadius:2}}/>)}
                  </div>
                  <SectionPill label={g.poseType} count={g.files.length} color={g.poseType==="Standing"?C.teal:C.orange}/>
                  <input value={g.editedFolderName} onChange={e=>setStudioGroups(prev=>prev.map(p=>p.key===g.key?{...p,editedFolderName:e.target.value}:p))} style={{height:34,border:`1.5px solid ${C.border}`,borderRadius:8,padding:"0 10px",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
                  <span style={{fontSize:9,background:C.light,color:C.teal,padding:"2px 6px",borderRadius:4,whiteSpace:"nowrap"}}>신뢰도 {Math.round(g.files.reduce((s,f)=>s+f.confidence,0)/g.files.length*100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <div className="ps-btn-row">
          <Btn variant="secondary" onClick={()=>setStep(0)}>← 처음으로</Btn>
          <Btn style={{background:C.purple}} onClick={()=>setStep(4)}>✅ 승인 →</Btn>
        </div>
      </div>
    );
  };

  const PERSON_FEATURE_LABELS: Record<string,string> = {
    male:"남성", female:"여성", unknown:"미확인",
    "20s":"20대","30s":"30대","40s":"40대","50s":"50대","60s+":"60대+",
    black:"검정",brown:"갈색",blonde:"금발",white_gray:"흰/회색",other:"기타",
    short:"단발",medium:"중간",long:"장발",bald:"민머리",
  };

  const StudioGroupStep3 = () => {
    const etcGroup    = personGroups.find(g=>g.isEtc);
    const normalGroups = personGroups.filter(g=>!g.isEtc);
    return (
      <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:820}}>
        <div style={{padding:14,background:"#F5F0FF",borderRadius:10,fontSize:12,color:C.purple,border:"1px solid #DDD6FE"}}>
          AI가 얼굴 특징(성별·연령·헤어·안경)을 기준으로 인물별 그룹을 분류했습니다. 폴더명을 수정한 후 <strong>승인</strong>해주세요.
        </div>
        {etcGroup && (
          <Card>
            <div style={{padding:"12px 18px",background:"#FEF2F2",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:12,fontWeight:900,color:C.red}}>00_ETC_조명불량</span>
              <span style={{fontSize:11,color:C.red,background:"#FEE2E2",padding:"2px 8px",borderRadius:20}}>{etcGroup.files.length}장</span>
            </div>
            <div style={{display:"flex",gap:4,padding:"10px 18px",overflowX:"auto"}}>
              {etcGroup.files.slice(0,8).map(f=>f.thumbUrl?<img key={f.name} src={f.thumbUrl} style={{width:52,height:38,objectFit:"cover",borderRadius:4,flexShrink:0}} alt=""/>:<div key={f.name} style={{width:52,height:38,background:C.border,borderRadius:4,flexShrink:0}}/>)}
            </div>
          </Card>
        )}
        <Card>
          <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>
            인물 그룹 — {normalGroups.length}명 / {normalGroups.reduce((s,g)=>s+g.files.length,0)}장
          </div>
          <div style={{padding:"8px 0"}}>
            {normalGroups.map((g,i)=>{
              const pf = g.features;
              const tags = [
                pf.gender!=="unknown"?PERSON_FEATURE_LABELS[pf.gender]:null,
                pf.ageBand!=="unknown"?PERSON_FEATURE_LABELS[pf.ageBand]:null,
                pf.hairColor!=="unknown"?PERSON_FEATURE_LABELS[pf.hairColor]+"머리":null,
                pf.hairLength!=="unknown"?PERSON_FEATURE_LABELS[pf.hairLength]:null,
                pf.hasGlasses?"안경":null,
              ].filter(Boolean);
              return (
                <div key={g.id} style={{borderBottom:i<normalGroups.length-1?`1px solid ${C.border}`:"none",padding:"12px 20px"}}>
                  <div className="pc-mobile-form-grid" style={{display:"grid",gridTemplateColumns:"56px auto 1fr 44px",gap:12,alignItems:"center"}}>
                    {g.sampleThumb
                      ? <img src={g.sampleThumb} style={{width:44,height:56,objectFit:"cover",borderRadius:6,border:`1px solid ${C.border}`}} alt=""/>
                      : <div style={{width:44,height:56,background:C.border,borderRadius:6}}/>
                    }
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        {tags.map((tag,ti)=>(
                          <span key={ti} style={{fontSize:9,background:C.light,color:C.teal,padding:"2px 6px",borderRadius:4,whiteSpace:"nowrap"}}>{tag}</span>
                        ))}
                        <span style={{fontSize:9,background:"#FFF0EB",color:C.orange,padding:"2px 6px",borderRadius:4}}>{g.files.length}장</span>
                      </div>
                      <div style={{display:"flex",gap:3}}>
                        {g.files.slice(0,4).map(f=>f.thumbUrl?<img key={f.name} src={f.thumbUrl} style={{width:22,height:16,objectFit:"cover",borderRadius:2}} alt=""/>:<div key={f.name} style={{width:22,height:16,background:C.border,borderRadius:2}}/>)}
                      </div>
                    </div>
                    <input value={g.editedFolderName}
                      onChange={e=>setPersonGroups(prev=>prev.map(p=>p.id===g.id?{...p,editedFolderName:e.target.value}:p))}
                      style={{height:34,border:`1.5px solid ${C.border}`,borderRadius:8,padding:"0 10px",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
                    <span style={{fontSize:9,background:C.light,color:C.muted,padding:"2px 6px",borderRadius:4,textAlign:"center"}}>{g.index}번</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <div className="ps-btn-row">
          <Btn variant="secondary" onClick={()=>setStep(0)}>← 처음으로</Btn>
          <Btn style={{background:C.purple}} onClick={()=>setStep(4)}>✅ 승인 →</Btn>
        </div>
      </div>
    );
  };

  const StudioGroupStep4 = () => {
    const etcGroup    = personGroups.find(g=>g.isEtc);
    const normalGroups = personGroups.filter(g=>!g.isEtc);
    const g = personGroups[activePersonGroup] ?? normalGroups[0];
    return (
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
          {personGroups.map((grp,i)=>(
            <button key={grp.id} onClick={()=>setActivePersonGroup(i)} style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${i===activePersonGroup?C.purple:C.border}`,background:i===activePersonGroup?"#F5F0FF":C.white,fontSize:11,fontWeight:i===activePersonGroup?800:600,color:i===activePersonGroup?C.purple:C.muted,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              {grp.isEtc?"ETC":grp.editedFolderName}<span style={{marginLeft:4,fontSize:9,color:C.hint}}>{grp.files.length}장</span>
            </button>
          ))}
        </div>
        <div className="ps-stat4">
          {[{label:"인물 수",value:normalGroups.length,color:C.purple},{label:"전체 JPG",value:normalGroups.reduce((s,g)=>s+g.files.length,0),color:C.txt},{label:"ETC",value:etcGroup?.files.length??0,color:C.red},{label:"RAW 파일",value:studioRawCount,color:C.muted}].map(({label,value,color})=>(
            <div key={label} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:900,color}}>{value}</div>
              <div style={{fontSize:10,color:C.hint,marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>
        {g && (
          <Card>
            <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:12,fontWeight:900,color:g.isEtc?C.red:C.purple}}>{g.editedFolderName}</span>
              <span style={{fontSize:11,color:C.hint}}>{g.files.length}장</span>
              {!g.isEtc && (() => {
                const pf = g.features;
                const tags = [pf.gender!=="unknown"?PERSON_FEATURE_LABELS[pf.gender]:null, pf.ageBand!=="unknown"?PERSON_FEATURE_LABELS[pf.ageBand]:null, pf.hairColor!=="unknown"?PERSON_FEATURE_LABELS[pf.hairColor]+"머리":null, pf.hasGlasses?"안경":null].filter(Boolean);
                return tags.map((t,i)=><span key={i} style={{fontSize:10,background:C.light,color:C.teal,padding:"2px 8px",borderRadius:20}}>{t}</span>);
              })()}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:6,padding:12}}>
              {g.files.map(f=>(
                <div key={f.name} style={{borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
                  {f.thumbUrl?<img src={f.thumbUrl} alt={f.name} style={{width:"100%",aspectRatio:"3/2",objectFit:"cover",display:"block"}}/>:<div style={{width:"100%",aspectRatio:"3/2",background:C.border}}/>}
                  <div style={{padding:"3px 6px",fontSize:8,color:C.hint,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
        <div className="ps-btn-row">
          <Btn variant="secondary" onClick={()=>setStep(3)}>← 그룹 수정</Btn>
          <Btn style={{background:C.purple}} onClick={runGroupOutput}>파일 정리 시작 →</Btn>
        </div>
      </div>
    );
  };

  const StudioStep4 = () => {
    const etcGroup     = studioGroups.find(g=>g.isEtc);
    const normalGroups = studioGroups.filter(g=>!g.isEtc);
    const g = studioGroups[activeGroup] ?? normalGroups[0];
    return (
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
          {studioGroups.map((grp,i)=>(
            <button key={grp.key} onClick={()=>setActiveGroup(i)} style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${i===activeGroup?C.purple:C.border}`,background:i===activeGroup?"#F5F0FF":C.white,fontSize:11,fontWeight:i===activeGroup?800:600,color:i===activeGroup?C.purple:C.muted,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              {grp.isEtc?"ETC":grp.editedFolderName.split("_").slice(1).join("_")}<span style={{marginLeft:4,fontSize:9,color:C.hint}}>{grp.files.length}장</span>
            </button>
          ))}
        </div>
        <div className="ps-stat4">
          {[{label:"전체 그룹",value:normalGroups.length,color:C.purple},{label:"전체 JPG",value:normalGroups.reduce((s,g)=>s+g.files.length,0),color:C.txt},{label:"ETC",value:etcGroup?.files.length??0,color:C.red},{label:"RAW 파일",value:studioRawCount,color:C.muted}].map(({label,value,color})=>(
            <div key={label} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:900,color}}>{value}</div>
              <div style={{fontSize:10,color:C.hint,marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>
        {g && (
          <Card>
            <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:12,fontWeight:900,color:g.isEtc?C.red:C.purple}}>{g.editedFolderName}</span>
              <span style={{fontSize:11,color:C.hint}}>{g.files.length}장</span>
              {!g.isEtc&&<><span style={{fontSize:10,background:C.light,color:C.teal,padding:"2px 8px",borderRadius:20}}>{g.clothingLabel}</span><span style={{fontSize:10,background:"#FFF0EB",color:C.orange,padding:"2px 8px",borderRadius:20}}>{g.poseType}</span></>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:6,padding:12}}>
              {g.files.map(f=>(
                <div key={f.name} style={{borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
                  {f.thumbUrl?<img src={f.thumbUrl} alt={f.name} style={{width:"100%",aspectRatio:"3/2",objectFit:"cover",display:"block"}}/>:<div style={{width:"100%",aspectRatio:"3/2",background:C.border}}/>}
                  <div style={{padding:"3px 6px",fontSize:8,color:C.hint,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
        <div className="ps-btn-row">
          <Btn variant="secondary" onClick={()=>setStep(3)}>← 그룹 수정</Btn>
          <Btn style={{background:C.purple}} onClick={runStudioOutput}>파일 정리 시작 →</Btn>
        </div>
      </div>
    );
  };

  const StudioStep5 = () => (
    <div style={{maxWidth:680,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.purple}}>스튜디오 파일 정리 중...</div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
      <div style={{maxHeight:260,overflowY:"auto",fontSize:11,fontFamily:"monospace",background:"#F8FFFE",borderRadius:8,padding:12,border:`1px solid ${C.border}`}}>
        {studioCopyLog.slice(-40).map((l,i)=><div key={i} style={{color:l.startsWith("✅")?C.green:l.startsWith("❌")?C.red:C.yellow}}>{l}</div>)}
      </div>
    </div>
  );

  const StudioStep6 = () => {
    if (!studioStats) return null;
    const isGroup = studioSubMode === "group";
    const rows = [
      {label: isGroup ? "인물 그룹" : "의상·포즈 그룹", value:studioStats.totalGroups, color:C.purple},
      {label:"정상 JPG",value:studioStats.totalNormal,color:C.teal},
      {label:"ETC 분리",value:studioStats.totalEtc,color:C.red},
      {label:"원본 RAW",value:studioStats.totalRaw,color:C.muted},
    ];
    return (
      <Card style={{maxWidth:600}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.purple}}>✅ 스튜디오 분류 완료!</div>
        <div style={{padding:20}}>
          <div className="pc-mobile-form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            {rows.map(({label,value,color})=>(
              <div key={label} style={{background:C.bg,borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:20,fontWeight:900,color}}>{value}</div>
                <div style={{fontSize:10,color:C.hint,marginTop:2}}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.light,borderRadius:10,padding:14,fontSize:11,color:C.muted,marginBottom:16,lineHeight:1.9}}>
            📁 <strong style={{color:C.teal}}>분류_{rootDir?.name}/</strong> — {isGroup ? "인물별" : "의상·포즈별"} 하위 폴더에 JPG 정리<br/>
            📊 <strong style={{color:C.teal}}>AI_SELECT_REPORT/</strong> — 3종 CSV + summary.json
          </div>
          <div className="ps-btn-row">
            {isGroup
              ? <Btn variant="secondary" onClick={()=>downloadCSV(makeCSV(["인물","폴더명","장수"],personGroups.filter(g=>!g.isEtc).map(g=>[g.label,g.editedFolderName,String(g.files.length)])),"person_group_summary.csv")}>↓ 인물 요약 CSV</Btn>
              : <Btn variant="secondary" onClick={()=>downloadCSV(makeCSV(["그룹","폴더명","의상","포즈","장수"],studioGroups.filter(g=>!g.isEtc).map(g=>[String(g.index),g.editedFolderName,g.clothingLabel,g.poseType,String(g.files.length)])),"studio_group_summary.csv")}>↓ 그룹 요약 CSV</Btn>
            }
            <Btn onClick={()=>{setStep(0);setStudioFiles([]);setStudioGroups([]);setPersonGroups([]);setRootDir(null);setStudioRawCount(0);setStudioCopyLog([]);setStudioStats(null);}}>처음으로</Btn>
          </div>
        </div>
      </Card>
    );
  };

  /* ════════════════════════════════════════════
     LAYOUT
  ═══════════════════════════════════════════ */
  return (
    <div>

      {step > 0 && (
        <div className="ps-mode-badge" style={{background:photoMode==="studio"?"#F5F0FF":C.light,color:photoMode==="studio"?C.purple:C.teal,borderBottom:`1px solid ${photoMode==="studio"?"#DDD6FE":C.border}`}}>
          {photoMode==="studio"
            ? (studioSubMode==="group" ? "스튜디오 · 여러명 모드" : "스튜디오 · 한명 모드")
            : `현장촬영 — ${DEPARTMENT_DISPLAY[department]} — ${gapMinutes}분`}
        </div>
      )}

      <div style={{background:C.bg,minHeight:isModal||isEmbedded?undefined:"100vh",color:C.txt}}>
        {renderStepIndicator()}
        <div className="ps-wrap" style={{maxWidth:960,margin:"0 auto"}}>
          {step===0 && <Step0/>}

          {photoMode==="field" && step===1 && <FieldStep1/>}
          {photoMode==="field" && step===2 && <FieldStep2/>}
          {photoMode==="field" && step===3 && <FieldStep3/>}
          {photoMode==="field" && step===4 && <FieldStep4/>}
          {photoMode==="field" && step===5 && <FieldStep5/>}
          {photoMode==="field" && step===6 && <FieldStep6/>}

          {photoMode==="studio" && step===1 && <StudioStep1/>}
          {photoMode==="studio" && step===2 && <StudioStep2/>}
          {photoMode==="studio" && step===3 && (studioSubMode==="group" ? <StudioGroupStep3/> : <StudioStep3/>)}
          {photoMode==="studio" && step===4 && (studioSubMode==="group" ? <StudioGroupStep4/> : <StudioStep4/>)}
          {photoMode==="studio" && step===5 && <StudioStep5/>}
          {photoMode==="studio" && step===6 && <StudioStep6/>}
        </div>
      </div>
    </div>
  );
}
