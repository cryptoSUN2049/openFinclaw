/**
 * @openfinclaw/fin-shared-types
 *
 * Canonical source for types, interfaces, and pure functions that are
 * shared across multiple fin-* extensions.  Cross-extension imports
 * should go through this package to avoid direct source-level coupling.
 */

// Types & interfaces
export type {
  // Market data
  OHLCV,
  MarketType,
  MarketRegime,
  // Strategy engine
  StrategyLevel,
  StrategyStatus,
  Signal,
  Position,
  IndicatorLib,
  StrategyContext,
  StrategyDefinition,
  BacktestConfig,
  TradeRecord,
  BacktestResult,
  WalkForwardResult,
  StrategyRecord,
  // Paper trading
  DecayState,
  // Fitness
  FitnessInput,
  // Fill simulation
  FillResult,
} from "./src/types.js";

// Pure functions — stats
export { mean, stdDev, sharpeRatio } from "./src/stats.js";

// Pure functions — fill simulation
export { applyConstantSlippage } from "./src/fill-simulation.js";
