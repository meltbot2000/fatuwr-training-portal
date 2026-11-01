// FATUWR Comp Prep — single-file frontend, no build step.
// Every value from the server goes through esc() before it touches innerHTML.

const $ = (sel, root = document) => root.querySelector(sel);
const view = $("#view");
const TOKEN_KEY = "wl_token";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} }

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
  [/^#\/?$/, renderDashboard, "Comp Prep"],
  [/^#\/member\/(\d+)$/, renderMember, "Activity"],
  [/^#\/log$/, renderLog, "Log workout"],
  [/^#\/log\/(\d+)$/, renderLog, "Edit workout"],
  [/^#\/admin$/, renderAdmin, "Admin"],
];

async function route() {
  const hash = location.hash || "#/";
  $("#tooltip").hidden = true; // its anchor is about to be removed, so pointerleave won't fire
  if (!getToken() && hash !== "#/login") { location.hash = "#/login"; return; }
  if (getToken() && !me && hash !== "#/login") {
    try { me = await api("/me"); } catch (e) { if (getToken()) view.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  }
  const nav = $("#nav");
  nav.hidden = hash === "#/login";
  if (me) {
    $("#nav-admin").hidden = !me.member.isAdmin;
    $("#nav-log").hidden = !me.canLog;
  }
  const tab = hash.startsWith("#/log") ? "log" : hash.startsWith("#/admin") ? "admin" : "dashboard";
  nav.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));

  for (const [re, fn, title] of routes) {
    const m = hash.match(re);
    if (m) {
      $("#title").textContent = title;
      document.title = `${title} · FATUWR`;
      view.innerHTML = `<p class="meta">Loading…</p>`;
      try { await fn(...m.slice(1)); } catch (e) { view.innerHTML = `<div class="card"><p class="error">${esc(e.message)}</p></div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = "#/";
}
window.addEventListener("hashchange", route);

// ── Login ────────────────────────────────────────────────────────────────────
function renderLogin() {
  let email = "";
  const step1 = () => {
    view.innerHTML = `
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
  const rangeText = data.range.from ? `${fmtDate(data.range.from, true)} – ${fmtDate(data.range.to, true)}` : `up to ${fmtDate(data.range.to, true)}`;

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
    <div class="chips" role="group" aria-label="Period" style="margin-bottom:12px">
      ${data.periods.map((o) => `<button class="chip${o.upcoming ? " upcoming" : ""}" data-period="${esc(o.key)}" aria-pressed="${o.key === data.period}">${esc(o.label)}</button>`).join("")}
    </div>
    ${data.weeks === null ? `<div class="banner" style="background:var(--card);color:var(--text-2)">This period starts ${fmtDate(data.range.from, true)}. Nothing to show yet.</div>` : ""}
    <div class="statrow">
      <h3>Team <span class="meta">· per person, ${esc(rangeText)}</span></h3>
      <div class="tiles cols2">
        ${tile(fmtAvg(data.team.avgTrainingsPerWeek), "Avg trainings / week")}
        ${tile(fmtAvg(data.team.avgWorkoutsPerWeek), "Avg extra workouts / week")}
      </div>
    </div>
    <div class="statrow">
      <h3>Individual <span class="meta">· ${esc(me.member.name)}</span></h3>
      ${mine ? `<div class="tiles cols4">
        ${tile(mine.trainings, "Trainings")}
        ${tile(mine.workouts, "Extra workouts")}
        ${tile(fmtAvg(mine.avgTrainingsPerWeek), "Avg trainings / week", target(mine.avgTrainingsPerWeek, (v) => v > T.trainingsPerWeekAbove, `target: above ${T.trainingsPerWeekAbove}`))}
        ${tile(fmtAvg(mine.avgWorkoutsPerWeek), "Avg extra / week", target(mine.avgWorkoutsPerWeek, (v) => v >= T.workoutsPerWeekMin, `target: ${T.workoutsPerWeekMin}+`))}
      </div>` : `<p class="meta">You're not in this squad, so there are no individual numbers.</p>`}
    </div>
    ${failing ? `<div class="banner">Training data couldn't be refreshed for ${failing} ${failing === 1 ? "person" : "people"} — showing the last good copy.</div>` : ""}
    <div class="card">
      <div class="row spread"><h2 style="margin:0">Squad · ${rows.length}</h2><span class="meta">${esc(rangeText)}</span></div>
      <div class="legend" aria-hidden="true"><span><i style="background:var(--series-training)"></i>Regular trainings</span><span><i style="background:var(--series-workout)"></i>Extra workouts</span></div>
      ${rows.length ? `<ul class="board">${rows.map((r) => boardRow(r, max)).join("")}</ul>` : `<p class="meta">No one in this squad yet.</p>`}
      <p class="meta" style="margin:8px 0 0">Trainings = portal sessions signed up for, counted from 1 h after the start, when sign-ups end (full rain-offs excluded). Synced ${esc(ago(oldestSync))}.</p>
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

const fmtAvg = (v) => (v === null || v === undefined ? "—" : v.toFixed(1));
function tile(value, label, status = "") {
  return `<div class="tile${status ? " " + status.cls : ""}"><div class="num">${esc(value)}</div><div class="lbl">${esc(label)}</div>${status ? `<div class="target">${status.html}</div>` : ""}</div>`;
}
/** Green/red against a target — always with ✓/✗ and the target in words, never colour alone. */
function target(v, ok, text) {
  if (v === null || v === undefined) return "";
  const pass = ok(v);
  return { cls: pass ? "good" : "bad", html: `${pass ? "✓" : "✗"} ${esc(text)}` };
}

function boardRow(r, max) {
  const pct = (n) => (n / max) * 100;
  const types = r.topTypes.map((t) => `${esc(t.type)} ×${t.count}`).join(" · ");
  const bits = [
    r.workouts ? fmtMins(r.workoutMinutes) + " extra" : "",
    r.lastActive ? `last ${fmtDate(r.lastActive)}` : "no activity yet",
  ].filter(Boolean).join(" · ");
  const label = `${r.member.name}: ${r.trainings} trainings, ${r.workouts} extra workouts`;
  return `<li><a class="item" href="#/member/${r.member.id}" aria-label="${esc(label)}">
    <div class="row">${avatar(r.member)}
      <div style="flex:1;min-width:0"><div class="name">${esc(r.member.name)}</div></div>
      <div class="counts"><span style="color:var(--text)">${r.trainings}</span> <span class="muted">+</span> <span style="color:var(--text)">${r.workouts}</span></div>
    </div>
    ${r.trainings + r.workouts ? `<div class="bar">
      ${r.trainings ? `<span class="t" style="width:${pct(r.trainings)}%" data-tip="${r.trainings} regular training${r.trainings === 1 ? "" : "s"}"></span>` : ""}
      ${r.workouts ? `<span class="w" style="width:${pct(r.workouts)}%" data-tip="${r.workouts} extra workout${r.workouts === 1 ? "" : "s"} · ${fmtMins(r.workoutMinutes)}"></span>` : ""}
    </div>` : ""}
    <div class="meta sub">${esc(bits)}${types ? `<br>${types}` : ""}${r.syncError ? `<br><span style="color:var(--warn)">training sync failing</span>` : ""}</div>
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
  $("#signout")?.addEventListener("click", () => {
    setToken(null); me = null;
    try { localStorage.removeItem("wl_email"); } catch {}
    location.hash = "#/login";
  });
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
      <div class="tile"><div class="num">${d.workouts.length}</div><div class="lbl">extra workouts</div></div>
      <div class="tile"><div class="num">${fmtMins(mins)}</div><div class="lbl">extra time</div></div>
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
      : me.member.isAdmin ? `<button class="danger" data-del="${w.id}">Delete</button>` : ""}
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
      toast(editing ? "Workout updated" : "Workout logged");
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
      const { competition } = await api("/competitions", { method: "POST", body: { name: $("#cn").value, startDate: $("#cs").value, competitionDate: $("#cd").value } });
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
    try { await api(`/competitions/${selected.id}`, { method: "PATCH", body: { name: $("#en").value, startDate: $("#es").value, competitionDate: $("#ed").value } }); toast("Saved"); route(); }
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

route();
