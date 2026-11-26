"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FilePlus2 } from "lucide-react";
import QuoteBuilder from "@/components/quote/QuoteBuilder";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";
import type { DocumentPortalTarget } from "@/lib/document-mail/portal";
import { DOCUMENT_MAIL_LABELS, type DocumentMailKind, type DocumentMailPreview } from "@/lib/document-mail/shared";
import {
  loadQuoteStatements, loadStatementWorkspace, openQuoteStatement, type StatementWorkspaceOpening,
} from "@/lib/quote/transactionStatementClient";
import DocumentMailPanel, { DOCUMENT_MAIL_ENDPOINT } from "./DocumentMailPanel";
import { DocumentPortalEditorContext } from "./DocumentPortalEditorContext";
import styles from "./DocumentMail.module.css";

const ContractBuilder = dynamic(() => import("@/components/contract/ContractBuilder"), { loading: EditorLoading });
const StatementWorkspace = dynamic(() => import("@/components/quote/TransactionStatementWorkspace"), { loading: EditorLoading });
const KINDS = Object.keys(DOCUMENT_MAIL_LABELS) as DocumentMailKind[];

function EditorLoading() {
  return <p className={styles.workspaceMessage} role="status">문서를 불러오는 중…</p>;
}

export default function DocumentPortalWorkspace({ target, embedded = false }: { target: DocumentPortalTarget; embedded?: boolean }) {
  const { anchor } = target;
  return <DocumentPortal key={`${anchor.kind}:${anchor.id}`} target={target} embedded={embedded} />;
}

function DocumentPortal({ target, embedded }: { target: DocumentPortalTarget; embedded: boolean }) {
  const { anchor } = target;
  const { kind, id } = anchor;
  const [tab, setTab] = useState(target.tab);
  const [preview, setPreview] = useState<DocumentMailPreview | null>(null);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  const [contractId, setContractId] = useState<string>();
  const [mailVisible, setMailVisible] = useState(false);
  const loadSequence = useRef(0);
  const currentSave = useRef<(() => Promise<boolean>) | null>(null);
  const pendingSave = useRef<Promise<boolean> | null>(null);
  const changingTab = useRef(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++loadSequence.current;
    const params = new URLSearchParams({ kind, id });
    const response = await fetch(`${DOCUMENT_MAIL_ENDPOINT}?${params}`, { signal, cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "문서 목록을 불러오지 못했습니다.");
    const next: DocumentMailPreview = payload.preview;
    if (sequence === loadSequence.current && !signal?.aborted) setPreview(next);
    return next;
  }, [kind, id]);

  const reportError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "문서를 불러오지 못했습니다.");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((cause) => { if (!controller.signal.aborted) reportError(cause); });
    return () => controller.abort();
  }, [refresh, reportError]);

  const editorContext = useMemo(() => ({
    registerSave: (save: (() => Promise<boolean>) | null) => { currentSave.current = save; },
    onSaved: () => { void refresh().catch(reportError); },
  }), [refresh, reportError]);

  const saveEditor = useCallback(() => {
    if (pendingSave.current) return pendingSave.current;
    const save = currentSave.current;
    if (!save) return Promise.resolve(true);
    const task = save().finally(() => { pendingSave.current = null; });
    pendingSave.current = task;
    return task;
  }, []);

  async function switchTab(next: DocumentMailKind, nextContractId?: string) {
    if (changingTab.current) return;
    changingTab.current = true;
    setSwitching(true);
    setError("");
    try {
      if (!await saveEditor()) throw new Error("현재 문서를 저장하지 못했습니다. 저장 상태를 확인해 주세요.");
      if (nextContractId) setContractId(nextContractId);
      setTab(next);
    } catch (cause) { reportError(cause); }
    finally { changingTab.current = false; setSwitching(false); }
  }

  const quote = preview?.documents.find((document) => document.kind === "quote");
  const contracts = preview?.documents.filter((document) => document.kind === "contract") ?? [];
  const statements = preview?.documents.filter((document) => document.kind === "statement") ?? [];
  const currentTab = quote ? tab : kind;
  const activeContract = contracts.find((document) => document.id === (contractId ?? target.documentId ?? (kind === "contract" ? id : undefined))) ?? contracts[0];
  const activeStatement = statements.find((document) => document.id === (kind === "statement" ? id : target.documentId)) ?? statements[0];
  const workspaceTitle = quote?.title || preview?.customerName;

  return <section className={styles.workspace} data-embedded={embedded || undefined} aria-label="문서 포털">
    <header className={styles.workspaceHeader}>
      <div className={styles.workspaceTitle}>
        {!embedded && <a className={styles.iconButton} href={kind === "statement" ? (quote ? `/quote?resourceId=${quote.id}` : "/quote") : `/${kind}?resourceId=${id}`} aria-label="문서 포털 나가기"><ArrowLeft size={17} /></a>}
        <h1>문서 포털</h1>
        {workspaceTitle && <span title={workspaceTitle}>{workspaceTitle}</span>}
      </div>
      <button type="button" className={styles.mobileMail} aria-expanded={mailVisible} onClick={() => setMailVisible((value) => !value)}>
        {mailVisible ? "문서 보기" : "메일 보내기"}
      </button>
    </header>
    <nav className={styles.tabs} aria-label="문서 선택">
      {KINDS.map((next) => <button key={next} type="button" aria-current={currentTab === next ? "page" : undefined}
        disabled={!preview || switching || (!quote && next !== kind)} onClick={() => { if (next !== currentTab) void switchTab(next); }}>
        {DOCUMENT_MAIL_LABELS[next]}
      </button>)}
    </nav>
    {error && <div className={styles.workspaceError} role="alert">{error} {!preview && <button className={styles.button} type="button" onClick={() => {
      setError(""); void refresh().catch(reportError);
    }}>다시 불러오기</button>}</div>}
    {preview ? <div className={styles.workspaceGrid} data-mail-visible={mailVisible || undefined}>
      <div className={styles.document}>
        <DocumentPortalEditorContext.Provider value={editorContext}>
          <DesktopWindowProvider value={true}>
            {currentTab === "quote" && quote && <QuoteBuilder mode="modal" documentOnly resourceId={quote.id} />}
            {currentTab === "statement" && <StatementTab quoteId={quote?.id} statementId={activeStatement?.id} onSaved={editorContext.onSaved} />}
            {currentTab === "contract" && <>
              {contracts.length > 1 && <label className={`${styles.field} ${styles.contractChooser}`}>계약서 기록<select value={activeContract?.id} disabled={switching}
                onChange={(event) => void switchTab("contract", event.target.value)}>
                {contracts.map((entry) => <option value={entry.id} key={entry.id}>{entry.number || entry.title}{entry.requiresSignature ? " · 서명 대기" : " · 서명 완료"}</option>)}
              </select></label>}
              <ContractTab key={contractId ?? target.documentId ?? "contract"} quoteId={quote?.id} initialContractId={activeContract?.id} />
            </>}
          </DesktopWindowProvider>
        </DocumentPortalEditorContext.Provider>
      </div>
      <div className={styles.mailRegion}>
        <DocumentMailPanel anchor={anchor} preview={preview} preferredContractId={target.tab === "contract" ? target.documentId : undefined} refresh={refresh} saveEditor={saveEditor} />
      </div>
    </div> : !error && <EditorLoading />}
  </section>;
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
