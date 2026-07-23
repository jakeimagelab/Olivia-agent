"use client";

import NewTaskDialog from "@/components/team-workspace/tasks/NewTaskDialog";
import type { ChatMessage } from "./types";

export default function CreateTaskFromMessageDialog({
  message,
  projectId,
  open,
  onClose,
  onCreated,
}: {
  message: ChatMessage;
  projectId?: string | null;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const firstLine = message.body.split("\n").find((line) => line.trim())?.trim() ?? "채팅 업무";
  const title = firstLine.length > 60 ? `${firstLine.slice(0, 60)}` : firstLine;
  return (
    <NewTaskDialog
      open={open}
      onClose={onClose}
      onCreated={onCreated}
      defaults={{
        title,
        description: message.body,
        roomId: message.room_id,
        sourceMessageId: message.id,
        projectId: projectId ?? undefined,
      }}
    />
  );
}
