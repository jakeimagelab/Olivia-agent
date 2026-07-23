import { redirect } from "next/navigation";

export default function TeamChatPage() {
  redirect("/team?tab=chat");
}
