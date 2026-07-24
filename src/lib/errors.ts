import { ZodError } from "zod";

export type AppErrorCode =
  | "AUTH_REQUIRED"
  | "ACCOUNT_INACTIVE"
  | "ADMIN_SESSION_EXPIRED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "CONNECTOR_DISABLED"
  | "CONNECTOR_UNAVAILABLE"
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_BALANCE"
  | "BENEFICIARY_HOLD"
  | "LEDGER_IMBALANCE"
  | "EVIDENCE_STORAGE"
  | "EVIDENCE_INTEGRITY"
  | "PAYOUT_STATE"
  | "PAYOUT_DISABLED"
  | "PAYOUT_LIMIT"
  | "STEP_UP_REQUIRED"
  | "SEPARATION_OF_DUTIES"
  | "PAYOUT_UNKNOWN"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: AppErrorCode,
    message: string,
    status = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorResponse(error: unknown, requestId?: string): Response {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Dữ liệu gửi lên không hợp lệ.",
          requestId,
          fields: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        }
      },
      { status: 400 }
    );
  }
  if (error instanceof AppError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId
        }
      },
      { status: error.status }
    );
  }

  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Hệ thống đang bận. Vui lòng thử lại sau.",
        requestId
      }
    },
    { status: 500 }
  );
}
