// Puff (FATUWR competition prep) — single-file frontend, no build step.
// Every value from the server goes through esc() before it touches innerHTML.

const $ = (sel, root = document) => root.querySelector(sel);
const view = $("#view");
const TOKEN_KEY = "wl_token";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The login token lives in localStorage AND in a cookie. iOS clears a home-screen web
// app's localStorage after a while, which looked like "logged out every time I reopen
// the app"; the cookie survives that, and the token is restored from it. Same fix the
// portal uses (client/src/main.tsx). The server never reads the cookie — requests carry
// the token as a Bearer header — so it adds no CSRF exposure.
const COOKIE_PATH = new URL(document.baseURI).pathname; // "/amager/"
const TOKEN_MAX_AGE = 90 * 24 * 60 * 60; // matches the server's token lifetime
function readTokenCookie() {
  const m = document.cookie.split("; ").find((c) => c.startsWith(TOKEN_KEY + "="));
  return m ? decodeURIComponent(m.slice(TOKEN_KEY.length + 1)) : null;
}
function writeTokenCookie(t) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = t
    ? `${TOKEN_KEY}=${encodeURIComponent(t)}; Max-Age=${TOKEN_MAX_AGE}; Path=${COOKIE_PATH}; SameSite=Lax${secure}`
    : `${TOKEN_KEY}=; Max-Age=0; Path=${COOKIE_PATH}; SameSite=Lax${secure}`;
}
function getToken() {
  let t = null;
  try { t = localStorage.getItem(TOKEN_KEY); } catch {}
  if (t) return t;
  t = readTokenCookie();
  if (t) { try { localStorage.setItem(TOKEN_KEY, t); } catch {} }
  return t;
}
function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
  writeTokenCookie(t);
}
// Someone signed in before this change only has the localStorage copy — back it up now.
{ let t = null; try { t = localStorage.getItem(TOKEN_KEY); } catch {} if (t && !readTokenCookie()) writeTokenCookie(t); }

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  // Relative on purpose: resolves against <base href>, so the app works under /amager/.
  const res = await fetch(`api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.error === "not_signed_in") { setToken(null); me = null; location.hash = "#/login"; throw new Error(data.message || "Please sign in."); }
  // Admin rights changed under a page that was already open: forget the cached "me" so the
  // next screen re-reads it (and the Admin tab disappears if it no longer applies).
  if (res.status === 403 && data.error === "admin_only") me = null;
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), 2600);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso, withYear = false) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? " " + y : ""}`;
}
function daysBetween(a, b) {
  const t = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}
