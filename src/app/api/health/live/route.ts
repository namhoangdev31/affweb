import { loadServerEnv } from "@/lib/env";

export function GET(): Response {
  return Response.json(
    {
      status: "ok",
      build: loadServerEnv().NEXT_PUBLIC_BUILD_SHA,
      timestamp: new Date().toISOString()
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
