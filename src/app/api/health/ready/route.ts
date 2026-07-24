import { db } from "@/lib/db";
import { loadServerEnv, productionReadinessIssues } from "@/lib/env";
import { AppError, errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const env = loadServerEnv();
    if (env.NODE_ENV === "production") {
      const issues = productionReadinessIssues(env);
      if (issues.length > 0) {
        throw new AppError(
          "CONNECTOR_UNAVAILABLE",
          "Production dependencies are not fully configured.",
          503,
          { issueCount: issues.length }
        );
      }
    }
    await db.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ready", database: "ok", timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
