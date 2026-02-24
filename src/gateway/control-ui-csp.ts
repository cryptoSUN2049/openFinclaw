export function buildControlUiCspHeader(opts?: { extraConnectSrc?: string[] }): string {
  // Control UI: block framing, block inline scripts, keep styles permissive
  // (UI uses a lot of inline style attributes in templates).
  const connectSrc = ["'self'", "ws:", "wss:"];
  if (opts?.extraConnectSrc) {
    for (const src of opts.extraConnectSrc) {
      if (src && !connectSrc.includes(src)) {
        connectSrc.push(src);
      }
    }
  }
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src ${connectSrc.join(" ")}`,
  ].join("; ");
}
