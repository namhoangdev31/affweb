import { NextResponse } from "next/server";

export const runtime = "nodejs";

function disabledResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Lazada webhook ingestion đã bị tắt. Dùng Lazada Open API sync định kỳ."
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(_request?: Request): Promise<Response> {
  return disabledResponse();
}

export async function POST(_request?: Request): Promise<Response> {
  return disabledResponse();
}
