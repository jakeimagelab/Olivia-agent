import type { SupabaseClient } from "@supabase/supabase-js";
import { sendKakaoEvent } from "@/lib/assistant/channels/kakao/client";
import { createAssistantNotification } from "@/lib/assistant/notifications/service";
import { classifyImportantEmail } from "@/lib/assistant/notifications/importantEmail";
import { shouldSendNotificationNow } from "@/lib/assistant/notifications/priority";
import { searchAssistantGmail } from "@/lib/assistant/oauth/google";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { decryptAssistantSecret } from "@/lib/assistant/security";

function kstMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

export async function scanAndNotifyImportantEmails(db: SupabaseClient) {
  const owner = await ensurePrimaryAssistantOwner(db);
  const [settingsResult, connectionResult] = await Promise.all([
    db
      .from("assistant_notification_settings")
      .select("*")
      .eq("owner_id", owner.id)
      .maybeSingle(),
    db
      .from("assistant_channel_connections")
      .select("external_user_id_encrypted")
      .eq("owner_id", owner.id)
      .eq("channel", "kakao")
      .eq("status", "active")
      .maybeSingle(),
  ]);
  const settings = settingsResult.data;
  if (!settings?.important_email_enabled) {
    return { checked: 0, sent: 0, reason: "disabled" as const };
  }

  const emails = await searchAssistantGmail(
    db,
    owner.id,
    "is:unread newer_than:1d",
    10,
  );
  let sentCount = 0;
  for (const email of emails) {
    const priority = classifyImportantEmail(email);
    if (!priority) continue;
    const notification = await createAssistantNotification(db, {
      ownerId: owner.id,
      notificationKey: `gmail:${email.id}:important`,
      notificationType: "email.important",
      priority,
      title: email.subject,
      message: `${email.from}\n${email.snippet}`.slice(0, 900),
      channel: "kakao",
    });
    if (notification.duplicate || notification.delivery_status !== "queued") continue;
    if (
      !settings.kakao_enabled ||
      !connectionResult.data?.external_user_id_encrypted ||
      !process.env.KAKAO_NOTIFICATION_EVENT_NAME ||
      !shouldSendNotificationNow({
        priority,
        settings,
        nowMinutes: kstMinutesNow(),
      })
    ) {
      continue;
    }

    const delivery = await sendKakaoEvent({
      eventName: process.env.KAKAO_NOTIFICATION_EVENT_NAME,
      userType: "botUserKey",
      userId: decryptAssistantSecret(
        connectionResult.data.external_user_id_encrypted,
      ),
      data: {
        title: email.subject.slice(0, 200),
        text: `${email.from}\n${email.snippet}`.slice(0, 900),
        messageId: email.id,
      },
    });
    await Promise.all([
      db.from("assistant_delivery_attempts").insert({
        owner_id: owner.id,
        notification_id: notification.id,
        channel: "kakao",
        external_request_id: delivery.taskId,
        status: "accepted",
        attempt_count: 1,
        response_metadata: {
          eventName: process.env.KAKAO_NOTIFICATION_EVENT_NAME,
          status: delivery.status,
        },
        sent_at: new Date().toISOString(),
      }),
      db
        .from("olivia_notification_history")
        .update({ delivery_status: "accepted" })
        .eq("id", notification.id)
        .eq("delivery_status", "queued"),
    ]);
    sentCount += 1;
  }
  return { checked: emails.length, sent: sentCount };
}
