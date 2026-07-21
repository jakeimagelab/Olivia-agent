"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, MessageCircle, Settings } from "lucide-react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { C } from "@/lib/theme";
import { getTeamChatSupabaseBrowser } from "@/lib/teamChat/supabaseBrowser";
import RoomList from "./RoomList";
import RoomHeader from "./RoomHeader";
import MessageThread from "./MessageThread";
import Composer from "./Composer";
import NewRoomDialog from "./NewRoomDialog";
import InviteMemberPanel from "./InviteMemberPanel";
import type { ChatAttachment, ChatMember, ChatMessage, ChatRoom, TeamChatSession } from "./types";

export default function TeamChatShell() {
  const [session, setSession] = useState<TeamChatSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [allMembers, setAllMembers] = useState<ChatMember[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [roomMembers, setRoomMembers] = useState<ChatMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [adminJoinError, setAdminJoinError] = useState("");

  const loadSession = () =>
    fetch("/api/team-chat/session")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setSession({ isAdmin: d.isAdmin, member: d.member }); });

  useEffect(() => {
    loadSession().finally(() => setLoading(false));
  }, []);

  // 관리자는 초대 링크 없이 바로 채팅에 참여시킨다 — pc_admin_session만 있고 아직
  // chat_members 행이 없으면 자동으로 관리자 계정을 만들고 로그인까지 처리한다.
  useEffect(() => {
    if (!session?.isAdmin || session.member || adminJoinError) return;
    fetch("/api/team-chat/admin-join", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) return loadSession();
        setAdminJoinError(d.error || "관리자 계정 준비에 실패했습니다.");
      })
      .catch(() => setAdminJoinError("관리자 계정 준비에 실패했습니다."));
  }, [session?.isAdmin, session?.member, adminJoinError]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRooms = async () => {
    const res = await fetch("/api/team-chat/rooms");
    const data = await res.json();
    if (data.ok) setRooms(data.rooms);
  };

  useEffect(() => {
    if (!session?.member) return;
    loadRooms();
    fetch("/api/team-chat/members").then((r) => r.json()).then((d) => { if (d.ok) setAllMembers(d.members); });
  }, [session?.member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRoomDetail = async (roomId: string) => {
    const [roomRes, messagesRes] = await Promise.all([
      fetch(`/api/team-chat/rooms/${roomId}`).then((r) => r.json()),
      fetch(`/api/team-chat/rooms/${roomId}/messages`).then((r) => r.json()),
    ]);
    if (roomRes.ok) { setActiveRoom(roomRes.room); setRoomMembers(roomRes.members); }
    if (messagesRes.ok) setMessages(messagesRes.messages);
  };

  useEffect(() => {
    if (!activeRoomId) { setActiveRoom(null); setRoomMembers([]); setMessages([]); return; }
    loadRoomDetail(activeRoomId);
  }, [activeRoomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime — 방을 선택하고 있는 동안 새 메시지/첨부/방 정보 변경을 즉시 반영한다.
  useEffect(() => {
    if (!activeRoomId || !session?.member) return;
    const supabase = getTeamChatSupabaseBrowser();
    const channel = supabase
      .channel(`room-${activeRoomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${activeRoomId}` },
        (payload: RealtimePostgresChangesPayload<ChatMessage>) => setMessages((prev) => [...prev, payload.new as ChatMessage])
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_attachments", filter: `room_id=eq.${activeRoomId}` },
        (payload: RealtimePostgresChangesPayload<ChatAttachment>) => {
          const att = payload.new as ChatAttachment;
          setMessages((prev) => prev.map((m) => (m.id === att.message_id ? { ...m, chat_attachments: [...(m.chat_attachments ?? []), att] } : m)));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_rooms", filter: `id=eq.${activeRoomId}` },
        (payload: RealtimePostgresChangesPayload<ChatRoom>) => {
          const patch = payload.new as Partial<ChatRoom>;
          setActiveRoom((prev) => (prev ? { ...prev, ...patch } : prev));
          setRooms((prev) => prev.map((r) => (r.id === activeRoomId ? { ...r, ...patch } : r)));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeRoomId, session?.member?.id]);

  const createRoom = async (name: string, memberIds: string[]) => {
    const res = await fetch("/api/team-chat/rooms", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, memberIds }),
    });
    const data = await res.json();
    if (data.ok) { await loadRooms(); setActiveRoomId(data.room.id); }
  };

  const renameRoom = async (name: string) => {
    if (!activeRoomId) return;
    await fetch(`/api/team-chat/rooms/${activeRoomId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    setActiveRoom((prev) => (prev ? { ...prev, name } : prev));
    setRooms((prev) => prev.map((r) => (r.id === activeRoomId ? { ...r, name } : r)));
  };

  const toggleOlivia = async (enabled: boolean) => {
    if (!activeRoomId) return;
    await fetch(`/api/team-chat/rooms/${activeRoomId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oliviaEnabled: enabled }),
    });
    setActiveRoom((prev) => (prev ? { ...prev, olivia_enabled: enabled } : prev));
  };

  const addMember = async (memberId: string) => {
    if (!activeRoomId) return;
    const res = await fetch(`/api/team-chat/rooms/${activeRoomId}/members`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId }),
    });
    if (res.ok) await loadRoomDetail(activeRoomId);
  };

  // 메시지 전송 — 실제 화면 반영은 POST 응답이 아니라 Realtime 구독이 담당한다
  // (works-saas와 동일한 방식: 낙관적 업데이트 없이 realtime 하나로 통일해 중복 표시를 원천 차단).
  const sendMessage = async (body: string, file: File | null) => {
    if (!activeRoomId) return;
    let attachment: { driveFileId: string; fileName: string; mimeType: string; sizeBytes: number } | undefined;

    if (file) {
      const sessionRes = await fetch(`/api/team-chat/rooms/${activeRoomId}/attachments/upload-session`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size }),
      });
      const sessionData = await sessionRes.json();
      if (!sessionData.ok) throw new Error(sessionData.error || "업로드 준비에 실패했습니다.");

      const uploadRes = await fetch(sessionData.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!uploadRes.ok) throw new Error("파일 업로드에 실패했습니다.");
      const driveFile = await uploadRes.json();
      attachment = { driveFileId: driveFile.id, fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size };
    }

    const res = await fetch(`/api/team-chat/rooms/${activeRoomId}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, attachment }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "전송에 실패했습니다.");
  };

  const logout = async () => {
    await fetch("/api/team-chat/logout", { method: "POST" });
    window.location.href = "/team-chat/login";
  };

  if (loading) {
    return <ShellState message="불러오는 중..." />;
  }
  if (!session) {
    return <ShellState message="세션을 확인할 수 없습니다." />;
  }

  // 관리자 세션은 있지만 아직 팀 채팅 멤버로 가입 전 — 초대/Drive 연결 패널만 보여준다.
  if (!session.member) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--mesh-bg)", padding: "60px 20px" }}>
        <div style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.mint, display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
            <MessageCircle size={26} color={C.teal} />
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: C.ink, margin: "0 0 8px" }}>팀 채팅</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: "0 0 24px", lineHeight: 1.6 }}>
            관리자님도 채팅에 참여하려면 먼저 팀원으로 가입해야 합니다.<br />
            아래에서 본인 이메일로 초대 링크를 만들어 가입해주세요.
          </p>
          <div style={{ textAlign: "left" }}>
            <InviteMemberPanel />
          </div>
          <Link href="/admin/team-chat-settings" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: C.muted, textDecoration: "none", marginTop: 20 }}>
            <Settings size={14} /> Drive 저장소 연결하기
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", height: "100vh", background: C.bg }}>
      <aside style={{ borderRight: `1px solid ${C.border}`, background: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{session.member.display_name}</div>
          <div style={{ fontSize: 11, color: C.hint }}>{session.member.email}</div>
        </div>
        <RoomList rooms={rooms} activeRoomId={activeRoomId} onSelect={setActiveRoomId} onNewRoom={() => setShowNewRoom(true)} />
        <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
          {session.isAdmin && <InviteMemberPanel />}
          <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0" }}>
            <LogOut size={14} /> 로그아웃
          </button>
        </div>
      </aside>

      <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {activeRoom ? (
          <>
            <RoomHeader
              room={activeRoom}
              members={roomMembers}
              allMembers={allMembers}
              isAdmin={session.isAdmin}
              onRename={renameRoom}
              onToggleOlivia={toggleOlivia}
              onAddMember={addMember}
            />
            <MessageThread messages={messages} members={roomMembers} currentMemberId={session.member.id} />
            <Composer onSend={sendMessage} />
          </>
        ) : (
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: C.hint, fontSize: 13 }}>
            왼쪽에서 채팅방을 선택하거나 새로 만들어보세요.
          </div>
        )}
      </section>

      {showNewRoom && (
        <NewRoomDialog allMembers={allMembers.filter((m) => m.id !== session.member!.id)} onCreate={createRoom} onClose={() => setShowNewRoom(false)} />
      )}
    </div>
  );
}

function ShellState({ message }: { message: string }) {
  return (
    <main style={{ minHeight: "100vh", background: "var(--mesh-bg)", display: "grid", placeItems: "center" }}>
      <p style={{ fontSize: 13, color: C.muted }}>{message}</p>
    </main>
  );
}
