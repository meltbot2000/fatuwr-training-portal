import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  // vite.config.ts exports a FUNCTION (it varies plugins by command), and spreading a
  // function yields {} — no root, no @ alias, no React or Tailwind plugin, so the dev
  // server would serve nothing. Resolve it first. `configFile: false` means Vite will not
  // load and call it for us.
  const resolvedViteConfig =
    typeof viteConfig === "function"
      ? await viteConfig({ command: "serve", mode: "development" })
      : viteConfig;

  const vite = await createViteServer({
    ...resolvedViteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Vite gives every asset a content hash (index-D1QrBWF4.js), so an asset URL can never
  // change meaning — cache it for a year. Without this, express.static sends
  // `Cache-Control: public, max-age=0` and every app open re-validates every asset before
  // the app can render, which on a phone is a round trip per file each time.
  app.use(
    "/assets",
    express.static(path.resolve(distPath, "assets"), {
      immutable: true,
      maxAge: "1y",
    })
  );

  // index.html must NEVER be cached that way: it is what points at the current hashed
  // bundle, so a stale copy pins the app to a deleted asset.
  app.use(express.static(distPath, { index: false, maxAge: 0 }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Surrogate-Control", "no-store");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
