/**
 * What this deployment was set up for: the Amager Cup and its initial squad list.
 * Runs once (marker in app_meta), so later edits/deletions in Admin stick.
 * Prep start (1 Nov 2026) is a placeholder — change it in Admin if prep began earlier/later.
 */
import { exec, query } from "./db";

const SEED_KEY = "seed.amager_cup.v1";
const COMPETITION = { name: "Amager Cup", startDate: "2026-11-01", competitionDate: "2027-04-10" };
// As given by Melanie, 2026-11-01. Matched to portal accounts by src/invites.ts.
const SQUAD = ["Hayley", "Melanie", "Rei", "Dilys", "Genevieve", "Dylia", "Huiwen", "Gaya", "Kimberly", "Annabel"];

export async function seedCompetitions(): Promise<void> {
  const [done] = await query("SELECT 1 FROM app_meta WHERE k = ?", [SEED_KEY]);
  if (done) return;

  let [comp] = await query<{ id: number }>("SELECT id FROM competitions WHERE name = ? LIMIT 1", [COMPETITION.name]);
  if (!comp) {
    const r = await exec("INSERT INTO competitions (name, start_date, competition_date) VALUES (?, ?, ?)",
      [COMPETITION.name, COMPETITION.startDate, COMPETITION.competitionDate]);
    comp = { id: r.insertId };
    console.log(`[seed] created competition "${COMPETITION.name}" (${COMPETITION.competitionDate})`);
  }
  for (const name of SQUAD) {
    await exec("INSERT IGNORE INTO squad_invites (competition_id, name) VALUES (?, ?)", [comp.id, name]);
  }
  await exec("INSERT INTO app_meta (k, v) VALUES (?, ?)", [SEED_KEY, new Date().toISOString()]);
  console.log(`[seed] queued ${SQUAD.length} squad names for matching`);
}