function fmtMins(m) { return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + "m" : ""}` : `${m}m`; }
function ago(utc) {
  if (!utc) return "never";
  const t = Date.parse(utc.replace(" ", "T") + "Z");
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
function avatar(m) {
  if (m.image) return `<img class="avatar" src="${esc(m.image)}" alt="" loading="lazy">`;
  const initials = (m.name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return `<span class="avatar" aria-hidden="true">${esc(initials)}</span>`;
}

let me = null;
const state = { competitionId: null, period: "prep" };
try { Object.assign(state, JSON.parse(localStorage.getItem("wl_view") || "{}")); } catch {}
// Old saved choices ("all", "4w") no longer exist — the server would fall back anyway,
// but reset here so the highlighted chip and the data always agree.
if (state.period === "all" || state.period === "4w") state.period = "prep";
const saveState = () => { try { localStorage.setItem("wl_view", JSON.stringify(state)); } catch {} };


// ── Router ───────────────────────────────────────────────────────────────────
const routes = [
  [/^#\/login$/, renderLogin, "Sign in"],
  [/^#\/?$/, renderDashboard, "Dashboard"],
  [/^#\/puff$/, renderPuff, "Puff"],
  [/^#\/member\/(\d+)$/, renderMember, "Activity"],
  [/^#\/log$/, renderLog, "Log workout"],
  [/^#\/log\/(\d+)$/, renderLog, "Edit workout"],
  [/^#\/admin$/, renderAdmin, "Admin"],
];

async function route() {
  const hash = location.hash || "#/";
  if (route.last && route.last !== hash) route.navigated = true;
  route.last = hash;
  $("#tooltip").hidden = true; // its anchor is about to be removed, so pointerleave won't fire
  // Even with nothing stored on the page, the server's session cookie may still sign us
  // in (iOS can wipe page storage), so always ask before showing the login screen.
  if (!me && hash !== "#/login") {
    try {
      me = await api("/me");
      if (me.token) setToken(me.token); // renewed on every open
    } catch (e) {
      if (location.hash !== "#/login") view.innerHTML = `<p class="error">${esc(e.message)}</p>`;
      return;
    }
  }
  const nav = $("#nav");
  nav.hidden = hash === "#/login";
  if (me) {
    $("#nav-admin").hidden = !me.member.isAdmin;
    $("#nav-log").hidden = !me.canLog;
  }
  const tab = hash.startsWith("#/log") ? "log" : hash.startsWith("#/admin") ? "admin" : hash.startsWith("#/puff") ? "puff" : "dashboard";
  nav.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));

  for (const [re, fn, title] of routes) {
    const m = hash.match(re);
    if (m) {
      $("#title").textContent = title;
      // Sub-pages (a person's activity, editing a workout) get a back button.
      $("#back").hidden = !/^#\/(member|log)\/\d+$/.test(hash);
      // The viewer's avatar sits top right (like the portal) and opens their own activity.
      const av = $("#meAvatar");
      av.hidden = !me || hash === "#/login";
      if (me) { av.href = `#/member/${me.member.id}`; av.innerHTML = avatar(me.member); }
      document.title = title === "Puff" ? "Puff" : `${title} · Puff`;
      view.innerHTML = `<p class="meta">Loading…</p>`;
      try { await fn(...m.slice(1)); } catch (e) { view.innerHTML = `<div class="card"><p class="error">${esc(e.message)}</p></div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = "#/";
}
window.addEventListener("hashchange", route);
$("#back").addEventListener("click", () => {
  // Back to where they came from inside the app; straight to the dashboard if they
  // opened the page directly (e.g. from a shared link) and there's nothing to go back to.
  if (route.navigated) history.back();
  else location.hash = location.hash.startsWith("#/log/") ? "#/log" : "#/";
});

// ── Login ────────────────────────────────────────────────────────────────────
function renderLogin() {
  let email = "";
  const step1 = () => {
    view.innerHTML = `
      <div class="login-brand">${puffImg("cruising", 120)}<div class="cute">Puff</div><p class="meta">FATUWR competition prep</p></div>
      <div class="card stack">
        <h2>Sign in with your FATUWR portal account</h2>
        <p class="meta">For the competition squad. We'll email you a 6-digit code — the same login as the training portal.</p>
        <form id="f" class="stack">
          <div><label for="email">Email</label><input id="email" type="email" autocomplete="email" required value="${esc(email)}"></div>
          <p class="error" id="err"></p>
          <button class="full" type="submit">Send code</button>
        </form>
      </div>`;
    $("#f").onsubmit = async (ev) => {
      ev.preventDefault();
      const btn = ev.submitter; btn.disabled = true; $("#err").textContent = "";
      email = $("#email").value.trim();
      try { await api("/auth/send", { method: "POST", body: { email } }); step2(); }
      catch (e) { $("#err").textContent = e.message; btn.disabled = false; }
    };
  };
  const step2 = () => {
    view.innerHTML = `
      <div class="card stack">
        <h2>Check your email</h2>
        <p class="meta">Code sent to ${esc(email)}. It expires in 10 minutes.</p>
        <form id="f" class="stack">
          <div><label for="code">6-digit code</label><input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required></div>
          <p class="error" id="err"></p>
          <button class="full" type="submit">Sign in</button>
          <button class="link" type="button" id="back">Use a different email</button>
        </form>
      </div>`;
    $("#code").focus();
    $("#back").onclick = step1;
    $("#f").onsubmit = async (ev) => {
      ev.preventDefault();
      const btn = ev.submitter; btn.disabled = true; $("#err").textContent = "";
      try {
        const { token } = await api("/auth/verify", { method: "POST", body: { email, code: $("#code").value.trim() } });
        setToken(token); me = null;
        try { localStorage.setItem("wl_email", email); } catch {}
        location.hash = "#/";
      } catch (e) { $("#err").textContent = e.message; btn.disabled = false; }
    };
  };
  step1();
}

// ── Dashboard ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  const [{ competitions }, data] = await Promise.all([
    api("/competitions"),
    api(`/dashboard?${new URLSearchParams({ ...(state.competitionId ? { competitionId: state.competitionId } : {}), period: state.period })}`)
      .catch((e) => { if (state.competitionId) { state.competitionId = null; saveState(); } throw e; }),
  ]);
  if (!data.competition) {
    view.innerHTML = `<div class="card"><h2>No competition set up yet</h2>
      <p class="meta">${me.member.isAdmin ? `Create one in <a href="#/admin">Admin</a> and pick the squad.` : "An admin needs to set up the upcoming competition and its squad."}</p></div>` + accountFooter();
    bindSignOut();
    return;
  }
  const c = data.competition;
  if (data.period !== state.period) { state.period = data.period; saveState(); }
  const daysLeft = daysBetween(data.today, c.competitionDate);
  const rows = data.rows;
  const mine = rows.find((r) => r.member.id === me.member.id);
  const T = data.targets;
  const max = Math.max(1, ...rows.map((r) => r.trainings + r.workouts));
  const failing = rows.filter((r) => r.syncError).length;
  const oldestSync = rows.map((r) => r.syncedAt).filter(Boolean).sort()[0];

  view.innerHTML = `
    ${competitions.length > 1 ? `<div style="margin-bottom:12px"><label for="comp">Competition</label>
      <select id="comp">${competitions.map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.name)} · ${fmtDate(x.competitionDate, true)}</option>`).join("")}</select></div>` : ""}
    <div class="card row spread" style="align-items:center">
      <div style="min-width:0"><div class="name" style="font-size:17px;font-weight:600">${esc(c.name)}</div>
        <div class="meta">${fmtDate(c.competitionDate, true)} · prep from ${fmtDate(c.startDate, true)}</div></div>
      <div class="countdown">${daysLeft >= 0
        ? `<div class="num">${daysLeft}</div><div class="lbl">${daysLeft === 1 ? "day to go" : "days to go"}</div>`
        : `<div class="lbl">Done</div>`}</div>
    </div>
    ${(() => {
      const chip = (o) => `<button class="chip${o.upcoming ? " upcoming" : ""}" data-period="${esc(o.key)}" aria-pressed="${o.key === data.period}">${esc(o.label)}</button>`;
      const isMonth = (o) => /^\d{4}-\d{2}$/.test(o.key);
      const months = data.periods.filter(isMonth);
      // One row: overall chips | months. Swipes sideways on the narrowest phones.
      return `<div class="chips one-row" role="group" aria-label="Period">${data.periods.filter((o) => !isMonth(o)).map(chip).join("")}${
        months.length ? `<span class="chip-divider" aria-hidden="true"></span>${months.map(chip).join("")}` : ""}</div>`;
    })()}
    ${data.weeks === null ? `<p class="meta range-line">Starts ${fmtDate(data.range.from, true)}, nothing to show yet</p>` : `<div class="range-gap"></div>`}

    <section class="statrow">
      <h3 class="eyebrow">Team <span>· average per person</span></h3>
      <div class="stats">
        ${stat("Trainings", data.team.avgTrainingsPerWeek, `${rows.reduce((a, r) => a + r.trainings, 0)} total, whole squad`)}
        ${stat("Other workouts", data.team.avgWorkoutsPerWeek, `${rows.reduce((a, r) => a + r.workouts, 0)} total, whole squad`)}
      </div>
    </section>

    <section class="statrow">
      <h3 class="eyebrow">You <span>· ${esc(me.member.name)}</span></h3>
      ${mine ? `<div class="stats">
        ${stat("Trainings", mine.avgTrainingsPerWeek, `${mine.trainings} total`, (v) => v >= T.trainingsPerWeekMin)}
        ${stat("Other workouts", mine.avgWorkoutsPerWeek, `${mine.workouts} total`, (v) => v >= T.workoutsPerWeekMin)}
      </div>
      <p class="meta targets">Targets: at least ${plural(T.trainingsPerWeekMin, "training")} and ${plural(T.workoutsPerWeekMin, "other workout")} a week.</p>`
      : `<p class="meta">You're not in this squad, so there are no personal numbers.</p>`}
    </section>
    ${failing ? `<div class="banner">Training data couldn't be refreshed for ${failing} ${failing === 1 ? "person" : "people"} — showing the last good copy.</div>` : ""}
    <div class="card">
      <h2 style="margin:0 0 4px">Squad · ${rows.length}</h2>
      <div class="legend" aria-hidden="true"><span><i style="background:var(--series-training)"></i>Regular trainings</span><span><i style="background:var(--series-workout)"></i>Other workouts</span></div>
      ${rows.length ? `<ul class="board">${rows.map((r) => boardRow(r, max, T)).join("")}</ul>` : `<p class="meta">No one in this squad yet.</p>`}
      <p class="meta" style="margin:8px 0 0">Synced ${esc(ago(oldestSync))}</p>
    </div>`;

  view.insertAdjacentHTML("beforeend", accountFooter());
  bindSignOut();
  $("#comp")?.addEventListener("change", (e) => { state.competitionId = Number(e.target.value); saveState(); route(); });
  // Switch period in place: no "Loading…" flash, no jump back to the top.
  view.querySelectorAll("[data-period]").forEach((b) => (b.onclick = async () => {
    const y = window.scrollY;
    state.period = b.dataset.period; saveState();
    view.querySelectorAll("[data-period]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    try { await renderDashboard(); } catch (e) { toast(e.message); }
    window.scrollTo(0, y);
  }));
  bindTooltips();
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const fmtAvg = (v) => (v === null || v === undefined ? "—" : v.toFixed(1));
/**
 * One stat box: the weekly average large, a total (or other context) small underneath.
 * With `meets`, the box is tinted green when the target is met and red when not.
 * The targets themselves are spelled out once, under the row.
 */
function stat(label, perWeek, sub, meets) {
  const has = perWeek !== null && perWeek !== undefined;
  const cls = meets && has ? (meets(perWeek) ? " good" : " bad") : "";
  const state = cls === " good" ? ", target met" : cls === " bad" ? ", below target" : "";
  return `<div class="stat${cls}" aria-label="${esc(label)}: ${has ? perWeek.toFixed(1) + " per week" : "no data"}${state}">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${has ? perWeek.toFixed(1) : "—"}<span class="unit">/wk</span></div>
    <div class="stat-sub">${esc(sub)}</div>
  </div>`;
}

function boardRow(r, max, T) {
  const pct = (n) => (n / max) * 100;
  const types = r.topTypes.map((t) => `${esc(t.type)} ×${t.count}`).join(" · ");
  // Green/red against the same targets as the "You" boxes; plain when there's no
  // average yet (a period that hasn't started).
  const mark = (v, ok) => (v === null || v === undefined ? "" : ok(v) ? "ok" : "low");
  const tCls = mark(r.avgTrainingsPerWeek, (v) => v >= T.trainingsPerWeekMin);
  const wCls = mark(r.avgWorkoutsPerWeek, (v) => v >= T.workoutsPerWeekMin);
  const avgs = r.avgTrainingsPerWeek === null || r.avgTrainingsPerWeek === undefined ? ""
    : `<span class="${tCls}">${r.avgTrainingsPerWeek.toFixed(1)}</span> trainings/wk · <span class="${wCls}">${r.avgWorkoutsPerWeek.toFixed(1)}</span> other/wk`;
  const bits = [
    r.workouts ? fmtMins(r.workoutMinutes) + " other" : "",
    r.lastActive ? `last ${fmtDate(r.lastActive)}` : "no activity yet",
  ].filter(Boolean).join(" · ");
  const label = `${r.member.name}: ${r.trainings} trainings, ${r.workouts} other workouts`;
  return `<li><a class="item" href="#/member/${r.member.id}" aria-label="${esc(label)}">
    <div class="row">${avatar(r.member)}
      <div style="flex:1;min-width:0"><div class="name">${esc(r.member.name)}</div></div>
      <div class="counts"><b class="${tCls}">${r.trainings}</b> <span class="muted">${r.trainings === 1 ? "training" : "trainings"}</span> · <b class="${wCls}">${r.workouts}</b> <span class="muted">other</span></div>
    </div>
    ${r.trainings + r.workouts ? `<div class="bar">
      ${r.trainings ? `<span class="t" style="width:${pct(r.trainings)}%" data-tip="${r.trainings} regular training${r.trainings === 1 ? "" : "s"}"></span>` : ""}
      ${r.workouts ? `<span class="w" style="width:${pct(r.workouts)}%" data-tip="${r.workouts} other workout${r.workouts === 1 ? "" : "s"} · ${fmtMins(r.workoutMinutes)}"></span>` : ""}
    </div>` : ""}
    <div class="meta sub">${avgs ? `${avgs}<br>` : ""}${esc(bits)}${types ? `<br>${types}` : ""}${r.syncError ? `<br><span style="color:var(--warn)">training sync failing</span>` : ""}</div>
  </a></li>`;
}

function bindTooltips() {
  const tip = $("#tooltip");
  view.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("pointerenter", () => { tip.textContent = el.dataset.tip; tip.hidden = false; });
    el.addEventListener("pointermove", (e) => {
      const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
      tip.style.left = `${x}px`; tip.style.top = `${e.clientY - 36}px`;
    });
    el.addEventListener("pointerleave", () => (tip.hidden = true));
  });
}

function accountFooter() {
  let email = "";
  try { email = localStorage.getItem("wl_email") || ""; } catch {}
  return `<p class="meta" style="text-align:center;margin-top:24px">Signed in as ${esc(me.member.name)}${email ? ` (${esc(email)})` : ""}${me.member.isAdmin ? " · admin" : ""}
    · <button class="link" id="signout" style="font-size:13px">Sign out</button></p>`;
}
function bindSignOut() {
  $("#signout")?.addEventListener("click", async () => {
    try { await fetch("api/auth/logout", { method: "POST" }); } catch {}
    setToken(null); me = null;
    try { localStorage.removeItem("wl_email"); } catch {}
    location.hash = "#/login";
  });
}

// ── Puff ────────────────────────────────────────────────────────────────────
const puffImg = (name, size, cls = "") =>
  `<img class="puff-img ${cls}" src="puff/puff-${name}.webp" width="${size}" height="${size}" alt="" draggable="false">`;

async function renderPuff() {
  const d = await api(`/puff${state.competitionId ? `?competitionId=${state.competitionId}` : ""}`);
  if (!d.competition) {
    view.innerHTML = `<div class="card"><h2>No competition set up yet</h2><p class="meta">Puff wakes up once there's a squad.</p></div>`;
    return;
  }
  const pct = Math.round(d.pct * 100);
  const text = {
    snoozing: "Puff is dozing off.",
    cruising: "Puff is cruising along.",
    puffed: "Puff is puffed up and happy.",
    sparkly: "Target smashed. Puff is glowing!",
  }[d.mood];
  const n = d.fish.length;
  const bubbles = Array.from({ length: 8 }, (_, i) =>
    `<span class="bubble-dot" style="left:${8 + i * 12}%;animation-duration:${5 + (i % 4) * 1.7}s;animation-delay:-${i * 1.3}s"></span>`).join("");

  view.innerHTML = `
    <section class="card puff-card">
      <p class="eyebrow">Puff · last 7 days</p>
      <div class="puff-stage">${bubbles}
        <div class="puff-wrap ${d.mood}"><div class="puff-bob">${puffImg(d.mood, 200)}</div></div>
      </div>
      <div class="mood-line"><div class="mood-name cute">${esc(d.moodLabel)}</div><div class="mood-pct">${pct}%</div></div>
      <p class="meta">${esc(text)} The squad has done ${d.sessions} of ${d.goal} sessions in the last 7 days.</p>
      <div>
        <div class="meter" aria-hidden="true"><i style="width:${Math.min(100, pct)}%"></i>
          ${d.thresholds.slice(1, 3).map((t) => `<span class="tick" style="left:${t.from * 100}%"></span>`).join("")}</div>
        <div class="meter-labels" aria-hidden="true">${d.thresholds.slice(1).map((t) => `<span style="left:${t.from === 1 ? "calc(100% - 14px)" : t.from * 100 + "%"}">${t.from * 100}%</span>`).join("")}</div>
      </div>
      <div class="moods">${d.thresholds.map((t, i) => {
        const next = d.thresholds[i + 1];
        const range = next ? (t.from === 0 ? `under ${next.from * 100}%` : `${t.from * 100}–${next.from * 100 - 1}%`) : `${t.from * 100}%+`;
        return `<div class="${t.key === d.mood ? "on" : ""}">${puffImg(t.key, 52)}${esc(t.label.replace("!", ""))}<br>${range}</div>`;
      }).join("")}</div>
      <details class="how">
        <summary>How it works</summary>
        <p>Sessions the squad logged in the last 7 days ÷ the team goal of ${d.perPerson.trainings + d.perPerson.workouts} per person (${plural(d.perPerson.trainings, "training")} + ${plural(d.perPerson.workouts, "other workout")}). It's a rolling 7 days, so Puff doesn't crash every Monday.</p>
      </details>
      ${me.canLog ? `<a class="btn full" href="#/log" style="text-align:center;text-decoration:none">+ Log a workout</a>` : ""}
    </section>

    <section class="card">
      <p class="eyebrow">The tank · last 7 days</p>
      <div class="tank" id="tank">
        ${d.fish.map((f) => {
          const x = n > 1 ? 9 + (f.rank * 82) / (n - 1) : 50;     // most active → furthest right
          const band = f.status === 2 ? [13, 29] : f.status === 1 ? [44, 58] : [74, 84];
          const y = band[f.rank % 2];
          const size = 38 + Math.min(f.sessions, 6) * 3;
          const sprite = f.status === 2 ? "puffed" : f.status === 1 ? "small" : "snoozing";
          const isMe = f.id === me.member.id;
          const label = `${f.name}: ${f.trainings} trainings and ${f.workouts} other workouts in the last 7 days${f.status === 2 ? ", met both targets" : ""}`;
          return `<button type="button" class="fish s${f.status}${isMe ? " me" : ""}" style="left:${x}%;top:${y}%"
              data-tip="${esc(`${f.name} · ${f.trainings} trainings, ${f.workouts} other${f.status === 2 ? " ✓" : ""}`)}" aria-label="${esc(label)}">
            <span class="swim" style="animation-duration:${3 + (f.rank % 4) * 0.9}s;animation-delay:-${f.rank * 0.7}s">${puffImg(sprite, size)}</span>
            <span class="nm">${isMe ? "You" : esc(f.name.split(" ")[0])}</span></button>`;
        }).join("")}
        <div class="fish-tip" id="fishTip" hidden></div>
      </div>

    </section>`;

  const tip = $("#fishTip");
  view.querySelectorAll(".fish").forEach((b) => (b.onclick = () => {
    tip.textContent = b.dataset.tip; tip.hidden = false;
    clearTimeout(tip._t); tip._t = setTimeout(() => (tip.hidden = true), 2600);
  }));
}

