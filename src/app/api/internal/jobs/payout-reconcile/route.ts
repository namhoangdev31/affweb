import { z } from "zod";
import { db } from "@/lib/db";
import { financeReconciliationDelaysSeconds } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { requestId } from "@/lib/request";
import { verifyQStashRequest } from "@/modules/jobs/qstash";
import { reconcileTenantPayout } from "@/modules/tenants/payout";
import { schedulePayoutReconciliation } from "@/modules/tenants/recovery";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  payoutId: z.string().cuid(),
  expectedAttemptId: z.string().cuid(),
  sequence: z.number().int().positive()
});

export async function POST(request: Request): Promise<Response> {
  const reqId = await requestId();
  try {
    const rawBody = await request.text();
    await verifyQStashRequest(request, rawBody);
    const input = schema.parse(JSON.parse(rawBody));
    const delays = financeReconciliationDelaysSeconds();
    if (input.sequence > delays.length) {
      return Response.json(
        { ok: true, exhausted: true },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const payout = await db.tenantPayout.findUnique({
      where: { id: input.payoutId },
      include: { attempts: true }
    });
    if (!payout) return Response.json({ ok: true, missing: true });
    if (payout.settlementStatus === "PAID" || payout.settlementStatus === "FAILED") {
      return Response.json({ ok: true, terminal: payout.settlementStatus });
    }
    const expectedAttempt = payout.attempts.find(
      (attempt) => attempt.id === input.expectedAttemptId && attempt.operation === "SUBMIT"
    );
    if (!expectedAttempt) {
      return Response.json(
        { error: { code: "PAYOUT_STATE", message: "Expected SUBMIT attempt mismatch." } },
        { status: 409 }
      );
    }
    const systemContext = {
      actorUserId: null,
      actorRole: "SYSTEM_WORKER" as const,
      workerIdentity: "qstash:payout-reconcile",
      targetTenantId: payout.tenantId,
      source: "QSTASH" as const,
      requestId: reqId
    };
    const result = await reconcileTenantPayout(systemContext, payout.id, input.sequence);
    if (
      result.settlementStatus !== "PAID" &&
      result.settlementStatus !== "FAILED" &&
      input.sequence < delays.length
    ) {
      await schedulePayoutReconciliation({
        payoutId: payout.id,
        expectedAttemptId: expectedAttempt.id,
        sequence: input.sequence + 1
      });
    } else if (result.settlementStatus !== "PAID" && result.settlementStatus !== "FAILED") {
      await schedulePayoutReconciliation({
        payoutId: payout.id,
        expectedAttemptId: expectedAttempt.id,
        sequence: input.sequence + 1
      });
    }
    return Response.json(
      { ok: true, settlementStatus: result.settlementStatus },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": reqId } }
    );
  } catch (error) {
    return errorResponse(error, reqId);
  }
}
