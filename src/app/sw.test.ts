import { describe, expect, it } from "vitest";
import { GET } from "@/app/sw.js/route";

describe("service worker financial cache policy", () => {
  it("keeps API, auth, every portal and redirect routes network-only", async () => {
    const source = await GET().text();
    expect(source).toContain('"/__clerk"');
    expect(source).toContain('"/sign-in"');
    expect(source).toContain('"/sign-up"');
    expect(source).toContain('"/app"');
    expect(source).toContain('"/admin"');
    expect(source).toContain('"/shop"');
    expect(source).toContain('"/tenant"');
    expect(source).toContain("/app(?:\\/|$)");
    expect(source).not.toMatch(/caches\.put\([^)]*\/api/);
    expect(source).not.toContain("backgroundSync");
  });

  it("supports safe update and generic push notifications", async () => {
    const source = await GET().text();
    expect(source).toContain("SKIP_WAITING");
    expect(source).toContain("Bạn có cập nhật mới.");
    expect(source).not.toMatch(/accountNumber|beneficiary|amountVnd/);
  });
});
