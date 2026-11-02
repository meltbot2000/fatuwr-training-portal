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

/**
 * The login also lives in a cookie the SERVER sets (HttpOnly). iOS Safari caps cookies
 * written by page JavaScript to 7 days and clears a home-screen app's localStorage after
 * a while; a server-set first-party cookie keeps its full lifetime. It is renewed on
 * every app open (/api/me), so only 90 days of not opening the app signs someone out.
 *
 * CSRF: the cookie is SameSite=Strict, so another site can't make the browser send it.
 */
export const SESSION_COOKIE = "wl_session";
const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function cookiePath() { return `${config.basePath}/`; }

export function setSessionCookie(res: Response, memberId: number): string {
  const token = issueToken(memberId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "strict", secure: config.isProduction,
    path: cookiePath(), maxAge: SESSION_MAX_AGE_MS,
  });
  return token;
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "strict", secure: config.isProduction, path: cookiePath() });
}

function readCookie(req: Request, name: string): string {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) { try { return decodeURIComponent(v.join("=")); } catch { return ""; } }
  }
  return "";
}

/** Bearer header first; the session cookie if that's missing or no longer valid. */
export function viewerIdFrom(req: Request): number | null {
  const h = req.headers.authorization || "";
  return verifyToken(h.startsWith("Bearer ") ? h.slice(7) : "") ?? verifyToken(readCookie(req, SESSION_COOKIE));
}

/**
 * Why a request isn't signed in, sent as `reason` with the 401 so the login screen can
 * say why someone was signed out (makes "I got logged out" diagnosable from a screenshot):
 *   no_saved_login  nothing arrived (device storage and cookie both gone, e.g. the
 *                   home-screen icon was removed and re-added)
 *   login_invalid   something arrived but didn't verify (expired after 90 days unused,
 *                   or SESSION_SECRET changed on the server)
 */
function signedOutReason(req: Request): "no_saved_login" | "login_invalid" {
  const h = req.headers.authorization || "";
  return (h.startsWith("Bearer ") && h.length > 7) || readCookie(req, SESSION_COOKIE) ? "login_invalid" : "no_saved_login";
}

export async function requireViewer(req: Request, res: Response, next: NextFunction) {
  const id = viewerIdFrom(req);
  if (!id) { res.status(401).json({ error: "not_signed_in", reason: signedOutReason(req) }); return; }
  try {
    const [m] = await query<{ id: number; name: string; image: string | null; club_role: string; is_admin: number }>(
      "SELECT id, name, image, club_role, is_admin FROM members WHERE id = ?", [id]);
    if (!m) { res.status(401).json({ error: "not_signed_in", reason: "account_missing" }); return; }
    if (!(await hasAccess(m.id, !!m.is_admin))) {
      res.status(401).json({ error: "not_signed_in", reason: "not_in_squad", message: "This app is for the competition squad only." });
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
