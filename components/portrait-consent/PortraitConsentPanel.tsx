"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  FileDown,
  FileSignature,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  DEFAULT_DETAIL_FIELDS,
  DEFAULT_INTRO_TEXT,
  DEFAULT_USAGE_ITEMS,
  buildPortraitConsentListHref,
  type PortraitConsentField,
  type PortraitConsentSignature,
  type PortraitConsentStatus,
} from "@/lib/portraitConsent";
import { generatePortraitConsentPdf } from "@/lib/portraitConsentPdf";
import PortraitConsentSignedDocument from "./PortraitConsentSignedDocument";
import styles from "./PortraitConsentWorkspace.module.css";

interface ConsentListItem {
  id: string;
  client_id: string | null;
  workflow_run_id: string | null;
  client_name: string | null;
  workflow_run_name: string | null;
  title: string;
  status: PortraitConsentStatus;
  signature_count: number;
  signature_limit: number;
  latest_signer_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ConsentDetail extends Omit<ConsentListItem, "client_name" | "workflow_run_name"> {
  intro_text: string;
  detail_fields: PortraitConsentField[];
  usage_items: PortraitConsentField[];
  signature_count: number;
  signature_limit: number;
}

interface ClientOption {
  id: string;
  name: string;
}

interface WorkflowRunOption {
  id: string;
  project_name?: string | null;
  shoot_date?: string | null;
  status?: string | null;
}

type StatusFilter = "all" | PortraitConsentStatus;

const STATUS_LABEL: Record<PortraitConsentStatus, string> = {
  draft: "초안",
  sent: "전달됨",
  signed: "서명 완료",
};

const STATUS_CLASS: Record<PortraitConsentStatus, string> = {
  draft: styles.statusDraft,
  sent: styles.statusSent,
  signed: styles.statusSigned,
};

const FIELD_TYPE_LABEL: Record<NonNullable<PortraitConsentField["type"]>, string> = {
  text: "텍스트",
  date: "날짜",
  checklist: "체크",
};

function cloneFields(fields: PortraitConsentField[]): PortraitConsentField[] {
  return fields.map((field) => ({ ...field, options: field.options ? [...field.options] : undefined }));
}

function workflowRunLabel(run: WorkflowRunOption): string {
  return run.project_name?.trim() || run.shoot_date?.trim() || "이름 없는 촬영 건";
}

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "방금 전";
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;
  return `${Math.floor(months / 12)}년 전`;
}

function toggleChecklistValue(current: string, option: string): string {
  const selected = current.split(",").map((item) => item.trim()).filter(Boolean);
  const next = selected.includes(option)
    ? selected.filter((item) => item !== option)
    : [...selected, option];
  return next.join(", ");
}

