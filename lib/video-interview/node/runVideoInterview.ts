import Anthropic from "@anthropic-ai/sdk";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureSafeDirectory, isInside, normalizePhotoProjectPath, requireSafeDirectory } from "@/lib/photo-operations/node/common";
import { getStorageRoots } from "@/lib/photo-classifier/node/storageConfig";
import type { RunnerRoots } from "@/lib/photo-classifier/node/types";
import { annotateSegments, type RawSegment } from "../signals";
import { buildInterviewUserMessage, VIDEO_INTERVIEW_SYSTEM_PROMPT, VIDEO_INTERVIEW_TOOL_NAME, VIDEO_INTERVIEW_TOOL_SCHEMA } from "../prompt";
import { resolveInterviewAnalysis } from "../resolve";
import { buildPlainTranscript, buildSrt } from "../srt";
import { formatClock } from "../timecode";
import type { InterviewClip, VideoAudioExtractResult, VideoInterviewResult, VideoStudioProgress } from "../types";
import { extractAnalysisAudio, extractEditAudio, listVideoFiles, probeClip, pythonPath, runProcess } from "./media";

export const VIDEO_INTERVIEW_OUTPUT_DIR = "인터뷰분석";
export const VIDEO_AUDIO_OUTPUT_DIR = "음성분리";
const WHISPER_PROMPT = "포토클리닉, 병원 브랜딩, 원장님, 병원 촬영, 프로필 사진, 홈페이지, 마케팅, 환자, 진료, 인터뷰.";
const DEFAULT_MODEL = "claude-sonnet-5";

type ProgressFn = (progress: VideoStudioProgress) => void;

function helperScriptPath(): string {
  const configured = process.env.OLIVIA_VIDEO_TRANSCRIBE_SCRIPT?.trim();
  if (configured) return configured;
  const repoRoot = process.env.OLIVIA_REPO_ROOT?.trim() || process.cwd();
  return path.join(repoRoot, "scripts", "video-studio", "interview_transcribe.py");
}

async function resolveFolders(sourceRelativePath: string, outputDirName: string, roots?: RunnerRoots) {
  const resolvedRoots = roots ?? getStorageRoots();
  const relativePath = normalizePhotoProjectPath(sourceRelativePath);
  const sourceRoot = await requireSafeDirectory(resolvedRoots.sourceRoot, "SOURCE_ROOT");
  const workRoot = await requireSafeDirectory(resolvedRoots.workRoot, "WORK_ROOT");
  const sourceCandidate = path.resolve(sourceRoot, ...relativePath.split("/"));
  if (!isInside(sourceRoot, sourceCandidate)) throw new Error("촬영 폴더가 SOURCE_ROOT 밖을 가리킵니다.");
  const sourceDir = await requireSafeDirectory(sourceCandidate, "촬영 폴더");
  if (!isInside(sourceRoot, sourceDir)) throw new Error("촬영 폴더의 실제 경로가 SOURCE_ROOT 밖입니다.");
  // 결과는 원본(SSD1)이 아니라 작업 디스크(SSD2)의 같은 상대 경로 아래에 저장한다.
  const outputDir = await ensureSafeDirectory(workRoot, path.resolve(workRoot, ...relativePath.split("/"), outputDirName));
  return { relativePath, sourceRoot, sourceDir, outputDir, outputRelativePath: `${relativePath}/${outputDirName}` };
}

async function probeAll(sourceDir: string, relativePath: string, onProgress: ProgressFn): Promise<InterviewClip[]> {
  const names = await listVideoFiles(sourceDir);
  if (!names.length) throw new Error("이 폴더에 영상 파일(mp4·mov 등)이 없습니다.");
  const clips: InterviewClip[] = [];
  let timeline = 0;
  for (const [index, name] of names.entries()) {
    onProgress({ stage: "probe", percent: 2, message: `촬영 파일 확인 중 (${index + 1}/${names.length}) ${name}` });
    const clip = await probeClip(path.join(sourceDir, name), `${relativePath}/${name}`, index, timeline);
    clips.push(clip);
    timeline += clip.durationSec;
  }
  return clips;
}