/** After logging a workout: Puff pops up and wiggles. */
function celebrate() {
  const el = document.createElement("div");
  el.className = "celebrate";
  el.setAttribute("role", "status");
  el.innerHTML = `${puffImg("wiggle", 150, "wiggle")}<div class="cute">Workout logged!</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("out"), 1300);
  setTimeout(() => el.remove(), 1700);
}

// ── Member detail ────────────────────────────────────────────────────────────
async function renderMember(id) {
  const q = new URLSearchParams({ ...(state.competitionId ? { competitionId: state.competitionId } : {}), period: state.period });
  const d = await api(`/members/${id}/activity?${q}`);
  $("#title").textContent = d.member.name;
  const items = [
    ...d.trainings.map((t) => ({ kind: "t", date: t.date, t })),
    ...d.workouts.map((w) => ({ kind: "w", date: w.date, w })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.kind === "t" ? -1 : 1));
  const mins = d.workouts.reduce((a, w) => a + w.durationMin, 0);
  const mine = me.member.id === d.member.id;

  view.innerHTML = `
    <div class="card row">${avatar(d.member)}<div><div class="name" style="font-weight:500">${esc(d.member.name)}</div>
      <div class="meta">${esc(d.periodLabel)} · ${fmtDate(d.range.from, true)} – ${fmtDate(d.range.to, true)}</div></div></div>
    <div class="tiles">
      <div class="tile"><div class="num">${d.trainings.length}</div><div class="lbl">trainings</div></div>
      <div class="tile"><div class="num">${d.workouts.length}</div><div class="lbl">other workouts</div></div>
      <div class="tile"><div class="num">${fmtMins(mins)}</div><div class="lbl">other workout time</div></div>
    </div>
    ${d.syncError ? `<div class="banner">Training data last refreshed ${esc(ago(d.syncedAt))}; the latest refresh failed.</div>` : ""}
    <div class="card">
      <h2>Activity</h2>
      ${items.length ? `<ul class="timeline">${items.map((i) => (i.kind === "t" ? trainingItem(i.t) : workoutItem(i.w, mine))).join("")}</ul>` : `<p class="meta">Nothing in this period.</p>`}
    </div>
    <p class="meta">Training attendance synced from the portal ${esc(ago(d.syncedAt))}.</p>`;

  view.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async (e) => {
    e.preventDefault();
    if (!confirm("Delete this workout?")) return;
    await api(`/workouts/${b.dataset.del}`, { method: "DELETE" });
    toast("Workout deleted"); route();
  }));
}

function trainingItem(t) {
  return `<li><div class="date">${fmtDate(t.date)}</div><div style="flex:1">
    <div class="row" style="gap:8px;flex-wrap:wrap"><span class="tag"><i style="background:var(--series-training)"></i>Training</span>
    <span style="font-size:14px">${esc(t.pool)}${t.trainingTime ? ` · ${esc(t.trainingTime)}` : ""}</span></div>
    <div class="meta">${esc(t.activity)}${t.rainOff === "half" ? " · half rain-off" : ""}</div></div></li>`;
}

function workoutItem(w, mine) {
  return `<li><div class="date">${fmtDate(w.date)}</div><div style="flex:1;min-width:0">
    <div class="row" style="gap:8px;flex-wrap:wrap"><span class="tag"><i style="background:var(--series-workout)"></i>Workout</span>
    <span style="font-size:14px">${esc(w.type)} · ${fmtMins(w.durationMin)}</span></div>
    ${w.notes ? `<div class="notes">${esc(w.notes)}</div>` : ""}
    ${mine ? `<div class="row" style="gap:4px;margin-top:4px"><a href="#/log/${w.id}" class="meta">Edit</a><button class="danger" data-del="${w.id}">Delete</button></div>`
      : ""}
  </div></li>`;
}

// ── Log a workout ────────────────────────────────────────────────────────────
async function renderLog(editId) {
  if (!me.canLog) {
    view.innerHTML = `<div class="card"><h2>You're not in a competition squad</h2><p class="meta">Workout logging is for squad members of an upcoming competition. Ask an admin to add you.</p></div>`;
    return;
  }
  const { workouts } = await api("/workouts");
  const editing = editId ? workouts.find((w) => w.id === Number(editId)) : null;
  if (editId && !editing) throw new Error("Workout not found.");
  const w = editing || { date: me.today, type: me.workoutTypes[0], durationMin: "", notes: "" };

  view.innerHTML = `
    <form id="f" class="card stack">
      <h2>${editing ? "Edit workout" : "Log a workout"}</h2>
      <div class="grid2">
        <div><label for="date">Date</label><input id="date" type="date" max="${me.today}" required value="${esc(w.date)}"></div>
        <div><label for="dur">Duration (minutes)</label><input id="dur" type="number" inputmode="numeric" min="1" max="600" required value="${esc(w.durationMin)}"></div>
      </div>
      <div><label for="type">Type</label><select id="type">${me.workoutTypes.map((t) => `<option ${t === w.type ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
      <div><label for="notes">Details — optional</label><textarea id="notes" maxlength="2000" placeholder="e.g. 5×5 squats 80kg, 5 km easy run">${esc(w.notes)}</textarea></div>
      <p class="error" id="err"></p>
      <button class="full" type="submit">${editing ? "Save changes" : "Log workout"}</button>
      ${editing ? `<a href="#/log" class="meta" style="text-align:center;display:block">Cancel</a>` : ""}
    </form>
    <div class="card"><div class="row spread"><h2 style="margin:0">My recent workouts</h2><a class="meta" href="#/member/${me.member.id}">All activity →</a></div>
      ${workouts.length ? `<ul class="timeline">${workouts.slice(0, 10).map((x) => workoutItem(x, true)).join("")}</ul>` : `<p class="meta">None yet.</p>`}
    </div>`;

  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter; btn.disabled = true; $("#err").textContent = "";
    const body = { date: $("#date").value, type: $("#type").value, durationMin: Number($("#dur").value),
      notes: $("#notes").value };
    try {
      await api(editing ? `/workouts/${editing.id}` : "/workouts", { method: editing ? "PATCH" : "POST", body });
      if (editing) toast("Workout updated"); else celebrate();
      if (editing) location.hash = "#/log"; else route();
    } catch (e) { $("#err").textContent = e.message; btn.disabled = false; }
  };
  view.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async (e) => {
    e.preventDefault();
    if (!confirm("Delete this workout?")) return;
    await api(`/workouts/${b.dataset.del}`, { method: "DELETE" });
    toast("Workout deleted"); route();
  }));
}

// ── Admin ────────────────────────────────────────────────────────────────────
async function renderAdmin() {
  if (!me.member.isAdmin) { location.hash = "#/"; return; }
  const [{ competitions }, { members: syncStatus }] = await Promise.all([api("/competitions"), api("/sync/status")]);
  // Problems first, then everyone else.
  const syncRows = [...syncStatus].sort((a, b) => (!!b.error - !!a.error) || a.name.localeCompare(b.name));
  const selected = competitions.find((c) => c.id === state.adminCompId) || competitions[0];
  const [squad, invites] = selected
    ? await Promise.all([api(`/competitions/${selected.id}/squad`).then((r) => r.members), api(`/competitions/${selected.id}/invites`).then((r) => r.invites)])
    : [[], []];

  view.innerHTML = `
    <form id="newc" class="card stack">
      <h2>New competition</h2>
      <div><label for="cn">Name</label><input id="cn" required maxlength="200" placeholder="e.g. Asia Pacific Champs 2027"></div>
      <div class="grid2">
        <div><label for="cs">Prep starts</label><input id="cs" type="date" required value="${me.today}"></div>
        <div><label for="cd">Competition date</label><input id="cd" type="date" required></div>
      </div>
      <div class="grid2">
        <div><label for="ct">Trainings per week</label><input id="ct" type="number" inputmode="numeric" min="0" max="14" step="1" required value="2"></div>
        <div><label for="cw">Other workouts per week</label><input id="cw" type="number" inputmode="numeric" min="0" max="14" step="1" required value="1"></div>
      </div>
      <p class="meta" style="margin:0">Weekly targets per person. They set the green/red on the Dashboard and Puff's team goal.</p>
      <p class="error" id="cerr"></p>
      <button type="submit">Create</button>
    </form>
    ${selected ? `
    <div class="card stack">
      <div><label for="sel">Competition</label><select id="sel">${competitions.map((c) => `<option value="${c.id}" ${c.id === selected.id ? "selected" : ""}>${esc(c.name)} · ${fmtDate(c.competitionDate, true)}</option>`).join("")}</select></div>
      <form id="editc" class="stack">
        <div><label for="en">Name</label><input id="en" required maxlength="200" value="${esc(selected.name)}"></div>
        <div class="grid2">
          <div><label for="es">Prep starts</label><input id="es" type="date" required value="${selected.startDate}"></div>
          <div><label for="ed">Competition date</label><input id="ed" type="date" required value="${selected.competitionDate}"></div>
        </div>
      <div class="grid2">
        <div><label for="et">Trainings per week</label><input id="et" type="number" inputmode="numeric" min="0" max="14" step="1" required value="${selected.targets.trainingsPerWeek}"></div>
        <div><label for="ew">Other workouts per week</label><input id="ew" type="number" inputmode="numeric" min="0" max="14" step="1" required value="${selected.targets.workoutsPerWeek}"></div>
      </div>
      <p class="meta" style="margin:0">Weekly targets per person. They set the green/red on the Dashboard and Puff's team goal.</p>
        <p class="error" id="eerr"></p>
        <div class="row"><button type="submit" class="secondary">Save</button><button type="button" class="danger" id="delc">Delete competition</button></div>
      </form>
    </div>
    ${invites.length ? `<div class="card stack">
      <div class="row spread"><h2 style="margin:0">Still to match · ${invites.length}</h2><button class="link" id="retry">Check again</button></div>
      <p class="meta">These names couldn't be matched to exactly one portal account. Pick the right person, or search below and then dismiss.</p>
      <ul class="timeline">${invites.map((i) => `<li style="align-items:flex-start"><div style="flex:1;min-width:0">
        <div style="font-weight:500">${esc(i.name)}</div><div class="meta">${esc(i.note)}</div>
        ${i.candidates.length ? `<div class="chips" style="margin-top:8px">${i.candidates.map((c) => `<button class="chip" data-pick="${i.id}" data-member="${c.id}">Add ${esc(c.name)}</button>`).join("")}</div>` : ""}
      </div><button class="danger" data-dismiss="${i.id}">Dismiss</button></li>`).join("")}</ul>
    </div>` : ""}
    <div class="card stack">
      <h2>Squad · ${squad.length}</h2>
      <div><label for="q">Add a portal member</label><input id="q" placeholder="Search by name" autocomplete="off"></div>
      <ul class="timeline" id="results"></ul>
      ${squad.length ? `<ul class="timeline">${squad.map((m) => `<li style="align-items:center">${avatar(m)}<div style="flex:1">${esc(m.name)}</div><button class="danger" data-rm="${m.id}">Remove</button></li>`).join("")}</ul>` : `<p class="meta">No one yet.</p>`}
    </div>` : ""}
    <div class="card stack">
      <h2>Training data</h2>
      <p class="meta">Attendance is pulled from the portal every 30 minutes and whenever someone signs in. Use this after closing a session if you want it on the dashboard right away.</p>
      <button class="secondary" id="sync">Sync now</button>
      ${syncRows.length ? `<ul class="timeline">${syncRows.map((m) => `<li><div style="flex:1;min-width:0">
        <div style="font-size:14px">${esc(m.name)}</div>
        <div class="meta" ${m.error ? 'style="color:var(--warn)"' : ""}>${m.error ? esc(m.error) : `OK · synced ${esc(ago(m.syncedAt))}`}</div>
      </div></li>`).join("")}</ul>` : ""}
    </div>`;

  $("#newc").onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const { competition } = await api("/competitions", { method: "POST", body: { name: $("#cn").value, startDate: $("#cs").value, competitionDate: $("#cd").value, targetTrainings: Number($("#ct").value), targetWorkouts: Number($("#cw").value) } });
      state.adminCompId = competition.id; toast("Competition created"); route();
    } catch (e) { $("#cerr").textContent = e.message; }
  };
  $("#sync").onclick = async (ev) => {
    ev.target.disabled = true;
    try { const r = await api("/sync", { method: "POST" }); toast(`Synced ${r.synced}${r.failed ? `, ${r.failed} failed` : ""}`); }
    catch (e) { toast(e.message); }
    ev.target.disabled = false;
  };
  if (!selected) return;

  $("#sel").onchange = (e) => { state.adminCompId = Number(e.target.value); route(); };
  $("#editc").onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api(`/competitions/${selected.id}`, { method: "PATCH", body: { name: $("#en").value, startDate: $("#es").value, competitionDate: $("#ed").value, targetTrainings: Number($("#et").value), targetWorkouts: Number($("#ew").value) } }); toast("Saved"); route(); }
    catch (e) { $("#eerr").textContent = e.message; }
  };
  $("#delc").onclick = async () => {
    if (!confirm(`Delete "${selected.name}"? The squad list is removed; everyone's logged workouts are kept.`)) return;
    await api(`/competitions/${selected.id}`, { method: "DELETE" });
    state.adminCompId = null; toast("Deleted"); route();
  };
  view.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
    await api(`/competitions/${selected.id}/squad/${b.dataset.rm}`, { method: "DELETE" });
    toast("Removed from squad"); route();
  }));

  view.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    await api(`/invites/${b.dataset.pick}/pick`, { method: "POST", body: { memberId: Number(b.dataset.member) } });
    toast("Added to squad"); route();
  }));
  view.querySelectorAll("[data-dismiss]").forEach((b) => (b.onclick = async () => {
    await api(`/invites/${b.dataset.dismiss}/dismiss`, { method: "POST" });
    route();
  }));
  $("#retry")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    const r = await api("/invites/retry", { method: "POST" });
    toast(r.added ? `Matched ${r.added}` : "No new matches"); route();
  });

  const inSquad = new Set(squad.map((m) => m.id));
  let timer;
  $("#q").oninput = (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    timer = setTimeout(async () => {
      const box = $("#results");
      if (q.length < 2) { box.innerHTML = ""; return; }
      const { members } = await api(`/portal-members?q=${encodeURIComponent(q)}`);
      box.innerHTML = members.length ? members.map((m) => `<li style="align-items:center">${avatar(m)}<div style="flex:1">${esc(m.name)}<div class="meta">${esc(m.memberStatus)}</div></div>
        ${inSquad.has(m.id) ? `<span class="meta">In squad</span>` : `<button class="secondary" data-add="${m.id}">Add</button>`}</li>`).join("") : `<li class="meta">No portal members match.</li>`;
      box.querySelectorAll("[data-add]").forEach((b) => (b.onclick = async () => {
        b.disabled = true;
        const r = await api(`/competitions/${selected.id}/squad`, { method: "POST", body: { memberId: Number(b.dataset.add) } });
        toast(r.sync?.ok ? `Added · ${r.sync.count} trainings synced` : "Added · training sync will retry");
        route();
      }));
    }, 250);
  };
}

