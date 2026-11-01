/**
 * Forwards fatuwr.up.railway.app/amager/* to the separate workout-log service.
 *
 * Railway gives each service its own domain and cannot route a PATH of one domain to
 * another service, so the portal forwards it. The workout-log app stays a separate
 * service with its own database; this is a plain byte-for-byte pass-through with the
 * /amager prefix kept (the app runs with BASE_PATH=/amager).
 *
 * WORKOUT_LOG_URL is the service's PRIVATE address, e.g.
 * http://workout-log.railway.internal:8080 — never the public domain (an extra trip out
 * through the edge and back). Unset = /amager answers 503.
 *
 * Must be mounted BEFORE express.json(): a body parser would consume the request
 * stream and POSTs would arrive empty.
 */
import http from "http";
import https from "https";
import type { NextFunction, Request, Response } from "express";

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
]);

export function createWorkoutLogProxy(prefix: string, getTarget: () => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path !== prefix && !req.path.startsWith(prefix + "/")) return next();
    const target = getTarget();
    if (!target) {
      res.status(503).type("text").send("The competition prep app is not configured yet.");
      return;
    }
    let url: URL;
    try { url = new URL(req.originalUrl, target); } catch {
      res.status(500).type("text").send("WORKOUT_LOG_URL is not a valid URL.");
      return;
    }

    const headers: http.OutgoingHttpHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) headers[k] = v;
    }
    headers.host = url.host;
    headers["x-forwarded-host"] = req.headers.host ?? "";
    headers["x-forwarded-proto"] = req.protocol;
    headers["x-forwarded-for"] = [req.headers["x-forwarded-for"], req.socket.remoteAddress].filter(Boolean).join(", ");

    const upstream = (url.protocol === "https:" ? https : http).request(url, {
      method: req.method,
      headers,
      timeout: 30_000,
    }, (up) => {
      const out: http.OutgoingHttpHeaders = {};
      for (const [k, v] of Object.entries(up.headers)) {
        if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) out[k] = v;
      }
      res.writeHead(up.statusCode ?? 502, out);
      up.pipe(res);
    });
    upstream.on("timeout", () => upstream.destroy(new Error("upstream timeout")));
    upstream.on("error", (e) => {
      console.error("[workout-log proxy]", e.message);
      if (!res.headersSent) res.status(502).type("text").send("The competition prep app is unavailable right now. Try again in a minute.");
      else res.end();
    });
    req.pipe(upstream);
  };
}
