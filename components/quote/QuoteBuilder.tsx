"use client";

import type { ReactElement, ReactNode } from "react";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import GlobalHeader from "@/components/GlobalHeader";
import WorkspaceActionBar from "@/components/WorkspaceActionBar";
import ActiveMissionBar from "@/components/dashboard/ActiveMissionBar";
import { createMailingDraft } from "@/lib/mailingQueue";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";
import { uploadWorkflowArtifact } from "@/lib/workflowArtifacts";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useDesktopWindowMode } from "@/lib/desktopWindowContext";
import { useQuoteStore } from "@/lib/store/useQuoteStore";
import type { Brand, BenefitItem, CustomItem, CustomerInfo } from "@/lib/quote/quoteFormTypes";
import { packages, singleItems, BRAND_CONFIG, type SingleItem } from "@/lib/quote/quoteCatalog";
import { computeQuoteTotals } from "@/lib/quote/computeQuoteTotals";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Maximize2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Quote,
  Receipt,
  RefreshCcw,
  Save,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
  X,
  ZoomIn,
  ZoomOut,
  FileText
} from "lucide-react";

type ContractQuoteItem = {
  id?: string;
  name: string;
  detail: string;
  unitPrice: number;
  qty: number;
  subtotal: number;
  note: string;
};

type ContractQuoteData = {
  id: string;
  savedAt: string;
  title: string;
  hospitalName: string;
  contactName: string;
  phone: string;
  email: string;
  quoteNumber: string;
  quoteDate: string;
  shootDate: string | null;
  validUntil: string;
  items: ContractQuoteItem[];
  supplyAmount: number;
  discountAmount: number;
  vat: number;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  depositRate: number;
  memos: string | null;
  status?: string;
  portalUrl?: string;
  // 저장 충돌(soft-warn) 감지용 — DB row의 updated_at을 그대로 들고 있다가 다음 저장 때
  // lastKnownUpdatedAt으로 함께 보낸다(Phase 5). 사람이 새로 입력 중인 값이 아니라 서버가
  // 마지막으로 알려준 시각일 뿐이라 폼 계산에는 전혀 쓰이지 않는다.
  updatedAt?: string;
  formState?: {
    customer: CustomerInfo;
    quoteTitle: string;
    selectedPackageId: string | null;
    selectedSingleItemIds: string[];
    singleItemAmounts?: Record<string, number>;
    profileCount: number;
    stagedCount: number;
    combinedProfileStagedCount?: number;
    floorCount: number;
    largeHospital: boolean;
    droneCount: number;
    customItems: CustomItem[];
    benefitItems: BenefitItem[];
    discountRate: number;
    extraDiscount: number;
    memo: string;
    depositRate: number;
    brand?: Brand;
    agentOverrideItems?: boolean;
  };
};

type ImportedPdfQuote = {
  hospitalName: string;
  quoteNumber: string;
  quoteDate: string;
  totalAmount: number;
  rawText: string;
};

const discountRates = [0, 10, 15, 20];

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayValue = () => toDateInputValue(new Date());

const addDays = (date: string, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return toDateInputValue(next);
};

const createQuoteNumber = (sequence = 1, prefix = "PC-") => {
  const date = todayValue().replaceAll("-", "");
  return `${prefix}${date}-${String(sequence).padStart(3, "0")}`;
};

const initialCustomer = (): CustomerInfo => {
  const quoteDate = todayValue();

  return {
    hospitalName: "",
    managerName: "",
    phone: "",
    email: "",
    quoteDate,
    validUntil: addDays(quoteDate, 14),
    shootDate: "",
    quoteNumber: createQuoteNumber()
  };
};

const won = (value: number) =>
  `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value)}원`;

const amount = (value: number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);

const numberValue = (value: string) => {
  const digitsOnly = value.replace(/[^0-9]/g, "");
  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) ? parsed : 0;
};

const displayDate = (date: string) => date || "-";

const RECENT_QUOTES_DISPLAY_LIMIT = 10;

const rowToContractQuoteData = (row: Record<string, any>): ContractQuoteData => ({
  id: row.id,
  savedAt: row.created_at ?? new Date().toISOString(),
  title: row.title ?? "",
  hospitalName: row.hospital_name ?? "",
  contactName: row.contact_name ?? "",
  phone: row.phone ?? "",
  email: row.email ?? "",
  quoteNumber: row.quote_number ?? "",
  quoteDate: row.quote_date ?? "",
  shootDate: row.shoot_date ?? null,
  validUntil: row.valid_until ?? "",
  items: row.items ?? [],
  supplyAmount: row.supply_amount ?? 0,
  discountAmount: row.discount_amount ?? 0,
  vat: row.vat ?? 0,
  totalAmount: row.total_amount ?? 0,
  depositAmount: row.deposit_amount ?? 0,
  balanceAmount: row.balance_amount ?? 0,
  depositRate: row.deposit_rate ?? 50,
  memos: row.memos ?? null,
  status: row.status ?? "draft",
  formState: row.form_state ?? undefined,
  updatedAt: row.updated_at ?? undefined,
});

const uniqueQuoteItems = (items: string[]) => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const parseQuotePdfText = (text: string): ImportedPdfQuote => {
  const normalized = text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
  const compact = normalized.replace(/\s+/g, " ");
  const quoteNumber = compact.match(/PC-\d{8}-\d{3}/)?.[0] || createQuoteNumber();
  const quoteDate = compact.match(/\d{4}-\d{2}-\d{2}/)?.[0] || todayValue();
  const amounts = Array.from(compact.matchAll(/([\d,]{4,})\s*원?/g))
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0);
  const totalAmount = amounts.length ? Math.max(...amounts) : 0;
  const hospitalName =
    normalized.match(/TO\.\s*([^\n]+)/i)?.[1]?.trim() ||
    normalized.match(/(?:병원명|수신|고객명)\s*[:：]?\s*([^\n]+)/)?.[1]?.trim() ||
    normalized.match(/([가-힣A-Za-z0-9\s]{2,}(?:병원|의원|클리닉|치과|한의원))/)?.[1]?.trim() ||
    "";

  return {
    hospitalName,
    quoteNumber,
    quoteDate,
    totalAmount,
    rawText: normalized
  };
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// html2canvas가 CSS filter를 지원하지 못해, PDF 캡처 직전에 로고 이미지를
// 직접 색상 반전(흰색화)한 data URL로 바꿔치기하기 위한 헬퍼.
const invertImageColors = (src: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas context 생성 실패")); return; }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("로고 이미지 로드 실패"));
    img.src = src;
  });

// Olivia Agent 2.0 — DynamicWorkspace가 견적서를 채팅 아래에 열어둔 상태에서, 채팅으로
// "프로필 촬영 50만원으로 바꿔줘" 같은 편집 명령을 받아 이 견적서에 바로 반영하기 위한
// 명령형 핸들. ref를 안 넘기면(기존 모든 사용처: /quote, /photoclinic, 고객관리 WorkspaceModal)
// 완전히 기존과 동일하게 동작한다 — 순수 추가라 기존 동작을 바꾸지 않는다.
export type QuoteBuilderHandle = {
  getSnapshot: () => {
    singleItems: { id: string; name: string; price: number; selected: boolean; amount: number }[];
    customItems: { id: string; name: string; detail: string; amount: number }[];
    totalAmount: number;
    depositRate: number;
  };
  setSingleItemSelected: (id: string, selected: boolean) => void;
  setSingleItemAmount: (id: string, amount: number) => void;
  addCustomItem: (name: string, amount: number, detail?: string) => void;
  removeCustomItem: (id: string) => void;
  setDepositRate: (rate: number) => void;
};

type QuoteBuilderProps = {
  mode?: "page" | "modal";
  clientId?: string;
  workflowRunId?: string;
  resourceId?: string;
  startInPreview?: boolean;
  onClose?: () => void;
  onPublished?: () => void;
  registerRequestClose?: (fn: () => void) => void;
};

