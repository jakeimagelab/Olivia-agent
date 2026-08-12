"use client";

import OliviaConversation from "@/components/olivia-v2/OliviaConversation";

// Legacy import compatibility only. Home, workspace, floating chat, and drawer
// all render the same conversation component backed by one Zustand store.
export default function OliviaHeroChat() {
  return <OliviaConversation variant="main" />;
}
