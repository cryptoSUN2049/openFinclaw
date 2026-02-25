/**
 * CCXT Bridge — unified trading interface across exchanges.
 * Wraps createOrder, cancelOrder, fetchPositions, etc. with
 * error handling and health checks.
 */

/** Categorized error from a CCXT exchange call. */
export class CcxtBridgeError extends Error {
  constructor(
    message: string,
    public readonly category:
      | "auth"
      | "insufficient_funds"
      | "rate_limit"
      | "network"
      | "invalid_order"
      | "not_found"
      | "exchange"
      | "unknown",
    public readonly original?: unknown,
  ) {
    super(message);
    this.name = "CcxtBridgeError";
  }
}

/**
 * Wrap a CCXT error into a categorized CcxtBridgeError.
 * Detects common error class names without importing ccxt at the call-site.
 */
function wrapCcxtError(err: unknown, context: string): CcxtBridgeError {
  if (err instanceof CcxtBridgeError) return err;

  const name = (err as { constructor?: { name?: string } })?.constructor?.name ?? "";
  const message = err instanceof Error ? err.message : String(err);

  if (name === "AuthenticationError" || name === "PermissionDenied") {
    return new CcxtBridgeError(
      `[${context}] Authentication failed: ${message}`,
      "auth",
      err,
    );
  }
  if (name === "InsufficientFunds") {
    return new CcxtBridgeError(
      `[${context}] Insufficient funds: ${message}`,
      "insufficient_funds",
      err,
    );
  }
  if (name === "RateLimitExceeded" || name === "DDoSProtection") {
    return new CcxtBridgeError(
      `[${context}] Rate limited: ${message}`,
      "rate_limit",
      err,
    );
  }
  if (
    name === "NetworkError" ||
    name === "RequestTimeout" ||
    name === "ExchangeNotAvailable"
  ) {
    return new CcxtBridgeError(
      `[${context}] Network error: ${message}`,
      "network",
      err,
    );
  }
  if (name === "InvalidOrder" || name === "OrderNotFound") {
    return new CcxtBridgeError(
      `[${context}] Invalid order: ${message}`,
      "invalid_order",
      err,
    );
  }
  if (name === "BadRequest" || name === "BadSymbol") {
    return new CcxtBridgeError(
      `[${context}] Bad request: ${message}`,
      "exchange",
      err,
    );
  }

  return new CcxtBridgeError(
    `[${context}] ${message}`,
    "unknown",
    err,
  );
}

export class CcxtBridge {
  constructor(private exchange: unknown) {}

  async placeOrder(params: {
    symbol: string;
    side: "buy" | "sell";
    type: "market" | "limit";
    amount: number;
    price?: number;
    params?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    try {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return (await ex.createOrder(
        params.symbol,
        params.type,
        params.side,
        params.amount,
        params.price,
        params.params,
      )) as Record<string, unknown>;
    } catch (err) {
      throw wrapCcxtError(err, `placeOrder ${params.side} ${params.symbol}`);
    }
  }

  async cancelOrder(id: string, symbol: string): Promise<Record<string, unknown>> {
    try {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return (await ex.cancelOrder(id, symbol)) as Record<string, unknown>;
    } catch (err) {
      throw wrapCcxtError(err, `cancelOrder ${id}`);
    }
  }

  async fetchPositions(symbol?: string): Promise<unknown[]> {
    try {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return (await ex.fetchPositions(symbol ? [symbol] : undefined)) as unknown[];
    } catch (err) {
      throw wrapCcxtError(err, `fetchPositions ${symbol ?? "all"}`);
    }
  }

  async fetchBalance(): Promise<Record<string, unknown>> {
    try {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return (await ex.fetchBalance()) as Record<string, unknown>;
    } catch (err) {
      throw wrapCcxtError(err, "fetchBalance");
    }
  }

  async fetchTicker(symbol: string): Promise<Record<string, unknown>> {
    try {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return (await ex.fetchTicker(symbol)) as Record<string, unknown>;
    } catch (err) {
      throw wrapCcxtError(err, `fetchTicker ${symbol}`);
    }
  }

  async fetchOpenOrders(symbol?: string): Promise<unknown[]> {
    try {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return (await ex.fetchOpenOrders(symbol)) as unknown[];
    } catch (err) {
      throw wrapCcxtError(err, `fetchOpenOrders ${symbol ?? "all"}`);
    }
  }

  async fetchOrder(orderId: string, symbol: string): Promise<Record<string, unknown>> {
    try {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return (await ex.fetchOrder(orderId, symbol)) as Record<string, unknown>;
    } catch (err) {
      throw wrapCcxtError(err, `fetchOrder ${orderId}`);
    }
  }
}
