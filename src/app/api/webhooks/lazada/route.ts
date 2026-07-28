import { NextResponse } from "next/server";

export const runtime = "nodejs";

function disabledResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Lazada postback is disabled until an authenticated provider contract is configured."
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request?: Request): Promise<NextResponse> {
  void request;
  return disabledResponse();
}

export async function POST(request?: Request): Promise<NextResponse> {
  void request;
  return disabledResponse();
}