// ── Staying up to date ───────────────────────────────────────────────────────
// A home-screen web app has no refresh button. Two ways it gets new code and data:
// 1. Pull down at the top of the page to reload (home-screen app only; a browser tab
//    has its own pull-to-refresh).
// 2. When the app is reopened, it asks the server which version is live and reloads
//    itself if that has changed since it loaded.
const LOADED_VERSION = document.querySelector('meta[name="app-version"]')?.content || "";
const isStandalone = () => window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;

async function checkForUpdate() {
  if (!LOADED_VERSION) return;
  try {
    const { version } = await (await fetch("api/version", { cache: "no-store" })).json();
    if (version && version !== LOADED_VERSION) location.reload();
  } catch {}
}
let lastCheck = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastCheck < 30_000) return;
  lastCheck = Date.now();
  checkForUpdate();
  if (getToken() && me) route(); // fresh numbers too
});

(function pullToRefresh() {
  if (!isStandalone()) return;
  const ptr = $("#ptr"), label = $("#ptr-label");
  const THRESHOLD = 70;
  let startY = null, pull = 0;
  window.addEventListener("touchstart", (e) => {
    startY = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
    pull = 0;
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    pull = Math.max(0, e.touches[0].clientY - startY);
    if (pull <= 0) { ptr.style.height = "0px"; return; }
    const h = Math.min(90, pull * 0.6);
    ptr.style.height = `${h}px`;
    label.textContent = pull > THRESHOLD ? "Release to refresh" : "Pull to refresh";
  }, { passive: true });
  window.addEventListener("touchend", () => {
    if (startY === null) return;
    startY = null;
    if (pull > THRESHOLD) {
      label.textContent = "Refreshing…";
      ptr.style.height = "44px";
      location.reload();
    } else {
      ptr.style.height = "0px";
    }
  });
})();

route();
