"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FilePlus2, FolderOpen, PanelRightClose } from "lucide-react";
import { SavedQuoteList } from "@/components/quote/SavedQuotePicker";
import Button from "@/components/ui/Button";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";
import type { DocumentPortalTarget } from "@/lib/document-mail/portal";
import { DOCUMENT_MAIL_LABELS, type DocumentMailKind, type DocumentMailPreview } from "@/lib/document-mail/shared";
import {
  loadQuoteStatements, loadStatementWorkspace, openQuoteStatement, type StatementWorkspaceOpening,
} from "@/lib/quote/transactionStatementClient";
import DocumentMailPanel, { DOCUMENT_MAIL_ENDPOINT } from "./DocumentMailPanel";
import { DocumentPortalEditorContext, type DocumentPortalContent } from "./DocumentPortalEditorContext";
import styles from "./DocumentMail.module.css";

const QuoteBuilder = dynamic(() => import("@/components/quote/QuoteBuilder"), { loading: EditorLoading });
const ContractBuilder = dynamic(() => import("@/components/contract/ContractBuilder"), { loading: EditorLoading });
const StatementWorkspace = dynamic(() => import("@/components/quote/TransactionStatementWorkspace"), { loading: EditorLoading });
const KINDS = Object.keys(DOCUMENT_MAIL_LABELS) as DocumentMailKind[];

function EditorLoading() {
  return <p className={styles.workspaceMessage} role="status">문서를 불러오는 중…</p>;
}

function messageFor(cause: unknown) {
  return cause instanceof Error ? cause.message : "문서를 불러오지 못했습니다.";
}

