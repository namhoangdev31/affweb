import "server-only";

const sensitiveKey = /token|secret|password|cookie|authorization|accountnumber|cipher/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : redact(item)
      ])
    );
  }
  return value;
}

export function log(
  level: "debug" | "info" | "warn" | "error",
  event: string,
  context: Record<string, unknown> = {}
): void {
  const safeContext = redact(context) as Record<string, unknown>;
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeContext
  });

  if (level === "error") {
    console.error(payload);
  } else if (level === "warn") {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}

export const logger = {
  debug: (event: string, context?: Record<string, unknown>) => log("debug", event, context),
  info: (event: string, context?: Record<string, unknown>) => log("info", event, context),
  warn: (event: string, context?: Record<string, unknown>) => log("warn", event, context),
  error: (event: string, context?: Record<string, unknown>) => log("error", event, context)
};
