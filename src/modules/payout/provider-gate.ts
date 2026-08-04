import { AppError } from "@/lib/errors";

export function assertPayoutProviderEnabled(input: {
  enabled: boolean;
  databaseEnabled: boolean;
  clientId: string | undefined;
  apiKey: string | undefined;
  checksumKey: string | undefined;
}): asserts input is {
  enabled: true;
  databaseEnabled: true;
  clientId: string;
  apiKey: string;
  checksumKey: string;
} {
  if (!input.enabled || !input.databaseEnabled) {
    throw new AppError("PAYOUT_DISABLED", "payOS Payout đang bị khóa bởi môi trường.", 503);
  }
  if (!input.clientId || !input.apiKey || !input.checksumKey) {
    throw new AppError("PAYOUT_DISABLED", "payOS Payout credentials chưa được cấu hình.", 503);
  }
}