export default function DocumentPortalWorkspace({ target: initialTarget, primaryKind, embedded, children }: {
  target?: DocumentPortalTarget;
  primaryKind?: "quote" | "contract";
  embedded?: boolean;
  children?: ReactNode;
}) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(Boolean(initialTarget));
  const [content, setContent] = useState<DocumentPortalContent | null>(() => initialTarget ? { target: initialTarget } : null);
  const target = content && "target" in content ? content.target : null;
  const kind = target?.anchor.kind;
  const id = target?.anchor.id;
  const groupKey = kind && id ? `${kind}:${id}` : null;
  const [loaded, setLoaded] = useState<{ key: string; preview?: DocumentMailPreview; error?: string } | null>(null);
  const [selection, setSelection] = useState<{ target: DocumentPortalTarget; tab: DocumentMailKind; contractId?: string }>();
  const [actionError, setActionError] = useState("");
  const [switching, setSwitching] = useState(false);
  const activeGroup = useRef(groupKey);
  const loadSequence = useRef(0);
  const currentSave = useRef<(() => Promise<boolean>) | null>(null);
  const pendingSave = useRef<Promise<boolean> | null>(null);
  const changingTab = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const preview = loaded?.key === groupKey ? loaded?.preview : undefined;
  const loadError = loaded?.key === groupKey ? loaded?.error : undefined;

  useLayoutEffect(() => {
    activeGroup.current = groupKey;
    return () => { activeGroup.current = null; };
  }, [groupKey]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!groupKey || !kind || !id) throw new Error("먼저 보낼 문서를 열어 주세요.");
    if (activeGroup.current !== groupKey) throw new Error("열려 있는 문서가 바뀌었습니다.");
    const sequence = ++loadSequence.current;
    const params = new URLSearchParams({ kind, id });
    const response = await fetch(`${DOCUMENT_MAIL_ENDPOINT}?${params}`, { signal, cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (activeGroup.current !== groupKey) throw new Error("열려 있는 문서가 바뀌었습니다.");
    if (!response.ok || !data?.ok || !data.preview) throw new Error(data?.error || "문서 포털을 불러오지 못했습니다.");
    if (sequence === loadSequence.current && !signal?.aborted) setLoaded({ key: groupKey, preview: data.preview });
    return data.preview as DocumentMailPreview;
  }, [groupKey, id, kind]);

  useEffect(() => {
    if (!groupKey) return;
    const request = new AbortController();
    void refresh(request.signal).catch((cause) => {
      if (!request.signal.aborted) setLoaded({ key: groupKey, error: messageFor(cause) });
    });
    return () => request.abort();
  }, [groupKey, refresh]);

  const reveal = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !panelRef.current?.contains(active)) opener.current = active;
    setExpanded(true);
  }, []);
  const close = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement)) opener.current?.focus({ preventScroll: true });
    setExpanded(false);
  }, []);
  const show = useCallback((next: DocumentPortalContent) => {
    setActionError("");
    setContent(next);
    reveal();
  }, [reveal]);
  const reset = useCallback(() => {
    activeGroup.current = null;
    loadSequence.current += 1;
    setContent(null);
    setLoaded(null);
    setActionError("");
    setExpanded(false);
  }, []);
  const sidebar = useMemo(() => ({ id: panelId, expanded, show, update: setContent, close, reset }), [close, expanded, panelId, reset, show]);
  const registerSave = useCallback((save: () => Promise<boolean>) => {
    currentSave.current = save;
    return () => { if (currentSave.current === save) currentSave.current = null; };
  }, []);
  const reportError = useCallback((cause: unknown) => setActionError(messageFor(cause)), []);
  const onSaved = useCallback(() => {
    if (!groupKey || activeGroup.current !== groupKey) return;
    void refresh().catch((cause) => { if (activeGroup.current === groupKey) reportError(cause); });
  }, [groupKey, refresh, reportError]);
  const saveEditor = useCallback(() => {
    if (pendingSave.current) return pendingSave.current;
    const save = currentSave.current;
    if (!save) return Promise.resolve(true);
    const task = save().finally(() => { pendingSave.current = null; });
    pendingSave.current = task;
    return task;
  }, []);

  async function switchTab(next: DocumentMailKind, nextContractId?: string) {
    if (!target || changingTab.current) return;
    changingTab.current = true;
    setSwitching(true);
    setActionError("");
    try {
      if (!await saveEditor()) throw new Error("현재 문서를 저장하지 못했습니다. 저장 상태를 확인해 주세요.");
      setSelection({ target, tab: next, contractId: nextContractId });
    } catch (cause) {
      reportError(cause);
    } finally {
      changingTab.current = false;
      setSwitching(false);
    }
  }

  function retryLoad() {
    if (!groupKey) return;
    setLoaded(null);
    void refresh().catch((cause) => { if (activeGroup.current === groupKey) setLoaded({ key: groupKey, error: messageFor(cause) }); });
  }

  const view = selection?.target === target ? selection : null;
  const quote = preview?.documents.find((document) => document.kind === "quote");
  const contracts = preview?.documents.filter((document) => document.kind === "contract") ?? [];
  const statements = preview?.documents.filter((document) => document.kind === "statement") ?? [];
  const currentTab = quote ? view?.tab ?? target?.tab : kind;
  const initialContractId = target?.tab === "contract" ? target.documentId : undefined;
  const contractId = view?.contractId ?? initialContractId ?? (kind === "contract" ? id : undefined);
  const activeContract = contracts.find((document) => document.id === contractId) ?? contracts[0];
  const activeStatement = statements.find((document) => document.id === (kind === "statement" ? id : target?.documentId)) ?? statements[0];
  const workspaceTitle = quote?.title || preview?.customerName;
  const showPrimary = Boolean(children) && (!preview || (currentTab === primaryKind
    && (primaryKind === "quote" || !view?.contractId || view.contractId === (initialContractId ?? id))));
  const primaryEditor = useMemo(() => ({ active: showPrimary, registerSave, onSaved, sidebar }), [onSaved, registerSave, showPrimary, sidebar]);
  const linkedEditor = useMemo(() => ({ active: !showPrimary, registerSave, onSaved }), [onSaved, registerSave, showPrimary]);

  return <div className={styles.workspace} data-fill={embedded || !children || undefined} data-standalone={!children || undefined}>
    <div className={styles.workspaceGrid} data-open={expanded || undefined} data-page={Boolean(children && !embedded) || undefined}>
      {children && <div className={styles.document} hidden={!showPrimary}>
        <DocumentPortalEditorContext.Provider value={primaryEditor}>{children}</DocumentPortalEditorContext.Provider>
      </div>}
      {!showPrimary && <div className={styles.document}>
        {!expanded && <div className={styles.editorActions}>
          {primaryKind && <Button onClick={() => void switchTab(primaryKind)} disabled={switching}>{DOCUMENT_MAIL_LABELS[primaryKind]} 보기</Button>}
          <Button variant="primary" icon={<FolderOpen size={15} />} aria-controls={panelId} aria-expanded={false} onClick={reveal}>문서 포털</Button>
        </div>}
        {!preview && (loadError ? <p className={styles.workspaceMessage}>{loadError}</p> : <EditorLoading />)}
        {preview && <DocumentPortalEditorContext.Provider value={linkedEditor}>
          <DesktopWindowProvider value={true}>
            {currentTab === "quote" && quote && <QuoteBuilder mode="modal" documentOnly resourceId={quote.id} />}
            {currentTab === "statement" && <StatementTab key={groupKey} quoteId={quote?.id} statementId={activeStatement?.id} onSaved={onSaved} />}
            {currentTab === "contract" && <ContractTab
              key={`${groupKey}:${view?.contractId ?? initialContractId ?? ""}`} quoteId={quote?.id} initialContractId={activeContract?.id}
            />}
          </DesktopWindowProvider>
        </DocumentPortalEditorContext.Provider>}
      </div>}
      <aside id={panelId} ref={panelRef} className={styles.drawerSlot} aria-label="문서 포털" inert={!expanded}
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
        <div className={styles.drawer}>
          <header className={styles.workspaceHeader}>
            <div className={styles.workspaceTitle}>
              <h2>문서 포털</h2>
              {workspaceTitle && <span title={workspaceTitle}>{workspaceTitle}</span>}
            </div>
            <button type="button" className={styles.iconButton} onClick={close} aria-label="문서 포털 닫기" title="문서 포털 닫기"><PanelRightClose size={17} /></button>
          </header>
          {preview && target && <nav className={styles.tabs} aria-label="문서 선택">
            {KINDS.map((next) => <button key={next} type="button" aria-current={currentTab === next ? "page" : undefined}
              disabled={switching || (!quote && next !== kind)} onClick={() => { if (next !== currentTab) void switchTab(next); }}>
              {DOCUMENT_MAIL_LABELS[next]}
            </button>)}
          </nav>}
          {currentTab === "contract" && contracts.length > 1 && <label className={`${styles.field} ${styles.contractChooser}`}>계약서 기록
            <select value={activeContract?.id} disabled={switching} onChange={(event) => void switchTab("contract", event.target.value)}>
              {contracts.map((entry) => <option value={entry.id} key={entry.id}>{entry.number || entry.title}{entry.requiresSignature ? " · 서명 대기" : " · 서명 완료"}</option>)}
            </select>
          </label>}
          <div className={styles.mailRegion}>
            {actionError && <p className={styles.workspaceError} role="alert">{actionError}</p>}
            {loadError && <div className={styles.workspaceError} role="alert">{loadError} <Button onClick={retryLoad}>다시 불러오기</Button></div>}
            {content && "chooseQuote" in content && <div className={styles.workspaceMessage}>
              <p>문서 포털에서 열 견적서를 선택하세요.</p>
              <SavedQuoteList onChoose={content.chooseQuote} />
            </div>}
            {content && "busy" in content && <p className={styles.workspaceMessage} role="status">{content.busy}</p>}
            {content && "error" in content && <div className={styles.workspaceError} role="alert">
              <p>{content.error}</p><Button onClick={content.retry}>다시 시도</Button>
            </div>}
            {target && (preview ? <DocumentMailPanel key={groupKey} anchor={target.anchor} preview={preview} preferredContractId={initialContractId}
              refresh={refresh} saveEditor={saveEditor} /> : !loadError && <EditorLoading />)}
          </div>
        </div>
      </aside>
    </div>
  </div>;
}

