import nodemailer from "nodemailer";

export function gmailTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("이메일 발송 설정이 없습니다.");
  return {
    user,
    client: nodemailer.createTransport({ service: "gmail", auth: { user, pass } }),
  };
}
