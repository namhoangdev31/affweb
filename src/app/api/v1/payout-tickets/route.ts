import { z } from "zod";
import { requireApiUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { jsonSafe } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, readJson } from "@/lib/request";
import { createPayoutTicket } from "@/modules/payout/service";

export const runtime = "nodejs";

const inputSchema = z.object({
  beneficiaryId: z.string().cuid(),
  amountVnd: z.coerce.bigint()
});

export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();
    const tickets = await db.payoutTicket.findMany({
      where: { userId: user.id },
      include: { beneficiary: { select: { bankBin: true, accountLast4: true } } },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return Response.json(jsonSafe({ tickets }), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const limit = await rateLimit(`payout:${user.id}`, 3, 3600);
    if (!limit.allowed) {
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "Bạn đã tạo quá nhiều payout ticket." } },
        { status: 429 }
      );
    }
    const input = inputSchema.parse(await readJson(request));
    const ticket = await createPayoutTicket({ userId: user.id, ...input });
    return Response.json(jsonSafe({ ticket }), {
      status: 201,
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
