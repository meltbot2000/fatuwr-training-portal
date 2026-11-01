/**
 * The competition this deployment was set up for. Inserted once, on first boot, only if
 * no competition by that name exists — so editing or deleting it in Admin sticks.
 * Prep start (1 Nov 2026) is a placeholder — change it in Admin if prep began earlier/later.
 */
import { exec, query } from "./db";

const SEED = { name: "Amager Cup", startDate: "2026-11-01", competitionDate: "2027-04-10" };

export async function seedCompetitions(): Promise<void> {
  const [existing] = await query("SELECT id FROM competitions WHERE name = ? LIMIT 1", [SEED.name]);
  if (existing) return;
  const [any] = await query("SELECT id FROM competitions LIMIT 1");
  if (any) return; // an admin has already set things up differently — don't add to it
  await exec("INSERT INTO competitions (name, start_date, competition_date) VALUES (?, ?, ?)",
    [SEED.name, SEED.startDate, SEED.competitionDate]);
  console.log(`[seed] created competition "${SEED.name}" (${SEED.competitionDate})`);
}
