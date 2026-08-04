import { describe, expect, it } from "vitest";
import { paginationPage } from "@/lib/pagination";

describe("paginationPage", () => {
  it.each([
    { value: undefined, total: 0, expected: 1 },
    { value: "nope", total: 50, expected: 1 },
    { value: "0", total: 50, expected: 1 },
    { value: "2", total: 50, expected: 2 },
    { value: "999", total: 50, expected: 3 }
  ])("normalizes $value against the available pages", ({ value, total, expected }) => {
    expect(paginationPage(value, total, 20)).toBe(expected);
  });
});
