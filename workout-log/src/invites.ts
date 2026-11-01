/**
 * Squad invites: names an admin wants in a squad, matched to portal accounts.
 *
 * Matching is deliberately strict — the portal's name search is a substring match, so
 * "Rei" also finds "Andrei" and "Reina". A name is added automatically only when
 * exactly ONE portal account has it as its first name (or whole name). Anything else
 * stays pending with the candidates listed, for an admin to pick in one tap.
 *
 * Pending invites are retried at every sync, so someone who creates their portal
 * account later is picked up without anyone doing anything.
 */
import { exec, query } from "./db";
import { portal, type PortalMember } from "./portal";
import { syncMember, upsertMember } from "./sync";

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/** Portal members whose first name, or whole name, equals the invited name. */
export function matchInvite(name: string, members: Pick<PortalMember, "id" | "name">[]): Pick<PortalMember, "id" | "name">[] {
  const want = norm(name);
  if (!want) return [];
  const seen = new Set<number>();
  return members.filter(m => {
    const full = norm(m.name);
    const first = full.split(" ")[0];
    const hit = full === want || first === want;
    if (!hit || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

interface InviteRow { id: number; competition_id: number; name: string }

export async function resolvePendingInvites(): Promise<{ added: number; pending: number }> {
  const pending = await query<InviteRow>("SELECT id, competition_id, name FROM squad_invites WHERE status = 'pending'");
  let added = 0;
  for (const inv of pending) {
    try {
      const { members } = await portal.searchMembers(inv.name);
      const matches = matchInvite(inv.name, members);
      if (matches.length === 1) {
        const m = members.find(x => x.id === matches[0].id)!;
        await upsertMember(m);
        await exec("INSERT IGNORE INTO squad_members (competition_id, member_id) VALUES (?, ?)", [inv.competition_id, m.id]);
        await exec("UPDATE squad_invites SET status = 'added', member_id = ?, candidates = NULL, note = NULL WHERE id = ?", [m.id, inv.id]);
        await syncMember(m.id);
        added++;
        console.log(`[Invites] "${inv.name}" → ${m.name} (#${m.id})`);
      } else {
        const note = matches.length ? `${matches.length} portal members match — pick one` : "No portal account with this name yet";
        await exec("UPDATE squad_invites SET candidates = ?, note = ? WHERE id = ?",
          [matches.length ? JSON.stringify(matches.map(x => ({ id: x.id, name: x.name }))) : null, note, inv.id]);
      }
    } catch (e: any) {
      console.warn(`[Invites] "${inv.name}" lookup failed: ${e?.message}`);
    }
  }
  return { added, pending: pending.length - added };
}
