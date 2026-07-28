import { describe, expect, it } from "vitest";
import { accessTradeOrderStatus } from "@/modules/connectors/accesstrade";
import { lazadaOrderStatus, parseLazadaVietnamDate } from "@/modules/connectors/lazada";

describe("provider order status mapping", () => {
  it("maps AccessTrade approved to validation only", () => {
    expect(accessTradeOrderStatus(0)).toBe("pending");
    expect(accessTradeOrderStatus(1)).toBe("validated");
    expect(accessTradeOrderStatus(2)).toBe("rejected");
    expect(accessTradeOrderStatus(99)).toBe("review_required");
  });

  it("maps Lazada fulfilled/delivered without treating them as settlement", () => {
    expect(lazadaOrderStatus("fulfilled")).toBe("delivered");
    expect(lazadaOrderStatus("delivered")).toBe("delivered");
    expect(lazadaOrderStatus("returned")).toBe("returned");
    expect(lazadaOrderStatus("paid")).toBe("review_required");
  });

  it("parses Lazada local timestamps as Vietnam time", () => {
    expect(parseLazadaVietnamDate("2026-07-28 12:00:00").toISOString()).toBe(
      "2026-07-28T05:00:00.000Z"
    );
  });
});
