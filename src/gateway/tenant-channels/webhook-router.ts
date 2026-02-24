import type { IncomingMessage, ServerResponse } from "node:http";
import type { TenantChannelManager } from "./manager.js";

const MAX_BODY_BYTES = 1024 * 1024;
const BODY_TIMEOUT_MS = 30_000;

/**
 * Handle incoming webhook requests at /wh/telegram/{tenantId}/{secret}.
 * Returns true if the request was handled (regardless of success).
 */
export async function handleTenantWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
  manager: TenantChannelManager | null,
): Promise<boolean> {
  if (!manager) {
    return false;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const match = url.pathname.match(/^\/wh\/telegram\/([^/]+)\/([^/]+)$/);
  if (!match || req.method !== "POST") {
    return false;
  }

  const tenantId = match[1];
  const secret = match[2];

  // Read body with size limit and timeout
  let body: string;
  try {
    body = await readBody(req, MAX_BODY_BYTES, BODY_TIMEOUT_MS);
  } catch {
    res.writeHead(400);
    res.end();
    return true;
  }

  let update: unknown;
  try {
    update = JSON.parse(body);
  } catch {
    res.writeHead(400);
    res.end();
    return true;
  }

  // Route to the correct bot (Telegram expects 200 even on errors)
  try {
    await manager.handleWebhookUpdate(tenantId, secret, update);
  } catch {
    // Swallow — Telegram retries on non-200
  }

  res.writeHead(200);
  res.end();
  return true;
}

function readBody(req: IncomingMessage, maxBytes: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        req.destroy();
        reject(new Error("body read timeout"));
      }
    }, timeoutMs);

    req.on("data", (chunk: Buffer) => {
      if (done) {
        return;
      }
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        done = true;
        clearTimeout(timer);
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", (err) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}