export async function runVideoInterviewAnalyze(input: {
  sourceRelativePath: string;
  context?: string;
  roots?: RunnerRoots;
  onProgress?: ProgressFn;
}): Promise<VideoInterviewResult> {
  const onProgress = input.onProgress ?? (() => undefined);
  const context = (input.context ?? "").trim().slice(0, 500);
  const folders = await resolveFolders(input.sourceRelativePath, VIDEO_INTERVIEW_OUTPUT_DIR, input.roots);
  const clips = await probeAll(folders.sourceDir, folders.relativePath, onProgress);
  const durationSec = clips.reduce((sum, clip) => sum + clip.durationSec, 0);
  const firstVideo = clips.find((clip) => clip.hasVideo) ?? clips[0];
  const temp = await mkdtemp(path.join(tmpdir(), "olivia-interview-"));

  try {
    // 1) 음성 추출
    const manifestClips: Array<{ duration: number; level_wav: string | null; asr_wav: string | null }> = [];
    for (const clip of clips) {
      onProgress({ stage: "audio", percent: 4 + Math.round((clip.index / clips.length) * 8), message: `음성 추출 중 (${clip.index + 1}/${clips.length}) ${clip.name}` });
      if (!clip.hasAudio) {
        manifestClips.push({ duration: clip.durationSec, level_wav: null, asr_wav: null });
        continue;
      }
      const levelWav = path.join(temp, `${clip.index}-level.wav`);
      const asrWav = path.join(temp, `${clip.index}-asr.wav`);
      await extractAnalysisAudio(clip, levelWav, asrWav);
      manifestClips.push({ duration: clip.durationSec, level_wav: levelWav, asr_wav: asrWav });
    }

    // 2) 음성 인식 (Python · mlx-whisper)
    const manifestPath = path.join(temp, "manifest.json");
    const outPath = path.join(temp, "transcript.json");
    await writeFile(manifestPath, JSON.stringify({
      clips: manifestClips,
      language: "ko",
      prompt: [WHISPER_PROMPT, context].filter(Boolean).join(" "),
      engine: process.env.OLIVIA_VIDEO_ASR_ENGINE || "auto",
      model: process.env.OLIVIA_VIDEO_ASR_MODEL || undefined,
    }));
    onProgress({ stage: "transcribe", percent: 12, message: "음성 인식을 시작합니다" });
    const asr = await runProcess(pythonPath(), [helperScriptPath(), "--manifest", manifestPath, "--out", outPath], {
      onStderrLine: (line) => {
        if (!line.startsWith("OLIVIA_PY_PROGRESS ")) return;
        try {
          const parsed = JSON.parse(line.slice("OLIVIA_PY_PROGRESS ".length)) as { percent?: number; message?: string };
          onProgress({ stage: "transcribe", percent: 12 + Math.round((Number(parsed.percent) || 0) * 0.6), message: parsed.message || "음성 인식 중" });
        } catch {
          // 진행 표시 줄 해석 실패는 무시한다.
        }
      },
    });
    if (asr.code !== 0) {
      const reason = asr.stderr.split(/\r?\n/).filter((line) => line && !line.startsWith("OLIVIA_PY_PROGRESS")).slice(-3).join(" / ");
      throw new Error(`음성 인식 실패: ${reason || `종료 코드 ${asr.code}`}`);
    }
    const transcript = JSON.parse(await readFile(outPath, "utf8")) as { engine: string; model: string; segments: RawSegment[] };

    // 3) Q&A 신호 (작은 목소리·쉼·파일 바뀜)
    onProgress({ stage: "signals", percent: 74, message: "질문·답변 구간 신호 계산 중" });
    const segments = annotateSegments(transcript.segments ?? [], clips);
    if (!segments.length) throw new Error("인식된 대사가 없습니다. 영상에 음성이 있는지 확인하세요.");

    // 4) Claude 분석
    const model = process.env.OLIVIA_VIDEO_INTERVIEW_MODEL?.trim() || DEFAULT_MODEL;
    onProgress({ stage: "analyze", percent: 78, message: "Q&A 분리·핵심 정리·릴스 추천 중 (1~3분)" });
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 15 * 60 * 1000 });
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: VIDEO_INTERVIEW_SYSTEM_PROMPT,
      tools: [{ name: VIDEO_INTERVIEW_TOOL_NAME, description: "인터뷰 Q&A 분리와 편집 설계 결과 저장", input_schema: VIDEO_INTERVIEW_TOOL_SCHEMA as unknown as Anthropic.Tool["input_schema"] }],
      tool_choice: { type: "tool", name: VIDEO_INTERVIEW_TOOL_NAME },
      messages: [{ role: "user", content: buildInterviewUserMessage(segments, context, durationSec) }],
    });
    const toolUse = response.content.find((block) => block.type === "tool_use");
    const analysis = resolveInterviewAnalysis(toolUse && toolUse.type === "tool_use" ? toolUse.input : null, segments, durationSec);

    // 5) 결과 저장 (작업 디스크)
    onProgress({ stage: "write", percent: 96, message: "결과 저장 중" });
    const title = analysis.titleCandidates[0] || path.basename(folders.relativePath);
    const result: VideoInterviewResult = {
      ok: true,
      status: "VIDEO_INTERVIEW_ANALYZED",
      version: 1,
      title,
      context,
      createdAt: new Date().toISOString(),
      sourceRelativePath: folders.relativePath,
      sourceAbsoluteRoot: folders.sourceRoot,
      outputRelativePath: folders.outputRelativePath,
      durationSec: Math.round(durationSec * 1000) / 1000,
      rate: firstVideo.rate,
      width: firstVideo.width ?? 1920,
      height: firstVideo.height ?? 1080,
      clips,
      segments,
      analysis,
      engine: { asr: transcript.engine, asrModel: transcript.model, llm: model },
    };
    await writeFile(path.join(folders.outputDir, "analysis.json"), JSON.stringify(result, null, 1));
    await writeFile(path.join(folders.outputDir, "전체자막.srt"), buildSrt(segments));
    await writeFile(path.join(folders.outputDir, "대본.txt"), buildPlainTranscript(segments, (seconds) => formatClock(seconds)));
    await writeFile(path.join(folders.outputDir, "Q&A정리.md"), qaMarkdown(result));
    onProgress({ stage: "done", percent: 100, message: `Q&A ${analysis.qa.length}개 · 릴스 후보 ${analysis.reels.length}개` });
    return result;
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined);
  }
}

