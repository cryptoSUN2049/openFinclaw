import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { ExchangeRegistry } from "./src/exchange-registry.js";
import { RiskController } from "./src/risk-controller.js";
import type { ExchangeConfig, TradingRiskConfig } from "./src/types.js";

export { ExchangeRegistry } from "./src/exchange-registry.js";
export { RiskController } from "./src/risk-controller.js";
export * from "./src/types.js";

const DEFAULT_RISK_CONFIG: TradingRiskConfig = {
  enabled: false,
  maxAutoTradeUsd: 500,
  confirmThresholdUsd: 5000,
  maxDailyLossUsd: 2000,
  maxPositionPct: 25,
  maxLeverage: 5,
};

const finCorePlugin = {
  id: "fin-core",
  name: "Financial Core",
  description: "Core financial infrastructure: exchange registry, risk controller, shared types",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    const registry = new ExchangeRegistry();

    // Pre-load exchanges from config so they're available immediately.
    const financialConfig = api.config?.financial;
    if (financialConfig?.exchanges) {
      for (const [name, cfg] of Object.entries(financialConfig.exchanges)) {
        registry.addExchange(name, cfg as ExchangeConfig);
      }
    }

    // Apply configured risk limits, falling back to safe defaults.
    const tradingCfg = financialConfig?.trading;
    const riskConfig: TradingRiskConfig = {
      ...DEFAULT_RISK_CONFIG,
      ...(tradingCfg?.enabled != null && { enabled: tradingCfg.enabled }),
      ...(tradingCfg?.maxAutoTradeUsd != null && { maxAutoTradeUsd: tradingCfg.maxAutoTradeUsd }),
      ...(tradingCfg?.confirmThresholdUsd != null && {
        confirmThresholdUsd: tradingCfg.confirmThresholdUsd,
      }),
      ...(tradingCfg?.maxDailyLossUsd != null && { maxDailyLossUsd: tradingCfg.maxDailyLossUsd }),
      ...(tradingCfg?.maxPositionPct != null && { maxPositionPct: tradingCfg.maxPositionPct }),
      ...(tradingCfg?.maxLeverage != null && { maxLeverage: tradingCfg.maxLeverage }),
      ...(tradingCfg?.allowedPairs && { allowedPairs: tradingCfg.allowedPairs }),
      ...(tradingCfg?.blockedPairs && { blockedPairs: tradingCfg.blockedPairs }),
    };
    const riskController = new RiskController(riskConfig);

    // Expose services for other fin-* plugins to consume.
    // The registry handles optional `instance` at runtime — cast to satisfy the type.
    api.registerService({
      id: "fin-exchange-registry",
      start: () => {},
      instance: registry,
    } as Parameters<typeof api.registerService>[0]);

    api.registerService({
      id: "fin-risk-controller",
      start: () => {},
      instance: riskController,
    } as Parameters<typeof api.registerService>[0]);

    // Register CLI commands for exchange management.
    api.registerCli(({ program }) => {
      const exchange = program.command("exchange").description("Manage exchange connections");

      exchange
        .command("list")
        .description("List configured exchanges")
        .action(() => {
          const exchanges = registry.listExchanges();
          if (exchanges.length === 0) {
            console.log("No exchanges configured. Run: openfinclaw exchange add <name>");
            return;
          }
          console.log("Configured exchanges:");
          for (const ex of exchanges) {
            console.log(`  ${ex.id} (${ex.exchange}${ex.testnet ? " [testnet]" : ""})`);
          }
        });

      exchange
        .command("add <name>")
        .description("Add an exchange connection")
        .option("--exchange <type>", "Exchange type (binance, okx, bybit, hyperliquid)")
        .option("--api-key <key>", "API key")
        .option("--secret <secret>", "API secret")
        .option("--passphrase <pass>", "API passphrase (OKX)")
        .option("--testnet", "Use testnet/sandbox mode")
        .action((name: string, opts: Record<string, string | boolean | undefined>) => {
          registry.addExchange(name, {
            exchange: (opts.exchange ?? name) as "binance" | "okx" | "bybit" | "hyperliquid",
            apiKey: (opts.apiKey as string) ?? "",
            secret: (opts.secret as string) ?? "",
            passphrase: opts.passphrase as string | undefined,
            testnet: !!opts.testnet,
          });
          console.log(`Exchange "${name}" added${opts.testnet ? " (testnet)" : ""}.`);
        });

      exchange
        .command("remove <name>")
        .description("Remove an exchange connection")
        .action((name: string) => {
          if (registry.removeExchange(name)) {
            console.log(`Exchange "${name}" removed.`);
          } else {
            console.log(`Exchange "${name}" not found.`);
          }
        });
    });

    // Risk control hook: intercept all fin_* tool calls.
    api.registerHook(
      "before_tool_call",
      async (ctx) => {
        const toolName = (ctx as unknown as Record<string, unknown>).toolName as string | undefined;
        if (
          !toolName ||
          (!toolName.startsWith("fin_place_order") && !toolName.startsWith("fin_modify_order"))
        ) {
          return; // Only gate trading actions.
        }

        // Risk evaluation happens in fin-trading; this hook provides the controller.
        (ctx as unknown as Record<string, unknown>).riskController = riskController;
      },
      { name: "fin-risk-gate" },
    );
  },
};

export default finCorePlugin;
