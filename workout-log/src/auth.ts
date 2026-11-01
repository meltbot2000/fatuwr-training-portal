/**
 * Login tokens. The portal proves who someone is (email code); this app then issues its
 * own signed token: base64url(JSON payload) + "." + HMAC-SHA256.
 *
 * Sent as `Authorization: Bearer`, stored in localStorage — not a cookie. Railway's edge
 * strips Set-Cookie unless every response is marked no-store (the portal learned this),
 * and a bearer header also rules out CSRF.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config";
import { query } from "./db";

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

interface TokenPayload { sub: number; exp: number }

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function issueToken(memberId: number, secret = config.sessionSecret, now = Date.now()): string {
  const payload: TokenPayload = { sub: memberId, exp: now + TOKEN_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

export function verifyToken(token: string, secret = config.sessionSecret, now = Date.now()): number | null {
  const [data, mac] = (token || "").split(".");
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString()) as TokenPayload;
    if (!Number.isInteger(p.sub) || typeof p.exp !== "number" || p.exp < now) return null;
    return p.sub;
  } catch {
    return null;
  }
}

export interface Viewer {
  id: number;
  name: string;
  image: string | null;
  clubRole: string;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { viewer?: Viewer } }
}

/**
 * Who may use the app at all: squad members (of any competition) and this app's admins
 * (ADMIN_EMAILS — not portal Admins). Checked at login AND on every request, so removing
 * someone from the squad shuts them out immediately.
 */
export async function hasAccess(memberId: number, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const [row] = await query("SELECT 1 FROM squad_members WHERE member_id = ? LIMIT 1", [memberId]);
  return !!row;
}

export async function requireViewer(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization || "";
  const id = verifyToken(h.startsWith("Bearer ") ? h.slice(7) : "");
  if (!id) { res.status(401).json({ error: "not_signed_in" }); return; }
  try {
    const [m] = await query<{ id: number; name: string; image: string | null; club_role: string; is_admin: number }>(
      "SELECT id, name, image, club_role, is_admin FROM members WHERE id = ?", [id]);
    if (!m) { res.status(401).json({ error: "not_signed_in" }); return; }
    if (!(await hasAccess(m.id, !!m.is_admin))) {
      res.status(401).json({ error: "not_signed_in", message: "This app is for the competition squad only." });
      return;
    }
    req.viewer = { id: m.id, name: m.name, image: m.image, clubRole: m.club_role, isAdmin: !!m.is_admin };
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.viewer?.isAdmin) {
    res.status(403).json({ error: "admin_only", message: "Only the app's admin can do this. If that's you, sign out and sign back in." });
    return;
  }
  next();
}
