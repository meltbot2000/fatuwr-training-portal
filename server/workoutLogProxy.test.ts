import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { createWorkoutLogProxy } from "./workoutLogProxy";

let upstream: Server, portal: Server, base = "", target = "";

beforeAll(async () => {
  const up = express();
  up.use(express.json());
  up.all("*", (req, res) => res.set("x-up", "1").json({ method: req.method, url: req.originalUrl, body: req.body ?? null, fwdHost: req.headers["x-forwarded-host"] }));
  upstream = up.listen(0);
  await new Promise(r => upstream.once("listening", r));
  const upUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

  const app = express();
  app.use(createWorkoutLogProxy("/amager", () => target));
  app.use(express.json()); // the real portal's parser sits AFTER the proxy, like this
  app.get("*", (_req, res) => res.send("portal"));
  portal = app.listen(0);
  await new Promise(r => portal.once("listening", r));
  base = `http://127.0.0.1:${(portal.address() as AddressInfo).port}`;
  target = upUrl;
});
afterAll(() => { upstream.close(); portal.close(); });

describe("workout-log proxy", () => {
  it("forwards GETs with the prefix kept", async () => {
    const r = await fetch(`${base}/amager/api/me?x=1`);
    expect(r.headers.get("x-up")).toBe("1");
    expect((await r.json()).url).toBe("/amager/api/me?x=1");
  });
  it("forwards POST bodies intact", async () => {
    const r = await fetch(`${base}/amager/api/workouts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationMin: 45 }) });
    const j = await r.json();
    expect(j.method).toBe("POST");
    expect(j.body).toEqual({ durationMin: 45 });
    expect(j.fwdHost).toContain("127.0.0.1");
  });
  it("leaves other portal paths alone, including look-alikes", async () => {
    expect(await (await fetch(`${base}/sessions`)).text()).toBe("portal");
    expect(await (await fetch(`${base}/amagerx`)).text()).toBe("portal");
  });
  it("503s when not configured and 502s when the service is down", async () => {
    const saved = target;
    target = "";
    expect((await fetch(`${base}/amager/`)).status).toBe(503);
    target = "http://127.0.0.1:1";
    expect((await fetch(`${base}/amager/`)).status).toBe(502);
    target = saved;
  });
});
