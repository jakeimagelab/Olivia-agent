type TelegramResponse = { ok?: boolean; description?: string };

export function telegramNotificationChatId() {
  return process.env.TELEGRAM_NOTIFICATION_CHAT_ID || process.env.TELEGRAM_ALLOWED_USER_ID || "";
}

export async function sendTelegramNotification(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = telegramNotificationChatId();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN 미설정");
  if (!chatId) throw new Error("TELEGRAM_NOTIFICATION_CHAT_ID 미설정");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const body = await response.json().catch(() => ({})) as TelegramResponse;
  if (!response.ok || !body.ok) throw new Error(body.description || "텔레그램 메시지 발송 실패");
  return { chatId };
}