function ContractTab({ quoteId, initialContractId }: { quoteId?: string; initialContractId?: string }) {
  // Keep the editor mounted if its first save adds the new contract to the mail choices.
  const [id] = useState(initialContractId);
  return <ContractBuilder mode="modal" documentOnly={Boolean(id)} resourceId={id} sourceQuoteId={id ? undefined : quoteId} />;
}

function StatementTab({ quoteId, statementId, onSaved }: { quoteId?: string; statementId?: string; onSaved: () => void }) {
  const [opening, setOpening] = useState<Promise<StatementWorkspaceOpening> | null>(null);
  const [openingError, setOpeningError] = useState("");
  const [initialId] = useState(statementId);

  const open = useCallback((id?: string) => {
    setOpeningError("");
    const request = id ? Promise.all([quoteId ? loadQuoteStatements(quoteId) : { statements: [] }, loadStatementWorkspace(id)])
      .then(([{ statements }, { statement }]) => ({ statements, statement }))
      : quoteId ? openQuoteStatement(quoteId).then((result) => { onSaved(); return result; }) : null;
    if (!request) return;
    void request.catch((cause) => setOpeningError(cause instanceof Error ? cause.message : "거래명세서를 열지 못했습니다."));
    setOpening(request);
  }, [onSaved, quoteId]);

  useEffect(() => { if (initialId) open(initialId); }, [initialId, open]);

  if (openingError) return <div className={styles.workspaceMessage}>
    <p role="alert">{openingError}</p><button className={styles.button} type="button" onClick={() => open(initialId)}>다시 시도</button>
  </div>;
  if (opening) return <StatementWorkspace opening={opening} quoteId={quoteId} />;
  if (initialId) return <EditorLoading />;
  return <div className={styles.workspaceMessage}>
    <p>이 견적에 연결된 거래명세서가 없습니다.</p>
    {quoteId && <button className={styles.button} type="button" onClick={() => open()}><FilePlus2 size={16} /> 거래명세서 만들기</button>}
  </div>;
}
