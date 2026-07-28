import { z } from "zod";
import { requireApiUser } from "@/lib/authz";
import { errorResponse } from "@/lib/errors";
import { assertTrustedOrigin, requestId } from "@/lib/request";
import { joinTenantBySlug } from "@/modules/tenants/membership";

export const runtime = "nodejs";

const paramsSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const id = await requestId();
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser();
    const { slug } = paramsSchema.parse(await context.params);
    const result = await joinTenantBySlug({ userId: user.id, slug });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store", "X-Request-Id": id }
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}