function FieldListEditor({
  items,
  onChange,
}: {
  items: PortraitConsentField[];
  onChange: (next: PortraitConsentField[]) => void;
}) {
  const update = (index: number, patch: Partial<PortraitConsentField>) => {
    onChange(items.map((field, itemIndex) => (itemIndex === index ? { ...field, ...patch } : field)));
  };

  return (
    <div className={styles.fieldList}>
      {items.map((field, index) => {
        const type = field.type ?? "text";
        const options = field.options?.length ? field.options : ["사진", "영상"];
        const selected = field.value.split(",").map((item) => item.trim()).filter(Boolean);
        return (
          <div className={styles.fieldRow} key={`${index}-${field.label}`}>
            <input
              aria-label={`${index + 1}번 항목 이름`}
              className={`${styles.textInput} ${styles.fieldLabelInput}`}
              value={field.label}
              placeholder="항목명"
              onChange={(event) => update(index, { label: event.target.value })}
            />
            <select
              aria-label={`${field.label || index + 1} 항목 종류`}
              className={`${styles.selectInput} ${styles.fieldTypeInput}`}
              value={type}
              onChange={(event) => {
                const nextType = event.target.value as NonNullable<PortraitConsentField["type"]>;
                update(index, {
                  type: nextType,
                  options: nextType === "checklist" ? options : undefined,
                  value: nextType === "checklist" ? "" : field.value,
                });
              }}
            >
              {(Object.keys(FIELD_TYPE_LABEL) as Array<keyof typeof FIELD_TYPE_LABEL>).map((key) => (
                <option key={key} value={key}>{FIELD_TYPE_LABEL[key]}</option>
              ))}
            </select>

            {type === "checklist" ? (
              <div className={styles.checklistValues}>
                {options.map((option) => (
                  <label key={option}>
                    <input
                      type="checkbox"
                      checked={selected.includes(option)}
                      onChange={() => update(index, { value: toggleChecklistValue(field.value, option) })}
                    />
                    {option}
                  </label>
                ))}
              </div>
            ) : (
              <input
                aria-label={`${field.label || index + 1} 내용`}
                className={`${styles.textInput} ${styles.fieldValueInput}`}
                type={type === "date" ? "date" : "text"}
                value={field.value}
                placeholder="내용"
                onChange={(event) => update(index, { value: event.target.value })}
              />
            )}
            <button
              aria-label={`${field.label || index + 1} 항목 삭제`}
              className={`${styles.iconButton} ${styles.dangerButton}`}
              type="button"
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      <button
        className={styles.addFieldButton}
        type="button"
        onClick={() => onChange([...items, { label: "", value: "", type: "text" }])}
      >
        <Plus size={13} /> 항목 추가
      </button>
    </div>
  );
}

export default function PortraitConsentPanel({
  clientId,
  workflowRunId,
  hospitalName,
  scopeToContext = false,
}: {
  clientId: string | null;
  workflowRunId: string | null;
  hospitalName: string;
  scopeToContext?: boolean;
}) {
  const [consents, setConsents] = useState<ConsentListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConsentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [signatures, setSignatures] = useState<PortraitConsentSignature[]>([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showEditorOnMobile, setShowEditorOnMobile] = useState(false);

  const [title, setTitle] = useState(hospitalName ? `${hospitalName} 초상권 동의서` : "초상권 동의서");
  const [introText, setIntroText] = useState(DEFAULT_INTRO_TEXT);
  const [detailFields, setDetailFields] = useState(() => cloneFields(DEFAULT_DETAIL_FIELDS));
  const [usageItems, setUsageItems] = useState(() => cloneFields(DEFAULT_USAGE_ITEMS));
  const [signatureLimit, setSignatureLimit] = useState(1);
  const [limitSaving, setLimitSaving] = useState(false);
  const [linkedClientId, setLinkedClientId] = useState<string | null>(clientId);
  const [linkedWorkflowRunId, setLinkedWorkflowRunId] = useState<string | null>(workflowRunId);
  const [linkedClientName, setLinkedClientName] = useState(hospitalName);
  const [linkedWorkflowRunName, setLinkedWorkflowRunName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const [shareBusy, setShareBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const detailDocRef = useRef<HTMLDivElement>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [dialogClientId, setDialogClientId] = useState<string | null>(null);
  const [dialogWorkflowRunId, setDialogWorkflowRunId] = useState<string | null>(null);
  const [dialogProjects, setDialogProjects] = useState<WorkflowRunOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");

  const signatureCount = detail?.signature_count ?? 0;
  const hasSignatures = signatureCount > 0;
  const isComplete = detail ? signatureCount >= detail.signature_limit : false;
  const selectedSignature = signatures.find((signature) => signature.id === selectedSignatureId) ?? signatures[0] ?? null;

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true);
    setListError("");
    try {
      const response = await fetch(buildPortraitConsentListHref({
        clientId,
        workflowRunId,
        scopeToContext,
      }));
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "동의서 목록을 불러오지 못했습니다.");
      setConsents(body.consents ?? []);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "동의서 목록을 불러오지 못했습니다.");
    } finally {
      if (!silent) setListLoading(false);
    }
  }, [clientId, scopeToContext, workflowRunId]);

  const loadConsent = useCallback(async (
    id: string,
    consent?: ConsentListItem,
    silent = false,
  ) => {
    if (silent) setRefreshing(true);
    else setDetailLoading(true);
    try {
      const [detailResponse, signaturesResponse] = await Promise.all([
        fetch(`/api/conti/portrait-consents/${id}`),
        fetch(`/api/conti/portrait-consents/${id}/signatures`),
      ]);
      const [detailBody, signaturesBody] = await Promise.all([
        detailResponse.json(),
        signaturesResponse.json(),
      ]);
      if (!detailResponse.ok || !detailBody.ok) {
        throw new Error(detailBody.error || "동의서를 불러오지 못했습니다.");
      }
      if (!signaturesResponse.ok || !signaturesBody.ok) {
        throw new Error(signaturesBody.error || "서명 목록을 불러오지 못했습니다.");
      }

      const nextDetail = detailBody.consent as ConsentDetail;
      const nextSignatures = (signaturesBody.signatures ?? []) as PortraitConsentSignature[];
      setDetail(nextDetail);
      setSignatures(nextSignatures);
      setSelectedSignatureId((current) => (
        current && nextSignatures.some((signature) => signature.id === current)
          ? current
          : nextSignatures[0]?.id ?? null
      ));
      setTitle(nextDetail.title);
      setIntroText(nextDetail.intro_text);
      setDetailFields(cloneFields(nextDetail.detail_fields?.length ? nextDetail.detail_fields : DEFAULT_DETAIL_FIELDS));
      setUsageItems(cloneFields(nextDetail.usage_items?.length ? nextDetail.usage_items : DEFAULT_USAGE_ITEMS));
      setSignatureLimit(nextDetail.signature_limit ?? 1);
      setLinkedClientId(nextDetail.client_id);
      setLinkedWorkflowRunId(nextDetail.workflow_run_id);
      if (consent) {
        setLinkedClientName(consent.client_name ?? "");
        setLinkedWorkflowRunName(consent.workflow_run_name ?? "");
      }
      if (!silent) setDirty(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "동의서를 불러오지 못했습니다.");
    } finally {
      if (silent) setRefreshing(false);
      else setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId && !dirty && hospitalName && title === "초상권 동의서") {
      setTitle(`${hospitalName} 초상권 동의서`);
      setLinkedClientName(hospitalName);
    }
  }, [dirty, hospitalName, selectedId, title]);

  const resetEditor = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setSignatures([]);
    setSelectedSignatureId(null);
    setTitle(hospitalName ? `${hospitalName} 초상권 동의서` : "초상권 동의서");
    setIntroText(DEFAULT_INTRO_TEXT);
    setDetailFields(cloneFields(DEFAULT_DETAIL_FIELDS));
    setUsageItems(cloneFields(DEFAULT_USAGE_ITEMS));
    setSignatureLimit(1);
    setLinkedClientId(clientId);
    setLinkedWorkflowRunId(workflowRunId);
    setLinkedClientName(hospitalName);
    setLinkedWorkflowRunName("");
    setDirty(false);
    setFormError("");
    setNotice("");
    setShareUrl("");
    setShareCopied(false);
  }, [clientId, hospitalName, workflowRunId]);

  const confirmDiscard = () => !dirty || window.confirm("저장하지 않은 작성 내용이 있습니다. 이동할까요?");

  const startNew = () => {
    if (!confirmDiscard()) return;
    resetEditor();
    setShowEditorOnMobile(true);
  };

  const openConsent = async (consent: ConsentListItem) => {
    if (consent.id === selectedId || !confirmDiscard()) return;
    setSelectedId(consent.id);
    setDetail(null);
    setSignatures([]);
    setSelectedSignatureId(null);
    setFormError("");
    setNotice("");
    setShareUrl("");
    setShowEditorOnMobile(true);
    await loadConsent(consent.id, consent);
  };

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadList(true),
      selectedId && !dirty ? loadConsent(selectedId, undefined, true) : Promise.resolve(),
    ]);
  }, [dirty, loadConsent, loadList, selectedId]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshAll();
    };
    const timer = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshAll]);

  const filteredConsents = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ko-KR");
    return consents.filter((consent) => {
      if (statusFilter !== "all" && consent.status !== statusFilter) return false;
      if (!normalizedSearch) return true;
      return [consent.title, consent.latest_signer_name, consent.client_name, consent.workflow_run_name]
        .some((value) => value?.toLocaleLowerCase("ko-KR").includes(normalizedSearch));
    });
  }, [consents, search, statusFilter]);

  const save = async () => {
    if (!title.trim()) {
      setFormError("제목을 입력해 주세요.");
      return;
    }
    if (hasSignatures) {
      setFormError("서명이 제출된 문서는 내용을 수정할 수 없습니다.");
      return;
    }
    setSaving(true);
    setFormError("");
    setNotice("");
    try {
      const payload = {
        clientId: linkedClientId,
        workflowRunId: linkedWorkflowRunId,
        title,
        introText,
        detailFields,
        usageItems,
        signatureLimit,
      };
      const response = selectedId
        ? await fetch(`/api/conti/portrait-consents/${selectedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/conti/portrait-consents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "동의서를 저장하지 못했습니다.");
      const saved = { ...body.consent, signature_count: body.consent.signature_count ?? 0 } as ConsentDetail;
      setSelectedId(saved.id);
      setDetail(saved);
      setDirty(false);
      setNotice("동의서를 저장했습니다.");
      await loadList();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "동의서를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const removeConsent = async () => {
    if (!selectedId || !window.confirm(hasSignatures ? "받은 서명까지 포함해 동의서를 삭제할까요?" : "이 동의서를 삭제할까요?")) return;
    setFormError("");
    try {
      const response = await fetch(`/api/conti/portrait-consents/${selectedId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "동의서를 삭제하지 못했습니다.");
      resetEditor();
      setShowEditorOnMobile(false);
      await loadList();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "동의서를 삭제하지 못했습니다.");
    }
  };

  const saveSignatureLimit = async () => {
    if (!selectedId || !detail || signatureLimit === detail.signature_limit || limitSaving) return;
    setLimitSaving(true);
    setFormError("");
    setNotice("");
    try {
      const response = await fetch(`/api/conti/portrait-consents/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureLimit }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "받을 인원을 저장하지 못했습니다.");
      const nextDetail = { ...body.consent, signature_count: body.consent.signature_count ?? signatureCount } as ConsentDetail;
      setDetail(nextDetail);
      setSignatureLimit(nextDetail.signature_limit);
      setNotice(`받을 인원을 ${nextDetail.signature_limit}명으로 저장했습니다.`);
      await loadList(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "받을 인원을 저장하지 못했습니다.");
    } finally {
      setLimitSaving(false);
    }
  };

  const generateLink = async () => {
    if (!selectedId || dirty) return;
    setShareBusy(true);
    setFormError("");
    setNotice("");
    setShareCopied(false);
    try {
      const response = await fetch(`/api/conti/portrait-consents/${selectedId}/share`, { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "서명 링크를 만들지 못했습니다.");
      const url = `${window.location.origin}/portrait-consent/${body.token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setNotice("서명 링크를 만들고 클립보드에 복사했습니다.");
      } catch {
        setNotice("서명 링크를 만들었습니다. 아래 주소를 직접 복사해 주세요.");
      }
      setDetail((current) => current ? { ...current, status: "sent" } : current);
      await loadList();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "서명 링크를 만들지 못했습니다.");
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setNotice("서명 링크를 복사했습니다.");
    } catch {
      setFormError("링크를 복사하지 못했습니다. 주소를 직접 선택해 복사해 주세요.");
    }
  };

  const downloadPdf = async () => {
    if (!detailDocRef.current || pdfBusy) return;
    setPdfBusy(true);
    setFormError("");
    try {
      const pdf = await generatePortraitConsentPdf(detailDocRef.current);
      const signer = selectedSignature?.provider_name?.trim();
      pdf.save(`${detail?.title || "초상권_동의서"}${signer ? `_${signer}` : ""}.pdf`);
    } catch {
      setFormError("PDF 생성에 실패했습니다.");
    } finally {
      setPdfBusy(false);
    }
  };

  const loadProjects = async (nextClientId: string) => {
    setProjectsLoading(true);
    setLinkError("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(nextClientId)}`);
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "촬영 건을 불러오지 못했습니다.");
      setDialogProjects(body.workflowRuns ?? []);
    } catch (error) {
      setDialogProjects([]);
      setLinkError(error instanceof Error ? error.message : "촬영 건을 불러오지 못했습니다.");
    } finally {
      setProjectsLoading(false);
    }
  };

  const openLinkDialog = async () => {
    setLinkDialogOpen(true);
    setLinkError("");
    setClientSearch("");
    setDialogClientId(linkedClientId);
    setDialogWorkflowRunId(linkedWorkflowRunId);
    if (linkedClientId) void loadProjects(linkedClientId);
    if (clients.length) return;
    setClientsLoading(true);
    try {
      const response = await fetch("/api/clients?scope=list");
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "고객 목록을 불러오지 못했습니다.");
      setClients((body.clients ?? []).map((client: { id: string; name?: string; hospital_name?: string }) => ({
        id: client.id,
        name: client.name || client.hospital_name || "이름 없는 고객",
      })));
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "고객 목록을 불러오지 못했습니다.");
    } finally {
      setClientsLoading(false);
    }
  };

  const chooseClient = (nextClient: ClientOption) => {
    setDialogClientId(nextClient.id);
    setDialogWorkflowRunId(null);
    setDialogProjects([]);
    void loadProjects(nextClient.id);
  };

  const confirmLink = async () => {
    const nextClient = clients.find((client) => client.id === dialogClientId) ?? null;
    const nextRun = dialogProjects.find((run) => run.id === dialogWorkflowRunId) ?? null;
    if (selectedId) {
      setLinkBusy(true);
      setLinkError("");
      try {
        const response = await fetch(`/api/conti/portrait-consents/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: dialogClientId, workflowRunId: dialogWorkflowRunId }),
        });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error || "고객 연결을 저장하지 못했습니다.");
        setDetail(body.consent);
        setNotice(dialogClientId ? "고객 연결을 저장했습니다." : "고객 연결을 해제했습니다.");
        await loadList();
      } catch (error) {
        setLinkError(error instanceof Error ? error.message : "고객 연결을 저장하지 못했습니다.");
        setLinkBusy(false);
        return;
      }
      setLinkBusy(false);
    } else {
      setDirty(true);
    }

    setLinkedClientId(dialogClientId);
    setLinkedWorkflowRunId(dialogClientId ? dialogWorkflowRunId : null);
    setLinkedClientName(nextClient?.name ?? "");
    setLinkedWorkflowRunName(nextRun ? workflowRunLabel(nextRun) : "");
    setLinkDialogOpen(false);
  };

  const visibleClients = useMemo(() => {
    const query = clientSearch.trim().toLocaleLowerCase("ko-KR");
    return query ? clients.filter((client) => client.name.toLocaleLowerCase("ko-KR").includes(query)) : clients;
  }, [clientSearch, clients]);

  const goBackToList = () => {
    if (!confirmDiscard()) return;
    setShowEditorOnMobile(false);
  };

  return (
    <section className={styles.workspace}>
      <header className={styles.appHeader}>
        <div className={styles.headingGroup}>
          <span className={styles.headingIcon}><FileSignature size={21} /></span>
          <div>
            <h1>초상권 동의서</h1>
            <p>현장에서 바로 작성하고 서명 링크를 모델에게 전달합니다.</p>
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={`${styles.listPane} ${showEditorOnMobile ? styles.mobileHidden : ""}`}>
          <button className={styles.newButton} type="button" onClick={startNew}>
            <Plus size={16} /> 새 동의서 작성
          </button>
          <div className={styles.searchWrap}>
            <Search size={15} />
            <input className={styles.searchInput} value={search} placeholder="제목·모델·고객 검색" onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className={styles.filterRow} aria-label="동의서 상태 필터">
            {([
              ["all", "전체"],
              ["draft", "초안"],
              ["sent", "전달됨"],
              ["signed", "서명 완료"],
            ] as Array<[StatusFilter, string]>).map(([value, label]) => (
              <button
                className={`${styles.statusFilter} ${statusFilter === value ? styles.statusFilterActive : ""}`}
                type="button"
                key={value}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {listLoading ? (
            <div className={styles.loadingState}><Loader2 className="spin-icon" size={18} /> 불러오는 중</div>
          ) : listError ? (
            <div className={styles.errorMessage}>{listError}</div>
          ) : filteredConsents.length === 0 ? (
            <div className={styles.emptyList}>조건에 맞는 동의서가 없습니다.<br />새 동의서를 바로 작성할 수 있습니다.</div>
          ) : (
            <div className={styles.list}>
              {filteredConsents.map((consent) => (
                <button
                  className={`${styles.listRow} ${selectedId === consent.id ? styles.listRowSelected : ""}`}
                  type="button"
                  key={consent.id}
                  onClick={() => void openConsent(consent)}
                >
                  <span className={styles.listTitleLine}>
                    <span className={styles.listTitle}>{consent.title}</span>
                    <span className={`${styles.statusBadge} ${STATUS_CLASS[consent.status]}`}>{STATUS_LABEL[consent.status]}</span>
                  </span>
                  <span className={styles.listPerson}>
                    <span>{consent.latest_signer_name ? `최근 서명 · ${consent.latest_signer_name}` : "아직 받은 서명이 없습니다."}</span>
                    <strong>서명 {consent.signature_count}/{consent.signature_limit}명</strong>
                  </span>
                  <span className={styles.listMetaLine}>
                    <span className={styles.listLink}>
                      {consent.client_name
                        ? `${consent.client_name}${consent.workflow_run_name ? ` · ${consent.workflow_run_name}` : ""}`
                        : "미연결"}
                    </span>
                    <span>{relativeTime(consent.updated_at || consent.created_at)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className={`${styles.detailPane} ${!showEditorOnMobile ? styles.mobileHidden : ""}`}>
          <header className={styles.detailHeader}>
            <div className={styles.headingGroup}>
              <button className={`${styles.iconButton} ${styles.mobileBack}`} type="button" onClick={goBackToList} aria-label="동의서 목록으로">
                <ArrowLeft size={16} />
              </button>
              <div className={styles.detailTitleGroup}>
                <h2>{selectedId ? (hasSignatures ? "받은 서명 확인" : "동의서 작성") : "새 동의서 작성"}</h2>
                <p>{hasSignatures ? "서명자를 선택해 원본을 확인하고 PDF로 받을 수 있습니다." : "내용을 저장한 뒤 서명 링크를 만들 수 있습니다."}</p>
              </div>
            </div>
            <div className={styles.headerActions}>
              <button
                className={styles.iconButton}
                type="button"
                aria-label="동의서 새로고침"
                title="새 서명 확인"
                disabled={refreshing}
                onClick={() => void refreshAll()}
              >
                <RefreshCw className={refreshing ? "spin-icon" : undefined} size={15} />
              </button>
              {detail?.status ? <span className={`${styles.statusBadge} ${STATUS_CLASS[detail.status]}`}>{STATUS_LABEL[detail.status]}</span> : null}
            </div>
          </header>

          <div className={styles.linkSummary}>
            <div className={styles.linkText}>
              <span className={styles.linkLabel}>연결된 고객 · 촬영 건</span>
              <span className={styles.linkValue}>
                {linkedClientName
                  ? `${linkedClientName}${linkedWorkflowRunName ? ` · ${linkedWorkflowRunName}` : " · 촬영 건 미선택"}`
                  : "미연결 — 고객 없이도 동의서를 만들 수 있습니다."}
              </span>
            </div>
            <button className={styles.secondaryButton} type="button" onClick={() => void openLinkDialog()}>
              <UserRoundCheck size={15} /> {linkedClientId ? "고객·촬영 건 변경" : "고객 연결하기"}
            </button>
          </div>

          <div className={styles.signatureProgress}>
            <div className={styles.progressCopy}>
              <span className={styles.linkLabel}>서명 진행</span>
              <strong>{signatureCount}/{signatureLimit}명</strong>
              <span>{isComplete ? "필요한 서명을 모두 받았습니다." : `${Math.max(0, signatureLimit - signatureCount)}명의 서명을 더 받을 수 있습니다.`}</span>
            </div>
            <div className={styles.limitControl}>
              <label htmlFor="portrait-signature-limit">받을 인원</label>
              <input
                id="portrait-signature-limit"
                className={styles.limitInput}
                type="number"
                min={Math.max(1, signatureCount)}
                max={100}
                value={signatureLimit}
                onChange={(event) => setSignatureLimit(Number(event.target.value))}
              />
              {selectedId && detail && signatureLimit !== detail.signature_limit ? (
                <button className={styles.secondaryButton} type="button" disabled={limitSaving} onClick={() => void saveSignatureLimit()}>
                  {limitSaving ? <Loader2 className="spin-icon" size={14} /> : <Check size={14} />} 인원 저장
                </button>
              ) : null}
            </div>
          </div>

          {detailLoading ? (
            <div className={styles.loadingState}><Loader2 className="spin-icon" size={18} /> 동의서를 불러오는 중</div>
          ) : hasSignatures && detail && selectedSignature ? (
            <div className={styles.formScroll}>
              <section className={styles.signerSection} aria-label="서명자 목록">
                <div className={styles.signerHeading}>
                  <div>
                    <h3>받은 서명</h3>
                    <p>서명자를 선택하면 아래 원본과 PDF가 함께 바뀝니다.</p>
                  </div>
                  <span>{signatures.length}명</span>
                </div>
                <div className={styles.signerList}>
                  {signatures.map((signature, index) => (
                    <button
                      className={`${styles.signerCard} ${selectedSignature.id === signature.id ? styles.signerCardSelected : ""}`}
                      type="button"
                      key={signature.id}
                      onClick={() => setSelectedSignatureId(signature.id)}
                    >
                      <span>{index + 1}</span>
                      <strong>{signature.provider_name || "이름 없음"}</strong>
                      <small>{signature.signed_date || relativeTime(signature.signed_at)}</small>
                    </button>
                  ))}
                </div>
              </section>
              <div className={styles.signedDocumentViewport}>
                <PortraitConsentSignedDocument ref={detailDocRef} consent={detail} signature={selectedSignature} />
              </div>
              {formError ? <div className={styles.errorMessage}>{formError}</div> : null}
              {notice ? <div className={styles.successMessage}>{notice}</div> : null}
            </div>
          ) : (
            <div className={styles.formScroll}>
              <section className={styles.formSection}>
                <div className={styles.fieldBlock}>
                  <label className={styles.fieldLabel} htmlFor="portrait-consent-title">제목</label>
                  <input id="portrait-consent-title" className={styles.textInput} value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} />
                </div>
                <div className={styles.fieldBlock}>
                  <label className={styles.fieldLabel} htmlFor="portrait-consent-intro">안내 문구</label>
                  <textarea id="portrait-consent-intro" className={styles.textArea} value={introText} onChange={(event) => { setIntroText(event.target.value); setDirty(true); }} />
                </div>
              </section>
              <section className={styles.formSection}>
                <h3>사진(영상)촬영 — 세부 내용</h3>
                <FieldListEditor items={detailFields} onChange={(next) => { setDetailFields(next); setDirty(true); }} />
              </section>
              <section className={styles.formSection}>
                <h3>영상/사진(이미지) 활용 목적</h3>
                <FieldListEditor items={usageItems} onChange={(next) => { setUsageItems(next); setDirty(true); }} />
              </section>
              {shareUrl ? (
                <div className={styles.shareBox}>
                  <strong>서명 링크</strong><br />{shareUrl}<br />
                  <button className={styles.weakButton} type="button" onClick={() => void copyShareUrl()} style={{ marginTop: 8 }}>
                    {shareCopied ? <Check size={14} /> : <Copy size={14} />} {shareCopied ? "복사됨" : "주소 복사"}
                  </button>
                </div>
              ) : null}
              {formError ? <div className={styles.errorMessage}>{formError}</div> : null}
              {notice ? <div className={styles.successMessage}>{notice}</div> : null}
            </div>
          )}

          <footer className={styles.actionBar}>
            <span className={styles.actionHint}>
              {hasSignatures
                ? isComplete
                  ? "필요한 서명을 모두 받았습니다. 선택한 서명자의 원본을 PDF로 받을 수 있습니다."
                  : "기존 링크를 다음 사람에게 그대로 전달하세요. 받은 서명 원본은 잠겨 있습니다."
                : dirty || !selectedId
                  ? "작성 내용을 저장하면 모델에게 전달할 서명 링크를 만들 수 있습니다."
                  : "저장된 내용으로 30일 동안 유효한 새 서명 링크를 만듭니다."}
            </span>
            <div className={styles.actionButtons}>
              {selectedId ? <button className={`${styles.weakButton} ${styles.dangerButton}`} type="button" onClick={() => void removeConsent()}><Trash2 size={14} /> 삭제</button> : null}
              {hasSignatures ? (
                <>
                <button className={styles.secondaryButton} type="button" disabled={pdfBusy} onClick={() => void downloadPdf()}>
                  {pdfBusy ? <Loader2 className="spin-icon" size={14} /> : <FileDown size={14} />} PDF 다운로드
                </button>
                {!isComplete ? (
                  <button className={styles.primaryButton} type="button" disabled={shareBusy} onClick={() => void generateLink()}>
                    {shareBusy ? <Loader2 className="spin-icon" size={15} /> : <Link2 size={15} />} 새 링크 만들기
                  </button>
                ) : null}
                </>
              ) : dirty || !selectedId ? (
                <button className={styles.primaryButton} type="button" disabled={saving} onClick={() => void save()}>
                  {saving ? <Loader2 className="spin-icon" size={15} /> : <Check size={15} />} {saving ? "저장 중" : "저장"}
                </button>
              ) : (
                <button className={styles.primaryButton} type="button" disabled={shareBusy} onClick={() => void generateLink()}>
                  {shareBusy ? <Loader2 className="spin-icon" size={15} /> : <Link2 size={15} />}
                  {detail?.status === "sent" ? "서명 링크 다시 만들기" : "서명 링크 만들기"}
                </button>
              )}
            </div>
          </footer>
        </section>
      </div>

      {linkDialogOpen ? (
        <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLinkDialogOpen(false); }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="portrait-link-title">
            <header className={styles.dialogHeader}>
              <h3 id="portrait-link-title">고객·촬영 건 연결</h3>
              <button className={styles.iconButton} type="button" aria-label="닫기" onClick={() => setLinkDialogOpen(false)}><X size={16} /></button>
            </header>
            <div className={styles.dialogBody}>
              <label className={styles.fieldLabel} htmlFor="portrait-client-search">1. 고객 선택</label>
              <div className={styles.searchWrap}>
                <Search size={15} />
                <input id="portrait-client-search" className={styles.searchInput} value={clientSearch} placeholder="고객 이름 검색" onChange={(event) => setClientSearch(event.target.value)} />
              </div>
              <div className={styles.clientList}>
                {clientsLoading ? (
                  <div className={styles.loadingState}>고객 목록을 불러오는 중</div>
                ) : visibleClients.length ? visibleClients.map((client) => (
                  <button className={`${styles.clientOption} ${dialogClientId === client.id ? styles.clientOptionSelected : ""}`} type="button" key={client.id} onClick={() => chooseClient(client)}>
                    {client.name}
                  </button>
                )) : <div className={styles.emptyList}>검색 결과가 없습니다.</div>}
              </div>

              <div className={styles.fieldBlock}>
                <label className={styles.fieldLabel} htmlFor="portrait-project-select">2. 촬영 건 선택 (선택 사항)</label>
                <select
                  id="portrait-project-select"
                  className={styles.selectInput}
                  value={dialogWorkflowRunId ?? ""}
                  disabled={!dialogClientId || projectsLoading}
                  onChange={(event) => setDialogWorkflowRunId(event.target.value || null)}
                >
                  <option value="">촬영 건을 연결하지 않음</option>
                  {dialogProjects.map((run) => <option value={run.id} key={run.id}>{workflowRunLabel(run)}</option>)}
                </select>
              </div>
              {linkError ? <div className={styles.errorMessage}>{linkError}</div> : null}
            </div>
            <footer className={styles.dialogActions}>
              <button className={`${styles.weakButton} ${styles.dangerButton}`} type="button" onClick={() => { setDialogClientId(null); setDialogWorkflowRunId(null); setDialogProjects([]); }}>연결 해제</button>
              <button className={styles.primaryButton} type="button" disabled={linkBusy} onClick={() => void confirmLink()}>
                {linkBusy ? <Loader2 className="spin-icon" size={15} /> : <Check size={15} />} 연결 저장
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
