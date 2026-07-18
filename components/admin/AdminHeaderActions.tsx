"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CalendarPlus, ChevronDown, NotebookPen, Plus, UserPlus, X } from "lucide-react";

type NotificationItem = { id: string; kind: string; title: string; subtitle: string; href: string };

export default function AdminHeaderActions() {
  const [panel, setPanel] = useState<"notifications" | "quick" | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/notifications", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setNotifications(data.items || []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setPanel(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setPanel(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, []);

  return (
    <div ref={rootRef} className="oa-header-actions">
      <div className="oa-header-action-wrap">
        <button className="oa-header-action-button" type="button" aria-label="알림 보기" aria-expanded={panel === "notifications"} onClick={() => setPanel((current) => current === "notifications" ? null : "notifications")}>
          <Bell size={17} strokeWidth={1.8}/>{notifications.length ? <span className="oa-header-action-button__dot"/> : null}
        </button>
        {panel === "notifications" ? <div className="oa-header-popover oa-header-popover--notifications">
          <header><div><span>NOTIFICATIONS</span><h2>확인할 알림</h2></div><button type="button" onClick={() => setPanel(null)} aria-label="알림 닫기"><X size={15}/></button></header>
          <div className="oa-header-notification-list">
            {loading ? <p>알림을 확인하고 있습니다.</p> : notifications.length ? notifications.map((item) => <Link key={`${item.kind}-${item.id}`} href={item.href} onClick={() => setPanel(null)}><span>{item.kind}</span><strong>{item.title}</strong><small>{item.subtitle}</small></Link>) : <p>현재 확인할 새 알림이 없습니다.</p>}
          </div>
          <Link className="oa-header-popover__footer" href="/admin/dashboard/home#olivia-assistant" onClick={() => setPanel(null)}>올리비아 업무 전체 보기 <span>↗</span></Link>
        </div> : null}
      </div>

      <div className="oa-header-action-wrap">
        <button className="oa-header-quick-trigger" type="button" aria-expanded={panel === "quick"} onClick={() => setPanel((current) => current === "quick" ? null : "quick")}>
          <Plus size={15} strokeWidth={1.9}/><span>빠른 실행</span><ChevronDown size={13} strokeWidth={1.7}/>
        </button>
        {panel === "quick" ? <div className="oa-header-popover oa-header-popover--quick">
          <span className="oa-header-popover__eyebrow">QUICK START</span>
          <Link href="/calendar" onClick={() => setPanel(null)}><i><CalendarPlus size={16}/></i><div><strong>일정 추가</strong><small>촬영과 미팅 일정을 등록합니다.</small></div></Link>
          <Link href="/memo" onClick={() => setPanel(null)}><i><NotebookPen size={16}/></i><div><strong>메모 작성</strong><small>일반·템플릿·음성메모를 작성합니다.</small></div></Link>
          <Link href="/clients" onClick={() => setPanel(null)}><i><UserPlus size={16}/></i><div><strong>고객 등록</strong><small>신규 고객과 워크플로우를 시작합니다.</small></div></Link>
        </div> : null}
      </div>

      <div className="oa-header-profile" aria-label="현재 사용자 정연호 대표">
        <span><img src="/assets/photoclinic-mark.png" alt=""/></span><div><strong>정연호 대표</strong><small>Photo Clinic</small></div>
      </div>
    </div>
  );
}
