# OpenFinClaw Heartbeat — Financial Monitoring Checklist

> This template defines the periodic checks your financial butler performs.
> Customize frequencies and thresholds in your `openfinclaw.yaml` config.

## Every 30 Seconds — Critical Monitors

- [ ] **Stop-loss proximity**: Any position within 2% of stop-loss price?
- [ ] **Liquidation risk**: Any leveraged position above 80% margin usage?
- [ ] **Open order status**: Any orders stuck or partially filled beyond timeout?

## Every 5 Minutes — Price Alerts

- [ ] **User-defined price alerts**: Check all active alerts against current prices
- [ ] **Significant moves**: Any watched asset moved >3% in the last 5 minutes?
- [ ] **Spread anomalies**: Unusual bid-ask spreads on actively traded pairs?

## Every Hour — Market Scan

- [ ] **Portfolio P&L update**: Calculate unrealized P&L across all exchanges
- [ ] **Correlation check**: Are portfolio assets moving in unexpected correlation?
- [ ] **Volume anomalies**: Unusual volume spikes on held assets?
- [ ] **Funding rates**: Check perpetual funding rates for held positions

## Daily at 07:00 — Morning Brief

- [ ] **Overnight summary**: What happened while you were away?
- [ ] **Portfolio snapshot**: Current holdings, P&L, allocation percentages
- [ ] **Market overview**: Major index moves, crypto market cap, fear/greed index
- [ ] **Calendar events**: Earnings, FOMC, token unlocks, options expiry today
- [ ] **Pending actions**: Unfilled orders, expiring alerts, due rebalances

## Daily at 17:00 — End of Day Review

- [ ] **Day's trades**: Summary of all executed trades with P&L
- [ ] **Portfolio drift**: Has allocation drifted from target? Suggest rebalance?
- [ ] **Risk assessment**: Updated risk metrics (VaR, max drawdown, Sharpe)
- [ ] **News impact**: Key news events and their observed portfolio impact

## Weekly (Sunday 10:00) — Weekly Report

- [ ] **Weekly P&L**: Detailed breakdown by asset and strategy
- [ ] **Benchmark comparison**: Performance vs. BTC, ETH, S&P 500
- [ ] **Trade review**: Win rate, average R:R, best/worst trades
- [ ] **Strategy assessment**: Are current strategies performing as expected?
- [ ] **Rebalance recommendation**: Suggested portfolio adjustments
- [ ] **Upcoming week**: Key events and potential trading opportunities

## Monthly (1st, 09:00) — Monthly Report

- [ ] **Monthly performance**: Returns, fees, slippage analysis
- [ ] **Asset allocation evolution**: How has the portfolio changed?
- [ ] **Tax events**: Capital gains/losses for tax reporting
- [ ] **Goal progress**: Are financial goals on track?
- [ ] **Risk profile review**: Should risk parameters be adjusted?
