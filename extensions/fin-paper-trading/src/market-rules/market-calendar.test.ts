import { describe, expect, it } from "vitest";
import { isMarketOpen, resolveMarket, getMarketTimezone } from "./market-calendar.js";

describe("resolveMarket", () => {
  it("BTC/USDT -> crypto", () => expect(resolveMarket("BTC/USDT")).toBe("crypto"));
  it("ETH/BTC -> crypto", () => expect(resolveMarket("ETH/BTC")).toBe("crypto"));
  it("600519.SH -> cn_a_share", () => expect(resolveMarket("600519.SH")).toBe("cn_a_share"));
  it("000001.SZ -> cn_a_share", () => expect(resolveMarket("000001.SZ")).toBe("cn_a_share"));
  it("0700.HK -> hk_equity", () => expect(resolveMarket("0700.HK")).toBe("hk_equity"));
  it("9988.HK -> hk_equity", () => expect(resolveMarket("9988.HK")).toBe("hk_equity"));
  it("AAPL -> us_equity", () => expect(resolveMarket("AAPL")).toBe("us_equity"));
  it("TSLA -> us_equity", () => expect(resolveMarket("TSLA")).toBe("us_equity"));
  it("MSFT -> us_equity", () => expect(resolveMarket("MSFT")).toBe("us_equity"));
});

describe("isMarketOpen", () => {
  it("crypto is always open", () => {
    expect(isMarketOpen("crypto")).toBe(true);
    expect(isMarketOpen("crypto", Date.UTC(2026, 2, 2, 10, 0))).toBe(true);
  });

  it("crypto open on weekends", () => {
    // Saturday 2026-03-07
    expect(isMarketOpen("crypto", Date.UTC(2026, 2, 7, 10, 0))).toBe(true);
  });

  it("US equity open during trading hours", () => {
    // Monday 2026-03-02 14:30 UTC = 09:30 ET (standard time)
    expect(isMarketOpen("us_equity", Date.UTC(2026, 2, 2, 14, 30))).toBe(true);
  });

  it("US equity closed before open", () => {
    // Monday 2026-03-02 14:00 UTC = 09:00 ET
    expect(isMarketOpen("us_equity", Date.UTC(2026, 2, 2, 14, 0))).toBe(false);
  });

  it("US equity closed after close", () => {
    // Monday 2026-03-02 21:00 UTC = 16:00 ET
    expect(isMarketOpen("us_equity", Date.UTC(2026, 2, 2, 21, 0))).toBe(false);
  });

  it("US equity closed on Saturday", () => {
    expect(isMarketOpen("us_equity", Date.UTC(2026, 2, 7, 15, 0))).toBe(false);
  });

  it("HK equity open in morning session", () => {
    // Monday 01:30 UTC = 09:30 HKT
    expect(isMarketOpen("hk_equity", Date.UTC(2026, 2, 2, 1, 30))).toBe(true);
  });

  it("HK equity closed during lunch break", () => {
    // Monday 04:30 UTC = 12:30 HKT (lunch break)
    expect(isMarketOpen("hk_equity", Date.UTC(2026, 2, 2, 4, 30))).toBe(false);
  });

  it("HK equity open in afternoon session", () => {
    // Monday 05:00 UTC = 13:00 HKT
    expect(isMarketOpen("hk_equity", Date.UTC(2026, 2, 2, 5, 0))).toBe(true);
  });

  it("CN A-share open in morning session", () => {
    // Monday 01:30 UTC = 09:30 CST (Asia/Shanghai)
    expect(isMarketOpen("cn_a_share", Date.UTC(2026, 2, 2, 1, 30))).toBe(true);
  });

  it("CN A-share closed during lunch", () => {
    // Monday 03:30 UTC = 11:30 CST (lunch)
    expect(isMarketOpen("cn_a_share", Date.UTC(2026, 2, 2, 3, 30))).toBe(false);
  });

  it("CN A-share open in afternoon", () => {
    // Monday 05:00 UTC = 13:00 CST
    expect(isMarketOpen("cn_a_share", Date.UTC(2026, 2, 2, 5, 0))).toBe(true);
  });
});

describe("getMarketTimezone", () => {
  it("crypto -> UTC", () => expect(getMarketTimezone("crypto")).toBe("UTC"));
  it("us_equity -> America/New_York", () =>
    expect(getMarketTimezone("us_equity")).toBe("America/New_York"));
  it("hk_equity -> Asia/Hong_Kong", () =>
    expect(getMarketTimezone("hk_equity")).toBe("Asia/Hong_Kong"));
  it("cn_a_share -> Asia/Shanghai", () =>
    expect(getMarketTimezone("cn_a_share")).toBe("Asia/Shanghai"));
});
