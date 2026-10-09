import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { getPool } from "@/lib/db";

/** A random invite token; only its hash is stored. */
export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function inviteTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Compares two secrets in constant time, whatever their lengths. */
export function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** The inviting owner's name, while the link is unused, unexpired, and the space still has room. */
export async function findOpenInvite(token: string): Promise<{ inviterName: string } | null> {
  const { rows } = await getPool().query<{ inviter_name: string }>(
    `select u.display_name as inviter_name
       from space_invites i
       join app_users u on u.id = i.created_by
      where i.token_hash = $1 and i.used_at is null and i.expires_at > now()
        and not exists (select 1 from space_members m where m.space_id = i.space_id and m.role = 'partner')`,
    [inviteTokenHash(token)],
  );
  return rows[0] ? { inviterName: rows[0].inviter_name } : null;
}
