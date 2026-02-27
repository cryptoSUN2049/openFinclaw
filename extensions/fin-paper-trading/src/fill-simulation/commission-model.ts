/**
 * Commission models for different asset classes.
 * Returns the commission amount and effective rate for a given notional value.
 */

export interface CommissionResult {
  commission: number;
  effectiveRate: number;
}

/** Default commission rates by market and side. */
const RATES: Record<string, { maker: number; taker: number }> = {
  crypto: { maker: 0.0008, taker: 0.001 }, // 0.08% maker, 0.10% taker
  equity: { maker: 0.0005, taker: 0.0005 }, // 0.05% flat
  commodity: { maker: 0.0006, taker: 0.0006 }, // 0.06% flat
};

/**
 * Calculate commission for a trade.
 * @param notional  Total trade value (price * quantity).
 * @param market    Asset class.
 * @param options   Optional: maker/taker side (defaults to taker).
 */
export function calculateCommission(
  notional: number,
  market: "crypto" | "equity" | "commodity",
  options?: { makerTaker?: "maker" | "taker" },
): CommissionResult {
  if (notional === 0) {
    return { commission: 0, effectiveRate: 0 };
  }

  const side = options?.makerTaker ?? "taker";
  const rates = RATES[market];
  const rate = side === "maker" ? rates.maker : rates.taker;
  const commission = notional * rate;

  return { commission, effectiveRate: rate };
}
