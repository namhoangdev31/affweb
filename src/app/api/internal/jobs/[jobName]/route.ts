import { errorResponse } from "@/lib/errors";
import { runJob } from "@/modules/jobs/runner";
import { verifyQStashRequest } from "@/modules/jobs/qstash";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handleJob(
  request: Request,
  context: { params: Promise<{ jobName: string }> }
): Promise<Response> {
  try {
    const body = request.method === "POST" ? await request.text() : "";
    await verifyQStashRequest(request, body);
    const { jobName } = await context.params;
    const result = await runJob(jobName);
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobName: string }> }
): Promise<Response> {
  return handleJob(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobName: string }> }
): Promise<Response> {
  return handleJob(request, context);
}
