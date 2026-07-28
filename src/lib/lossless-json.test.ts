import { describe, expect, it } from "vitest";
import { parseLosslessJson } from "@/lib/lossless-json";

describe("parseLosslessJson", () => {
  it("preserves every numeric token as its exact decimal string", () => {
    expect(
      parseLosslessJson('{"commission":53040.75,"large":9223372036854775807,"page":1,"ok":true}')
    ).toEqual({
      commission: "53040.75",
      large: "9223372036854775807",
      page: "1",
      ok: true
    });
  });

  it("rejects malformed, duplicate-key and oversized payloads", () => {
    expect(() => parseLosslessJson('{"amount":1,"amount":2}')).toThrow();
    expect(() => parseLosslessJson("{")).toThrow();
    expect(() => parseLosslessJson('{"amount":1}', 2)).toThrow();
  });
});
