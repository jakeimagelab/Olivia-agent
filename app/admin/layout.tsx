import type { Metadata } from "next";
import AdminShell from "@/components/admin/AdminShell";
import "./admin.css";

export const metadata: Metadata = {
  title: "Olivia Admin | 포토클리닉",
  description: "포토클리닉 촬영 운영과 고객 관리를 위한 Olivia 관리자 콘솔",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
