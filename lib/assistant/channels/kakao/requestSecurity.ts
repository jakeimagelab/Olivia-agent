import { timingSafeEqual } from "node:crypto";

export function isKakaoSkillConfigured(): boolean {
  return Boolean(process.env.KAKAO_SKILL_SECRET);
}

export function getKakaoSkillSecretHeader(
  headers: Pick<Headers, "get">,
): string | null {
  return (
    headers.get("x-api-key") ??
    headers.get("x-olivia-kakao-skill-secret")
  );
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
