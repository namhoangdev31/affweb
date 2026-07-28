import { NextResponse } from "next/server";

export const runtime = "nodejs";

function retiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Legacy Zalo QR activation has been retired. Use an authenticated one-time group binding code."
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(): Promise<NextResponse> {
  return retiredResponse();
}

export async function POST(): Promise<NextResponse> {
  return retiredResponse();
}
