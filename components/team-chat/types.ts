export type ChatMember = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
};

export type ChatAttachment = {
  id: string;
  message_id: string;
  drive_file_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  sender_type: "member" | "olivia";
  sender_member_id: string | null;
  body: string;
  created_at: string;
  chat_attachments?: ChatAttachment[];
};

export type ChatRoom = {
  id: string;
  name: string;
  color: string;
  olivia_enabled: boolean;
  created_by: string;
  memberCount?: number;
};

export type TeamChatSession = {
  isAdmin: boolean;
  member: ChatMember | null;
};
