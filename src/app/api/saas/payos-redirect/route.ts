import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With"
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}

async function handleRedirect(request: Request): Promise<Response> {
  const env = loadServerEnv();
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();

  const targetUrl = new URL(
    `/app/settings/tenant${searchParams ? `?${searchParams}` : ""}`,
    env.APP_BASE_URL
  );

  return NextResponse.redirect(targetUrl.toString(), {
    status: 303,
    headers: corsHeaders
  });
}

export async function GET(request: Request): Promise<Response> {
  return handleRedirect(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleRedirect(request);
}
