import express, { type NextFunction, type Request, type Response } from "express";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { hasAccess, issueToken, requireAdmin, requireViewer } from "./auth";
import { addDays, config, todaySgt } from "./config";
import { exec, getPool, query } from "./db";
import { portal, PortalError } from "./portal";
import { buildDashboard, inRange, parsePeriod, periodOptions, periodRange, perWeek, PUFF, puffSummary, summarise, TARGETS, weeksElapsed, WORKOUT_TYPES } from "./stats";
import { resolvePendingInvites } from "./invites";
import { syncAll, syncMember, upsertMember } from "./sync";
import { BadRequest, intIn, isoDate, text, workoutInput } from "./validate";

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

interface CompetitionRow { id: number; name: string; start_date: string; competition_date: string }

const competitionDto = (c: CompetitionRow & { squad_size?: number }) => ({
  id: c.id, name: c.name, startDate: c.start_date, competitionDate: c.competition_date,
  ...(c.squad_size !== undefined ? { squadSize: Number(c.squad_size) } : {}),
});

async function getCompetition(id: unknown): Promise<CompetitionRow> {
  const n = Number(id);
  const [c] = Number.isInteger(n) ? await query<CompetitionRow>("SELECT * FROM competitions WHERE id = ?", [n]) : [];
  if (!c) throw new NotFound("competition not found");
  return c;
}

/** The competition to show when none is chosen: the next upcoming, else the most recent. */
async function defaultCompetition(today: string): Promise<CompetitionRow | null> {
  const [next] = await query<CompetitionRow>(
    "SELECT * FROM competitions WHERE competition_date >= ? ORDER BY competition_date ASC LIMIT 1", [today]);
  if (next) return next;
  const [last] = await query<CompetitionRow>("SELECT * FROM competitions ORDER BY competition_date DESC LIMIT 1");
  return last ?? null;
}

async function viewerCanLog(memberId: number, today: string): Promise<boolean> {
  const [row] = await query(
    `SELECT 1 FROM squad_members s JOIN competitions c ON c.id = s.competition_id
     WHERE s.member_id = ? AND c.competition_date >= ? LIMIT 1`, [memberId, today]);
  return !!row;
}

class NotFound extends Error {}
class Forbidden extends Error {}

