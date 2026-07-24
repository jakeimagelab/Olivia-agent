import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ENCRYPTION_VERSION = "v1";
const IV_BYTES = 12;

function parseEncryptionKey(value: string): Buffer {
  const trimmed = value.trim();
  const key = /^[a-f0-9]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ASSISTANT_CREDENTIAL_ENCRYPTION_KEY는 32바이트 base64 또는 64자리 hex여야 합니다.",
    );
  }
  return key;
}

export function getAssistantEncryptionKey(): Buffer {
  const value = process.env.ASSISTANT_CREDENTIAL_ENCRYPTION_KEY;
  if (!value) {
    throw new Error("ASSISTANT_CREDENTIAL_ENCRYPTION_KEY 환경변수 미설정");
  }
  return parseEncryptionKey(value);
}

export function getAssistantHashPepper(): string {
  const value = process.env.ASSISTANT_LINK_CODE_PEPPER;
  if (!value || value.length < 16) {
    throw new Error("ASSISTANT_LINK_CODE_PEPPER 환경변수 미설정");
  }
  return value;
}

export function hashAssistantSecret(
  value: string,
  pepper = getAssistantHashPepper(),
): string {
  return createHmac("sha256", pepper).update(value, "utf8").digest("hex");
}

export function safeHashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function encryptAssistantSecret(
  value: string,
  key = getAssistantEncryptionKey(),
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptAssistantSecret(
  value: string,
  key = getAssistantEncryptionKey(),
): string {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (
    version !== ENCRYPTION_VERSION ||
    !ivValue ||
    !tagValue ||
    !encryptedValue
  ) {
    throw new Error("암호화된 비밀정보 형식이 올바르지 않습니다.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
