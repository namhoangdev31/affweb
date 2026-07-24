import { z } from "zod";
import { requireApiUser } from "@/lib/authz";
import { stableHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, readJson } from "@/lib/request";
import { saveBeneficiary } from "@/modules/beneficiaries/service";

export const runtime = "nodejs";

const inputSchema = z.object({
  bankBin: z.string().regex(/^\d{6}$/),
  accountNumber: z.string().regex(/^\d{6,20}$/),
  accountName: z.string().min(3).max(120)
});

export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();
    const beneficiaries = await db.bankBeneficiary.findMany({
      where: { userId: user.id, active: true },
      select: {
        id: true,
        bankBin: true,
        accountLast4: true,
        status: true,
        changedAt: true
      }
    });
    return Response.json({ beneficiaries }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const input = inputSchema.parse(await readJson(request));
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const beneficiary = await saveBeneficiary({
      userId: user.id,
      ...input,
      ...(ip ? { ipHash: stableHash(ip) } : {})
    });
    return Response.json({ beneficiary }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
