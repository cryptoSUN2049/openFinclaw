/**
 * Constant slippage model for paper trading fill simulation.
 * Applies a fixed basis-point spread to the mid price.
 */

export interface FillResult {
  fillPrice: number;
  slippageCost: number;
}

/**
 * Apply constant slippage to a price.
 * @param price  Mid-market price.
 * @param side   Trade direction.
 * @param slippageBps  Slippage in basis points (1 bps = 0.01%).
 */
export function applyConstantSlippage(
  price: number,
  side: "buy" | "sell",
  slippageBps: number,
): FillResult {
  const slippageFraction = slippageBps / 10000;
  const slippageCost = price * slippageFraction;

  const fillPrice = side === "buy" ? price + slippageCost : price - slippageCost;

  return { fillPrice, slippageCost };
}
