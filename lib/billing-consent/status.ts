import type { BillingConsentPublicState, BillingConsentStatus } from "./types";

export function effectiveBillingConsentStatus(input: BillingConsentPublicState): BillingConsentStatus {
  if (
    (input.status === "sent" || input.status === "viewed")
    && input.expiresAt
    && new Date(input.expiresAt).getTime() <= (input.now ?? new Date()).getTime()
  ) return "expired";
  return input.status;
}

export function canSignBillingConsent(input: BillingConsentPublicState) {
  const status = effectiveBillingConsentStatus(input);
  return status === "sent" || status === "viewed";
}
