"use client";

import { useCallback, useRef, useState } from "react";
import { prepareScreenshotForOcr } from "@/lib/selectMatch/browserOcr";

export type SelectMatchClientInputMode = "folder" | "text" | "upload";

type UploadOcrMessage = {
  text: string;
  ok: boolean;
};

export function normalizeRecognizedFileNames(names: readonly string[]) {
  return Array.from(new Set(names
    .map((name) => name.trim().normalize("NFC").toLocaleLowerCase("en-US"))
    .filter(Boolean)));
}

export function useSelectMatchClientInput({
  initialMode,
  onConfirm,
}: {
  initialMode: SelectMatchClientInputMode;
  onConfirm: (names: Set<string>) => void;
}) {
  const [inputMode, setInputMode] = useState<SelectMatchClientInputMode>(initialMode);
  const [clientText, setClientText] = useState("");
  const [clientDragging, setClientDragging] = useState(false);
  const clientFileRef = useRef<HTMLInputElement>(null);
  const [uploadedClientFiles, setUploadedClientFiles] = useState<File[]>([]);
  const [uploadOcrLoading, setUploadOcrLoading] = useState(false);
  const [uploadOcrNames, setUploadOcrNames] = useState<string[]>([]);
  const [selectedUploadOcrNames, setSelectedUploadOcrNames] = useState<Set<string>>(() => new Set());
  const [uploadOcrMessage, setUploadOcrMessage] = useState<UploadOcrMessage | null>(null);

  const confirmClientInput = useCallback((names: Set<string>) => {
    if (names.size === 0) {
      alert("파일명을 찾지 못했습니다. 파일명(DSC_0142.jpg 형태)이 포함된 텍스트를 붙여넣어 주세요.");
      return;
    }
    onConfirm(names);
  }, [onConfirm]);

  const setUploadedFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => file.size > 0);
    setUploadedClientFiles(files);
    setUploadOcrNames([]);
    setSelectedUploadOcrNames(new Set());
    setUploadOcrMessage(files.length
      ? { text: `${files.length}개 파일을 준비했습니다. 사진 파일명 그대로 사용하거나, 셀렉 리포트라면 이미지 속 파일명을 분석하세요.`, ok: true }
      : { text: "선택한 파일을 읽지 못했습니다.", ok: false });
    if (clientFileRef.current) clientFileRef.current.value = "";
  }, []);

  const analyzeUploadedFileNames = useCallback(async () => {
    if (!uploadedClientFiles.length || uploadOcrLoading) return;
    setUploadOcrLoading(true);
    setUploadOcrMessage(null);
    try {
      const recognized: string[] = [];
      for (const file of uploadedClientFiles.slice(0, 4)) {
        const imageBase64 = await prepareScreenshotForOcr(file);
        const response = await fetch("/api/select-match/ocr-filenames", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64 }),
        });
        const data = await response.json().catch(() => null) as { ok?: boolean; filenames?: unknown; error?: unknown } | null;
        if (!response.ok || !data?.ok || !Array.isArray(data.filenames)) {
          throw new Error(typeof data?.error === "string" ? data.error : "이미지 속 파일명 분석에 실패했습니다.");
        }
        recognized.push(...data.filenames.filter((name): name is string => typeof name === "string"));
      }
      const names = normalizeRecognizedFileNames(recognized);
      if (!names.length) throw new Error("이미지에서 확장자가 포함된 파일명을 찾지 못했습니다.");
      setUploadOcrNames(names);
      setSelectedUploadOcrNames(new Set(names));
      setUploadOcrMessage({ text: `이미지에서 파일명 ${names.length}개를 찾았습니다. 아래 목록을 확인한 뒤 RAW 매칭으로 진행하세요.`, ok: true });
    } catch (error) {
      setUploadOcrNames([]);
      setSelectedUploadOcrNames(new Set());
      setUploadOcrMessage({ text: error instanceof Error ? error.message : "이미지 속 파일명 분석에 실패했습니다.", ok: false });
    } finally {
      setUploadOcrLoading(false);
    }
  }, [uploadOcrLoading, uploadedClientFiles]);

  return {
    inputMode,
    setInputMode,
    clientText,
    setClientText,
    clientDragging,
    setClientDragging,
    clientFileRef,
    uploadedClientFiles,
    uploadOcrLoading,
    uploadOcrNames,
    selectedUploadOcrNames,
    setSelectedUploadOcrNames,
    uploadOcrMessage,
    confirmClientInput,
    setUploadedFiles,
    analyzeUploadedFileNames,
  };
}

export type SelectMatchClientInputController = ReturnType<typeof useSelectMatchClientInput>;
