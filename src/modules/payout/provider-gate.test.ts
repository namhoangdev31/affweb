import { describe, expect, it } from "vitest";
import { assertPayoutProviderEnabled } from "@/modules/payout/provider-gate";

describe("payOS payout environment gate", () => {
  it.each([
    {
      enabled: false,
      databaseEnabled: true,
      clientId: "id",
      apiKey: "key",
      checksumKey: "sum"
    },
    {
      enabled: true,
      databaseEnabled: false,
      clientId: "id",
      apiKey: "key",
      checksumKey: "sum"
    },
    {
      enabled: true,
      databaseEnabled: true,
      clientId: undefined,
      apiKey: "key",
      checksumKey: "sum"
    },
    {
      enabled: true,
      databaseEnabled: true,
      clientId: "id",
      apiKey: undefined,
      checksumKey: "sum"
    },
    {
      enabled: true,
      databaseEnabled: true,
      clientId: "id",
      apiKey: "key",
      checksumKey: undefined
    }
  ])("fails closed unless every payout gate is ready", (input) => {
    expect(() => assertPayoutProviderEnabled(input)).toThrow();
  });

  it("accepts only an enabled provider with the complete credential set", () => {
    expect(() =>
      assertPayoutProviderEnabled({
        enabled: true,
        databaseEnabled: true,
        clientId: "id",
        apiKey: "key",
        checksumKey: "sum"
      })
    ).not.toThrow();
  });
});
