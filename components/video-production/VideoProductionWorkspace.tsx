"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Clapperboard, History, LoaderCircle, Sparkles } from "lucide-react";
import { readVideoGenerationHistory, upsertVideoGenerationHistory } from "@/lib/higgsfield/history";
import type { VideoGenerationRecord, VideoGenerationStatus, VideoModelCapability } from "@/lib/higgsfield/types";
import { watchRequest, stopWatching } from "@/lib/higgsfield/vendor/template/poll";
import { uploadMedia } from "@/lib/higgsfield/vendor/template/upload";
import type { GenerationStatus } from "@/lib/higgsfield/vendor/template/platform";
import { VideoHistory } from "./VideoHistory";
import { VideoInputPanel } from "./VideoInputPanel";
import { VideoModelSelector } from "./VideoModelSelector";
import { VideoOptionsPanel } from "./VideoOptionsPanel";
import { VideoPromptPanel } from "./VideoPromptPanel";
import { VideoResultViewer } from "./VideoResultViewer";
import { activeRoles, defaultSettings, ROLE_KIND, type MediaDraft } from "./types";
import styles from "./VideoProductionWorkspace.module.css";

type WorkspaceTab = "generate" | "history";
type GenerationStage = "idle" | "uploading" | "submitting";

type ModelResponse = {
  ok?: boolean;
  error?: string;
  models?: VideoModelCapability[];
  connection?: { configured?: boolean };
};

type GenerateResponse = {
  ok?: boolean;
  error?: string;
  detail?: string;
  generation?: { requestId: string; status: VideoGenerationStatus; model: VideoModelCapability };
};

function draftId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isTerminal(status: VideoGenerationStatus): boolean {
  return status === "completed" || status === "failed" || status === "nsfw" || status === "canceled";
}

function messageFromResponse(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") return payload.error;
  return fallback;
}

function statusPatch(record: VideoGenerationRecord, status: GenerationStatus): VideoGenerationRecord {
  const providerError = typeof status.error === "string" ? status.error : status.error === undefined ? undefined : JSON.stringify(status.error) || "영상 생성에 실패했습니다.";
  const normalizedStatus: VideoGenerationStatus = ["queued", "in_progress", "completed", "failed", "nsfw", "canceled"].includes(status.status)
    ? status.status as VideoGenerationStatus
    : "queued";
  return {
    ...record,
    status: normalizedStatus,
    updatedAt: new Date().toISOString(),
    ...(status.video?.url ? { videoUrl: status.video.url, thumbnailUrl: status.video.url } : {}),
    ...(providerError ? { providerError } : {}),
  };
}

function defaultInputMode(model: VideoModelCapability | undefined): string | undefined {
  return model?.mediaModes?.[0]?.id;
}

