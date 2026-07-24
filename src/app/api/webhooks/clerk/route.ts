import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  claimWebhookEvent,
  completeWebhookEvent,
  handleClerkWebhook,
  releaseWebhookClaim
} from "@/modules/identity/webhook";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  const svixId = request.headers.get("svix-id");
  if (!svixId) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Missing svix-id." } },
      { status: 400 }
    );
  }

  let event;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    logger.warn("clerk.webhook_signature_rejected", {
      svixId,
      reason: error instanceof Error ? error.message : "unknown"
    });
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid webhook signature." } },
      { status: 400 }
    );
  }

  try {
    if (!(await claimWebhookEvent(svixId, event))) {
      return Response.json({ accepted: true, duplicate: true });
    }
    try {
      await handleClerkWebhook(event);
      await completeWebhookEvent(svixId);
      return Response.json({ accepted: true });
    } catch (error) {
      await releaseWebhookClaim(svixId);
      throw error;
    }
  } catch (error) {
    logger.warn("clerk.webhook_processing_failed", {
      svixId,
      reason: error instanceof Error ? error.message : "unknown"
    });
    return errorResponse(error);
  }
}