const workoutDto = (w: any) => ({
  id: w.id, memberId: w.member_id, date: w.date, type: w.type, durationMin: w.duration_min,
  intensity: w.intensity, notes: w.notes || "",
});
const trainingDto = (t: any) => ({
  signupId: t.signup_id, date: t.date, pool: t.pool, trainingTime: t.training_time, day: t.day,
  activity: t.activity, rainOff: t.rain_off,
});

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Surrogate-Control", "no-store");
    next();
  });

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => { res.json({ status: "ok" }); });
  app.get("/api/health/db", wrap(async (_req, res) => {
    try { await getPool().query("SELECT 1"); res.json({ status: "ok" }); }
    catch { res.status(503).json({ status: "db_unreachable" }); }
  }));

  // Public: lets an open (or reopened) app notice it's out of date and reload.
  app.get("/api/version", (_req, res) => { res.json({ version: frontendVersion() }); });

  // Web app manifest: "Add to Home Screen" opens the comp-prep app full-screen, at
  // /amager/, with the red icon.
  app.get("/manifest.webmanifest", (req, res) => {
    const base = req.baseUrl; // "/amager" when mounted under the prefix
    res.type("application/manifest+json").setHeader("Cache-Control", "no-cache");
    res.json({
      name: "FATUWR Comp Prep", short_name: "Comp Prep",
      start_url: `${base}/`, scope: `${base}/`, display: "standalone",
      background_color: "#111111", theme_color: "#111111",
      icons: [
        { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png" },
        { src: `${base}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" },
      ],
    });
  });

  // ── Login (relayed to the portal) ─────────────────────────────────────────────
  app.post("/api/auth/send", wrap(async (req, res) => {
    const email = text(req.body?.email, "email", 320, { required: true }).toLowerCase();
    await portal.sendOtp(email);
    res.json({ ok: true });
  }));

  app.post("/api/auth/verify", wrap(async (req, res) => {
    const email = text(req.body?.email, "email", 320, { required: true }).toLowerCase();
    const code = text(req.body?.code, "code", 6, { required: true });
    const { member } = await portal.verifyOtp(email, code);
    // Squad members and portal Admins only. Checked before anything is stored, so people
    // outside the squad leave no trace here.
    const isAdmin = config.adminEmails.includes(email);
    if (!(await hasAccess(member.id, isAdmin))) {
      throw new Forbidden("This app is only for the competition squad. Ask an admin if you think you should be on it.");
    }
    await upsertMember(member, { loggedIn: true, isAdmin });
    // Fresh attendance for squad members; don't make the login wait for it.
    if (await viewerCanLog(member.id, todaySgt())) syncMember(member.id).catch(() => {});
    res.json({ token: issueToken(member.id) });
  }));

  // Everything below needs a signed-in portal member.
  app.use("/api", requireViewer);

  app.get("/api/me", wrap(async (req, res) => {
    const v = req.viewer!;
    const today = todaySgt();
    const squads = await query<CompetitionRow>(
      `SELECT c.* FROM competitions c JOIN squad_members s ON s.competition_id = c.id
       WHERE s.member_id = ? ORDER BY c.competition_date DESC`, [v.id]);
    res.json({
      member: { id: v.id, name: v.name, image: v.image, isAdmin: v.isAdmin },
      canLog: await viewerCanLog(v.id, today),
      squads: squads.map(competitionDto),
      workoutTypes: WORKOUT_TYPES,
      today,
    });
  }));

  // ── Competitions & squads ───────────────────────────────────────────────────
  app.get("/api/competitions", wrap(async (_req, res) => {
    const rows = await query<CompetitionRow & { squad_size: number }>(
      `SELECT c.*, (SELECT COUNT(*) FROM squad_members s WHERE s.competition_id = c.id) AS squad_size
       FROM competitions c ORDER BY c.competition_date DESC`);
    res.json({ competitions: rows.map(competitionDto) });
  }));

  const competitionBody = (body: any) => {
    const name = text(body?.name, "name", 200, { required: true });
    const startDate = isoDate(body?.startDate, "startDate");
    const competitionDate = isoDate(body?.competitionDate, "competitionDate");
    if (startDate > competitionDate) throw new BadRequest("prep start must be on or before the competition date");
    return { name, startDate, competitionDate };
  };

  app.post("/api/competitions", requireAdmin, wrap(async (req, res) => {
    const c = competitionBody(req.body);
    const r = await exec(
      "INSERT INTO competitions (name, start_date, competition_date, created_by) VALUES (?, ?, ?, ?)",
      [c.name, c.startDate, c.competitionDate, req.viewer!.id]);
    res.json({ competition: competitionDto(await getCompetition(r.insertId)) });
  }));

  app.patch("/api/competitions/:id", requireAdmin, wrap(async (req, res) => {
    const existing = await getCompetition(req.params.id);
    const c = competitionBody(req.body);
    await exec("UPDATE competitions SET name = ?, start_date = ?, competition_date = ? WHERE id = ?",
      [c.name, c.startDate, c.competitionDate, existing.id]);
    res.json({ competition: competitionDto(await getCompetition(existing.id)) });
  }));

  // Deleting a competition removes its squad list only. Workouts belong to the person,
  // not the competition, and are never deleted here.
  app.delete("/api/competitions/:id", requireAdmin, wrap(async (req, res) => {
    const c = await getCompetition(req.params.id);
    await exec("DELETE FROM squad_members WHERE competition_id = ?", [c.id]);
    await exec("DELETE FROM competitions WHERE id = ?", [c.id]);
    res.json({ ok: true });
  }));

  app.get("/api/competitions/:id/squad", wrap(async (req, res) => {
    const c = await getCompetition(req.params.id);
    const rows = await query(
      `SELECT m.id, m.name, m.image FROM squad_members s JOIN members m ON m.id = s.member_id
       WHERE s.competition_id = ? ORDER BY m.name`, [c.id]);
    res.json({ members: rows });
  }));

  app.post("/api/competitions/:id/squad", requireAdmin, wrap(async (req, res) => {
    const c = await getCompetition(req.params.id);
    const memberId = intIn(req.body?.memberId, "memberId", 1, 2_147_483_647);
    const { members } = await portal.getMembers([memberId]);
    if (!members[0]) throw new NotFound("no such portal member");
    await upsertMember(members[0]);
    await exec("INSERT IGNORE INTO squad_members (competition_id, member_id) VALUES (?, ?)", [c.id, memberId]);
    const sync = await syncMember(memberId);
    res.json({ ok: true, sync });
  }));

  app.delete("/api/competitions/:id/squad/:memberId", requireAdmin, wrap(async (req, res) => {
    const c = await getCompetition(req.params.id);
    await exec("DELETE FROM squad_members WHERE competition_id = ? AND member_id = ?", [c.id, Number(req.params.memberId)]);
    res.json({ ok: true });
  }));

  // ── Squad invites (names waiting to be matched to a portal account) ─────────
  app.get("/api/competitions/:id/invites", requireAdmin, wrap(async (req, res) => {
    const c = await getCompetition(req.params.id);
    const rows = await query<any>(
      "SELECT id, name, candidates, note FROM squad_invites WHERE competition_id = ? AND status = 'pending' ORDER BY name", [c.id]);
    res.json({ invites: rows.map(r => ({ id: r.id, name: r.name, note: r.note || "Not checked yet", candidates: r.candidates ? JSON.parse(r.candidates) : [] })) });
  }));

  async function pendingInvite(id: unknown) {
    const n = Number(id);
    const [inv] = Number.isInteger(n) ? await query<any>("SELECT * FROM squad_invites WHERE id = ? AND status = 'pending'", [n]) : [];
    if (!inv) throw new NotFound("invite not found");
    return inv;
  }

  app.post("/api/invites/:id/pick", requireAdmin, wrap(async (req, res) => {
    const inv = await pendingInvite(req.params.id);
    const memberId = intIn(req.body?.memberId, "memberId", 1, 2_147_483_647);
    const { members } = await portal.getMembers([memberId]);
    if (!members[0]) throw new NotFound("no such portal member");
    await upsertMember(members[0]);
    await exec("INSERT IGNORE INTO squad_members (competition_id, member_id) VALUES (?, ?)", [inv.competition_id, memberId]);
    await exec("UPDATE squad_invites SET status = 'added', member_id = ? WHERE id = ?", [memberId, inv.id]);
    res.json({ ok: true, sync: await syncMember(memberId) });
  }));

  app.post("/api/invites/:id/dismiss", requireAdmin, wrap(async (req, res) => {
    const inv = await pendingInvite(req.params.id);
    await exec("UPDATE squad_invites SET status = 'dismissed' WHERE id = ?", [inv.id]);
    res.json({ ok: true });
  }));

  app.post("/api/invites/retry", requireAdmin, wrap(async (_req, res) => {
    res.json(await resolvePendingInvites());
  }));

  app.get("/api/portal-members", requireAdmin, wrap(async (req, res) => {
    const q = text(req.query.q, "q", 100);
    if (q.length < 2) { res.json({ members: [] }); return; }
    res.json(await portal.searchMembers(q));
  }));

  app.get("/api/sync/status", requireAdmin, wrap(async (_req, res) => {
    const rows = await query<any>(
      `SELECT m.id, m.name, m.trainings_synced_at, m.trainings_sync_error
       FROM members m WHERE m.id IN (SELECT member_id FROM squad_members) ORDER BY m.name`);
    res.json({ members: rows.map(r => ({ id: r.id, name: r.name, syncedAt: r.trainings_synced_at, error: r.trainings_sync_error })) });
  }));

  app.post("/api/sync", requireAdmin, wrap(async (_req, res) => {
    res.json(await syncAll());
  }));

  // ── Workouts ────────────────────────────────────────────────────────────────
  app.get("/api/workouts", wrap(async (req, res) => {
    const memberId = req.query.memberId ? intIn(req.query.memberId, "memberId", 1, 2_147_483_647) : req.viewer!.id;
    const rows = await query("SELECT * FROM workouts WHERE member_id = ? ORDER BY date DESC, id DESC LIMIT 500", [memberId]);
    res.json({ workouts: rows.map(workoutDto) });
  }));

  app.post("/api/workouts", wrap(async (req, res) => {
    const today = todaySgt();
    if (!(await viewerCanLog(req.viewer!.id, today))) throw new Forbidden("only squad members of an upcoming competition can log workouts");
    const w = workoutInput(req.body, today);
    const r = await exec(
      "INSERT INTO workouts (member_id, date, type, duration_min, intensity, notes) VALUES (?, ?, ?, ?, ?, ?)",
      [req.viewer!.id, w.date, w.type, w.durationMin, w.intensity, w.notes || null]);
    const [row] = await query("SELECT * FROM workouts WHERE id = ?", [r.insertId]);
    res.json({ workout: workoutDto(row) });
  }));

  async function ownWorkout(req: Request) {
    const id = Number(req.params.id);
    const [w] = Number.isInteger(id) ? await query("SELECT * FROM workouts WHERE id = ?", [id]) : [];
    if (!w) throw new NotFound("workout not found");
    return w;
  }

  app.patch("/api/workouts/:id", wrap(async (req, res) => {
    const w = await ownWorkout(req);
    if (w.member_id !== req.viewer!.id) throw new Forbidden("You can only edit your own workouts.");
    const input = workoutInput(req.body, todaySgt());
    await exec("UPDATE workouts SET date = ?, type = ?, duration_min = ?, intensity = ?, notes = ? WHERE id = ?",
      [input.date, input.type, input.durationMin, input.intensity, input.notes || null, w.id]);
    const [row] = await query("SELECT * FROM workouts WHERE id = ?", [w.id]);
    res.json({ workout: workoutDto(row) });
  }));

  app.delete("/api/workouts/:id", wrap(async (req, res) => {
    const w = await ownWorkout(req);
    // Only the person who logged it — admins included, nobody else can edit or delete it.
    if (w.member_id !== req.viewer!.id) throw new Forbidden("You can only delete your own workouts.");
    await exec("DELETE FROM workouts WHERE id = ?", [w.id]);
    res.json({ ok: true });
  }));

  // ── Dashboard ───────────────────────────────────────────────────────────────

  // Puff tab: the team's mood over the last 7 days + the tank.
  app.get("/api/puff", wrap(async (req, res) => {
    const today = todaySgt();
    const comp = req.query.competitionId ? await getCompetition(req.query.competitionId) : await defaultCompetition(today);
    if (!comp) { res.json({ competition: null }); return; }
    const members = await query<any>(
      `SELECT m.id, m.name, m.image FROM squad_members s JOIN members m ON m.id = s.member_id WHERE s.competition_id = ?`, [comp.id]);
    const ids = members.map(m => m.id);
    const from = addDays(today, -(PUFF.windowDays - 1));
    const [trainings, workouts] = ids.length
      ? await Promise.all([
          query<any>("SELECT member_id, date FROM training_records WHERE member_id IN (?) AND date >= ?", [ids, from]),
          query<any>("SELECT member_id, date FROM workouts WHERE member_id IN (?) AND date >= ?", [ids, from]),
        ])
      : [[], []];
    res.json({ competition: competitionDto(comp), today, ...puffSummary(members, trainings, workouts, today) });
  }));

  app.get("/api/dashboard", wrap(async (req, res) => {
    const today = todaySgt();
    const comp = req.query.competitionId ? await getCompetition(req.query.competitionId) : await defaultCompetition(today);
    if (!comp) { res.json({ competition: null, rows: [] }); return; }
    const periods = periodOptions(comp.start_date, comp.competition_date, today);
    const period = parsePeriod(req.query.period, periods);
    const range = periodRange(period, today, comp.start_date);

    const members = await query<any>(
      `SELECT m.id, m.name, m.image, m.trainings_synced_at, m.trainings_sync_error
       FROM squad_members s JOIN members m ON m.id = s.member_id WHERE s.competition_id = ?`, [comp.id]);
    const ids = members.map(m => m.id);
    const [trainings, workouts] = ids.length
      ? await Promise.all([
          query<any>("SELECT member_id, date FROM training_records WHERE member_id IN (?)", [ids]),
          query<any>("SELECT member_id, date, type, duration_min, intensity FROM workouts WHERE member_id IN (?)", [ids]),
        ])
      : [[], []];

    const rows = buildDashboard(
      members.map(m => ({ id: m.id, name: m.name, image: m.image, syncedAt: m.trainings_synced_at, syncError: m.trainings_sync_error })),
      trainings, workouts, range);
    const weeks = weeksElapsed(range, today);
    const withAvgs = rows.map(r => ({
      ...r,
      avgTrainingsPerWeek: perWeek(r.trainings, weeks),
      avgWorkoutsPerWeek: perWeek(r.workouts, weeks),
    }));
    res.json({
      competition: competitionDto(comp), periods, period, range, today,
      ...summarise(rows, weeks), targets: TARGETS,
      rows: withAvgs,
    });
  }));

  // Per-person detail behind a dashboard row: every training and workout in the period.
  app.get("/api/members/:id/activity", wrap(async (req, res) => {
    const id = intIn(req.params.id, "id", 1, 2_147_483_647);
    const [m] = await query<any>("SELECT id, name, image, trainings_synced_at, trainings_sync_error FROM members WHERE id = ?", [id]);
    if (!m) throw new NotFound("member not found");
    const today = todaySgt();
    const comp = req.query.competitionId ? await getCompetition(req.query.competitionId) : await defaultCompetition(today);
    const prepStart = comp?.start_date ?? addDays(today, -27);
    const periods = periodOptions(prepStart, comp?.competition_date ?? today, today);
    const period = parsePeriod(req.query.period, periods);
    const range = periodRange(period, today, prepStart);
    const [trainings, workouts] = await Promise.all([
      query("SELECT * FROM training_records WHERE member_id = ? ORDER BY date DESC", [id]),
      query("SELECT * FROM workouts WHERE member_id = ? ORDER BY date DESC, id DESC", [id]),
    ]);
    res.json({
      member: { id: m.id, name: m.name, image: m.image },
      syncedAt: m.trainings_synced_at, syncError: m.trainings_sync_error,
      period, periodLabel: periods.find(o => o.key === period)?.label ?? "", range,
      trainings: trainings.filter((t: any) => inRange(t.date, range)).map(trainingDto),
      workouts: workouts.filter((w: any) => inRange(w.date, range)).map(workoutDto),
    });
  }));

  // ── Errors ──────────────────────────────────────────────────────────────────
  app.use("/api", (_req, res) => { res.status(404).json({ error: "not_found" }); });
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BadRequest) { res.status(400).json({ error: "bad_request", message: err.message }); return; }
    if (err instanceof NotFound) { res.status(404).json({ error: "not_found", message: err.message }); return; }
    if (err instanceof Forbidden) { res.status(403).json({ error: "forbidden", message: err.message }); return; }
    if (err instanceof PortalError) {
      const messages: Record<string, string> = {
        no_portal_account: "No FATUWR portal account uses that email. Sign up in the portal first.",
        invalid_code: "That code is wrong or has expired.",
        rate_limited: err.message,
        portal_unreachable: "Can't reach the training portal right now. Try again in a minute.",
      };
      const status = [400, 401, 404, 429].includes(err.status) ? err.status : 502;
      res.status(status).json({ error: err.code, message: messages[err.code] || "The training portal returned an error." });
      return;
    }
    console.error("[Error]", err);
    res.status(500).json({ error: "internal", message: "Something went wrong." });
  });

  return app;
}

// ── Frontend version ──────────────────────────────────────────────────────────
// A hash of the shipped frontend files. Assets are requested as app.js?v=<hash>, so any
// page load after a deploy fetches the new code (a home-screen web app otherwise keeps
// running the old one), and the app compares it with /api/version when reopened.
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
let _version: string | null = null;
export function frontendVersion(): string {
  if (_version) return _version;
  const h = createHash("sha256");
  for (const f of ["index.html", "app.js", "styles.css"]) {
    try { h.update(fs.readFileSync(path.join(publicDir, f))); } catch { /* tests: no files */ }
  }
  return (_version = h.digest("hex").slice(0, 12));
}

/**
 * Static frontend. Kept out of createApp so tests don't need the files.
 *
 * Nothing here is content-hashed, so everything is no-cache — and Surrogate-Control
 * no-store, because when served via the portal's /amager proxy the response passes
 * through Railway's Fastly edge (portal SYSTEM.md §3).
 */
export function serveFrontend(app: express.Express, basePath: string) {
  // dist/index.js → ../public ; src/app.ts (dev) → ../public
  const noCache = (res: Response) => {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Surrogate-Control", "no-store");
  };
  const v = frontendVersion();
  const indexHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8")
    .replace('<base href="/">', `<base href="${basePath}/">`)
    .replace('href="styles.css"', `href="styles.css?v=${v}"`)
    .replace('src="app.js"', `src="app.js?v=${v}"`)
    .replace('</head>', `  <meta name="app-version" content="${v}">\n</head>`)
    .replace(/__BASE__/g, basePath);
  app.use(express.static(publicDir, { index: false, setHeaders: noCache }));
  app.get("*", (_req, res) => { noCache(res); res.type("html").send(indexHtml); });
}
