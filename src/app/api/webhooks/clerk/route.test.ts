import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/clerk/route";

describe("Clerk webhook authentication", () => {
  it("rejects requests without a Svix event ID", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: "{}"
      })
    );
    expect(response.status).toBe(400);
  });

  it("rejects an invalid Svix signature before touching application data", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/clerk", {
        method: "POST",
        headers: {
          "svix-id": "msg_invalid",
          "svix-timestamp": String(Math.floor(Date.now() / 1000)),
          "svix-signature": "v1,invalid"
        },
        body: JSON.stringify({ type: "user.created", data: { id: "user_test" } })
      })
    );
    expect(response.status).toBe(400);
  });
});