export function VideoProductionWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState<WorkspaceTab>("generate");
  const [models, setModels] = useState<VideoModelCapability[]>([]);
  const [configured, setConfigured] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string>();
  const [modelId, setModelId] = useState("");
  const [inputMode, setInputMode] = useState<string>();
  const [media, setMedia] = useState<MediaDraft[]>([]);
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [history, setHistory] = useState<VideoGenerationRecord[]>([]);
  const [currentId, setCurrentId] = useState<string>();
  const [stage, setStage] = useState<GenerationStage>("idle");
  const [error, setError] = useState<string>();
  const restoredRequestIds = useRef(new Set<string>());
  const objectUrls = useRef(new Set<string>());

  const selectedModel = useMemo(() => models.find((model) => model.id === modelId), [models, modelId]);
  const roles = useMemo(() => activeRoles(selectedModel, inputMode), [selectedModel, inputMode]);
  const currentRecord = useMemo(() => history.find((record) => record.requestId === currentId), [currentId, history]);

  const updateRecord = useCallback((next: VideoGenerationRecord) => {
    setHistory((current) => upsertVideoGenerationHistory(current, next));
    setCurrentId(next.requestId);
  }, []);

  const watchRecord = useCallback((record: VideoGenerationRecord) => {
    if (isTerminal(record.status) || restoredRequestIds.current.has(record.requestId)) return;
    restoredRequestIds.current.add(record.requestId);
    void watchRequest(record.requestId, {
      onUpdate: (status) => updateRecord(statusPatch(record, status)),
    })
      .then((status) => updateRecord(statusPatch(record, status)))
      .catch((caught) => updateRecord({
        ...record,
        status: "failed",
        updatedAt: new Date().toISOString(),
        providerError: caught instanceof Error ? caught.message : "생성 상태를 확인하지 못했습니다.",
      }));
  }, [updateRecord]);

  useEffect(() => {
    const restored = readVideoGenerationHistory();
    setHistory(restored);
    if (restored[0]) setCurrentId(restored[0].requestId);
    for (const record of restored) watchRecord(record);
  }, [watchRecord]);

  useEffect(() => {
    const loadModels = async () => {
      setModelsLoading(true);
      setModelsError(undefined);
      try {
        const response = await fetch("/api/higgsfield/models", { cache: "no-store" });
        const payload = await response.json().catch(() => null) as ModelResponse | null;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.models)) throw new Error(messageFromResponse(payload, "Higgsfield 모델 목록을 불러오지 못했습니다."));
        const availableModels = payload.models;
        setModels(availableModels);
        setConfigured(Boolean(payload.connection?.configured));
        const first = availableModels[0];
        if (first) {
          setModelId((current) => current && availableModels.some((model) => model.id === current) ? current : first.id);
          setInputMode((current) => current ?? defaultInputMode(first));
          setSettings((current) => Object.keys(current).length ? current : defaultSettings(first));
        }
      } catch (caught) {
        setModelsError(caught instanceof Error ? caught.message : "Higgsfield 모델 목록을 불러오지 못했습니다.");
      } finally {
        setModelsLoading(false);
      }
    };
    void loadModels();
  }, []);

  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    stopWatching();
  }, []);

  const chooseModel = (nextId: string) => {
    const model = models.find((candidate) => candidate.id === nextId);
    setModelId(nextId);
    setInputMode(defaultInputMode(model));
    setSettings(defaultSettings(model));
    setMedia((current) => current.filter((item) => activeRoles(model, defaultInputMode(model))[item.role]));
    setError(undefined);
  };

  const chooseInputMode = (nextMode?: string) => {
    setInputMode(nextMode);
    setMedia((current) => current.filter((item) => activeRoles(selectedModel, nextMode)[item.role]));
    setError(undefined);
  };

  const addMedia = (role: keyof typeof ROLE_KIND, files: FileList | File[]) => {
    const limit = roles[role] ?? 0;
    if (!limit) return;
    const remaining = Math.max(0, limit - media.filter((item) => item.role === role).length);
    const selected = Array.from(files).slice(0, remaining).filter((file) => file.size > 0);
    if (!selected.length) return;
    const newDrafts = selected.map((file) => {
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      if (previewUrl) objectUrls.current.add(previewUrl);
      return { id: draftId(), role, kind: ROLE_KIND[role], name: file.name, file, previewUrl } satisfies MediaDraft;
    });
    setMedia((current) => [...current, ...newDrafts]);
    setError(undefined);
  };

  const removeMedia = (id: string) => setMedia((current) => {
    const item = current.find((candidate) => candidate.id === id);
    if (item?.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      objectUrls.current.delete(item.previewUrl);
    }
    return current.filter((candidate) => candidate.id !== id);
  });

  const createGeneration = async () => {
    if (!configured) {
      setError("Higgsfield API 연결이 필요합니다. 서버 환경변수를 등록한 뒤 다시 시도해주세요.");
      return;
    }
    if (!selectedModel) {
      setError("영상 모델을 선택해주세요.");
      return;
    }
    if (selectedModel.requirePrompt && !prompt.trim()) {
      setError("이 모델에는 프롬프트가 필요합니다.");
      return;
    }
    setError(undefined);
    try {
      setStage("uploading");
      const generationMedia = await Promise.all(media.map(async (item) => {
        const url = item.url ?? (item.file ? (await uploadMedia(item.file)).url : undefined);
        if (!url) throw new Error(`${item.name} 파일을 준비하지 못했습니다.`);
        return { id: item.id, url, role: item.role, kind: item.kind, name: item.name };
      }));
      setStage("submitting");
      const response = await fetch("/api/higgsfield/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel.id, inputMode, prompt, media: generationMedia, settings }),
      });
      const payload = await response.json().catch(() => null) as GenerateResponse | null;
      if (!response.ok || !payload?.ok || !payload.generation) throw new Error(messageFromResponse(payload, "영상 생성 요청에 실패했습니다."));
      const now = new Date().toISOString();
      const record: VideoGenerationRecord = {
        requestId: payload.generation.requestId,
        model: selectedModel.id,
        modelLabel: payload.generation.model.label,
        ...(inputMode ? { inputMode } : {}),
        prompt,
        settings,
        status: payload.generation.status,
        createdAt: now,
        updatedAt: now,
      };
      updateRecord(record);
      watchRecord(record);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "영상 생성 요청에 실패했습니다.");
    } finally {
      setStage("idle");
    }
  };

  const cancelCurrent = async () => {
    if (!currentRecord?.requestId) return;
    setError(undefined);
    try {
      const response = await fetch("/api/higgsfield/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: currentRecord.requestId }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageFromResponse(payload, "생성 취소에 실패했습니다."));
      updateRecord({ ...currentRecord, status: "canceled", updatedAt: new Date().toISOString() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "생성 취소에 실패했습니다.");
    }
  };

  const newGeneration = () => {
    setPrompt("");
    for (const item of media) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setMedia([]);
    setCurrentId(undefined);
    setError(undefined);
    setTab("generate");
  };

  const useAsReference = () => {
    if (!currentRecord?.videoUrl) return;
    const referenceRole = roles.source ? "source" : roles.video ? "video" : undefined;
    if (!referenceRole) {
      setError("선택한 모델은 생성 영상을 참조 입력으로 지원하지 않습니다.");
      return;
    }
    setMedia((current) => [...current.filter((item) => item.role !== referenceRole), {
      id: draftId(), role: referenceRole, kind: ROLE_KIND[referenceRole], name: "생성 영상 Reference", url: currentRecord.videoUrl,
    }]);
    setError(undefined);
    setTab("generate");
  };

  const retryGeneration = () => { void createGeneration(); };
  const isWorking = stage !== "idle";

  return (
    <main className={`${styles.workspace} ${embedded ? styles.embedded : ""}`}>
      {!embedded ? <header className={styles.pageIntro}><div><span>OLIVIA CREATIVE STUDIO</span><h1>영상제작 <em>BETA</em></h1><p>AI 이미지·영상 모델로 촬영 이미지와 아이디어를 영상으로 제작합니다.</p></div><div className={configured ? styles.connectionReady : styles.connectionNeeded}>{configured ? "● Higgsfield 연결됨" : "△ API 연결 필요"}</div></header> : null}

      <div className={styles.tabs} role="tablist" aria-label="영상제작 탭">
        <button type="button" role="tab" aria-selected={tab === "generate"} className={tab === "generate" ? styles.tabActive : styles.tab} onClick={() => setTab("generate")}><Clapperboard size={16} /> 영상 생성</button>
        <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? styles.tabActive : styles.tab} onClick={() => setTab("history")}><History size={16} /> 생성 기록</button>
      </div>

      {modelsLoading ? <section className={styles.loadingPanel}><LoaderCircle className={styles.spin} size={28} /> 영상 모델을 준비하는 중...</section> : modelsError ? <section className={styles.failurePanel}><AlertTriangle size={22} /><div><strong>영상제작을 열지 못했습니다.</strong><p>{modelsError}</p></div><button type="button" onClick={() => window.location.reload()}>다시 시도</button></section> : tab === "history" ? (
        <section className={styles.historyOnly}><VideoHistory records={history} activeId={currentId} onSelect={(record) => { setCurrentId(record.requestId); setTab("generate"); }} /></section>
      ) : (
        <>
          <div className={styles.studioGrid}>
            <section className={styles.settingsPanel}>
              <div className={styles.panelTitle}><div><Sparkles size={18} /><strong>생성 설정</strong></div><span>모델별 지원 옵션만 표시됩니다.</span></div>
              <VideoModelSelector models={models} modelId={modelId} inputMode={inputMode} onModelChange={chooseModel} onInputModeChange={chooseInputMode} />
              <VideoInputPanel roles={roles} media={media} onAdd={addMedia} onRemove={removeMedia} />
              <VideoPromptPanel value={prompt} onChange={setPrompt} required={selectedModel?.requirePrompt} />
              <VideoOptionsPanel model={selectedModel} settings={settings} onChange={(key, value) => setSettings((current) => ({ ...current, [key]: value }))} />
              {error ? <div className={styles.inlineError}><AlertTriangle size={15} /><span>{error}</span></div> : null}
              <button type="button" className={styles.generateButton} onClick={() => void createGeneration()} disabled={isWorking || !configured || !selectedModel}><Sparkles size={18} /> {stage === "uploading" ? "입력 파일 업로드 중" : stage === "submitting" ? "영상 생성 요청 중" : "영상 생성하기"}</button>
              {!configured ? <p className={styles.configHint}>서버 환경변수 <code>HF_API_KEY</code> 등록 후 생성 버튼이 활성화됩니다.</p> : null}
            </section>
            <VideoResultViewer record={currentRecord} configured={configured} onCancel={() => void cancelCurrent()} onRetry={retryGeneration} onReference={useAsReference} onNew={newGeneration} />
          </div>
          <VideoHistory records={history} activeId={currentId} onSelect={(record) => setCurrentId(record.requestId)} />
        </>
      )}
    </main>
  );
}
