"use client";

import OliviaFloatingConversation from "@/components/olivia-v2/OliviaFloatingConversation";

type OliviaChatProps = {
  pageContext?: string;
  contextData?: Record<string, unknown>;
  contiData?: unknown;
  onContiUpdate?: (value: unknown) => void;
};

// Compatibility shell for existing quote/conti pages. It intentionally owns no
// message state: every surface reads the same useOliviaConversationStore array.
export default function OliviaChat(_props: OliviaChatProps = {}) {
  void _props;
  return <OliviaFloatingConversation />;
}
