import "server-only";

export const HIGGSFIELD_DEFAULT_BASE_URL = "https://api.higgsfield.ai";

export type HiggsfieldServerConfig = {
  credentials: string;
  baseUrl: string;
};

export class HiggsfieldConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HiggsfieldConfigurationError";
  }
}

function credentialsFromEnvironment(): string | undefined {
  const combined = [
    process.env.HIGGSFIELD_API_CREDENTIALS,
    process.env.HF_CREDENTIALS,
    process.env.HF_KEY,
  ].find((value) => Boolean(value?.trim()))?.trim();
  if (combined) return combined;

  const apiKey = process.env.HF_API_KEY?.trim();
  const apiSecret = process.env.HF_API_SECRET?.trim();
  return apiKey && apiSecret ? `${apiKey}:${apiSecret}` : undefined;
}

export function hasHiggsfieldCredentials(): boolean {
  return Boolean(credentialsFromEnvironment());
}

export function getHiggsfieldServerConfig(): HiggsfieldServerConfig {
  const credentials = credentialsFromEnvironment();
  if (!credentials) {
    throw new HiggsfieldConfigurationError("Higgsfield API 연결이 필요합니다.");
  }
  if (credentials.split(":").length !== 2) {
    throw new HiggsfieldConfigurationError("Higgsfield API 자격증명 형식을 확인해주세요.");
  }
  return {
    credentials,
    baseUrl: process.env.HF_API_BASE_URL?.trim() || HIGGSFIELD_DEFAULT_BASE_URL,
  };
}