// mode="page"(기본값)면 /photoclinic, /quote 라우트에서 그대로 쓰던 것과 100% 동일하게 동작한다.
// mode="modal"이면 고객관리의 Workspace Modal 안에서 clientId 프리필/자동저장/닫기확인/발행콜백이
// 추가로 개입한다. Next.js page.tsx의 default export는 PageProps 타입 제약을 받기 때문에
// 이 컴포넌트는 일반 컴포넌트 파일로 두고, app/photoclinic/page.tsx·app/quote/page.tsx는
// 이걸 mode="page"로 감싸는 얇은 래퍼로만 존재한다.
const QuoteBuilder = forwardRef<QuoteBuilderHandle, QuoteBuilderProps>(function QuoteBuilder({
  mode = "page",
  clientId,
  workflowRunId,
  resourceId,
  startInPreview,
  onClose,
  onPublished,
  registerRequestClose,
}, ref) {
  const isModal = mode === "modal";
  // mode="modal"은 OLIVIA OS 창(QuoteBuilderWindowContent)과, 그보다 먼저부터 있던 채팅
  // 분할뷰 모달 두 군데서 같이 쓴다 — useDesktopWindowMode()는 OS 창 쪽만 Provider로
  // true를 내려주므로(ClientsWindowContent.tsx와 같은 패턴), 이걸로 구분해야 기존 채팅
  // 분할뷰 모달의 레이아웃(상단 상태바 + 인라인 액션 바)이 그대로 유지된다.
  const isDesktopWindowMode = useDesktopWindowMode();
  const isDesktopWindow = isModal && isDesktopWindowMode;
  const setOliviaWorkspace = useOliviaContextStore((state) => state.setWorkspace);
  const setOliviaClient = useOliviaContextStore((state) => state.setClient);
  const setOliviaProject = useOliviaContextStore((state) => state.setProject);
  const setOliviaSelection = useOliviaContextStore((state) => state.setSelection);
  const selectedOliviaEntityId = useOliviaContextStore((state) => state.selectedEntityId);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewShellRef = useRef<HTMLDivElement>(null);
  const quotePdfInputRef = useRef<HTMLInputElement>(null);
  // Agent가 채팅에서 건드려야 하는 필드는 QuoteBuilder만의 로컬 useState가 아니라 공유
  // useQuoteStore(Zustand)에 둔다 — Olivia Agent(actionRouter.ts)가 같은 store를 patch하면
  // Form도 Preview도 즉시 같은 값을 본다(Phase 3). 변수명은 기존 useState 시절과 동일하게
  // 유지해 아래 JSX/핸들러는 전혀 손대지 않는다.
  const customer = useQuoteStore((state) => state.customer);
  const setCustomer = useQuoteStore((state) => state.setCustomer);
  const brand = useQuoteStore((state) => state.brand);
  const setBrand = useQuoteStore((state) => state.setBrand);
  const cfg = BRAND_CONFIG[brand];
  const quoteTitle = useQuoteStore((state) => state.quoteTitle);
  const setQuoteTitle = useQuoteStore((state) => state.setQuoteTitle);
  const selectedPackageId = useQuoteStore((state) => state.selectedPackageId);
  const setSelectedPackageId = useQuoteStore((state) => state.setSelectedPackageId);
  const selectedSingleItemIds = useQuoteStore((state) => state.selectedSingleItemIds);
  const setSelectedSingleItemIds = useQuoteStore((state) => state.setSelectedSingleItemIds);
  const singleItemAmounts = useQuoteStore((state) => state.singleItemAmounts);
  const setSingleItemAmounts = useQuoteStore((state) => state.setSingleItemAmounts);
  const profileCount = useQuoteStore((state) => state.profileCount);
  const setProfileCount = useQuoteStore((state) => state.setProfileCount);
  const stagedCount = useQuoteStore((state) => state.stagedCount);
  const setStagedCount = useQuoteStore((state) => state.setStagedCount);
  const combinedProfileStagedCount = useQuoteStore((state) => state.combinedProfileStagedCount);
  const setCombinedProfileStagedCount = useQuoteStore((state) => state.setCombinedProfileStagedCount);
  const floorCount = useQuoteStore((state) => state.floorCount);
  const setFloorCount = useQuoteStore((state) => state.setFloorCount);
  const largeHospital = useQuoteStore((state) => state.largeHospital);
  const setLargeHospital = useQuoteStore((state) => state.setLargeHospital);
  const droneCount = useQuoteStore((state) => state.droneCount);
  const setDroneCount = useQuoteStore((state) => state.setDroneCount);
  const customItems = useQuoteStore((state) => state.customItems);
  const setCustomItems = useQuoteStore((state) => state.setCustomItems);
  const benefitItems = useQuoteStore((state) => state.benefitItems);
  const setBenefitItems = useQuoteStore((state) => state.setBenefitItems);
  const discountRate = useQuoteStore((state) => state.discountRate);
  const setDiscountRate = useQuoteStore((state) => state.setDiscountRate);
  const extraDiscount = useQuoteStore((state) => state.extraDiscount);
  const setExtraDiscount = useQuoteStore((state) => state.setExtraDiscount);
  const memo = useQuoteStore((state) => state.memo);
  const setMemo = useQuoteStore((state) => state.setMemo);
  const depositRate = useQuoteStore((state) => state.depositRate);
  const setDepositRate = useQuoteStore((state) => state.setDepositRate);
  const dirtyFields = useQuoteStore((state) => state.dirtyFields);
  const setOliviaCurrentDocumentTotal = useOliviaContextStore((state) => state.setCurrentDocumentTotal);
  const setOliviaCurrentDocument = useOliviaContextStore((state) => state.setCurrentDocument);
  const setOliviaPageContext = useOliviaContextStore((state) => state.setPageContext);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImportingQuotePdf, setIsImportingQuotePdf] = useState(false);
  const [pdfImportMessage, setPdfImportMessage] = useState("");
  const [manualPdfQuote, setManualPdfQuote] = useState<ImportedPdfQuote | null>(null);
  const [recentQuoteMessage, setRecentQuoteMessage] = useState("");
  // 페이지 모드(/photoclinic)에서 "불러오기"로 연 견적서의 id — 채팅이 지금 이 견적서를
  // 찾아 수정할 수 있게(activeResourceId) 하고, 수정 후 실시간 반영에도 쓴다.
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null);
  const [currentQuoteStatus, setCurrentQuoteStatus] = useState("draft");
  const [basePreviewScale, setBasePreviewScale] = useState(0.48);
  const [previewZoom, setPreviewZoom] = useState(1);
  // startInPreview는 채팅에서 "미리보기 보여줘"(preview_quote)로 이 워크스페이스가 방금 새로
  // 열렸을 때만 의미가 있다 — lazy initializer라 마운트 시 한 번만 반영되고, 이미 마운트된
  // 상태에서 이 prop이 나중에 바뀌어도(같은 리소스를 다시 미리보기) 재적용되지 않는다. 그
  // "이미 열려 있는" 경우는 olivia-quote-preview 이벤트 리스너가 대신 처리한다(아래 useEffect).
  const [showFullscreenPreview, setShowFullscreenPreview] = useState(() => !!startInPreview);
  const quoteDocumentId = resourceId || currentQuoteId || undefined;

  useEffect(() => {
    setOliviaCurrentDocument(quoteDocumentId, "quote", quoteTitle || customer.hospitalName || "견적서");
    setOliviaPageContext({
      pageMode: quoteDocumentId ? "edit" : "create",
      capabilities: ["quote.edit", "quote.discount", "quote.add_item", "quote.publish", "contract.create"],
      documentStatus: currentQuoteStatus,
      brand,
      canEdit: currentQuoteStatus !== "archived",
      canFinalize: currentQuoteStatus !== "published" && currentQuoteStatus !== "archived",
    });
  }, [brand, currentQuoteStatus, customer.hospitalName, quoteDocumentId, quoteTitle, setOliviaCurrentDocument, setOliviaPageContext]);

  useEffect(() => {
    const current = useOliviaContextStore.getState();
    if (current.activeWorkspace !== "quote" || current.activeResourceId !== quoteDocumentId) setOliviaWorkspace("quote", quoteDocumentId);
    return () => {
      const current = useOliviaContextStore.getState();
      if (current.activeWorkspace === "quote" && current.activeResourceId === quoteDocumentId) current.setWorkspace(undefined, undefined);
    };
  }, [quoteDocumentId, setOliviaWorkspace]);

  useEffect(() => {
    setOliviaWorkspace("quote", resourceId);
    if (workflowRunId) setOliviaProject(workflowRunId);
    return () => {
      const current = useOliviaContextStore.getState();
      if (current.activeWorkspace === "quote" && current.activeResourceId === resourceId) {
        current.setWorkspace(undefined, undefined);
      }
    };
  }, [resourceId, setOliviaProject, setOliviaWorkspace, workflowRunId]);
  const [fullscreenPreviewScale, setFullscreenPreviewScale] = useState(1);
  const [recentQuotes, setRecentQuotes] = useState<ContractQuoteData[]>([]);
  const [publishingQuoteId, setPublishingQuoteId] = useState<string | null>(null);
  const [todayQuoteNumbers, setTodayQuoteNumbers] = useState<string[]>([]);
  const previewScale = Number((basePreviewScale * previewZoom).toFixed(3));
  const previewPercent = Math.round(previewZoom * 100);

  // Workspace Modal 모드 전용 — dirty 추적/자동저장/닫기 확인 (mode="page"일 땐 전부 미사용).
  const lastSavedFormStateRef = useRef<string>("");
  // 서버가 마지막으로 알려준 이 견적의 updated_at — 저장할 때 함께 보내 다른 곳(Agent 또는
  // 다른 탭)이 그 사이 먼저 저장했는지 서버가 감지하게 한다(soft-warn, Phase 5). 폼 계산에는
  // 쓰이지 않으므로 store가 아니라 ref로 둔다.
  const lastKnownUpdatedAtRef = useRef<string | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  useEffect(() => {
    const date = todayValue().replaceAll("-", "");
    const defaultQuoteNumber = createQuoteNumber();
    Promise.all([
      fetch(`/api/quotes?limit=${RECENT_QUOTES_DISPLAY_LIMIT}`).then((res) => res.json()),
      fetch(`/api/quotes?prefix=${encodeURIComponent(`PC-${date}-`)}`).then((res) => res.json()),
      fetch(`/api/quotes?prefix=${encodeURIComponent(`JI-${date}-`)}`).then((res) => res.json()),
    ])
      .then(([recentRes, todayPcRes, todayJiRes]) => {
        if (recentRes?.ok) setRecentQuotes((recentRes.quotes ?? []).map(rowToContractQuoteData));
        const pcNumbers = todayPcRes?.ok ? todayPcRes.quoteNumbers ?? [] : [];
        const jiNumbers = todayJiRes?.ok ? todayJiRes.quoteNumbers ?? [] : [];
        const allTodayNumbers = [...pcNumbers, ...jiNumbers];
        setTodayQuoteNumbers(allTodayNumbers);

        // 마운트 시 quoteNumber는 항상 순번 "-001"로 초기화되는데, 오늘 이미 그 번호로 저장된
        // 견적이 있으면(다른 고객 세션 등) 저장/자동저장이 번호 충돌로 그 견적을 덮어써 다른
        // 고객에게 재할당해버린다. 사용자가 번호를 아직 직접 건드리지 않았을 때만 보정한다.
        if (allTodayNumbers.includes(defaultQuoteNumber)) {
          const prefix = `${cfg.quoteNumberPrefix}${date}-`;
          const usedNumbers = allTodayNumbers
            .filter((num) => num.startsWith(prefix))
            .map((num) => Number(num.replace(prefix, "")))
            .filter((value) => Number.isFinite(value));
          const nextSequence = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;
          const safeNumber = createQuoteNumber(nextSequence, cfg.quoteNumberPrefix);
          setCustomer((prev) => (prev.quoteNumber === defaultQuoteNumber ? { ...prev, quoteNumber: safeNumber } : prev));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const shell = previewShellRef.current;
    if (!shell) return;

    const updateScale = () => {
      const style = window.getComputedStyle(shell);
      const paddingX =
        Number.parseFloat(style.paddingLeft || "0") + Number.parseFloat(style.paddingRight || "0");
      const borderX =
        Number.parseFloat(style.borderLeftWidth || "0") + Number.parseFloat(style.borderRightWidth || "0");
      const shellWidth = shell.getBoundingClientRect().width;
      const availableWidth = Math.max(0, shellWidth - paddingX - borderX - 2);
      // OLIVIA OS 1차 작업 지시서 3단계 — 창이 넓어질수록 실제 사이즈(scale=1, 1123px)까지
      // 계속 커지던 걸 0.7로 막는다. .preview-shell이 이미 place-items:center라 남는 폭은
      // 자동으로 가운데 정렬 여백이 된다(전체화면 미리보기의 updateFullscreenScale은 별개 —
      // 거기는 의도적으로 화면을 최대한 채워야 해서 그대로 둔다).
      const nextScale = Math.min(0.7, Math.max(0.12, availableWidth / 1123));
      setBasePreviewScale(Number(nextScale.toFixed(3)));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(shell);
    window.addEventListener("resize", updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
    // 전체화면 전환 시 previewShellRef가 portal로 다른 DOM 위치로 이동하면서
    // React가 이 서브트리를 새로 마운트할 수 있어, 그때마다 다시 구독해야 한다.
  }, [showFullscreenPreview]);

  useEffect(() => {
    if (!showFullscreenPreview) return;

    const updateFullscreenScale = () => {
      const pad = 64;
      const availableWidth = Math.max(0, window.innerWidth - pad * 2);
      const availableHeight = Math.max(0, window.innerHeight - pad * 2);
      const nextScale = Math.max(0.2, Math.min(availableWidth / 1123, availableHeight / 794));
      setFullscreenPreviewScale(Number(nextScale.toFixed(3)));
    };
    updateFullscreenScale();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowFullscreenPreview(false);
    };

    window.addEventListener("resize", updateFullscreenScale);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updateFullscreenScale);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showFullscreenPreview]);

  const getPreviewZoomMax = () => {
    if (typeof window === "undefined") return 1.8;
    return window.matchMedia("(max-width: 768px)").matches ? 1.35 : 1.8;
  };

  const keepZoomControlsReachable = () => {
    window.requestAnimationFrame(() => {
      const shell = previewShellRef.current;
      if (!shell) return;

      // 모바일에서 확대 후 가로 스크롤 때문에 전체 페이지가 밀리지 않도록
      // 미리보기 내부 스크롤만 중앙 기준으로 정리합니다.
      const maxScrollLeft = Math.max(0, shell.scrollWidth - shell.clientWidth);
      shell.scrollLeft = Math.min(shell.scrollLeft, maxScrollLeft);
    });
  };

  const zoomOutPreview = () => {
    setPreviewZoom((value) => Math.max(0.7, Number((value - 0.1).toFixed(1))));
    keepZoomControlsReachable();
  };

  const zoomInPreview = () => {
    setPreviewZoom((value) => Math.min(getPreviewZoomMax(), Number((value + 0.1).toFixed(1))));
    keepZoomControlsReachable();
  };

  const resetPreviewZoom = () => {
    setPreviewZoom(1);
    window.requestAnimationFrame(() => {
      if (previewShellRef.current) previewShellRef.current.scrollLeft = 0;
    });
  };

  const createNextQuoteNumber = () => {
    const date = todayValue().replaceAll("-", "");
    const todayPrefix = `${cfg.quoteNumberPrefix}${date}-`;
    const usedNumbers = todayQuoteNumbers
      .filter((quoteNumber) => quoteNumber.startsWith(todayPrefix))
      .map((quoteNumber) => Number(quoteNumber.replace(todayPrefix, "")))
      .filter((value) => Number.isFinite(value));
    const nextSequence = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;

    return createQuoteNumber(nextSequence, cfg.quoteNumberPrefix);
  };

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedPackageId) ?? null,
    [selectedPackageId]
  );

  const selectedSingleItems = useMemo(
    () => singleItems.filter((item) => selectedSingleItemIds.includes(item.id)),
    [selectedSingleItemIds]
  );

  const singleItemPrice = (item: SingleItem) =>
    brand === "jakeimage" ? (singleItemAmounts[item.id] || 0) : item.price;

  const updateSingleItemAmount = (id: string, value: string) => {
    setSingleItemAmounts((current) => ({ ...current, [id]: numberValue(value) }));
  };

  const optionItems = useMemo(() => {
    const items = [
      {
        name: "프로필 인원 추가",
        detail: `${profileCount}인`,
        amount: profileCount * 250000,
        visible: profileCount > 0
      },
      {
        name: "연출 인원 추가",
        detail: `${stagedCount}인`,
        amount: stagedCount * 450000,
        visible: stagedCount > 0
      },
      {
        name: "프로필/연출 추가",
        detail: `${combinedProfileStagedCount}인`,
        amount: combinedProfileStagedCount * 650000,
        visible: combinedProfileStagedCount > 0
      },
      {
        name: "인테리어 층수 추가",
        detail: `${floorCount}층`,
        amount: floorCount * 250000,
        visible: floorCount > 0
      },
      {
        name: cfg.largeScaleLabel,
        detail: "적용",
        amount: 750000,
        visible: largeHospital
      },
      {
        name: "드론촬영",
        detail: `${droneCount}회`,
        amount: droneCount * 500000,
        visible: droneCount > 0
      }
    ];

    return items.filter((item) => item.visible);
  }, [cfg.largeScaleLabel, combinedProfileStagedCount, droneCount, floorCount, largeHospital, profileCount, stagedCount]);

  const packageTotal = selectedPackage?.price ?? 0;
  const singleItemsTotal = selectedSingleItems.reduce((sum, item) => sum + singleItemPrice(item), 0);
  const optionsTotal = optionItems.reduce((sum, item) => sum + item.amount, 0);
  const visibleCustomItems = customItems.filter((item) => item.name || item.detail || item.amount > 0);
  const visibleBenefitItems = benefitItems.filter((item) => item.name);
  // 실제 합계 계산은 lib/quote/computeQuoteTotals.ts로 옮겼다(코드만 이동, 로직 동일) — 채팅
  // Quote Preview Card도 같은 함수를 써서 이 화면과 절대 다른 숫자를 보여줄 수 없게 한다.
  const {
    discountableSubtotal,
    contentSubtotal,
    rateDiscountAmount,
    extraDiscountAmount,
    discountTotal,
    supplyAmount,
    vat,
    finalAmount,
  } = computeQuoteTotals({ packageTotal, singleItemsTotal, optionsTotal, customItems, discountRate, extraDiscount });

  // Agent가 총액을 스스로 계산해서 말하지 않고 지금 화면의 실제 값을 그대로 전달하게 한다
  // (PHASE 2 스펙 §21, §40) — 편집할 때마다(dirtyFields도 함께) 최신 값으로 갱신한다.
  useEffect(() => {
    setOliviaCurrentDocumentTotal(finalAmount, dirtyFields.size > 0);
  }, [finalAmount, dirtyFields, setOliviaCurrentDocumentTotal]);

  const updateCustomer = (key: keyof CustomerInfo, value: string) => {
    setCustomer((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSingleItem = (id: string) => {
    setSelectedSingleItemIds((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id]
    );
  };

  const addCustomItem = () => {
    setCustomItems((items) => [
      ...items,
      { id: crypto.randomUUID(), name: "", detail: "", amount: 0, discountable: true }
    ]);
  };

  const addBenefitItem = () => {
    setBenefitItems((items) => [
      ...items,
      { id: crypto.randomUUID(), name: "" }
    ]);
  };

  const updateCustomItem = (
    id: string,
    key: keyof CustomItem,
    value: string | number | boolean
  ) => {
    setCustomItems((items) =>
      items.map((item) => (item.id === id ? { ...item, [key]: value } : item))
    );
  };

  const removeCustomItem = (id: string) => {
    setCustomItems((items) => items.filter((item) => item.id !== id));
  };

  const moveCustomItem = (id: string, direction: "up" | "down") => {
    setCustomItems((items) => {
      const index = items.findIndex((item) => item.id === id);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index === -1 || targetIndex < 0 || targetIndex >= items.length) return items;
      const next = [...items];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const updateBenefitItem = (id: string, value: string) => {
    setBenefitItems((items) =>
      items.map((item) => (item.id === id ? { ...item, name: value } : item))
    );
  };

  const removeBenefitItem = (id: string) => {
    setBenefitItems((items) => items.filter((item) => item.id !== id));
  };

  const toggleBrand = () => {
    const nextBrand: Brand = brand === "photoclinic" ? "jakeimage" : "photoclinic";
    const fromCfg = BRAND_CONFIG[brand];
    const toCfg = BRAND_CONFIG[nextBrand];
    setQuoteTitle((currentTitle) =>
      currentTitle === fromCfg.defaultQuoteTitle ? toCfg.defaultQuoteTitle : currentTitle
    );
    setMemo((currentMemo) => (currentMemo === fromCfg.defaultMemo ? toCfg.defaultMemo : currentMemo));
    setCustomer((current) => ({
      ...current,
      quoteNumber: current.quoteNumber.startsWith(fromCfg.quoteNumberPrefix)
        ? toCfg.quoteNumberPrefix + current.quoteNumber.slice(fromCfg.quoteNumberPrefix.length)
        : current.quoteNumber
    }));
    if (nextBrand === "jakeimage") {
      // 제이크이미지연구소 견적서에는 패키지/추가옵션 UI가 없으므로
      // 숨겨진 값이 계산에 몰래 남지 않도록 초기화한다.
      setSelectedPackageId(null);
      setProfileCount(0);
      setStagedCount(0);
      setCombinedProfileStagedCount(0);
      setFloorCount(0);
      setLargeHospital(false);
      setDroneCount(0);
    }
    setBrand(nextBrand);
  };

  const resetForm = () => {
    setCustomer({
      ...initialCustomer(),
      quoteNumber: createNextQuoteNumber()
    });
    setQuoteTitle(cfg.defaultQuoteTitle);
    setSelectedPackageId(brand === "jakeimage" ? null : packages[0].id);
    setSelectedSingleItemIds([]);
    setSingleItemAmounts({});
    setProfileCount(0);
    setStagedCount(0);
    setCombinedProfileStagedCount(0);
    setFloorCount(0);
    setLargeHospital(false);
    setDroneCount(0);
    setCustomItems([]);
    setBenefitItems([]);
    setDiscountRate(0);
    setExtraDiscount(0);
    setMemo(cfg.defaultMemo);
    // 위 setter들은 사람이 직접 입력할 때 쓰는 것과 같은 함수라 각 필드를 dirty로 표시했다 —
    // 여기는 "새 기준선을 세우는 것"이지 편집이 아니므로 끝에서 지운다(Phase 3, patchFromAgent
    // 가드가 여기서 잘못 dirty로 남은 필드를 영구히 못 건드리게 되는 걸 막는다).
    useQuoteStore.getState().clearDirty();
  };

  // useQuoteStore는 모듈 전역 싱글턴이라, useState였을 때와 달리 컴포넌트를 다시 마운트해도
  // (모달을 닫았다가 다른 고객으로 다시 열 때 등) 이전 값이 저절로 사라지지 않는다. 마운트마다
  // 항상 빈 폼에서 시작하도록 resetForm()을 명시적으로 호출한다 — resourceId/clientId 프리필은
  // 바로 아래(모달 전용) useEffect가 뒤이어 덮어쓴다. useLayoutEffect라 브라우저가 그리기 전에
  // 끝나 이전 견적의 값이 한 프레임이라도 보이는 깜빡임이 없다.
  useLayoutEffect(() => {
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildContractQuoteData = (): ContractQuoteData => {
    const visibleItems: ContractQuoteItem[] = [
      ...(selectedPackage && selectedPackage.price > 0 ? [{
        id: `package:${selectedPackage.id}`,
        name: `${selectedPackage.name} 패키지`,
        detail: selectedPackage.composition,
        unitPrice: selectedPackage.price,
        qty: 1,
        subtotal: selectedPackage.price,
        note: "촬영 패키지"
      }] : []),
      ...selectedSingleItems.map((item) => ({
        id: item.id,
        name: item.name,
        detail: "단일 촬영 항목",
        unitPrice: singleItemPrice(item),
        qty: 1,
        subtotal: singleItemPrice(item),
        note: "단일항목"
      })),
      ...optionItems.map((item) => ({
        id: item.name === "프로필 인원 추가" ? "profile_shoot" : item.name === "연출 인원 추가" ? "staged_shoot" : item.name === "프로필/연출 추가" ? "combined_profile_staged" : item.name === "인테리어 층수 추가" ? "floor_shoot" : item.name === "드론촬영" ? "drone_shoot" : `option:${item.name}`,
        name: item.name,
        detail: item.detail,
        unitPrice: item.amount,
        qty: 1,
        subtotal: item.amount,
        note: "추가 옵션"
      })),
      ...visibleCustomItems.map((item) => ({
        id: item.id,
        name: item.name,
        detail: item.detail,
        unitPrice: item.amount,
        qty: 1,
        subtotal: item.amount,
        note: item.discountable === false ? "기타 · 할인 제외" : "기타"
      })),
      ...visibleBenefitItems.map((item) => ({
        id: item.id,
        name: item.name,
        detail: "서비스 및 혜택",
        unitPrice: 0,
        qty: 1,
        subtotal: 0,
        note: "서비스"
      }))
    ];

    return {
      id: `${customer.quoteNumber || "quote"}-${Date.now()}`,
      savedAt: new Date().toISOString(),
      title: quoteTitle,
      hospitalName: customer.hospitalName,
      contactName:  customer.managerName,
      phone:        customer.phone,
      email:        customer.email,
      quoteNumber:  customer.quoteNumber,
      quoteDate:    customer.quoteDate,
      shootDate:    customer.shootDate || null,
      validUntil:   customer.validUntil,
      items:        visibleItems,
      supplyAmount,
      discountAmount: discountTotal,
      vat,
      totalAmount:  finalAmount,
      depositAmount: Math.round(finalAmount * depositRate / 100),
      balanceAmount: Math.round(finalAmount * (100 - depositRate) / 100),
      depositRate,
      memos:        memo || null,
      formState: {
        customer,
        quoteTitle,
        selectedPackageId,
        selectedSingleItemIds,
        singleItemAmounts,
        profileCount,
        stagedCount,
        combinedProfileStagedCount,
        floorCount,
        largeHospital,
        droneCount,
        customItems,
        benefitItems,
        discountRate,
        extraDiscount,
        memo,
        depositRate,
        brand
      }
    };
  };

  const saveRecentQuote = async (data: ContractQuoteData): Promise<ContractQuoteData | null> => {
    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Workspace Modal 모드에서는 병원명 문자열매칭이 아니라 이미 알고 있는 정확한
        // clientId/workflowRunId로 연결한다(app/api/quotes/route.ts가 body.clientId를 우선한다).
        // lastKnownUpdatedAt은 서버가 저장 충돌을 감지(soft-warn)하는 데만 쓰인다(Phase 5).
        body: JSON.stringify({
          ...(isModal ? { ...data, clientId, workflowRunId } : data),
          lastKnownUpdatedAt: lastKnownUpdatedAtRef.current,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "서버 오류");

      const savedData = { ...data, id: body.id ?? data.id, savedAt: body.createdAt ?? data.savedAt, updatedAt: body.updatedAt ?? data.updatedAt };
      lastKnownUpdatedAtRef.current = savedData.updatedAt;
      setRecentQuotes((current) => [
        savedData,
        ...current.filter((quote) => quote.quoteNumber !== savedData.quoteNumber),
      ].slice(0, RECENT_QUOTES_DISPLAY_LIMIT));

      const todayPrefix = `PC-${todayValue().replaceAll("-", "")}-`;
      if (data.quoteNumber.startsWith(todayPrefix)) {
        setTodayQuoteNumbers((prev) => Array.from(new Set([...prev, data.quoteNumber])));
      }
      if (isModal) {
        lastSavedFormStateRef.current = JSON.stringify(savedData.formState ?? null);
        setDirty(false);
      }
      // 저장이 실제로 성공한 지금이 새 기준선이다 — dirtyFields를 비워서 Agent가 이후 이
      // 필드들을 다시 patch할 수 있게 한다(모드에 상관없이 적용, page 모드는 지금까지
      // dirty 추적 자체가 없었다).
      useQuoteStore.getState().clearDirty();
      // 저장은 됐지만 그 사이 다른 곳에서 먼저 저장했을 수 있다 — 막지 않고 알려만 준다.
      if (body.conflictDetected) {
        setRecentQuoteMessage("⚠️ 저장했지만, 그 사이 다른 곳에서 이 견적서가 먼저 수정됐어요. 최신 상태인지 확인해주세요.");
      }
      return savedData;
    } catch (error) {
      setRecentQuoteMessage(`⚠️ 견적 저장 실패 — ${error instanceof Error ? error.message : "네트워크 오류"}`);
      return null;
    }
  };

  const loadRecentQuote = (data: ContractQuoteData) => {
    lastKnownUpdatedAtRef.current = data.updatedAt;
    if (data.formState && !data.formState.agentOverrideItems) {
      setBrand(data.formState.brand ?? "photoclinic");
      setCustomer(data.formState.customer);
      setQuoteTitle(data.formState.quoteTitle);
      setSelectedPackageId(data.formState.selectedPackageId);
      setSelectedSingleItemIds(data.formState.selectedSingleItemIds);
      setSingleItemAmounts(data.formState.singleItemAmounts ?? {});
      setProfileCount(data.formState.profileCount);
      setStagedCount(data.formState.stagedCount);
      setCombinedProfileStagedCount(data.formState.combinedProfileStagedCount ?? 0);
      setFloorCount(data.formState.floorCount);
      setLargeHospital(data.formState.largeHospital);
      setDroneCount(data.formState.droneCount);
      setCustomItems(data.formState.customItems);
      setBenefitItems(data.formState.benefitItems);
      setDiscountRate(data.formState.discountRate);
      setExtraDiscount(data.formState.extraDiscount);
      setMemo(data.formState.memo);
    } else {
      setBrand("photoclinic");
      setCustomer({
        hospitalName: data.hospitalName || "",
        managerName: data.contactName || "",
        phone: data.phone || "",
        email: data.email || "",
        quoteDate: data.quoteDate || todayValue(),
        validUntil: data.validUntil || addDays(todayValue(), 14),
        shootDate: data.shootDate || "",
        quoteNumber: data.quoteNumber || createQuoteNumber()
      });
      setQuoteTitle(data.title || BRAND_CONFIG.photoclinic.defaultQuoteTitle);
      setSelectedPackageId(null);
      setSelectedSingleItemIds([]);
      setSingleItemAmounts({});
      setProfileCount(0);
      setStagedCount(0);
      setCombinedProfileStagedCount(0);
      setFloorCount(0);
      setLargeHospital(false);
      setDroneCount(0);
      setCustomItems(
        data.items
          .filter((item) => item.subtotal > 0)
          .map((item) => ({
            id: item.id || crypto.randomUUID(),
            name: item.name,
            detail: item.detail,
            amount: item.subtotal
          }))
      );
      setBenefitItems(
        data.items
          .filter((item) => item.subtotal === 0)
          .map((item) => ({ id: item.id || crypto.randomUUID(), name: item.name }))
      );
      setDiscountRate(0);
      setExtraDiscount(data.discountAmount || 0);
      setMemo(data.memos || "");
    }

    setRecentQuoteMessage("선택한 견적서를 입력 폼에 불러왔습니다.");
    // 페이지 모드에서 불러온 뒤에도 채팅이 "지금 이 견적서"를 찾아 수정할 수 있도록 컨텍스트를
    // 맞춰준다(모달 모드는 resourceId prop으로 이미 되고 있음) — components/conti/ContiBuilder.tsx의
    // 같은 패턴(불러오기 클릭 시 setOliviaWorkspace) 참고.
    if (data.id) {
      setCurrentQuoteId(data.id);
      setCurrentQuoteStatus(data.status || "draft");
      setOliviaWorkspace("quote", data.id);
      if (data.hospitalName) setOliviaClient(undefined, data.hospitalName);
    }
    // resetForm()과 같은 이유로, 방금 불러온 값을 새 기준선으로 삼는다 — 사람이 편집 중이던
    // 값을 dirty로 남겨서 이후 Agent patch를 영구히 막지 않도록 한다.
    useQuoteStore.getState().clearDirty();
  };

  const openContractWithQuote = (data: ContractQuoteData) => {
    const { formState, ...contractPayload } = data;
    const contractBrand = formState?.brand ?? "photoclinic";
    const encoded = encodeURIComponent(JSON.stringify(contractPayload));
    window.open(`/contract?data=${encoded}&brand=${contractBrand}`, "_blank");
  };

  const publishQuoteToPortal = async (
    item: ContractQuoteData,
    overrides?: { forceClientId?: string; forceCreateNew?: boolean },
  ) => {
    setPublishingQuoteId(item.id);
    setRecentQuoteMessage("");
    try {
      const response = await fetch(`/api/quotes/${item.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides ?? {}),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        if (json.needsConfirmation && json.candidate) {
          const useExisting = window.confirm(
            `비슷한 이름의 기존 고객 "${json.candidate.hospital_name}"이(가) 있습니다.\n이 고객에 연결할까요? (취소하면 새 고객으로 생성합니다)`,
          );
          setPublishingQuoteId(null);
          await publishQuoteToPortal(item, useExisting ? { forceClientId: json.candidate.id } : { forceCreateNew: true });
          return;
        }
        setRecentQuoteMessage(json.error || "포털 공개에 실패했습니다.");
        return;
      }
      setRecentQuotes((prev) =>
        prev.map((quote) => (quote.id === item.id ? { ...quote, status: "published", portalUrl: json.portalUrl } : quote)),
      );
      if (item.id === (resourceId || currentQuoteId)) setCurrentQuoteStatus("published");
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(json.portalUrl).catch(() => {});
        setRecentQuoteMessage("포털에 공개했습니다. 포털 링크를 클립보드에 복사했습니다.");
      } else {
        setRecentQuoteMessage(`포털에 공개했습니다: ${json.portalUrl}`);
      }
      if (isModal) {
        setTimeout(() => { onPublished?.(); onClose?.(); }, 700);
      }
    } catch (error) {
      setRecentQuoteMessage(error instanceof Error ? error.message : "포털 공개 중 오류가 발생했습니다.");
    } finally {
      setPublishingQuoteId(null);
    }
  };

  // 계약서 생성 페이지로 이동 (견적 데이터 전달)
  const goToContract = () => {
    const data = buildContractQuoteData();
    saveRecentQuote(data);
    openContractWithQuote(data);
  };

  const saveCurrentQuoteSnapshot = () => {
    const data = buildContractQuoteData();
    saveRecentQuote(data);
    return data;
  };

  const [manualSaving, setManualSaving] = useState(false);
  const handleManualSave = async () => {
    setManualSaving(true);
    setRecentQuoteMessage("");
    const data = buildContractQuoteData();
    const saved = await saveRecentQuote(data);
    if (saved) setRecentQuoteMessage("현재 입력 내용을 DB에 저장했습니다.");
    setManualSaving(false);
  };
  useSaveShortcut(handleManualSave);

  // 다운로드 — PDF/Excel 선택 팝오버(코드 요청서 3차 2번 항목, 2026-08-16). 콘티의
  // handlePDF/handleSpreadsheetDownload 팝오버 패턴을 그대로 견적서에 적용한다.
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // "최종완료" — 코드 요청서 2차(2026-08-16) 2번 항목. 저장 → 워크플로우 quote 단계 완료 처리 →
  // 다음 단계로 진행까지 승인 없이 즉시 처리한다. 포털 공개(publishQuoteToPortal)와는 완전히
  // 분리된 동작 — 고객에게 아직 안 보여줬어도(포털 미공개) 대표가 직접 만든 것 자체가 승인이다.
  const [completingQuote, setCompletingQuote] = useState(false);
  const completeQuoteStep = async (
    quoteId: string,
    overrides?: { forceClientId?: string; forceCreateNew?: boolean },
  ) => {
    setCompletingQuote(true);
    setRecentQuoteMessage("");
    try {
      const response = await fetch(`/api/quotes/${quoteId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides ?? {}),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        if (json.needsConfirmation && json.candidate) {
          const useExisting = window.confirm(
            `비슷한 이름의 기존 고객 "${json.candidate.hospital_name}"이(가) 있습니다.\n이 고객에 연결할까요? (취소하면 새 고객으로 생성합니다)`,
          );
          setCompletingQuote(false);
          await completeQuoteStep(quoteId, useExisting ? { forceClientId: json.candidate.id } : { forceCreateNew: true });
          return;
        }
        setRecentQuoteMessage(json.error || "최종완료 처리에 실패했습니다.");
        return;
      }
      setRecentQuoteMessage(json.advanced ? "견적서 단계를 최종완료 처리하고 다음 단계(계약서)로 진행했습니다." : "견적서 단계를 최종완료 처리했습니다.");
    } catch (error) {
      setRecentQuoteMessage(error instanceof Error ? error.message : "최종완료 처리 중 오류가 발생했습니다.");
    } finally {
      setCompletingQuote(false);
    }
  };
  const handleFinalComplete = async () => {
    setCompletingQuote(true);
    setRecentQuoteMessage("");
    const data = buildContractQuoteData();
    const saved = await saveRecentQuote(data);
    if (!saved?.id) {
      setCompletingQuote(false);
      return;
    }
    await completeQuoteStep(saved.id);
  };

  // ── Workspace Modal 전용 동작 (mode==="modal"일 때만 개입, mode==="page"는 전부 no-op) ──

  // 1) 프리필: resourceId가 있으면 기존 견적서를 불러오고, clientId만 있으면 고객 정보만 채운다.
  useEffect(() => {
    if (!isModal) return;
    const loadResource = () => {
      if (!resourceId) return;
      fetch(`/api/quotes/${resourceId}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.ok) {
            loadRecentQuote(rowToContractQuoteData(json.quote));
            setOliviaClient(json.quote?.client_id, json.quote?.hospital_name);
            if (json.quote?.workflow_run_id) setOliviaProject(json.quote.workflow_run_id);
          }
        })
        .catch(() => {});
    };
    if (resourceId) {
      loadResource();
      const onRefresh = (event: Event) => {
        const detail = (event as CustomEvent<{ resource?: string; resourceId?: string; after?: unknown }>).detail;
        if ((!detail?.resource || detail.resource === "quote") && (!detail?.resourceId || detail.resourceId === resourceId)) {
          // after(방금 저장된 DB row)가 실려 있으면 다시 fetch하지 않고 dirty하지 않은 필드만
          // 즉시 patch한다 — 없을 때만(다른 리소스 타입이 재사용하는 경우 등) 기존처럼 다시
          // 불러온다.
          if (detail?.after && typeof detail.after === "object") {
            const afterRow = detail.after as Record<string, unknown>;
            useQuoteStore.getState().patchFromAgent(afterRow);
            // Agent가 방금 이 시각으로 저장했다 — 사람의 다음 저장이 이 값을 기준으로 충돌
            // 여부를 판단하게 최신화한다(Phase 5). 그대로면 실제로는 이미 반영된 Agent 변경을
            // "충돌"로 잘못 경고하게 된다.
            if (typeof afterRow.updated_at === "string") lastKnownUpdatedAtRef.current = afterRow.updated_at;
          } else {
            loadResource();
          }
        }
      };
      window.addEventListener("olivia-resource-refresh", onRefresh);
      const onPreview = (event: Event) => {
        const detail = (event as CustomEvent<{ resourceId?: string }>).detail;
        if (!detail?.resourceId || detail.resourceId === resourceId) setShowFullscreenPreview(true);
      };
      window.addEventListener("olivia-quote-preview", onPreview);
      return () => {
        window.removeEventListener("olivia-resource-refresh", onRefresh);
        window.removeEventListener("olivia-quote-preview", onPreview);
      };
    }
    if (clientId) {
      fetch(`/api/clients/${clientId}/workspace`)
        .then((res) => res.json())
        .then((json) => {
          if (!json.ok) return;
          setCustomer((prev) => ({
            ...prev,
            hospitalName: json.client?.name || prev.hospitalName,
            managerName: json.client?.manager_name || prev.managerName,
            phone: json.client?.phone || prev.phone,
            email: json.client?.email || prev.email,
            shootDate: json.activeProject?.shoot_date || prev.shootDate,
          }));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal, clientId, resourceId]);

  // 페이지 모드(/photoclinic)에서 "불러오기"로 연 견적서 — 모달 전용 effect 위에는 아예 없던
  // 리스너라 채팅으로 지금 보고 있는 견적을 수정해도 화면이 그대로였다(콘티와 동일한 버그).
  // currentQuoteId가 있을 때(견적을 한 번이라도 불러온 뒤)만 듣고 새로고침 없이 다시 불러온다.
  useEffect(() => {
    if (isModal || !currentQuoteId) return;
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ resource?: string; resourceId?: string; after?: unknown }>).detail;
      if (detail?.resource && detail.resource !== "quote") return;
      if (detail?.resourceId && detail.resourceId !== currentQuoteId) return;
      if (detail?.after && typeof detail.after === "object") {
        const afterRow = detail.after as Record<string, unknown>;
        useQuoteStore.getState().patchFromAgent(afterRow);
        if (typeof afterRow.updated_at === "string") lastKnownUpdatedAtRef.current = afterRow.updated_at;
        return;
      }
      fetch(`/api/quotes/${currentQuoteId}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.ok) loadRecentQuote(rowToContractQuoteData(json.quote));
        })
        .catch(() => {});
    };
    window.addEventListener("olivia-resource-refresh", onRefresh);
    return () => window.removeEventListener("olivia-resource-refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal, currentQuoteId]);

  // 2) dirty 추적: formState 스냅샷을 마지막 저장본과 비교한다(id/savedAt은 매번 달라 formState만 비교).
  useEffect(() => {
    if (!isModal) return;
    const data = buildContractQuoteData();
    const snapshot = JSON.stringify(data.formState ?? null);
    setDirty(snapshot !== lastSavedFormStateRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isModal, customer, quoteTitle, selectedPackageId, selectedSingleItemIds, singleItemAmounts,
    profileCount, stagedCount, combinedProfileStagedCount, floorCount, largeHospital, droneCount,
    customItems, benefitItems, discountRate, extraDiscount, memo, depositRate, brand,
  ]);

  // 3) 자동저장: dirty가 1000ms 유지되면 기존 saveRecentQuote()를 그대로 재사용해 저장한다.
  // dirty는 한 번 true가 되면(예: 프리필로 인한 변경) 값이 안 바뀌는 한 계속 true라서, deps를
  // [isModal, dirty]로만 두면 프리필 이후의 입력이 이 effect를 다시 안 태우고 — setTimeout
  // 콜백이 effect가 처음 걸렸을 때(즉 마운트 시점, customer가 비어있을 때)의 클로저를 그대로
  // 들고 있어서 매번 "그 시점"의 오래된 값을 저장하는 버그가 있었다(실제 배포 후 재현 테스트에서
  // 발견 — 자동저장은 성공했지만 병원명/담당자가 빈 값으로 저장됨). dirty 판단에 쓰는 것과
  // 동일한 필드 전체를 deps에 넣어서, 값이 바뀔 때마다 항상 최신 클로저로 타이머를 다시 건다.
  // 닫기 시점에 아직 진행 중인 자동저장이 있으면 그 완료를 기다렸다가 판단하기 위한 참조 —
  // dirty는 저장이 끝나야(=fetch 응답 이후) false가 되므로, "저장 중" 상태에서 곧바로 닫으면
  // 워크플로우 자동 전진(서버의 completeOpenStepTasksForManualSave/maybeAdvanceWorkflow)이
  // 아직 반영되기 전에 부모 화면이 새로고침되어 "다음 할 일"이 낡은 값으로 보일 수 있다.
  const pendingSaveRef = useRef<Promise<ContractQuoteData | null> | null>(null);

  useEffect(() => {
    if (!isModal || !dirty) return;
    const timer = setTimeout(() => {
      setAutosaveStatus("saving");
      const data = buildContractQuoteData();
      const savePromise = saveRecentQuote(data).then((saved) => {
        setAutosaveStatus(saved ? "saved" : "error");
        return saved;
      });
      pendingSaveRef.current = savePromise;
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isModal, dirty, customer, quoteTitle, selectedPackageId, selectedSingleItemIds, singleItemAmounts,
    profileCount, stagedCount, combinedProfileStagedCount, floorCount, largeHospital, droneCount,
    customItems, benefitItems, discountRate, extraDiscount, memo, depositRate, brand,
  ]);

  // 4) 닫기 정책: 진행 중인 자동저장이 있으면 먼저 기다리고, 저장 안 된 변경사항이 남아있으면
  // 확인창을, 없으면 바로 닫는다. dirty state가 아니라 lastSavedFormStateRef(ref라 항상 최신)와
  // 직접 비교해서 판단한다 — dirty는 이 함수가 등록된 시점의 클로저 값이라 대기 후에는 낡을 수 있다.
  const handleModalClose = async () => {
    if (!isModal) return;
    if (pendingSaveRef.current) await pendingSaveRef.current;
    const stillDirty = JSON.stringify(buildContractQuoteData().formState ?? null) !== lastSavedFormStateRef.current;
    if (!stillDirty) { onClose?.(); return; }
    setCloseConfirmOpen(true);
  };
  useEffect(() => {
    if (!isModal) return;
    registerRequestClose?.(() => handleModalClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal, registerRequestClose, dirty]);

  const createContractQuoteFromImportedPdf = (parsed: ImportedPdfQuote): ContractQuoteData => {
    const supply = Math.round(parsed.totalAmount / 1.1);
    const vatAmount = Math.max(parsed.totalAmount - supply, 0);
    const itemNames = uniqueQuoteItems(
      [
        "스탠다드",
        "프리미엄",
        "프리미엄 플러스",
        "프로필촬영",
        "연출 촬영",
        "인테리어 촬영",
        "브랜드필름",
        "포인트영상",
        "드론촬영"
      ].filter((keyword) => parsed.rawText.includes(keyword))
    );

    return {
      id: `${parsed.quoteNumber || "pdf-quote"}-${Date.now()}`,
      savedAt: new Date().toISOString(),
      title: "기존 견적서 PDF 기반 계약서",
      hospitalName: parsed.hospitalName,
      contactName: "",
      phone: "",
      email: "",
      quoteNumber: parsed.quoteNumber,
      quoteDate: parsed.quoteDate,
      shootDate: null,
      validUntil: addDays(parsed.quoteDate, 14),
      items: [
        {
          name: itemNames.length ? itemNames.join(", ") : "기존 견적서 PDF 항목",
          detail: "업로드한 견적서 PDF에서 추출한 계약 항목입니다.",
          unitPrice: supply,
          qty: 1,
          subtotal: supply,
          note: "PDF 불러오기"
        }
      ],
      supplyAmount: supply,
      discountAmount: 0,
      vat: vatAmount,
      totalAmount: parsed.totalAmount,
      depositAmount: Math.round(parsed.totalAmount * 0.5),
      balanceAmount: parsed.totalAmount - Math.round(parsed.totalAmount * 0.5),
      depositRate: 50,
      memos: "기존 견적서 PDF를 기준으로 생성한 계약서입니다."
    };
  };

  const makeManualPdfQuote = (fileName = ""): ImportedPdfQuote => {
    const dateFromName = fileName.match(/\d{4}-\d{2}-\d{2}/)?.[0] || todayValue();

    return {
      hospitalName: "",
      quoteNumber: createQuoteNumber(),
      quoteDate: dateFromName,
      totalAmount: 0,
      rawText: ""
    };
  };

  const updateManualPdfQuote = (key: keyof ImportedPdfQuote, value: string) => {
    setManualPdfQuote((prev) => {
      const current = prev || makeManualPdfQuote();
      return {
        ...current,
        [key]: key === "totalAmount" ? numberValue(value) : value
      };
    });
  };

  const addManualPdfQuoteToRecent = () => {
    if (!manualPdfQuote?.totalAmount) {
      setPdfImportMessage("계약서 생성을 위해 총 견적금액을 입력해주세요.");
      return;
    }

    const data = createContractQuoteFromImportedPdf({
      ...manualPdfQuote,
      rawText: manualPdfQuote.rawText || "기존 견적서 PDF 수동 입력"
    });

    saveRecentQuote(data);
    setPdfImportMessage("입력한 내용으로 최근 견적 목록에 추가했습니다. 목록에서 계약서를 눌러 생성할 수 있습니다.");
    setManualPdfQuote(null);
  };

  const importQuotePdf = async (file: File) => {
    setIsImportingQuotePdf(true);
    setPdfImportMessage("");
    setManualPdfQuote(null);

    try {
      const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
      const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
      const pdfjs = (await import(/* webpackIgnore: true */ pdfjsUrl)) as any;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

      const buffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      const pageTexts: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pageTexts.push(content.items.map((item: any) => item.str).join("\n"));
      }

      let fullText = pageTexts.join("\n").trim();
      if (!fullText || fullText.length < 30) {
        setPdfImportMessage("이미지형 PDF입니다. Google Vision AI로 텍스트를 인식 중입니다. 잠시만 기다려주세요...");

        try {
          setPdfImportMessage("Google Vision AI로 이미지를 분석 중입니다. 잠시만 기다려주세요...");
          const ocrTexts: string[] = [];
          const pageLimit = Math.min(pdf.numPages, 2);

          for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) continue;

            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: context, viewport }).promise;

            // Canvas → base64 (data URL 제외)
            const dataUrl   = canvas.toDataURL("image/jpeg", 0.95);
            const imageBase64 = dataUrl.split(",")[1];

            // Google Vision API 호출
            const visionRes = await fetch("/api/ocr-pdf", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageBase64 }),
            });
            const visionData = await visionRes.json() as { ok: boolean; text?: string; error?: string };
            if (!visionData.ok) throw new Error(visionData.error || "OCR 실패");
            if (visionData.text) ocrTexts.push(visionData.text);
          }

          fullText = ocrTexts.join("\n").trim();
        } catch {
          setManualPdfQuote(makeManualPdfQuote(file.name));
          setPdfImportMessage("이미지형 PDF 분석에 실패했습니다. 아래에 병원명과 금액을 입력하면 계약서로 만들 수 있습니다.");
          return;
        }

        if (!fullText || fullText.length < 30) {
          setManualPdfQuote(makeManualPdfQuote(file.name));
          setPdfImportMessage("이미지형 PDF를 OCR로 읽었지만 필요한 내용을 찾지 못했습니다. 아래에 직접 입력해주세요.");
          return;
        }
      }

      const parsed = parseQuotePdfText(fullText);
      if (!parsed.totalAmount) {
        setManualPdfQuote({
          ...parsed,
          totalAmount: 0
        });
        setPdfImportMessage("PDF 텍스트는 읽었지만 최종 금액을 찾지 못했습니다. 아래에서 금액을 입력해주세요.");
        return;
      }

      const data = createContractQuoteFromImportedPdf(parsed);
      saveRecentQuote(data);
      setPdfImportMessage("PDF 내용을 읽어 최근 견적 목록에 추가했습니다. 목록에서 계약서를 눌러 생성할 수 있습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPdfImportMessage(`PDF 불러오기에 실패했습니다: ${message}`);
    } finally {
      setIsImportingQuotePdf(false);
      if (quotePdfInputRef.current) {
        quotePdfInputRef.current.value = "";
      }
    }
  };

  // onResult는 선택 인자다 — 사람이 누르는 다운로드 버튼(onClick={() => void downloadPdf()})은
  // 그대로 두고, Agent가 채팅으로 트리거할 때만(useQuoteStore.pdfHandler, 아래 useEffect)
  // 실제 성공/실패를 알려준다. 별도의 "Agent용 PDF 함수"를 만들지 않고 같은 함수를 그대로
  // 재사용하기 위한 최소한의 확장이다(Phase 4).
  const downloadPdf = async (onResult?: (result: { success: boolean; error?: string }) => void) => {
    if (!previewRef.current || isGenerating) {
      onResult?.({ success: false, error: isGenerating ? "이미 PDF를 생성하고 있어요." : "견적서 화면을 찾지 못했어요." });
      return;
    }
    const snapshot = buildContractQuoteData();

    const shootingLines = snapshot.items
      .filter(item => item.subtotal > 0)
      .map(item => `• ${item.name}${item.detail && item.detail !== "단일 촬영 항목" ? ` (${item.detail})` : ""}`)
      .join("\n");

    createMailingDraft({
      type: "quote",
      source_module: "photoclinic",
      source_id: snapshot.quoteNumber,
      hospital_name: snapshot.hospitalName,
      contact_name: snapshot.contactName,
      to_email: snapshot.email,
      subject: `[${cfg.label}] ${snapshot.hospitalName} 촬영 견적서`,
      body: `안녕하세요${snapshot.contactName ? `, ${snapshot.contactName} 담당자님` : ""}.\n\n${cfg.label}입니다.\n이번 촬영 관련 견적서를 첨부 파일로 보내드립니다.\n아래 촬영 구성을 확인하시고, 궁금하신 점은 편하게 연락 주시기 바랍니다.\n\n[촬영 구성]\n${shootingLines || "• 별도 협의"}\n\n견적서는 ${snapshot.validUntil}까지 유효합니다.\n계약 확정 시 선금 입금을 완료하시면 촬영 일정이 확정됩니다.\n\n감사합니다.\n${cfg.label} 드림`,
    });

    const pdfWindow = window.open("", "_blank");
    const popupInk = brand === "jakeimage" ? "#162238" : "#155855";
    const popupInkRgb = brand === "jakeimage" ? "22, 34, 56" : "21, 88, 85";

    const writeGeneratingWindow = () => {
      if (!pdfWindow) return;

      pdfWindow.document.open();
      pdfWindow.document.write(`
        <!doctype html>
        <html lang="ko">
          <head>
            <title>${cfg.label} 견적서 생성 중</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
                background: ${cfg.popupBg};
                color: ${popupInk};
              }
              .box {
                text-align: center;
                padding: 32px;
                border-radius: 18px;
                background: #fff;
                box-shadow: 0 18px 50px rgba(${popupInkRgb}, 0.12);
              }
              strong { display: block; margin-bottom: 8px; font-size: 18px; }
              span { color: #6f6961; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="box">
              <strong>PDF 견적서를 생성하고 있습니다.</strong>
              <span>잠시만 기다려주세요.</span>
            </div>
          </body>
        </html>
      `);
      pdfWindow.document.close();
    };

    const writeErrorWindow = (message: string) => {
      if (!pdfWindow) return;

      pdfWindow.document.open();
      pdfWindow.document.write(`
        <!doctype html>
        <html lang="ko">
          <head>
            <title>${cfg.label} 견적서 생성 실패</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
                background: ${cfg.popupBg};
                color: #222;
              }
              .box {
                max-width: 520px;
                margin: 24px;
                padding: 28px;
                border-radius: 18px;
                background: #fff;
                box-shadow: 0 18px 50px rgba(${popupInkRgb}, 0.12);
              }
              strong { display: block; margin-bottom: 10px; color: ${popupInk}; font-size: 18px; }
              p { margin: 0 0 10px; color: #6f6961; line-height: 1.6; }
              code { display: block; padding: 12px; border-radius: 10px; background: #faf7f2; color: #e85d2c; white-space: pre-wrap; word-break: break-word; }
            </style>
          </head>
          <body>
            <div class="box">
              <strong>PDF 생성에 실패했습니다.</strong>
              <p>아래 오류 내용을 확인해주세요. 팝업 차단 또는 이미지 로딩 문제일 수 있습니다.</p>
              <code>${escapeHtml(message)}</code>
            </div>
          </body>
        </html>
      `);
      pdfWindow.document.close();
    };

    writeGeneratingWindow();
    setIsGenerating(true);

    let captureRoot: HTMLDivElement | null = null;

    try {
      const savedSnapshot = await saveRecentQuote(snapshot);
      if (!savedSnapshot) throw new Error("견적 DB 저장에 실패했습니다.");

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf")
      ]);

      // 화면용 미리보기는 transform scale이 적용되어 있으므로,
      // PDF용으로는 원본 견적서를 복제해 1123 x 794 사이즈로 따로 캡처합니다.
      // 이렇게 해야 새 창에 "생성 중"만 남거나 PDF가 미리보기와 다르게 나오는 문제를 줄일 수 있습니다.
      captureRoot = document.createElement("div");
      // previewRef가 가리키는 .quote-page는 브랜드 색상(--quote-ink 등)을 정의하는
      // .quote-app / .quote-app--jakeimage의 자손일 뿐이라, previewRef만 복제하면
      // 그 조상 클래스가 통째로 빠져 CSS 변수가 비어버린다 — 캡처 컨테이너에도 동일한
      // 브랜드 클래스를 붙여줘야 PDF가 화면 미리보기와 같은 색상으로 나온다.
      captureRoot.className = `quote-app${brand === "jakeimage" ? " quote-app--jakeimage" : ""}`;
      captureRoot.setAttribute("aria-hidden", "true");
      captureRoot.style.position = "fixed";
      captureRoot.style.left = "-10000px";
      captureRoot.style.top = "0";
      captureRoot.style.width = "1123px";
      captureRoot.style.height = "794px";
      captureRoot.style.overflow = "visible";
      captureRoot.style.background = "#ffffff";
      captureRoot.style.pointerEvents = "none";
      captureRoot.style.zIndex = "-1";

      const captureTarget = previewRef.current.cloneNode(true) as HTMLElement;
      captureTarget.style.width = "1123px";
      captureTarget.style.height = "794px";
      captureTarget.style.minHeight = "794px";
      captureTarget.style.margin = "0";
      captureTarget.style.transform = "none";
      captureTarget.style.transformOrigin = "top left";
      captureTarget.style.zoom = "1";

      captureRoot.appendChild(captureTarget);
      document.body.appendChild(captureRoot);

      // html2canvas는 CSS filter(제이크이미지연구소 로고를 흰색으로 반전시키는
      // brightness(0) invert(1))를 제대로 그리지 못해, 화면과 달리 PDF에서는
      // 원본 색(어두운 잉크색) 로고가 어두운 배경(--quote-ink)에 묻혀버린다.
      // 캡처 직전에 로고 픽셀 자체를 캔버스로 반전시켜 별도 이미지로 바꿔치기한다.
      if (brand === "jakeimage") {
        const logoImg = captureTarget.querySelector<HTMLImageElement>(".rail-slogan img");
        if (logoImg) {
          try {
            const inverted = await invertImageColors(logoImg.src);
            logoImg.src = inverted;
            logoImg.style.filter = "none";
          } catch {
            // 반전 실패 시 원본 로고라도 그대로 남겨 완전히 안 보이는 상황은 피한다.
          }
        }
      }

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      await new Promise((resolve) => window.requestAnimationFrame(resolve));

      const canvas = await html2canvas(captureTarget, {
        scale: 2.4,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: 1123,
        height: 794,
        windowWidth: 1123,
        windowHeight: 794,
        scrollX: 0,
        scrollY: 0
      });

      const image = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      const safeMargin = 4;
      pdf.addImage(image, "PNG", safeMargin, safeMargin, 297 - safeMargin * 2, 210 - safeMargin * 2);

      const hospital = customer.hospitalName.trim() || cfg.label;
      const fileName = `${hospital}_${cfg.label}_견적서_${customer.quoteDate}.pdf`;
      const pdfBlob = pdf.output("blob");
      const pageParams = new URLSearchParams(window.location.search);
      try {
        // 고객 레코드가 아직 CRM에 없어 연결에 실패해도(신규 브랜드 등) 로컬 PDF 저장은 막지 않는다.
        await uploadWorkflowArtifact({
          file: pdfBlob,
          fileName,
          documentType: "quote",
          sourceTable: "quotes",
          sourceId: savedSnapshot.id,
          title: snapshot.title || `${snapshot.hospitalName} 견적서`,
          hospitalName: snapshot.hospitalName,
          clientId: pageParams.get("client_id") || pageParams.get("clientId"),
          workflowRunId: pageParams.get("workflowRunId"),
        });
      } catch (artifactError) {
        console.error("workflow artifact upload failed (non-blocking)", artifactError);
      }
      pdf.save(fileName);

      if (pdfWindow) {
        pdfWindow.close();
      }
      onResult?.({ success: true });
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error("PDF generation failed", error);
      writeErrorWindow(message);
      onResult?.({ success: false, error: message });
    } finally {
      if (captureRoot) {
        captureRoot.remove();
      }
      setIsGenerating(false);
    }
  };

  // downloadPdf는 렌더마다 새로 만들어지는 클로저라(customer/brand 등 최신 상태를 참조해야
  // 한다) 아래 등록 effect가 매번 다시 실행되면 낭비다 — 최신 함수는 ref로만 갱신하고,
  // useQuoteStore에 등록하는 handler 자체는 마운트 시 한 번만 만들어 안정적으로 유지한다
  // (advanced-use-latest 패턴).
  const downloadPdfRef = useRef(downloadPdf);
  useEffect(() => {
    downloadPdfRef.current = downloadPdf;
  });

  // 사람이 누르는 다운로드 버튼과 Agent(actionRouter.ts의 DOWNLOAD_QUOTE_PDF)가 정확히 같은
  // downloadPdf()를 호출하게 하는 연결점 — 지금 이 인스턴스가 마운트돼 있을 때만 등록되고,
  // 언마운트되면 해제된다. useQuoteStore.pdfHandler가 null이면 "지금 열려 있는 견적서가
  // 없다"는 뜻이라 Agent 쪽에서 실행 전에 바로 알 수 있다(Phase 4).
  useEffect(() => {
    const handler = () =>
      new Promise<{ success: boolean; error?: string }>((resolve) => {
        void downloadPdfRef.current((result) => resolve(result));
      });
    useQuoteStore.getState().registerPdfHandler(handler);
    return () => {
      if (useQuoteStore.getState().pdfHandler === handler) useQuoteStore.getState().registerPdfHandler(null);
    };
  }, []);

  /* ── Excel 다운로드 (열너비 적용, 2시트) — 코드 요청서 3차 2번 항목, 콘티의
     handleSpreadsheetDownload과 같은 패턴(xlsx 패키지, aoa_to_sheet) ── */
  const downloadExcel = async () => {
    const snapshot = buildContractQuoteData();
    const XLSX = await import("xlsx");
    const hospitalName = snapshot.hospitalName || "병원";

    const styleSheet = (ws: any, colWidths: number[]) => {
      ws["!cols"] = colWidths.map((w) => ({ wch: w }));
      return ws;
    };

    const infoWs = styleSheet(XLSX.utils.aoa_to_sheet([
      ["병원명", snapshot.hospitalName],
      ["담당자", snapshot.contactName],
      ["연락처", snapshot.phone],
      ["이메일", snapshot.email],
      ["견적번호", snapshot.quoteNumber],
      ["견적일", snapshot.quoteDate],
      ["촬영예정일", snapshot.shootDate || ""],
      ["유효기간", snapshot.validUntil],
    ]), [14, 30]);

    const itemsWs = styleSheet(XLSX.utils.aoa_to_sheet([
      ["항목명", "상세", "단가", "수량", "소계", "비고"],
      ...snapshot.items.map((item) => [item.name, item.detail || "", item.unitPrice, item.qty, item.subtotal, item.note || ""]),
      [],
      ["공급가액", "", "", "", snapshot.supplyAmount, ""],
      ["할인", "", "", "", -snapshot.discountAmount, ""],
      ["부가세", "", "", "", snapshot.vat, ""],
      ["합계", "", "", "", snapshot.totalAmount, ""],
      [`선금 (${snapshot.depositRate}%)`, "", "", "", snapshot.depositAmount, ""],
      [`잔금 (${100 - snapshot.depositRate}%)`, "", "", "", snapshot.balanceAmount, ""],
    ]), [24, 22, 12, 8, 14, 16]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, infoWs, "기본정보");
    XLSX.utils.book_append_sheet(wb, itemsWs, "견적내역");
    XLSX.writeFile(wb, `${hospitalName}_견적서.xlsx`);
  };

  const quotePreviewShellNode = (
          <div
            className={`quote-app${brand === "jakeimage" ? " quote-app--jakeimage" : ""} ${showFullscreenPreview ? "preview-shell preview-shell--fullscreen" : isDesktopWindow ? "preview-shell preview-shell--embedded" : "preview-shell"}`}
            ref={previewShellRef}
          >
            {showFullscreenPreview && (
              <button
                type="button"
                className="preview-fullscreen-close"
                onClick={() => setShowFullscreenPreview(false)}
                aria-label="전체화면 닫기"
              >
                <X size={18} />
                닫기
              </button>
            )}
            <div
              className="quote-preview-viewport"
              style={{
                width: `${1123 * (showFullscreenPreview ? fullscreenPreviewScale : previewScale)}px`,
                height: `${794 * (showFullscreenPreview ? fullscreenPreviewScale : previewScale)}px`
              }}
            >
            <div
              ref={previewRef}
              className="quote-page"
              style={{ transform: `scale(${showFullscreenPreview ? fullscreenPreviewScale : previewScale})` }}
            >
              <aside className="brand-rail">
                <div className="rail-slogan" style={brand === "photoclinic" ? {fontFamily:"'Nanum Myeongjo', serif"} : undefined}>
                  {cfg.sloganLines.map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                  <span className="rail-divider" aria-hidden="true" />
                  <div className="rail-caption">
                    <strong>{cfg.railCaptionTitle}</strong>
                    <span>{cfg.railCaptionSub}</span>
                  </div>
                </div>
                <div className="rail-address">
                  <span>TO.</span>
                  <strong>{customer.hospitalName || cfg.entityLabel}</strong>
                  <small>{customer.managerName || "담당자"}</small>
                </div>
                <div className="rail-notice">
                  <strong>CONTACT</strong>
                  <div className="rail-contact-row">
                    <Receipt size={11} />
                    <span>
                      선금 50%, 잔금 50% 기준
                      <br />
                      세부 조건은 상호 협의 가능
                    </span>
                  </div>
                  <div className="rail-contact-row">
                    <Phone size={11} />
                    <span>
                      1002-754-988962
                      <br />
                      우리은행
                    </span>
                  </div>
                  <div className="rail-contact-row">
                    <MapPin size={11} />
                    <span>
                      제이크이미지연구소
                      <br />
                      (정헌호)
                    </span>
                  </div>
                </div>
                <div className="rail-notice rail-notice--brand">
                  <strong>{cfg.railNoticeTitle}</strong>
                  <span>{cfg.railNoticeSub}</span>
                  <span>{cfg.railNoticeDetail}</span>
                </div>
              </aside>

              <div className="quote-content">
                <header className="quote-hero">
                  <div className="invoice-meta">
                    <div>
                      <span>견적번호</span>
                      <strong>{customer.quoteNumber}</strong>
                    </div>
                    <div>
                      <span>견적일</span>
                      <strong>{displayDate(customer.quoteDate)}</strong>
                    </div>
                    <div>
                      <span>촬영 예정일</span>
                      <strong>{displayDate(customer.shootDate)}</strong>
                    </div>
                    <div>
                      <span>견적 유효기간</span>
                      <strong>{displayDate(customer.validUntil)}</strong>
                    </div>
                  </div>
                  <h2 style={{fontFamily:"'Nanum Myeongjo', serif", whiteSpace:"pre-line"}}>
                    {quoteTitle || cfg.defaultQuoteTitle}
                  </h2>
                </header>

                <section className="client-strip">
                  <Info icon={<Building2 size={11} />} label={cfg.entityLabel} value={customer.hospitalName || "-"} />
                  <Info icon={<UserRound size={11} />} label="담당자명" value={customer.managerName || "-"} />
                  <Info icon={<Phone size={11} />} label="연락처" value={customer.phone || "-"} />
                  <Info icon={<Mail size={11} />} label="이메일" value={customer.email || "-"} />
                </section>

                <section className="estimate-table-wrap">
                  <table className="quote-table">
                    <thead>
                      <tr>
                        <th>항목</th>
                        <th>수량</th>
                        <th>가격</th>
                        <th>소계</th>
                        <th>비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="category-row">
                        <td colSpan={5}>촬영 콘텐츠</td>
                      </tr>
                      {selectedPackage ? (
                        <tr>
                          <td>
                            1. {selectedPackage.name} 패키지
                            <small>{selectedPackage.composition}</small>
                          </td>
                          <td></td>
                          <td>{amount(selectedPackage.price)}</td>
                          <td>{amount(selectedPackage.price)}</td>
                          <td>촬영 패키지</td>
                        </tr>
                      ) : null}
                      {selectedSingleItems.length > 0 ? (
                        <tr className="category-row">
                          <td colSpan={5}>단일 항목</td>
                        </tr>
                      ) : null}
                      {selectedSingleItems.map((item, index) => (
                        <tr key={item.id}>
                          <td>{(selectedPackage ? 2 : 1) + index}. {item.name}</td>
                          <td></td>
                          <td>{amount(singleItemPrice(item))}</td>
                          <td>{amount(singleItemPrice(item))}</td>
                          <td>단일 콘텐츠</td>
                        </tr>
                      ))}
                      {optionItems.map((item, index) => (
                        <tr key={item.name}>
                          <td>
                            {(selectedPackage ? 1 : 0) + selectedSingleItems.length + index + 1}. {item.name}
                            {item.detail ? <small>{item.detail}</small> : null}
                          </td>
                          <td></td>
                          <td>{amount(item.amount)}</td>
                          <td>{amount(item.amount)}</td>
                          <td>-</td>
                        </tr>
                      ))}
                      {visibleCustomItems.map((item, index) => (
                        <tr key={item.id}>
                          <td>
                            {(selectedPackage ? 1 : 0) + selectedSingleItems.length + optionItems.length + index + 1}. {item.name || cfg.customItemsLabel}
                            {item.detail ? <small style={{ whiteSpace: "pre-line" }}>- {item.detail}</small> : null}
                          </td>
                          <td></td>
                          <td>{amount(item.amount)}</td>
                          <td>{amount(item.amount)}</td>
                          <td>기타</td>
                        </tr>
                      ))}
                      {visibleBenefitItems.length > 0 ? (
                        <tr className="category-row">
                          <td colSpan={5}>서비스 및 혜택</td>
                        </tr>
                      ) : null}
                      {visibleBenefitItems.map((item, index) => (
                        <tr key={item.id}>
                          <td>{(selectedPackage ? 1 : 0) + selectedSingleItems.length + optionItems.length + visibleCustomItems.length + index + 1}. {item.name}</td>
                          <td></td>
                          <td>-</td>
                          <td>-</td>
                          <td>서비스 및 혜택</td>
                        </tr>
                      ))}
                      {discountRate > 0 ? (
                        <tr className="discount-row">
                          <td>{discountRate}% 할인</td>
                          <td>-</td>
                          <td>-{amount(rateDiscountAmount)}</td>
                          <td>-{amount(rateDiscountAmount)}</td>
                          <td>촬영콘텐츠 합계 기준</td>
                        </tr>
                      ) : null}
                      {extraDiscountAmount > 0 ? (
                        <tr className="discount-row">
                          <td>추가할인(절삭)</td>
                          <td>-</td>
                          <td>-{amount(extraDiscountAmount)}</td>
                          <td>-{amount(extraDiscountAmount)}</td>
                          <td>최종금액 조정</td>
                        </tr>
                      ) : null}
                      {contentSubtotal === 0 ? (
                        <tr>
                          <td>선택된 촬영 항목 없음</td>
                          <td>-</td>
                          <td>0</td>
                          <td>0</td>
                          <td>-</td>
                        </tr>
                      ) : null}
                      <tr className="blank-row"><td colSpan={5}></td></tr>
                    </tbody>
                  </table>
                </section>

                <footer className="quote-bottom">
                  <div className="payment-box">
                    <div className="payment-terms-note">
                      <strong>결제조건</strong>
                      <span>선금 50%, 잔금 50% 기준<br />세부 조건은 상호 협의 가능</span>
                    </div>
                    <div className="payment-terms-rows">
                      <div className="payment-row">
                        {depositRate > 0 && <>
                          <span className="payment-label"><span className="payment-icon" aria-hidden="true">₩</span><strong>선금{depositRate}%</strong></span>
                          <span>{amount(Math.round(finalAmount * depositRate / 100))}</span>
                        </>}
                      </div>
                      <div className="payment-row">
                        {depositRate < 100 && <>
                          <span className="payment-label"><span className="payment-icon" aria-hidden="true">₩</span><strong>잔금{100-depositRate}%</strong></span>
                          <span>{amount(Math.round(finalAmount * (100-depositRate) / 100))}</span>
                        </>}
                      </div>
                      <p>세부 결제 조건은 상호 협의에 따라 조정될 수 있습니다.</p>
                    </div>
                  </div>

                  <div className="total-signature">
                    <div className="total-box">
                      <div>
                        <span>공급가액</span>
                        <strong>{amount(supplyAmount)}</strong>
                      </div>
                      <div>
                        <span>할인 합계</span>
                        <strong>{discountTotal ? `-${amount(discountTotal)}` : "0"}</strong>
                      </div>
                      <div>
                        <span>부가세/10%</span>
                        <strong>{amount(vat)}</strong>
                      </div>
                      <div className="grand-total">
                        <span>KRW</span>
                        <strong>{amount(finalAmount)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="contract-note">
                    <Quote className="contract-note-icon" aria-hidden="true" />
                    <div>
                      <strong>계약 안내</strong>
                      <p>
                        본 견적서는 상호 협의 및 선금 입금 시 계약서의 효력을 대신할 수 있습니다. 촬영 범위 변경 시 최종 금액은 조정될 수 있습니다.
                      </p>
                      {memo.trim() ? <small>{memo}</small> : null}
                    </div>
                  </div>
                </footer>

                <div className="quote-brand-mark">
                  <div className="brand-mark-spacer" aria-hidden="true" />
                  <div className="brand-logo-stack">
                    <img
                      src={cfg.logo}
                      alt={cfg.label}
                      className="brand-logo-image"
                    />
                    <p>{cfg.brandMarkCaption}</p>
                  </div>
                  <div className="signature-area brand-signature">
                    <span>Director Signature</span>
                    <img src="/assets/ceo-signature.png" alt="Director Signature" />
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
  );

  useImperativeHandle(ref, () => ({
    getSnapshot: () => ({
      singleItems: singleItems.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        selected: selectedSingleItemIds.includes(item.id),
        amount: singleItemAmounts[item.id] ?? item.price,
      })),
      customItems: customItems.map(({ id, name, detail, amount }) => ({ id, name, detail, amount })),
      totalAmount: finalAmount,
      depositRate,
    }),
    setSingleItemSelected: (id, selected) => {
      setSelectedSingleItemIds((ids) => {
        if (selected) return ids.includes(id) ? ids : [...ids, id];
        return ids.filter((existing) => existing !== id);
      });
    },
    setSingleItemAmount: (id, amount) => {
      setSingleItemAmounts((amounts) => ({ ...amounts, [id]: amount }));
    },
    addCustomItem: (name, amount, detail) => {
      setCustomItems((items) => [
        ...items,
        { id: crypto.randomUUID(), name, detail: detail ?? "", amount, discountable: true },
      ]);
    },
    removeCustomItem,
    setDepositRate,
  }), [selectedSingleItemIds, singleItemAmounts, customItems, finalAmount, depositRate, removeCustomItem, setCustomItems, setDepositRate, setSelectedSingleItemIds, setSingleItemAmounts]);

  return (
    <>
    {isModal ? null : <GlobalHeader title="견적서 생성기" description="촬영 패키지와 옵션을 선택해 견적서 PDF를 생성합니다." />}
    <main className={`${isModal ? "" : "min-h-screen"} text-[#222222] quote-app${brand === "jakeimage" ? " quote-app--jakeimage" : ""}`} style={isModal ? undefined : { background: "var(--mesh-bg)" }}>
      {isModal ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 20px", borderBottom: "1px solid rgba(21,88,85,.1)", background: "#fafaf8" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: autosaveStatus === "error" ? "#DC2626" : "#5a7470" }}>
            {autosaveStatus === "saving" ? "저장 중..." : autosaveStatus === "saved" ? "저장됨" : autosaveStatus === "error" ? "저장 실패" : dirty ? "저장 안 된 변경사항 있음" : ""}
          </span>
        </div>
      ) : null}
      {isModal && workflowRunId ? (
        <div style={{ padding: "10px 20px 0" }}>
          <ActiveMissionBar workflowRunId={workflowRunId} />
        </div>
      ) : null}
      {/* 이 그리드의 minmax() 하한이 곧 "이 아래로는 못 줄어든다"는 실제 폭 마지노선이다.
          기존 440/560px(lg) 하한은 /quote 풀페이지처럼 뷰포트를 통째로 쓰는 화면 기준이었는데,
          같은 컴포넌트가 워크스페이스 채팅 분할(고정 70% 폭, DynamicWorkspace.tsx가 overflow:hidden
          으로 감싸 넘치면 스크롤 없이 그냥 잘려 보인다) 안에서도 mode="modal"로 그대로 쓰이면서
          실제 폭이 하한보다 좁아져 미리보기 열이 잘려 보이는 문제가 있었다(2026-08-30 사용자
          리포트). 미리보기 안쪽 A4 페이지는 이미 ResizeObserver로 실제 폭에 맞춰 scale을 다시
          계산하므로(위 previewShellRef 참고) 그리드 하한만 낮춰도 잘림 없이 계속 축소된다 —
          /quote 풀페이지는 폭이 넉넉해 fr 비율로 그대로 채워지므로 시각적으로 변화가 없다. */}
      <section className={`mx-auto grid max-w-[1500px] min-w-0 gap-6 px-4 py-5 sm:px-6 lg:py-8 ${isModal ? "md:grid-cols-[minmax(300px,0.85fr)_minmax(340px,1.15fr)]" : "md:grid-cols-[minmax(340px,0.82fr)_minmax(420px,1.18fr)] lg:grid-cols-[minmax(440px,0.9fr)_minmax(560px,1.1fr)]"}`}>
        <div className="min-w-0 space-y-5">
          <header className="rounded-lg border border-[var(--quote-ink)]/15 bg-white px-5 py-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--quote-ink)]">
                {cfg.label}
              </span>
              <button
                type="button"
                onClick={toggleBrand}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition hover:-translate-y-0.5"
                style={{ borderColor: "var(--quote-ink)", color: "var(--quote-ink)" }}
              >
                <RefreshCcw size={13} />
                {brand === "photoclinic" ? "제이크이미지연구소로 전환" : "포토클리닉으로 전환"}
              </button>
            </div>
            <Field label="견적서 제목">
              <textarea
                value={quoteTitle}
                onChange={(event) => setQuoteTitle(event.target.value)}
                placeholder={cfg.defaultQuoteTitle}
                rows={2}
                style={{resize:"none", fontFamily:"'Nanum Myeongjo', serif", lineHeight:"1.6", width:"100%", padding:"8px 12px", border:"1px solid #d8d0c4", borderRadius:"6px", fontSize:"14px"}}
              />
            </Field>
          </header>

          <Panel
            title="고객 정보"
            icon={<UserRound size={18} />}
            collapsible={isDesktopWindow}
            defaultOpen
            summary={customer.hospitalName || "미입력"}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={cfg.entityLabel}>
                <input
                  value={customer.hospitalName}
                  onChange={(event) => updateCustomer("hospitalName", event.target.value)}
                  placeholder={cfg.entityPlaceholder}
                />
              </Field>
              <Field label="담당자명">
                <input
                  value={customer.managerName}
                  onChange={(event) => updateCustomer("managerName", event.target.value)}
                  placeholder="정연호"
                />
              </Field>
              <Field label="연락처">
                <input
                  value={customer.phone}
                  onChange={(event) => updateCustomer("phone", event.target.value)}
                  placeholder="010-0000-0000"
                />
              </Field>
              <Field label="이메일">
                <input
                  type="email"
                  value={customer.email}
                  onChange={(event) => updateCustomer("email", event.target.value)}
                  placeholder={cfg.emailPlaceholder}
                />
              </Field>
              <Field label="견적일">
                <input
                  type="date"
                  value={customer.quoteDate}
                  onChange={(event) => updateCustomer("quoteDate", event.target.value)}
                />
              </Field>
              <Field label="견적 유효기간">
                <input
                  type="date"
                  value={customer.validUntil}
                  onChange={(event) => updateCustomer("validUntil", event.target.value)}
                />
              </Field>
              <Field label="촬영 예정일">
                <input
                  type="date"
                  value={customer.shootDate}
                  onChange={(event) => updateCustomer("shootDate", event.target.value)}
                />
              </Field>
              <Field label="견적번호">
                <input
                  value={customer.quoteNumber}
                  onChange={(event) => updateCustomer("quoteNumber", event.target.value)}
                />
              </Field>
            </div>
          </Panel>

          {brand === "photoclinic" && (
            <Panel
              title="패키지 선택"
              icon={<WalletCards size={18} />}
              collapsible={isDesktopWindow}
              defaultOpen
              summary={selectedPackage?.name ?? "패키지 선택 안 함"}
            >
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPackageId(null)}
                  className={`package-button ${selectedPackageId === null ? "package-button-active" : ""}`}
                >
                  <span>
                    <strong>패키지 선택 안 함</strong>
                    <small>단일항목 또는 추가 옵션만으로 견적 구성</small>
                  </span>
                  <b>{won(0)}</b>
                </button>
                {packages.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setOliviaSelection("quote-item", `package:${item.id}`);
                      setSelectedPackageId(item.id);
                    }}
                    className={`package-button ${
                      selectedPackageId === item.id ? "package-button-active" : ""
                    }`}
                    style={{ outline: selectedOliviaEntityId === `package:${item.id}` ? "2px solid rgba(21,88,85,.45)" : undefined }}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.composition}</small>
                    </span>
                    <b>{won(item.price)}</b>
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="단일항목 선택">
            <div className="single-item-grid">
              {singleItems.map((item) => {
                const isSelected = selectedSingleItemIds.includes(item.id);

                if (brand === "jakeimage") {
                  return (
                    <div key={item.id} className="jake-single-item-row">
                      <button
                        type="button"
                        onClick={() => {
                          setOliviaSelection("quote-item", item.id);
                          toggleSingleItem(item.id);
                        }}
                        className={`single-item-button ${isSelected ? "single-item-button-active" : ""}`}
                        style={{ outline: selectedOliviaEntityId === item.id ? "2px solid rgba(21,88,85,.45)" : undefined }}
                        aria-pressed={isSelected}
                      >
                        <span>{item.name}</span>
                        <strong>{isSelected ? "선택됨" : "탭하여 선택"}</strong>
                      </button>
                      {isSelected ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9,]*"
                          value={singleItemAmounts[item.id] ? amount(singleItemAmounts[item.id]) : ""}
                          onChange={(event) => updateSingleItemAmount(item.id, event.target.value)}
                          placeholder="금액 직접 입력"
                          className="jake-single-item-amount"
                        />
                      ) : null}
                    </div>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setOliviaSelection("quote-item", item.id);
                      toggleSingleItem(item.id);
                    }}
                    className={`single-item-button ${isSelected ? "single-item-button-active" : ""}`}
                    style={{ outline: selectedOliviaEntityId === item.id ? "2px solid rgba(21,88,85,.45)" : undefined }}
                    aria-pressed={isSelected}
                  >
                    <span>{item.name}</span>
                    <strong>{won(item.price)}</strong>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="추가 옵션"
            collapsible={isDesktopWindow}
            defaultOpen={false}
            summary={(() => {
              const activeOptionCount =
                [profileCount > 0, stagedCount > 0, combinedProfileStagedCount > 0, floorCount > 0, largeHospital, droneCount > 0].filter(Boolean).length +
                customItems.length;
              return activeOptionCount > 0 ? `${activeOptionCount}개` : "없음";
            })()}
          >
            <div className="grid gap-3">
              {brand === "photoclinic" && (
                <>
                  <div onPointerDown={() => setOliviaSelection("quote-item", "profile_shoot")}>
                    <QuantityField
                      label="프로필 인원 추가"
                      unit="인"
                      price="1인당 250,000원"
                      value={profileCount}
                      onChange={setProfileCount}
                    />
                  </div>
                  <div onPointerDown={() => setOliviaSelection("quote-item", "staged_shoot")}>
                    <QuantityField
                      label="연출 인원 추가"
                      unit="인"
                      price="1인당 450,000원"
                      value={stagedCount}
                      onChange={setStagedCount}
                    />
                  </div>
                  <QuantityField
                    label="프로필/연출 추가"
                    unit="인"
                    price="1인당 650,000원"
                    value={combinedProfileStagedCount}
                    onChange={setCombinedProfileStagedCount}
                  />
                  <QuantityField
                    label="인테리어 층수 추가"
                    unit="층"
                    price="1층당 250,000원"
                    value={floorCount}
                    onChange={setFloorCount}
                  />
                  <label className="flex items-center justify-between rounded-lg border border-[#ddd5c9] bg-[#faf7f2] px-4 py-3">
                    <span>
                      <span className="block text-sm font-bold text-[var(--quote-ink)]">
                        {cfg.largeScaleLabel}
                      </span>
                      <span className="text-xs text-[#6f6961]">750,000원</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={largeHospital}
                      onChange={(event) => setLargeHospital(event.target.checked)}
                      className="h-5 w-5 accent-[var(--quote-ink)]"
                    />
                  </label>
                  <QuantityField
                    label="드론촬영"
                    unit="회"
                    price="1회당 500,000원"
                    value={droneCount}
                    onChange={setDroneCount}
                  />
                </>
              )}
              <div className="custom-items-box">
                <div className="custom-items-head">
                  <div>
                    <strong>{cfg.customItemsLabel}</strong>
                    <span>항목명과 금액을 직접 입력합니다.</span>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={addCustomItem}
                    aria-label={`${cfg.customItemsLabel} 추가`}
                    title={`${cfg.customItemsLabel} 추가`}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {customItems.length === 0 ? (
                  <p className="empty-text">추가된 {cfg.customItemsLabel}이 없습니다.</p>
                ) : (
                  <div className="grid gap-3">
                    {customItems.map((item, index) => (
                      <div key={item.id} className="custom-item-editor">
                        <div className="item-row">
                          <div className="item-reorder-buttons">
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => moveCustomItem(item.id, "up")}
                              disabled={index === 0}
                              aria-label="위로 이동"
                              title="위로 이동"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => moveCustomItem(item.id, "down")}
                              disabled={index === customItems.length - 1}
                              aria-label="아래로 이동"
                              title="아래로 이동"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <input
                            value={item.name}
                            onChange={(event) =>
                              updateCustomItem(item.id, "name", event.target.value)
                            }
                            placeholder="예: 영상촬영"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9,]*"
                            value={item.amount > 0 ? amount(item.amount) : ""}
                            onChange={(event) =>
                              updateCustomItem(
                                item.id,
                                "amount",
                                numberValue(event.target.value)
                              )
                            }
                            placeholder="금액"
                          />
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => removeCustomItem(item.id)}
                            aria-label="삭제"
                            title="삭제"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <textarea
                          value={item.detail}
                          onChange={(event) =>
                            updateCustomItem(item.id, "detail", event.target.value)
                          }
                          placeholder="서브항목 메모 예: 4K 카메라 2대, 삼각대, 프롬프터 등"
                          rows={2}
                        />
                        <label className="custom-item-discount-toggle">
                          <input
                            type="checkbox"
                            checked={item.discountable !== false}
                            onChange={(event) =>
                              updateCustomItem(item.id, "discountable", event.target.checked)
                            }
                          />
                          할인 적용 (외주 헤어메이크업·모델료 등은 해제)
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="custom-items-box">
                <div className="custom-items-head">
                  <div>
                    <strong>서비스 및 혜택</strong>
                    <span>금액 없이 견적서에 표시합니다.</span>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={addBenefitItem}
                    aria-label="서비스 및 혜택 추가"
                    title="서비스 및 혜택 추가"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {benefitItems.length === 0 ? (
                  <p className="empty-text">추가된 서비스 및 혜택이 없습니다.</p>
                ) : (
                  <div className="grid gap-3">
                    {benefitItems.map((item) => (
                      <div key={item.id} className="item-row item-row-service">
                        <input
                          value={item.name}
                          onChange={(event) => updateBenefitItem(item.id, event.target.value)}
                          placeholder="예: 보정본 추가 제공"
                        />
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => removeBenefitItem(item.id)}
                          aria-label="삭제"
                          title="삭제"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="할인 선택">
            <div className="discount-rate-grid">
              {discountRates.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setDiscountRate(rate)}
                  className={`discount-rate-button ${discountRate === rate ? "discount-rate-button-active" : ""}`}
                >
                  <span>{rate === 0 ? "할인 없음" : `${rate}% 할인`}</span>
                  <strong>{rate === 0 ? won(0) : `-${won(Math.round(discountableSubtotal * (rate / 100)))}`}</strong>
                </button>
              ))}
            </div>
          </Panel>

          <Panel
            title="추가할인(절삭)"
            collapsible={isDesktopWindow}
            defaultOpen={false}
            summary={extraDiscount > 0 ? `${amount(extraDiscount)}원` : "없음"}
          >
            <div className="grid gap-3">
              <Field label="추가할인 금액">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  value={extraDiscount > 0 ? amount(extraDiscount) : ""}
                  onChange={(event) => setExtraDiscount(numberValue(event.target.value))}
                  placeholder="예: 40,000"
                />
              </Field>
              <p className="empty-text">
                최종 견적금액에서 직접 차감됩니다. 예: 3,240,000원 → 3,200,000원으로 맞출 때 40,000 입력
              </p>
            </div>
          </Panel>

          <Panel
            title="메모"
            collapsible={isDesktopWindow}
            defaultOpen={false}
            summary={memo.trim() ? "있음" : "없음"}
          >
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="견적서에 함께 남길 메모를 입력하세요."
              rows={4}
            />
          </Panel>

          <Panel title="기존 견적서 PDF 불러오기" icon={<Upload size={18} />}>
            <div className="grid gap-3">
              <input
                ref={quotePdfInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void importQuotePdf(file);
                  }
                }}
              />
              <button
                type="button"
                className="secondary-button w-full"
                onClick={() => quotePdfInputRef.current?.click()}
                disabled={isImportingQuotePdf}
              >
                <Upload size={18} />
                {isImportingQuotePdf ? "PDF 읽는 중" : "기존 견적서 PDF 선택"}
              </button>
              <p className="empty-text">
                텍스트 PDF는 바로 읽고, 이미지형 PDF는 OCR로 읽어 최근 견적 목록에 추가합니다.
              </p>
              {pdfImportMessage ? (
                <div className="rounded-lg border border-[#d8d0c4] bg-white px-4 py-3 text-sm leading-6 text-[var(--quote-ink)]">
                  {pdfImportMessage}
                </div>
              ) : null}
              {manualPdfQuote ? (
                <div className="grid gap-3 rounded-xl border border-[#d8d0c4] bg-[#fffdfa] p-4">
                  <div>
                    <strong className="block text-sm font-extrabold text-[var(--quote-ink)]">
                      PDF 내용 직접 입력
                    </strong>
                    <span className="mt-1 block text-xs leading-5 text-[#6f6961]">
                      OCR이 안 되는 기존 견적서는 핵심 정보만 입력해 계약서를 만들 수 있습니다.
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={cfg.entityLabel}>
                      <input
                        value={manualPdfQuote.hospitalName}
                        onChange={(event) => updateManualPdfQuote("hospitalName", event.target.value)}
                        placeholder={`예: ${cfg.entityPlaceholder}`}
                      />
                    </Field>
                    <Field label="견적번호">
                      <input
                        value={manualPdfQuote.quoteNumber}
                        onChange={(event) => updateManualPdfQuote("quoteNumber", event.target.value)}
                        placeholder="PC-20260531-001"
                      />
                    </Field>
                    <Field label="견적일">
                      <input
                        type="date"
                        value={manualPdfQuote.quoteDate}
                        onChange={(event) => updateManualPdfQuote("quoteDate", event.target.value)}
                      />
                    </Field>
                    <Field label="총 견적금액">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={manualPdfQuote.totalAmount > 0 ? amount(manualPdfQuote.totalAmount) : ""}
                        onChange={(event) => updateManualPdfQuote("totalAmount", event.target.value)}
                        placeholder="예: 5,225,000"
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    className="primary-button w-full"
                    onClick={addManualPdfQuoteToRecent}
                  >
                    <FileText size={18} />
                    입력값으로 계약서 목록에 추가
                  </button>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title={`최근 생성 견적 (최근 ${RECENT_QUOTES_DISPLAY_LIMIT}개 표시 · 전체 이력은 Supabase에 보관)`}>
            {recentQuoteMessage ? (
              <div className="mb-3 rounded-lg border border-[var(--quote-tint-border)] bg-[var(--quote-tint)] px-4 py-3 text-sm font-bold text-[var(--quote-ink)]">
                {recentQuoteMessage}
              </div>
            ) : null}
            {recentQuotes.length === 0 ? (
              <p className="empty-text">PDF 다운로드 또는 계약서 생성을 누르면 최근 견적이 자동 보관됩니다.</p>
            ) : (
              <div className="grid gap-3">
                {recentQuotes.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-xl border border-[#d8d0c4] bg-[#fffdfa] p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="mb-2 inline-flex rounded-full bg-[var(--quote-tint)] px-3 py-1 text-xs font-extrabold text-[var(--quote-ink)]">
                        최근 견적
                      </div>
                      <strong className="block truncate text-base font-extrabold text-[var(--quote-ink)]">
                        {item.hospitalName || `${cfg.entityLabel} 없음`}
                      </strong>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6f6961]">
                        <span>{item.quoteNumber}</span>
                        <span className="text-[#c7bbad]">|</span>
                        <span>{displayDate(item.quoteDate)}</span>
                      </div>
                      <b className="mt-2 block text-lg font-extrabold text-[var(--quote-accent)]">
                        {won(item.totalAmount)}
                      </b>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:w-[172px]">
                      <button
                        type="button"
                        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm font-extrabold text-[var(--quote-ink)] transition hover:-translate-y-0.5 hover:border-[var(--quote-ink)]"
                        onClick={() => loadRecentQuote(item)}
                      >
                        불러오기
                      </button>
                      <button
                        type="button"
                        className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[var(--quote-ink)] bg-[var(--quote-accent)] px-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5"
                        onClick={() => openContractWithQuote(item)}
                      >
                        <FileText size={15} />
                        계약서
                      </button>
                      <button
                        type="button"
                        disabled={publishingQuoteId === item.id}
                        className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[#155855] bg-white px-3 text-sm font-extrabold text-[#155855] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void publishQuoteToPortal(item)}
                      >
                        {publishingQuoteId === item.id ? "공개 중..." : item.status === "published" ? "포털 다시 공개" : "포털 공개"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="선금 / 잔금 비율">
            <div className="grid gap-3">
              <div className="flex gap-2">
                {([100, 70, 50, 30, 0] as number[]).map((rate) => (
                  <button key={rate} type="button" onClick={() => setDepositRate(rate)}
                    className={depositRate === rate ? "deposit-btn active" : "deposit-btn"}>
                    {rate === 0 ? "잔금 100%" : `${rate}%`}
                  </button>
                ))}
              </div>
              <div className="deposit-summary">
                <div className="deposit-row">
                  <span>선금 ({depositRate}%)</span>
                  <strong>{won(Math.round(finalAmount * depositRate / 100))}원</strong>
                </div>
                <div className="deposit-row">
                  <span>잔금 ({100 - depositRate}%)</span>
                  <strong>{won(Math.round(finalAmount * (100 - depositRate) / 100))}원</strong>
                </div>
              </div>
            </div>
          </Panel>

          <div className="action-button-bar">
            <button className="secondary-button" type="button" onClick={handleManualSave} disabled={manualSaving}>
              <Save size={18} />
              {manualSaving ? "저장 중…" : "임시저장 (⌘S)"}
            </button>
            <div style={{ position: "relative", flex: 1, minWidth: 140 }}>
              <button className="primary-button" type="button" onClick={() => setShowDownloadMenu((v) => !v)} style={{ width: "100%" }}>
                <Download size={18} />
                {isGenerating ? "PDF 생성 중" : "다운로드"}
                <ChevronDown size={14} />
              </button>
              {showDownloadMenu && (
                <div style={{
                  position: "absolute", bottom: "100%", left: 0, marginBottom: 4, zIndex: 30,
                  background: "#fff", border: "1px solid rgba(21,88,85,.14)", borderRadius: 10,
                  boxShadow: "0 12px 30px rgba(21,88,85,.14)", minWidth: 140, overflow: "hidden",
                }}>
                  <button
                    type="button"
                    onClick={() => { setShowDownloadMenu(false); void downloadPdf(); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: 0, background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#155855" }}
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDownloadMenu(false); void downloadExcel(); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: 0, borderTop: "1px solid rgba(21,88,85,.08)", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#155855" }}
                  >
                    <FileSpreadsheet size={14} /> Excel
                  </button>
                </div>
              )}
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={handleFinalComplete}
              disabled={completingQuote}
              style={{ background: "#155855" }}
            >
              <CheckCircle2 size={18} />
              {completingQuote ? "최종완료 처리 중…" : "최종완료"}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={goToContract}
              style={{ background: "var(--quote-accent)" }}
            >
              <FileText size={18} />
              고객 승인 후 계약서 생성
            </button>
            <button className="secondary-button" type="button" onClick={resetForm}>
              <RefreshCcw size={18} />
              초기화
            </button>
          </div>
        </div>

        <aside className="min-w-0 md:sticky md:top-4 md:self-start md:max-h-[calc(100vh-32px)] md:overflow-y-auto md:pr-1 lg:top-6 lg:max-h-[calc(100vh-48px)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <p className="text-sm font-bold text-[var(--quote-ink)]">실시간 견적서 미리보기</p>
              <p className="text-xs text-[#797168]">A4 가로형 1페이지 · 100%는 화면 맞춤</p>
            </div>
            <div className="preview-zoom-controls" aria-label="견적서 미리보기 확대 축소">
              <button type="button" onClick={zoomOutPreview} aria-label="미리보기 축소">
                <ZoomOut size={16} />
              </button>
              <button type="button" onClick={resetPreviewZoom} className="zoom-percent" aria-label="미리보기 확대 비율 초기화">
                {previewPercent}%
              </button>
              <button type="button" onClick={zoomInPreview} aria-label="미리보기 확대">
                <ZoomIn size={16} />
              </button>
              <button type="button" onClick={() => setShowFullscreenPreview(true)} aria-label="전체화면 보기">
                <Maximize2 size={16} />
              </button>
            </div>
          </div>

          {showFullscreenPreview && typeof document !== "undefined"
            ? createPortal(quotePreviewShellNode, document.body)
            : quotePreviewShellNode}
        </aside>
      </section>
    </main>
    {isModal && closeConfirmOpen && typeof document !== "undefined" ? createPortal(
      <div className="pcrm-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCloseConfirmOpen(false)}>
        <div style={{ width: "min(420px, calc(100vw - 24px))", background: "#fff", borderRadius: 16, padding: 24 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800, color: "#155855" }}>저장하지 않은 변경사항이 있습니다.</h3>
          <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "#5a7470" }}>계속 작성하시겠습니까, 아니면 저장 후 닫으시겠습니까?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" onClick={() => setCloseConfirmOpen(false)}
              style={{ height: 40, borderRadius: 9, border: "1px solid rgba(21,88,85,.12)", background: "#fff", color: "#155855", fontWeight: 800, cursor: "pointer" }}>
              계속 작성
            </button>
            <button type="button" onClick={async () => { await handleManualSave(); setCloseConfirmOpen(false); onClose?.(); }}
              style={{ height: 40, borderRadius: 9, border: "none", background: "#155855", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
              임시 저장 후 닫기
            </button>
            <button type="button" onClick={() => { setCloseConfirmOpen(false); onClose?.(); }}
              style={{ height: 40, borderRadius: 9, border: "1px solid #DC2626", background: "#FEF2F2", color: "#DC2626", fontWeight: 800, cursor: "pointer" }}>
              저장하지 않고 닫기
            </button>
          </div>
        </div>
      </div>,
      document.body,
    ) : null}
    </>
  );
});

export default QuoteBuilder;

function Panel({
  title,
  icon,
  action,
  children,
  collapsible = false,
  defaultOpen = true,
  summary,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /* OLIVIA OS 1차 작업 지시서 3단계 — 아코디언 4개. collapsible이 false면(기본값) 기존과
     완전히 동일하게(항상 펼침) 동작해서, 이 props를 안 넘기는 다른 Panel 호출부는 전혀
     영향받지 않는다. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /* 접혔을 때 헤더 우측에 보여줄 요약값 — 기존 state를 그대로 읽어 문자열로만 넘긴다. */
  summary?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;

  return (
    <section className="rounded-lg border border-[#ded7cc] bg-white p-4 shadow-sm sm:p-5">
      <div className={isOpen ? "mb-4 flex items-center justify-between gap-3" : "flex items-center justify-between gap-3"}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={isOpen}
            style={{
              display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0,
              background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {isOpen ? <ChevronUp size={14} color="#9a9184" /> : <ChevronDown size={14} color="#9a9184" />}
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--quote-ink)]">
              {icon}
              {title}
            </h2>
            {!isOpen && summary != null ? (
              <span style={{ marginLeft: "auto", paddingLeft: 8, fontSize: 12, fontWeight: 600, color: "#8a8377", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {summary}
              </span>
            ) : null}
          </button>
        ) : (
          <h2 className="flex items-center gap-2 text-base font-bold text-[var(--quote-ink)]">
            {icon}
            {title}
          </h2>
        )}
        {action}
      </div>
      {isOpen ? children : null}
    </section>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function QuantityField({
  label,
  price,
  unit,
  value,
  onChange
}: {
  label: string;
  price: string;
  unit: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="quantity-field">
      <div>
        <strong>{label}</strong>
        <span>{price}</span>
      </div>
      <div className="stepper" aria-label={`${label} 수량`}>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`${label} 줄이기`}
          disabled={value === 0}
        >
          -
        </button>
        <output>
          {value}
          <em>{unit}</em>
        </output>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`${label} 늘리기`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div>
      <span>{icon}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
