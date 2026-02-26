import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import { confirm, select, text } from "./configure.shared.js";
import { guardCancel } from "./onboard-helpers.js";

type ExchangeId = "binance" | "okx" | "bybit" | "hyperliquid";

interface ExchangeEntry {
  exchange: ExchangeId;
  apiKey: string;
  secret: string;
  passphrase?: string;
  testnet?: boolean;
}

/** Run the financial configuration wizard section. */
export async function promptFinancialConfig(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
): Promise<OpenClawConfig> {
  let nextConfig = { ...cfg };

  note(
    [
      "Configure exchange connections and trading risk limits.",
      "API keys are stored locally in your config file — never transmitted.",
      "Docs: https://docs.openclaw.ai/financial/setup",
    ].join("\n"),
    "Financial configuration",
  );

  const existingFinancial = (nextConfig as Record<string, unknown>).financial as
    | Record<string, unknown>
    | undefined;
  const existingExchanges = (existingFinancial?.exchanges ?? {}) as Record<string, ExchangeEntry>;
  const existingTrading = (existingFinancial?.trading ?? {}) as Record<string, unknown>;

  const configuredIds = Object.keys(existingExchanges);
  if (configuredIds.length > 0) {
    note(
      configuredIds
        .map((id) => {
          const ex = existingExchanges[id];
          return `  ${id} (${ex.exchange}${ex.testnet ? " [testnet]" : ""})`;
        })
        .join("\n"),
      "Configured exchanges",
    );
  }

  // Exchange management loop
  while (true) {
    const action = guardCancel(
      await select({
        message: "Exchange connections",
        options: [
          { value: "add", label: "Add exchange", hint: "Connect a new exchange" },
          ...(configuredIds.length > 0
            ? [
                {
                  value: "remove" as const,
                  label: "Remove exchange",
                  hint: "Remove an existing connection",
                },
              ]
            : []),
          {
            value: "done" as const,
            label: "Done",
            hint: configuredIds.length > 0 ? "Continue to risk settings" : "Skip exchanges",
          },
        ],
      }),
      runtime,
    );

    if (action === "done") {
      break;
    }

    if (action === "add") {
      const exchangeType = guardCancel(
        await select<ExchangeId>({
          message: "Select exchange",
          options: [
            { value: "binance", label: "Binance", hint: "World's largest crypto exchange" },
            { value: "okx", label: "OKX", hint: "Requires API passphrase" },
            { value: "bybit", label: "Bybit", hint: "Derivatives-focused" },
            { value: "hyperliquid", label: "Hyperliquid", hint: "On-chain perps DEX" },
          ],
        }),
        runtime,
      );

      const nameInput = guardCancel(
        await text({
          message: "Connection name (e.g. my-binance, binance-testnet)",
          placeholder: `${exchangeType}-main`,
          validate: (v) => {
            const s = (v ?? "").trim();
            if (!s) {
              return "Name is required";
            }
            if (!/^[\w-]+$/.test(s)) {
              return "Use only letters, numbers, hyphens, underscores";
            }
            return undefined;
          },
        }),
        runtime,
      );
      const name = String(nameInput).trim();

      const apiKeyInput = guardCancel(
        await text({
          message: "API Key",
          placeholder: "Paste your API key",
          validate: (v) => ((v ?? "").trim() ? undefined : "API key is required"),
        }),
        runtime,
      );

      const secretInput = guardCancel(
        await text({
          message: "API Secret",
          placeholder: "Paste your API secret",
          validate: (v) => ((v ?? "").trim() ? undefined : "API secret is required"),
        }),
        runtime,
      );

      let passphrase: string | undefined;
      if (exchangeType === "okx") {
        const passphraseInput = guardCancel(
          await text({
            message: "API Passphrase (required for OKX)",
            placeholder: "Paste your passphrase",
            validate: (v) => ((v ?? "").trim() ? undefined : "Passphrase is required for OKX"),
          }),
          runtime,
        );
        passphrase = String(passphraseInput).trim();
      }

      const useTestnet = guardCancel(
        await confirm({
          message: "Use testnet/sandbox mode?",
          initialValue: false,
        }),
        runtime,
      );

      const entry: ExchangeEntry = {
        exchange: exchangeType,
        apiKey: String(apiKeyInput).trim(),
        secret: String(secretInput).trim(),
        ...(passphrase ? { passphrase } : {}),
        ...(useTestnet ? { testnet: true } : {}),
      };

      existingExchanges[name] = entry;
      configuredIds.push(name);

      // Test connection
      const shouldTest = guardCancel(
        await confirm({
          message: "Test connection now? (calls fetchBalance to verify)",
          initialValue: true,
        }),
        runtime,
      );

      if (shouldTest) {
        try {
          // Dynamic import — ccxt must be installed as a peer dependency
          let ccxt: Record<string, unknown>;
          try {
            // eslint-disable-next-line no-implied-eval -- dynamic import for optional peer dep
            ccxt = await (Function('return import("ccxt")')() as Promise<Record<string, unknown>>);
          } catch {
            throw new Error("ccxt package not found. Install it: pnpm add ccxt");
          }
          const ExchangeClass = ccxt[exchangeType];
          if (typeof ExchangeClass !== "function") {
            throw new Error(`Unsupported exchange: ${exchangeType}`);
          }
          const instance = new (ExchangeClass as new (
            opts: Record<string, unknown>,
          ) => Record<string, unknown>)({
            apiKey: entry.apiKey,
            secret: entry.secret,
            password: entry.passphrase,
            enableRateLimit: true,
          });
          if (useTestnet && typeof instance.setSandboxMode === "function") {
            (instance as { setSandboxMode: (v: boolean) => void }).setSandboxMode(true);
          }
          const balance = await (
            instance as { fetchBalance: () => Promise<Record<string, unknown>> }
          ).fetchBalance();
          const total = balance.total as Record<string, number> | undefined;
          const nonZero = total ? Object.entries(total).filter(([, v]) => v > 0) : [];
          note(
            nonZero.length > 0
              ? nonZero.map(([coin, amt]) => `  ${coin}: ${amt}`).join("\n")
              : "  Connection successful (no balances found)",
            "Connection verified",
          );
        } catch (err) {
          note(
            `Connection failed: ${err instanceof Error ? err.message : String(err)}\nYou can fix the credentials later with: openfinclaw config --section financial`,
            "Connection test failed",
          );
        }
      }

      note(`Exchange "${name}" (${exchangeType}${useTestnet ? " testnet" : ""}) added.`, "Added");
    }

    if (action === "remove") {
      const toRemove = guardCancel(
        await select({
          message: "Remove which exchange?",
          options: configuredIds.map((id) => ({
            value: id,
            label: id,
            hint: `${existingExchanges[id].exchange}${existingExchanges[id].testnet ? " [testnet]" : ""}`,
          })),
        }),
        runtime,
      );

      const confirmed = guardCancel(
        await confirm({
          message: `Remove "${toRemove}" connection?`,
          initialValue: false,
        }),
        runtime,
      );

      if (confirmed) {
        delete existingExchanges[toRemove];
        const idx = configuredIds.indexOf(toRemove);
        if (idx >= 0) {
          configuredIds.splice(idx, 1);
        }
        note(`Exchange "${toRemove}" removed.`, "Removed");
      }
    }
  }

  // Risk configuration
  if (configuredIds.length > 0) {
    const configureRisk = guardCancel(
      await confirm({
        message: "Configure trading risk limits?",
        initialValue: true,
      }),
      runtime,
    );

    if (configureRisk) {
      const enableTrading = guardCancel(
        await confirm({
          message: "Enable automated trading? (can be changed later)",
          initialValue: (existingTrading.enabled as boolean) ?? false,
        }),
        runtime,
      );

      const maxAutoInput = guardCancel(
        await text({
          message: "Max auto-trade size (USD) — orders below this execute automatically",
          initialValue: String(Number(existingTrading.maxAutoTradeUsd) || 500),
          validate: (v) =>
            Number.isFinite(Number(v ?? "")) && Number(v ?? "") > 0
              ? undefined
              : "Enter a positive number",
        }),
        runtime,
      );

      const confirmThresholdInput = guardCancel(
        await text({
          message: "Confirmation threshold (USD) — orders above this require user confirmation",
          initialValue: String(Number(existingTrading.confirmThresholdUsd) || 5000),
          validate: (v) =>
            Number.isFinite(Number(v ?? "")) && Number(v ?? "") > 0
              ? undefined
              : "Enter a positive number",
        }),
        runtime,
      );

      const maxDailyLossInput = guardCancel(
        await text({
          message: "Max daily loss limit (USD) — trading halts when reached",
          initialValue: String(Number(existingTrading.maxDailyLossUsd) || 2000),
          validate: (v) =>
            Number.isFinite(Number(v ?? "")) && Number(v ?? "") > 0
              ? undefined
              : "Enter a positive number",
        }),
        runtime,
      );

      const maxLeverageInput = guardCancel(
        await text({
          message: "Max leverage allowed",
          initialValue: String(Number(existingTrading.maxLeverage) || 5),
          validate: (v) =>
            Number.isFinite(Number(v ?? "")) && Number(v ?? "") >= 1
              ? undefined
              : "Enter a number >= 1",
        }),
        runtime,
      );

      existingTrading.enabled = enableTrading;
      existingTrading.maxAutoTradeUsd = Number(maxAutoInput);
      existingTrading.confirmThresholdUsd = Number(confirmThresholdInput);
      existingTrading.maxDailyLossUsd = Number(maxDailyLossInput);
      existingTrading.maxLeverage = Number(maxLeverageInput);
      existingTrading.maxPositionPct = (existingTrading.maxPositionPct as number) ?? 25;

      note(
        [
          `Trading: ${enableTrading ? "enabled" : "disabled"}`,
          `Auto-trade limit: $${String(existingTrading.maxAutoTradeUsd)}`,
          `Confirm threshold: $${String(existingTrading.confirmThresholdUsd)}`,
          `Daily loss limit: $${String(existingTrading.maxDailyLossUsd)}`,
          `Max leverage: ${String(existingTrading.maxLeverage)}x`,
        ].join("\n"),
        "Risk limits configured",
      );
    }
  }

  // Build the financial config section
  nextConfig = {
    ...nextConfig,
    financial: {
      exchanges: existingExchanges,
      trading: {
        enabled: (existingTrading.enabled as boolean) ?? false,
        maxAutoTradeUsd: (existingTrading.maxAutoTradeUsd as number) ?? 500,
        confirmThresholdUsd: (existingTrading.confirmThresholdUsd as number) ?? 5000,
        maxDailyLossUsd: (existingTrading.maxDailyLossUsd as number) ?? 2000,
        maxPositionPct: (existingTrading.maxPositionPct as number) ?? 25,
        maxLeverage: (existingTrading.maxLeverage as number) ?? 5,
      },
    },
  } as OpenClawConfig;

  return nextConfig;
}
