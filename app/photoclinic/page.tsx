"use client";

import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import OliviaChat from "@/components/OliviaChat";
import PageHeader from "@/components/PageHeader";
import { createMailingDraft } from "@/lib/mailingQueue";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";
import { uploadWorkflowArtifact } from "@/lib/workflowArtifacts";
import {
  Download,
  Maximize2,
  Plus,
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

type PackageOption = {
  id: string;
  name: string;
  price: number;
  composition: string;
};

type SingleItem = {
  id: string;
  name: string;
  price: number;
};

type CustomItem = {
  id: string;
  name: string;
  detail: string;
  amount: number;
};

type BenefitItem = {
  id: string;
  name: string;
};

type ContractQuoteItem = {
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
  formState?: {
    customer: CustomerInfo;
    quoteTitle: string;
    selectedPackageId: string | null;
    selectedSingleItemIds: string[];
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
  };
};

type CustomerInfo = {
  hospitalName: string;
  managerName: string;
  phone: string;
  email: string;
  quoteDate: string;
  validUntil: string;
  shootDate: string;
  quoteNumber: string;
};

type ImportedPdfQuote = {
  hospitalName: string;
  quoteNumber: string;
  quoteDate: string;
  totalAmount: number;
  rawText: string;
};

const packages: PackageOption[] = [
  {
    id: "standard",
    name: "스탠다드",
    price: 1350000,
    composition: "프로필 + 연출사진"
  },
  {
    id: "premium",
    name: "프리미엄",
    price: 2000000,
    composition: "프로필 + 연출사진 + 인테리어"
  },
  {
    id: "premium-plus-1",
    name: "프리미엄 플러스 1",
    price: 3600000,
    composition: "프로필 + 연출사진 + 인테리어 + 포인트영상"
  },
  {
    id: "premium-plus-2",
    name: "프리미엄 플러스 2",
    price: 4500000,
    composition: "프로필 + 연출사진 + 인테리어 + 브랜드필름"
  }
];

const singleItems: SingleItem[] = [
  {
    id: "studio-profile",
    name: "프로필촬영",
    price: 350000
  },
  {
    id: "directing",
    name: "연출 촬영",
    price: 1200000
  },
  {
    id: "interior",
    name: "인테리어 촬영",
    price: 750000
  },
  {
    id: "brand-film",
    name: "브랜드필름",
    price: 2800000
  },
  {
    id: "point-video",
    name: "포인트영상",
    price: 1800000
  }
];

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

const createQuoteNumber = (sequence = 1) => {
  const date = todayValue().replaceAll("-", "");
  return `PC-${date}-${String(sequence).padStart(3, "0")}`;
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
  formState: row.form_state ?? undefined,
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

export default function QuoteBuilder() {
  const previewRef = useRef<HTMLDivElement>(null);
  const previewShellRef = useRef<HTMLDivElement>(null);
  const quotePdfInputRef = useRef<HTMLInputElement>(null);
  const [customer, setCustomer] = useState<CustomerInfo>(() => initialCustomer());
  const [quoteTitle, setQuoteTitle] = useState("포토클리닉 브랜드사진 견적서");
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(packages[0].id);
  const [selectedSingleItemIds, setSelectedSingleItemIds] = useState<string[]>([]);
  const [profileCount, setProfileCount] = useState(0);
  const [stagedCount, setStagedCount] = useState(0);
  const [combinedProfileStagedCount, setCombinedProfileStagedCount] = useState(0);
  const [floorCount, setFloorCount] = useState(0);
  const [largeHospital, setLargeHospital] = useState(false);
  const [droneCount, setDroneCount] = useState(0);
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [benefitItems, setBenefitItems] = useState<BenefitItem[]>([]);
  const [discountRate, setDiscountRate] = useState(0);
  const [extraDiscount, setExtraDiscount] = useState(0);
  const [memo, setMemo] = useState("");
  const [depositRate, setDepositRate] = useState(50);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImportingQuotePdf, setIsImportingQuotePdf] = useState(false);
  const [pdfImportMessage, setPdfImportMessage] = useState("");
  const [manualPdfQuote, setManualPdfQuote] = useState<ImportedPdfQuote | null>(null);
  const [recentQuoteMessage, setRecentQuoteMessage] = useState("");
  const [basePreviewScale, setBasePreviewScale] = useState(0.48);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [showFullscreenPreview, setShowFullscreenPreview] = useState(false);
  const [fullscreenPreviewScale, setFullscreenPreviewScale] = useState(1);
  const [recentQuotes, setRecentQuotes] = useState<ContractQuoteData[]>([]);
  const [todayQuoteNumbers, setTodayQuoteNumbers] = useState<string[]>([]);
  const previewScale = Number((basePreviewScale * previewZoom).toFixed(3));
  const previewPercent = Math.round(previewZoom * 100);

  useEffect(() => {
    const todayPrefix = `PC-${todayValue().replaceAll("-", "")}-`;
    Promise.all([
      fetch(`/api/quotes?limit=${RECENT_QUOTES_DISPLAY_LIMIT}`).then((res) => res.json()),
      fetch(`/api/quotes?prefix=${encodeURIComponent(todayPrefix)}`).then((res) => res.json()),
    ])
      .then(([recentRes, todayRes]) => {
        if (recentRes?.ok) setRecentQuotes((recentRes.quotes ?? []).map(rowToContractQuoteData));
        if (todayRes?.ok) setTodayQuoteNumbers(todayRes.quoteNumbers ?? []);
      })
      .catch(() => {});
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
      const nextScale = Math.min(1, Math.max(0.12, availableWidth / 1123));
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
  }, []);

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
    const todayPrefix = `PC-${date}-`;
    const usedNumbers = todayQuoteNumbers
      .filter((quoteNumber) => quoteNumber.startsWith(todayPrefix))
      .map((quoteNumber) => Number(quoteNumber.replace(todayPrefix, "")))
      .filter((value) => Number.isFinite(value));
    const nextSequence = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;

    return createQuoteNumber(nextSequence);
  };

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedPackageId) ?? null,
    [selectedPackageId]
  );

  const selectedSingleItems = useMemo(
    () => singleItems.filter((item) => selectedSingleItemIds.includes(item.id)),
    [selectedSingleItemIds]
  );

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
        name: "병원급 규모 추가",
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
  }, [combinedProfileStagedCount, droneCount, floorCount, largeHospital, profileCount, stagedCount]);

  const packageTotal = selectedPackage?.price ?? 0;
  const singleItemsTotal = selectedSingleItems.reduce((sum, item) => sum + item.price, 0);
  const optionsTotal = optionItems.reduce((sum, item) => sum + item.amount, 0);
  const customTotal = customItems.reduce((sum, item) => sum + item.amount, 0);
  const visibleCustomItems = customItems.filter((item) => item.name || item.detail || item.amount > 0);
  const visibleBenefitItems = benefitItems.filter((item) => item.name);
  const contentSubtotal = packageTotal + singleItemsTotal + optionsTotal + customTotal;
  const rateDiscountAmount = Math.round(contentSubtotal * (discountRate / 100));
  const extraDiscountAmount = Math.min(Math.max(Number(extraDiscount) || 0, 0), Math.max(contentSubtotal - rateDiscountAmount, 0));
  const discountTotal = rateDiscountAmount + extraDiscountAmount;
  const rawSupplyAmount = Math.max(contentSubtotal - discountTotal, 0);
  const supplyAmount = Math.floor(rawSupplyAmount / 10000) * 10000;
  const vat = Math.round(supplyAmount * 0.1);
  const finalAmount = supplyAmount + vat;

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
      { id: crypto.randomUUID(), name: "", detail: "", amount: 0 }
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
    value: string | number
  ) => {
    setCustomItems((items) =>
      items.map((item) => (item.id === id ? { ...item, [key]: value } : item))
    );
  };

  const removeCustomItem = (id: string) => {
    setCustomItems((items) => items.filter((item) => item.id !== id));
  };

  const updateBenefitItem = (id: string, value: string) => {
    setBenefitItems((items) =>
      items.map((item) => (item.id === id ? { ...item, name: value } : item))
    );
  };

  const removeBenefitItem = (id: string) => {
    setBenefitItems((items) => items.filter((item) => item.id !== id));
  };

  const resetForm = () => {
    setCustomer({
      ...initialCustomer(),
      quoteNumber: createNextQuoteNumber()
    });
    setQuoteTitle("포토클리닉 브랜드사진 견적서");
    setSelectedPackageId(packages[0].id);
    setSelectedSingleItemIds([]);
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
    setMemo("");
  };

  const buildContractQuoteData = (): ContractQuoteData => {
    const visibleItems: ContractQuoteItem[] = [
      ...(selectedPackage && selectedPackage.price > 0 ? [{
        name: `${selectedPackage.name} 패키지`,
        detail: selectedPackage.composition,
        unitPrice: selectedPackage.price,
        qty: 1,
        subtotal: selectedPackage.price,
        note: "촬영 패키지"
      }] : []),
      ...selectedSingleItems.map((item) => ({
        name: item.name,
        detail: "단일 촬영 항목",
        unitPrice: item.price,
        qty: 1,
        subtotal: item.price,
        note: "단일항목"
      })),
      ...optionItems.map((item) => ({
        name: item.name,
        detail: item.detail,
        unitPrice: item.amount,
        qty: 1,
        subtotal: item.amount,
        note: "추가 옵션"
      })),
      ...visibleCustomItems.map((item) => ({
        name: item.name,
        detail: item.detail,
        unitPrice: item.amount,
        qty: 1,
        subtotal: item.amount,
        note: "기타"
      })),
      ...visibleBenefitItems.map((item) => ({
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
        depositRate
      }
    };
  };

  const saveRecentQuote = async (data: ContractQuoteData): Promise<ContractQuoteData | null> => {
    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "서버 오류");

      const savedData = { ...data, id: body.id ?? data.id, savedAt: body.createdAt ?? data.savedAt };
      setRecentQuotes((current) => [
        savedData,
        ...current.filter((quote) => quote.quoteNumber !== savedData.quoteNumber),
      ].slice(0, RECENT_QUOTES_DISPLAY_LIMIT));

      const todayPrefix = `PC-${todayValue().replaceAll("-", "")}-`;
      if (data.quoteNumber.startsWith(todayPrefix)) {
        setTodayQuoteNumbers((prev) => Array.from(new Set([...prev, data.quoteNumber])));
      }
      return savedData;
    } catch (error) {
      setRecentQuoteMessage(`⚠️ 견적 저장 실패 — ${error instanceof Error ? error.message : "네트워크 오류"}`);
      return null;
    }
  };

  const loadRecentQuote = (data: ContractQuoteData) => {
    if (data.formState) {
      setCustomer(data.formState.customer);
      setQuoteTitle(data.formState.quoteTitle);
      setSelectedPackageId(data.formState.selectedPackageId);
      setSelectedSingleItemIds(data.formState.selectedSingleItemIds);
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
      setQuoteTitle(data.title || "포토클리닉 브랜드사진 견적서");
      setSelectedPackageId(null);
      setSelectedSingleItemIds([]);
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
            id: crypto.randomUUID(),
            name: item.name,
            detail: item.detail,
            amount: item.subtotal
          }))
      );
      setBenefitItems(
        data.items
          .filter((item) => item.subtotal === 0)
          .map((item) => ({ id: crypto.randomUUID(), name: item.name }))
      );
      setDiscountRate(0);
      setExtraDiscount(data.discountAmount || 0);
      setMemo(data.memos || "");
    }

    setRecentQuoteMessage("선택한 견적서를 입력 폼에 불러왔습니다.");
  };

  const openContractWithQuote = (data: ContractQuoteData) => {
    const { formState, ...contractPayload } = data;
    const encoded = encodeURIComponent(JSON.stringify(contractPayload));
    window.open(`/contract?data=${encoded}`, "_blank");
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

  const downloadPdf = async () => {
    if (!previewRef.current || isGenerating) return;
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
      subject: `[포토클리닉] ${snapshot.hospitalName} 촬영 견적서`,
      body: `안녕하세요${snapshot.contactName ? `, ${snapshot.contactName} 담당자님` : ""}.\n\n포토클리닉입니다.\n이번 촬영 관련 견적서를 첨부 파일로 보내드립니다.\n아래 촬영 구성을 확인하시고, 궁금하신 점은 편하게 연락 주시기 바랍니다.\n\n[촬영 구성]\n${shootingLines || "• 별도 협의"}\n\n견적서는 ${snapshot.validUntil}까지 유효합니다.\n계약 확정 시 선금 입금을 완료하시면 촬영 일정이 확정됩니다.\n\n감사합니다.\n포토클리닉 드림`,
    });

    const pdfWindow = window.open("", "_blank");

    const writeGeneratingWindow = () => {
      if (!pdfWindow) return;

      pdfWindow.document.open();
      pdfWindow.document.write(`
        <!doctype html>
        <html lang="ko">
          <head>
            <title>포토클리닉 견적서 생성 중</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
                background: #f0f4f2;
                color: #155855;
              }
              .box {
                text-align: center;
                padding: 32px;
                border-radius: 18px;
                background: #fff;
                box-shadow: 0 18px 50px rgba(21, 88, 85, 0.12);
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
            <title>포토클리닉 견적서 생성 실패</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
                background: #f0f4f2;
                color: #222;
              }
              .box {
                max-width: 520px;
                margin: 24px;
                padding: 28px;
                border-radius: 18px;
                background: #fff;
                box-shadow: 0 18px 50px rgba(21, 88, 85, 0.12);
              }
              strong { display: block; margin-bottom: 10px; color: #155855; font-size: 18px; }
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

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      await new Promise((resolve) => window.requestAnimationFrame(resolve));

      const canvas = await html2canvas(captureTarget, {
        scale: 2,
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

      const hospital = customer.hospitalName.trim() || "포토클리닉";
      const fileName = `${hospital}_포토클리닉_견적서_${customer.quoteDate}.pdf`;
      const pdfBlob = pdf.output("blob");
      const pageParams = new URLSearchParams(window.location.search);
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
      pdf.save(fileName);

      if (pdfWindow) {
        pdfWindow.close();
      }
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error("PDF generation failed", error);
      writeErrorWindow(message);
    } finally {
      if (captureRoot) {
        captureRoot.remove();
      }
      setIsGenerating(false);
    }
  };

  return (
    <>
    <PageHeader title="Quote Builder" />
    <main className="min-h-screen text-[#222222]" style={{ background: "var(--mesh-bg)" }}>
      <section className="mx-auto grid max-w-[1500px] min-w-0 gap-6 px-4 py-5 sm:px-6 md:grid-cols-[minmax(340px,0.82fr)_minmax(420px,1.18fr)] lg:grid-cols-[minmax(440px,0.9fr)_minmax(560px,1.1fr)] lg:py-8">
        <div className="min-w-0 space-y-5">
          <header className="rounded-lg border border-[#155855]/15 bg-white px-5 py-5 shadow-sm">
            <Field label="견적서 제목">
              <textarea
                value={quoteTitle}
                onChange={(event) => setQuoteTitle(event.target.value)}
                placeholder="포토클리닉 브랜드사진 견적서"
                rows={2}
                style={{resize:"none", fontFamily:"'Nanum Myeongjo', serif", lineHeight:"1.6", width:"100%", padding:"8px 12px", border:"1px solid #d8d0c4", borderRadius:"6px", fontSize:"14px"}}
              />
            </Field>
          </header>

          <Panel title="고객 정보" icon={<UserRound size={18} />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="병원명">
                <input
                  value={customer.hospitalName}
                  onChange={(event) => updateCustomer("hospitalName", event.target.value)}
                  placeholder="포토클리닉"
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
                  placeholder="photoclnic@gmail.com"
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

          <Panel title="패키지 선택" icon={<WalletCards size={18} />}>
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
                  onClick={() => setSelectedPackageId(item.id)}
                  className={`package-button ${
                    selectedPackageId === item.id ? "package-button-active" : ""
                  }`}
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

          <Panel title="단일항목 선택">
            <div className="single-item-grid">
              {singleItems.map((item) => {
                const isSelected = selectedSingleItemIds.includes(item.id);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleSingleItem(item.id)}
                    className={`single-item-button ${isSelected ? "single-item-button-active" : ""}`}
                    aria-pressed={isSelected}
                  >
                    <span>{item.name}</span>
                    <strong>{won(item.price)}</strong>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="추가 옵션">
            <div className="grid gap-3">
              <QuantityField
                label="프로필 인원 추가"
                unit="인"
                price="1인당 250,000원"
                value={profileCount}
                onChange={setProfileCount}
              />
              <QuantityField
                label="연출 인원 추가"
                unit="인"
                price="1인당 450,000원"
                value={stagedCount}
                onChange={setStagedCount}
              />
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
                  <span className="block text-sm font-bold text-[#155855]">
                    병원급 규모 추가
                  </span>
                  <span className="text-xs text-[#6f6961]">750,000원</span>
                </span>
                <input
                  type="checkbox"
                  checked={largeHospital}
                  onChange={(event) => setLargeHospital(event.target.checked)}
                  className="h-5 w-5 accent-[#155855]"
                />
              </label>
              <QuantityField
                label="드론촬영"
                unit="회"
                price="1회당 500,000원"
                value={droneCount}
                onChange={setDroneCount}
              />
              <div className="custom-items-box">
                <div className="custom-items-head">
                  <div>
                    <strong>기타 항목</strong>
                    <span>항목명과 금액을 직접 입력합니다.</span>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={addCustomItem}
                    aria-label="기타 항목 추가"
                    title="기타 항목 추가"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {customItems.length === 0 ? (
                  <p className="empty-text">추가된 기타 항목이 없습니다.</p>
                ) : (
                  <div className="grid gap-3">
                    {customItems.map((item) => (
                      <div key={item.id} className="custom-item-editor">
                        <div className="item-row">
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
                  <strong>{rate === 0 ? won(0) : `-${won(Math.round(contentSubtotal * (rate / 100)))}`}</strong>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="추가할인(절삭)">
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

          <Panel title="메모">
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
                <div className="rounded-lg border border-[#d8d0c4] bg-white px-4 py-3 text-sm leading-6 text-[#155855]">
                  {pdfImportMessage}
                </div>
              ) : null}
              {manualPdfQuote ? (
                <div className="grid gap-3 rounded-xl border border-[#d8d0c4] bg-[#fffdfa] p-4">
                  <div>
                    <strong className="block text-sm font-extrabold text-[#155855]">
                      PDF 내용 직접 입력
                    </strong>
                    <span className="mt-1 block text-xs leading-5 text-[#6f6961]">
                      OCR이 안 되는 기존 견적서는 핵심 정보만 입력해 계약서를 만들 수 있습니다.
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="병원명">
                      <input
                        value={manualPdfQuote.hospitalName}
                        onChange={(event) => updateManualPdfQuote("hospitalName", event.target.value)}
                        placeholder="예: 포토클리닉"
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
              <div className="mb-3 rounded-lg border border-[#c8ddd9] bg-[#eaf4f2] px-4 py-3 text-sm font-bold text-[#155855]">
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
                      <div className="mb-2 inline-flex rounded-full bg-[#eaf4f2] px-3 py-1 text-xs font-extrabold text-[#155855]">
                        최근 견적
                      </div>
                      <strong className="block truncate text-base font-extrabold text-[#155855]">
                        {item.hospitalName || "병원명 없음"}
                      </strong>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6f6961]">
                        <span>{item.quoteNumber}</span>
                        <span className="text-[#c7bbad]">|</span>
                        <span>{displayDate(item.quoteDate)}</span>
                      </div>
                      <b className="mt-2 block text-lg font-extrabold text-[#e85d2c]">
                        {won(item.totalAmount)}
                      </b>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:w-[172px]">
                      <button
                        type="button"
                        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm font-extrabold text-[#155855] transition hover:-translate-y-0.5 hover:border-[#155855]"
                        onClick={() => loadRecentQuote(item)}
                      >
                        불러오기
                      </button>
                      <button
                        type="button"
                        className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[#155855] bg-[#e85d2c] px-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5"
                        onClick={() => openContractWithQuote(item)}
                      >
                        <FileText size={15} />
                        계약서
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
                {([100, 70, 50, 30] as number[]).map((rate) => (
                  <button key={rate} type="button" onClick={() => setDepositRate(rate)}
                    className={depositRate === rate ? "deposit-btn active" : "deposit-btn"}>
                    {rate}%
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
            <button className="primary-button" type="button" onClick={downloadPdf}>
              <Download size={18} />
              {isGenerating ? "PDF 생성 중" : "PDF 다운로드"}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={goToContract}
              style={{ background: "#E85D2C" }}
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
              <p className="text-sm font-bold text-[#155855]">실시간 견적서 미리보기</p>
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

          <div
            className={`preview-shell${showFullscreenPreview ? " preview-shell--fullscreen" : ""}`}
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
              style={{ transform: `scale(${previewScale})` }}
            >
              <aside className="brand-rail">
                <div className="rail-slogan" style={{fontFamily:"'Nanum Myeongjo', serif"}}>
                  <p>브랜드를 담습니다.</p>
                  <p>정직하고,</p>
                  <p>자연스럽게.</p>
                </div>
                <div className="rail-address">
                  <span>TO.</span>
                  <strong>{customer.hospitalName || "병원명"}</strong>
                  <small>{customer.managerName || "담당자"}</small>
                </div>
                <div className="rail-notice">
                  <strong>결제 조건</strong>
                  <span>선금 50%, 잔금 50% 기준</span>
                  <span>세부 조건은 상호 협의 가능</span>
                </div>
                <div className="rail-notice">
                  <strong>포토클리닉</strong>
                  <span>제이크이미지연구소</span>
                  <span>병원 전문 브랜드 촬영</span>
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
                    {quoteTitle || "포토클리닉 브랜드사진 견적서"}
                  </h2>
                </header>

                <section className="client-strip">
                  <Info label="병원명" value={customer.hospitalName || "-"} />
                  <Info label="담당자명" value={customer.managerName || "-"} />
                  <Info label="연락처" value={customer.phone || "-"} />
                  <Info label="이메일" value={customer.email || "-"} />
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
                          <td>{amount(item.price)}</td>
                          <td>{amount(item.price)}</td>
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
                            {(selectedPackage ? 1 : 0) + selectedSingleItems.length + optionItems.length + index + 1}. {item.name || "기타 항목"}
                            {item.detail ? <small>- {item.detail}</small> : null}
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
                    <div>
                      <strong>선금{depositRate}%</strong>
                      <span>{amount(Math.round(finalAmount * depositRate / 100))}</span>
                    </div>
                    <div>
                      {depositRate < 100 && <><strong>잔금{100-depositRate}%</strong>
                      <span>{amount(Math.round(finalAmount * (100-depositRate) / 100))}</span></>}
                    </div>
                    <p>세부 결제 조건은 상호 협의에 따라 조정될 수 있습니다.</p>
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
                      src="/assets/photoclinic-logo.png?v=3"
                      alt="PHOTO CLINIC"
                      className="brand-logo-image"
                    />
                    <p>제이크이미지연구소 · 병원 전문 브랜드 촬영</p>
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
        </aside>
      </section>
      <OliviaChat
        pageContext="견적서 작성 페이지"
        contextData={{
          병원명: customer.hospitalName || "미입력",
          담당자: customer.managerName || "미입력",
        }}
      />
    </main>
    </>
  );
}

function Panel({
  title,
  icon,
  action,
  children
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#ded7cc] bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-[#155855]">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
