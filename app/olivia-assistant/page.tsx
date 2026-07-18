import { redirect } from "next/navigation";

export default function OliviaAssistantRedirectPage() {
  redirect("/admin/dashboard/home#olivia-assistant");
}
