"use client";

import { mimeTypeFromAudioFile, VOICE_ORIGINAL_UPLOAD_MAX_BYTES } from "./config";

export type ImportedAudioInfo = {
  file: File;
  mimeType: string;
  durationSeconds: number;
};

export function validateImportedAudio(file: File): string | null {
  if (!file.size) return "비어 있는 음성 파일입니다.";
  if (file.size > VOICE_ORIGINAL_UPLOAD_MAX_BYTES) return "음성 원본은 최대 512MB까지 업로드할 수 있습니다.";
  const mimeType = mimeTypeFromAudioFile(file);
  if (!mimeType.startsWith("audio/")) return "m4a, mp3, wav, webm 형식의 음성 파일을 선택해주세요.";
  return null;
}

export async function inspectImportedAudio(file: File): Promise<ImportedAudioInfo> {
  const validationError = validateImportedAudio(file);
  if (validationError) throw new Error(validationError);
  const objectUrl = URL.createObjectURL(file);
  try {
    const durationSeconds = await new Promise<number>((resolve) => {
      const audio = document.createElement("audio");
      const finish = (value: number) => {
        audio.removeAttribute("src");
        audio.load();
        resolve(Number.isFinite(value) && value >= 0 ? value : 0);
      };
      audio.preload = "metadata";
      audio.onloadedmetadata = () => finish(audio.duration);
      audio.onerror = () => finish(0);
      audio.src = objectUrl;
    });
    return { file, mimeType: mimeTypeFromAudioFile(file), durationSeconds };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
