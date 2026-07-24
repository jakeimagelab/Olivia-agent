import { timingSafeEqual } from "node:crypto";

export function isKakaoSkillConfigured(): boolean {
  return Boolean(process.env.KAKAO_SKILL_SECRET);
}

export function verifyKakaoSkillSecret(value: string | null): boolean {
  const expected = process.env.KAKAO_SKILL_SECRET;
  if (!expected || !value) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(value);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
