import { describe, it, expect } from "vitest";
import { calculateFitness } from "./fitness.js";
import type { FitnessInput } from "./fitness.js";

describe("calculateFitness", () => {
  it("good strategy with all windows positive → fitness > 0", () => {
    const input: FitnessInput = {
      longTerm: { sharpe: 1.5, maxDD: -0.1, trades: 200 },
      recent: { sharpe: 1.8, maxDD: -0.08, trades: 50 },
      paper: { sharpe: 1.6, maxDD: -0.09, trades: 30 },
    };
    const fitness = calculateFitness(input);
    expect(fitness).toBeGreaterThan(0);
  });

  it("decaying strategy (longTerm good, recent bad) → lower fitness", () => {
    const good: FitnessInput = {
      longTerm: { sharpe: 2.0, maxDD: -0.1, trades: 200 },
      recent: { sharpe: 2.0, maxDD: -0.1, trades: 50 },
      paper: { sharpe: 2.0, maxDD: -0.1, trades: 30 },
    };
    const decaying: FitnessInput = {
      longTerm: { sharpe: 2.0, maxDD: -0.1, trades: 200 },
      recent: { sharpe: 0.5, maxDD: -0.2, trades: 50 },
      paper: { sharpe: 0.5, maxDD: -0.2, trades: 30 },
    };
    expect(calculateFitness(decaying)).toBeLessThan(calculateFitness(good));
  });

  it("overfitting strategy (backtest good, paper bad) → penalized vs non-overfit", () => {
    // Same base inputs, but paper sharpe much lower than recent sharpe → overfit penalty
    const noOverfit: FitnessInput = {
      longTerm: { sharpe: 1.5, maxDD: -0.1, trades: 200 },
      recent: { sharpe: 1.5, maxDD: -0.1, trades: 50 },
      paper: { sharpe: 1.5, maxDD: -0.1, trades: 30 },
    };
    const overfitting: FitnessInput = {
      longTerm: { sharpe: 1.5, maxDD: -0.1, trades: 200 },
      recent: { sharpe: 1.5, maxDD: -0.1, trades: 50 },
      paper: { sharpe: 0.3, maxDD: -0.3, trades: 30 },
    };
    expect(calculateFitness(overfitting)).toBeLessThan(calculateFitness(noOverfit));
  });

  it("no paper data → uses recent 70% + longTerm 30%", () => {
    const input: FitnessInput = {
      longTerm: { sharpe: 1.0, maxDD: -0.15, trades: 200 },
      recent: { sharpe: 1.5, maxDD: -0.1, trades: 50 },
    };
    const fitness = calculateFitness(input);
    expect(fitness).toBeGreaterThan(0);
    expect(Number.isFinite(fitness)).toBe(true);
  });

  it("applies correlation penalty", () => {
    const base: FitnessInput = {
      longTerm: { sharpe: 1.5, maxDD: -0.1, trades: 200 },
      recent: { sharpe: 1.5, maxDD: -0.1, trades: 50 },
      correlationWithPortfolio: 0,
    };
    const correlated: FitnessInput = {
      ...base,
      correlationWithPortfolio: 0.9,
    };
    expect(calculateFitness(correlated)).toBeLessThan(calculateFitness(base));
  });

  it("applies half-life penalty after 180 days", () => {
    const fresh: FitnessInput = {
      longTerm: { sharpe: 1.5, maxDD: -0.1, trades: 200 },
      recent: { sharpe: 1.5, maxDD: -0.1, trades: 50 },
      daysSinceLaunch: 90,
    };
    const stale: FitnessInput = {
      ...fresh,
      daysSinceLaunch: 365,
    };
    expect(calculateFitness(stale)).toBeLessThan(calculateFitness(fresh));
  });

  it("no half-life penalty at exactly 180 days", () => {
    const at180: FitnessInput = {
      longTerm: { sharpe: 1.5, maxDD: -0.1, trades: 200 },
      recent: { sharpe: 1.5, maxDD: -0.1, trades: 50 },
      daysSinceLaunch: 180,
    };
    const at90: FitnessInput = {
      ...at180,
      daysSinceLaunch: 90,
    };
    // At exactly 180 days, penalty = 0.1 * (180-180)/365 = 0
    expect(calculateFitness(at180)).toBe(calculateFitness(at90));
  });

  it("handles all-negative sharpe values", () => {
    const input: FitnessInput = {
      longTerm: { sharpe: -0.5, maxDD: -0.3, trades: 100 },
      recent: { sharpe: -1.0, maxDD: -0.4, trades: 30 },
    };
    const fitness = calculateFitness(input);
    expect(Number.isFinite(fitness)).toBe(true);
  });
});
