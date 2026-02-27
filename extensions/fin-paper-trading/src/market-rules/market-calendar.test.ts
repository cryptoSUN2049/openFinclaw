import { describe, expect, it } from "vitest";
import { isMarketOpen, resolveMarket, getMarketTimezone } from "./market-calendar.js";

describe("isMarketOpen", () => {
  it("crypto is always open", () => {
    expect(isMarketOpen("crypto")).toBe(true);
    expect(isMarketOpen("crypto", Date.now())).toBe(true);
  });

  it("equity is closed in Phase 1", () => {
    expect(isMarketOpen("equity")).toBe(false);
  });

  it("commodity is closed in Phase 1", () => {
    expect(isMarketOpen("commodity")).toBe(false);
  });
});

describe("resolveMarket", () => {
  it("BTC/USDT → crypto", () => {
    expect(resolveMarket("BTC/USDT")).toBe("crypto");
  });

  it("ETH/BTC → crypto", () => {
    expect(resolveMarket("ETH/BTC")).toBe("crypto");
  });

  it("AAPL → equity", () => {
    expect(resolveMarket("AAPL")).toBe("equity");
  });

  it("TSLA → equity", () => {
    expect(resolveMarket("TSLA")).toBe("equity");
  });
});

describe("getMarketTimezone", () => {
  it("crypto → UTC", () => {
    expect(getMarketTimezone("crypto")).toBe("UTC");
  });

  it("equity → America/New_York", () => {
    expect(getMarketTimezone("equity")).toBe("America/New_York");
  });

  it("commodity → America/Chicago", () => {
    expect(getMarketTimezone("commodity")).toBe("America/Chicago");
  });
});
