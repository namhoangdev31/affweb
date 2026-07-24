import { describe, expect, it } from "vitest";
import { csvRecords, parseCsv } from "@/lib/csv";

describe("CSV parser", () => {
  it("parses quoted commas and escaped quotes", () => {
    expect(parseCsv('id,name\r\n1,"Món ăn, ""đặc biệt"""\r\n')).toEqual([
      ["id", "name"],
      ["1", 'Món ăn, "đặc biệt"']
    ]);
  });

  it("maps a UTF-8 BOM header into records", () => {
    expect(csvRecords("\uFEFFid,status\nA-1,validated\n")).toEqual([
      { id: "A-1", status: "validated" }
    ]);
  });
});