function qaMarkdown(result: VideoInterviewResult): string {
  const { analysis } = result;
  const lines = [`# ${result.title}`, "", analysis.oneLine, "", analysis.summary, ""];
  for (const block of analysis.qa) {
    lines.push(`## ${block.label}. ${block.topic}  \`${formatClock(block.start)}–${formatClock(block.end)}\``);
    lines.push(`**질문${block.questionSource === "inferred" ? "(추정)" : ""}** ${block.question}`, "", block.summary);
    for (const point of block.keyPoints) lines.push(`- ${point}`);
    if (block.bestQuote) lines.push("", `> ${block.bestQuote}`);
    lines.push("");
  }
  if (analysis.reels.length) {
    lines.push("## 릴스 후보");
    analysis.reels.forEach((reel, index) => lines.push(`- ${String(index + 1).padStart(2, "0")} ${"★".repeat(reel.score)} ${reel.title} \`${formatClock(reel.start)}–${formatClock(reel.end)}\` 훅: ${reel.hook}`));
  }
  return lines.join("\n");
}

export async function runVideoAudioExtract(input: {
  sourceRelativePath: string;
  roots?: RunnerRoots;
  onProgress?: ProgressFn;
}): Promise<VideoAudioExtractResult> {
  const onProgress = input.onProgress ?? (() => undefined);
  const folders = await resolveFolders(input.sourceRelativePath, VIDEO_AUDIO_OUTPUT_DIR, input.roots);
  const clips = await probeAll(folders.sourceDir, folders.relativePath, onProgress);
  const files: VideoAudioExtractResult["files"] = [];
  for (const clip of clips) {
    if (!clip.hasAudio) continue;
    onProgress({ stage: "extract", percent: Math.round(5 + (clip.index / clips.length) * 90), message: `음성 분리 중 (${clip.index + 1}/${clips.length}) ${clip.name}` });
    const output = path.join(folders.outputDir, `${path.parse(clip.name).name}.wav`);
    await extractEditAudio(clip, output);
    files.push({ clip: clip.name, output: `${folders.outputRelativePath}/${path.basename(output)}`, sizeBytes: (await stat(output)).size, durationSec: clip.durationSec });
  }
  if (!files.length) throw new Error("음성이 들어 있는 영상 파일이 없습니다.");
  onProgress({ stage: "done", percent: 100, message: `${files.length}개 파일 저장` });
  return { ok: true, status: "VIDEO_AUDIO_EXTRACTED", sourceRelativePath: folders.relativePath, outputRelativePath: folders.outputRelativePath, files };
}

