"use client";

import { useRef, useState } from "react";
import { useSelectMatchChatStore } from "@/lib/store/useSelectMatchChatStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { parseNamesFromText, parseNamesFromFiles } from "@/lib/selectMatch/nameParsing";
import { buildRawIndex, copyFileHandle, computePreflight, type RawIndexEntry } from "@/lib/selectMatch/rawIndex";
import { collectJpgFolderGroups } from "@/lib/selectMatch/folderScanner";
import { collectBridgeSidecarRatedNames } from "@/lib/selectMatch/bridgeRating";
import { buildMatchSummaryText } from "@/lib/selectMatch/matchSummary";

// 채팅 안에서 셀렉 매칭을 끝까지 수행하는 카드 — /select-match 페이지의 "텍스트 붙여넣기"/
// "파일 업로드" 입력 모드 + RAW 폴더 선택 + 사전 확인 + 복사 실행을 압축한 버전이다. 실제
// 로직(lib/selectMatch/*)은 페이지와 100% 동일한 함수를 그대로 재사용한다.
export default function SelectMatchChatCard({ flowId }: { flowId: string }) {
  const flow = useSelectMatchChatStore((s) => s.flows[flowId]);
  const store = useSelectMatchChatStore.getState;
  const setBlockState = useOliviaConversationStore((s) => s.setClientTaskBlockState);
  const appendMessage = useOliviaConversationStore((s) => s.appendMessage);

  const rawIndexRef = useRef<Map<string, RawIndexEntry>>(new Map());
  const cancelRef = useRef(false);
  const [textValue, setTextValue] = useState("");
  const [inputMode, setInputMode] = useState<"folder" | "text" | "upload">("folder");
  const [dragging, setDragging] = useState(false);
  const [folderScanning, setFolderScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!flow) return null;

  const appendAssistantText = (text: string) => {
    appendMessage({
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      blocks: [{ type: "text", text }],
      createdAt: new Date().toISOString(),
      status: "complete",
    });
  };

  const submitNames = (names: Set<string>) => {
    if (names.size === 0) {
      store().setError(flowId, "파일명을 찾지 못했어요. 파일명(DSC_0142.jpg 형태)이 포함된 텍스트를 붙여넣거나 파일을 업로드해주세요.");
      return;
    }
    store().setNames(flowId, names);
    store().setStep(flowId, "awaiting_raw_folder");
    setBlockState(flowId, "in_progress");
  };

  const pickJpgFolderAndCollect = async () => {
    try {
      // showDirectoryPicker는 반드시 클릭 핸들러의 첫 번째 await여야 한다 — pickRawFolderAndScan과
      // 동일한 이유(user gesture). 이름만 필요하므로 읽기 전용으로 연다.
      const dir = await (window as any).showDirectoryPicker({ mode: "read" });
      setFolderScanning(true);
      const groups = await collectJpgFolderGroups(dir);
      const result = await collectBridgeSidecarRatedNames(groups);
      if (result.names.size === 0) {
        store().setError(
          flowId,
          result.scanned === 0
            ? "선택한 폴더에서 JPG 파일을 찾지 못했어요."
            : `JPG ${result.scanned.toLocaleString()}장을 확인했지만 Bridge 별점 사이드카(.xmp)를 찾지 못했어요. Adobe Bridge에서 별점을 저장한 뒤 다시 선택해주세요.`,
        );
        return;
      }
      submitNames(result.names);
    } catch (e: any) {
      if (e?.name !== "AbortError") store().setError(flowId, "폴더 선택에 실패했어요. 다시 시도해주세요.");
    } finally {
      setFolderScanning(false);
    }
  };

  const pickRawFolderAndScan = async () => {
    try {
      // showDirectoryPicker는 반드시 클릭 핸들러의 첫 번째 await여야 한다 — 다른 await/상태
      // 갱신이 먼저 오면 브라우저가 user gesture를 인정하지 않아 거부한다.
      const dir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      store().setRawRootDir(flowId, dir);
      store().setScanProgress(flowId, 0);
      store().setStep(flowId, "scanning");
      const rawIndex = await buildRawIndex(dir, null, (count) => store().setScanProgress(flowId, count));
      rawIndexRef.current = rawIndex;
      store().setPreflight(flowId, computePreflight(flow.selectedNames, rawIndex));
      store().setStep(flowId, "preflight_ready");
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        const msg = "RAW 폴더 선택에 실패했어요. 다시 시도해주세요.";
        store().setError(flowId, msg);
        appendAssistantText(msg);
      }
    }
  };

  const runMatch = async () => {
    if (!flow.rawRootDir) return;
    store().setStep(flowId, "matching");
    cancelRef.current = false;
    const rawSelectDir = await (flow.rawRootDir as any).getDirectoryHandle("Selected_RAW", { create: true }) as FileSystemDirectoryHandle;
    let matched = 0, missing = 0, done = 0;
    const missingNames: string[] = [];
    const names = Array.from(flow.selectedNames);
    for (const basename of names) {
      if (cancelRef.current) break;
      store().setMatchProgress(flowId, { cur: done, total: names.length, msg: `매칭: ${basename}` });
      const entry = rawIndexRef.current.get(basename);
      if (entry) {
        const rawFile = await entry.fileHandle.getFile();
        try { await copyFileHandle(entry.fileHandle, rawSelectDir, rawFile.name); store().appendLog(flowId, `✅ ${rawFile.name}`); matched++; }
        catch { store().appendLog(flowId, `❌ 실패: ${rawFile.name}`); }
      } else {
        store().appendLog(flowId, `⚠️ RAW 없음: ${basename}`);
        missing++;
        missingNames.push(basename);
      }
      done++;
    }
    store().setResult(flowId, { matched, missing, selected: names.length });
    store().setStep(flowId, "done");
    setBlockState(flowId, "done");
    // client_task 블록은 텍스트가 아니라서 다음 턴 모델 입력(messageText())에 절대 안 잡힌다 —
    // "한 장 왜 안됐어?" 같은 팔로우업에 답하려면 결과를 텍스트로도 남겨야 한다.
    appendAssistantText(buildMatchSummaryText(names.length, matched, missing, missingNames));
  };

  return (
    <div className="olivia-select-match-card">
      {flow.step === "collecting_names" && (
        <div className="olivia-select-match-card__section">
          <p>셀렉 매칭을 도와드릴게요. 고객이 선택한 파일명을 알려주세요 — 폴더를 선택하거나, 텍스트로 붙여넣거나, 파일을 업로드하면 돼요.</p>
          <div className="olivia-select-match-card__tabs">
            <button type="button" className={inputMode === "folder" ? "is-active" : ""} onClick={() => setInputMode("folder")}>폴더 선택</button>
            <button type="button" className={inputMode === "text" ? "is-active" : ""} onClick={() => setInputMode("text")}>텍스트 붙여넣기</button>
            <button type="button" className={inputMode === "upload" ? "is-active" : ""} onClick={() => setInputMode("upload")}>파일 업로드</button>
          </div>
          {inputMode === "folder" ? (
            <>
              <p>촬영 JPG 폴더를 선택하면 Bridge 별점 사이드카(.xmp)를 확인해 별점이 있는 사진만 가져와요.</p>
              <button type="button" disabled={folderScanning} onClick={() => void pickJpgFolderAndCollect()}>
                {folderScanning ? "Bridge 별점 확인 중…" : "📂 JPG 폴더 선택 →"}
              </button>
            </>
          ) : inputMode === "text" ? (
            <>
              <textarea
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder={"예시: DSC_0142.jpg, DSC_0145.jpg"}
                rows={4}
              />
              <button type="button" disabled={!textValue.trim()} onClick={() => submitNames(parseNamesFromText(textValue))}>
                다음 →
              </button>
            </>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.jpg,.jpeg,.heic,.png,.tif"
                hidden
                onChange={(e) => { if (e.target.files) submitNames(parseNamesFromFiles(e.target.files)); }}
              />
              <div
                className={`olivia-select-match-card__dropzone${dragging ? " is-dragging" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); submitNames(parseNamesFromFiles(e.dataTransfer.files)); }}
                onClick={() => fileInputRef.current?.click()}
              >
                파일을 드래그하거나 클릭해서 선택
              </div>
            </>
          )}
          {flow.errorMessage && <div className="olivia-select-match-card__error">{flow.errorMessage}</div>}
        </div>
      )}

      {flow.step === "awaiting_raw_folder" && (
        <div className="olivia-select-match-card__section">
          <p>파일명 <strong>{flow.selectedNames.size}개</strong>를 확인했어요. 이제 RAW 파일이 들어있는 폴더를 선택해주세요.</p>
          <div className="olivia-select-match-card__samples">
            {Array.from(flow.selectedNames).slice(0, 5).map((n) => <div key={n}>{n}</div>)}
            {flow.selectedNames.size > 5 && <div>... 외 {flow.selectedNames.size - 5}개</div>}
          </div>
          <button type="button" onClick={() => void pickRawFolderAndScan()}>📂 RAW 폴더 선택 →</button>
        </div>
      )}

      {flow.step === "scanning" && (
        <div className="olivia-select-match-card__section">
          <div className="olivia-select-match-card__progress-bar"><i /></div>
          <p>RAW 파일 탐색 중{flow.rawScanCount > 0 ? ` — ${flow.rawScanCount.toLocaleString()}개 확인` : "..."}</p>
        </div>
      )}

      {flow.step === "preflight_ready" && flow.preflight && (
        <div className="olivia-select-match-card__section">
          <div className="olivia-select-match-card__stats">
            <div><strong>{flow.preflight.rawFound}</strong><span>RAW 발견</span></div>
            <div><strong>{flow.preflight.willMatch}</strong><span>매칭 예상</span></div>
            <div><strong>{flow.preflight.willMiss}</strong><span>누락 예상</span></div>
          </div>
          {flow.preflight.rawFound === 0 ? (
            <div className="olivia-select-match-card__error">RAW 파일을 찾지 못했어요. 다른 폴더를 선택해주세요.</div>
          ) : flow.preflight.willMatch === 0 ? (
            <div className="olivia-select-match-card__warning">파일명이 맞지 않아요. JPG와 RAW의 파일명이 같아야 매칭돼요.</div>
          ) : null}
          <div className="olivia-select-match-card__actions">
            <button type="button" className="is-secondary" onClick={() => store().resetFlow(flowId)}>취소</button>
            {flow.preflight.willMatch > 0 && <button type="button" onClick={() => void runMatch()}>복사 시작 ({flow.preflight.willMatch}개) →</button>}
          </div>
        </div>
      )}

      {flow.step === "matching" && (
        <div className="olivia-select-match-card__section">
          <div className="olivia-select-match-card__progress-bar">
            <i style={{ width: `${flow.matchProgress.total > 0 ? Math.round((flow.matchProgress.cur / flow.matchProgress.total) * 100) : 0}%` }} />
          </div>
          <p>{flow.matchProgress.msg}</p>
          <div className="olivia-select-match-card__log">
            {flow.log.slice(-20).map((line, i) => <div key={i}>{line}</div>)}
          </div>
          <button type="button" className="is-secondary" onClick={() => { cancelRef.current = true; }}>중단</button>
        </div>
      )}

      {flow.step === "done" && flow.result && (
        <div className="olivia-select-match-card__section">
          <strong>✅ 매칭 완료!</strong>
          <div className="olivia-select-match-card__stats">
            <div><strong>{flow.result.selected}</strong><span>선택 JPG</span></div>
            <div><strong>{flow.result.matched}</strong><span>RAW 매칭</span></div>
            <div><strong>{flow.result.missing}</strong><span>RAW 누락</span></div>
          </div>
          <p>Selected_RAW/ 폴더에 저장했어요. 원본 RAW 파일은 삭제되지 않았어요.</p>
        </div>
      )}

      {flow.step === "error" && (
        <div className="olivia-select-match-card__section">
          <div className="olivia-select-match-card__error">{flow.errorMessage}</div>
          <button type="button" onClick={() => store().resetFlow(flowId)}>다시 시도</button>
        </div>
      )}
    </div>
  );
}
