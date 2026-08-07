import { NextResponse } from "next/server";

export const runtime = "nodejs";

function retiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Endpoint /api/saas/zalo-qr đã bị ngưng hoạt động. Sử dụng Zalo Bot 1-Click Binding."
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(): Promise<Response> {
  return retiredResponse();
}

export async function POST(): Promise<Response> {
  return retiredResponse();
}
