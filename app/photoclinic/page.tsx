"use client";

import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Plus,
  RefreshCcw,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
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
