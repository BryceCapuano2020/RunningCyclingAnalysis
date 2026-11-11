import type { Bindings } from '../env.ts'
import type { Deps } from '../deps.ts'
import { reserveR2Operation } from '../storage.ts'
import { openTokens, sealTokens, type SealedTokens } from '../providers/tokens.ts'
import type { GarminGrant, GarminTokens } from './oauth.ts'

/** The link and inbox rows of docs/design/garmin-sync.md section 5a. Only routes/garmin.ts and deletion call these. */

export const GARMIN = 'garmin'

export interface StoredLink {
  userId: string
  garminUserId: string
  sealed: SealedTokens
}

interface LinkRow {
  user_id: string
  provider_user_id: string
  token_ciphertext: string
  key_id: string
}

function stored(row: LinkRow): StoredLink {
  return {
    userId: row.user_id,
    garminUserId: row.provider_user_id,
    sealed: { ciphertext: row.token_ciphertext, keyId: row.key_id },
  }
}

const LINK_COLUMNS = 'user_id, provider_user_id, token_ciphertext, key_id'

export async function linkOf(db: D1Database, userId: string): Promise<StoredLink | null> {
  const row = await db
    .prepare(`SELECT ${LINK_COLUMNS} FROM provider_links WHERE user_id = ? AND provider = ?`)
    .bind(userId, GARMIN)
    .first<LinkRow>()
  return row === null ? null : stored(row)
}

export async function linkOfGarminUser(
  db: D1Database,
  garminUserId: string,
): Promise<StoredLink | null> {
  const row = await db
    .prepare(
      `SELECT ${LINK_COLUMNS} FROM provider_links WHERE provider = ? AND provider_user_id = ?`,
    )
    .bind(GARMIN, garminUserId)
    .first<LinkRow>()
  return row === null ? null : stored(row)
}

export type SaveOutcome =
  | { saved: true; replaced: StoredLink | null }
  | { saved: false; reason: 'linked_elsewhere' | 'deleting' }

/**
 * Stores the grant as the account's one Garmin link, sealed, in one statement that holds only while the account is
 * not deleting. A Garmin user linked to another account is refused; the unique index refuses one that races in.
 * `replaced` is the link this one replaced when it was for another Garmin user, whose grant the caller deregisters.
 */
export async function saveLink(
  env: Bindings,
  deps: Pick<Deps, 'now' | 'randomBytes'>,
  userId: string,
  grant: GarminGrant,
): Promise<SaveOutcome> {
  const db = env.DB
  const holder = await linkOfGarminUser(db, grant.garminUserId)
  if (holder !== null && holder.userId !== userId)
    return { saved: false, reason: 'linked_elsewhere' }
  const previous = await linkOf(db, userId)
  const sealed = await sealTokens(
    env.PROVIDER_TOKEN_KEY,
    deps.randomBytes,
    userId,
    GARMIN,
    grant.tokens,
  )
  let written: { user_id: string } | null
  try {
    written = await db
      .prepare(
        `INSERT INTO provider_links (user_id, provider, provider_user_id, token_ciphertext, key_id, scopes, linked_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
         WHERE EXISTS (SELECT 1 FROM users WHERE id = ?1 AND deleting_at IS NULL)
         ON CONFLICT (user_id, provider) DO UPDATE SET provider_user_id = excluded.provider_user_id,
           token_ciphertext = excluded.token_ciphertext, key_id = excluded.key_id, scopes = excluded.scopes,
           linked_at = excluded.linked_at
         RETURNING user_id`,
      )
      .bind(
        userId,
        GARMIN,
        grant.garminUserId,
        sealed.ciphertext,
        sealed.keyId,
        grant.scopes.join(' '),
        deps.now(),
      )
      .first<{ user_id: string }>()
  } catch (error) {
    // Another account's callback for the same Garmin user wrote first.
    if (/UNIQUE constraint failed/i.test(String(error))) {
      return { saved: false, reason: 'linked_elsewhere' }
    }
    throw error
  }
  if (written === null) return { saved: false, reason: 'deleting' }
  const replaced =
    previous !== null && previous.garminUserId !== grant.garminUserId ? previous : null
  return { saved: true, replaced }
}

/**
 * Removes the account's link and every inbox item, rows first in one batch, then the items' files. With a Garmin user
 * id, only that link goes (a notice must not remove a link made since it was read), and the inbox only with it. The
 * files are best effort: a failure is logged, and files no row names go to the orphan scan.
 */
export async function removeLink(
  env: Bindings,
  now: number,
  userId: string,
  garminUserId?: string,
): Promise<void> {
  const [, items] = await env.DB.batch<{ file_key: string | null }>([
    env.DB.prepare(
      `DELETE FROM provider_links WHERE user_id = ?1 AND provider = ?2
         AND (?3 IS NULL OR provider_user_id = ?3)`,
    ).bind(userId, GARMIN, garminUserId ?? null),
    // changes() is the link statement's: the inbox goes only with the link (or when there was none to remove).
    env.DB.prepare(
      `DELETE FROM inbox_items WHERE user_id = ?1 AND provider = ?2 AND (?3 IS NULL OR changes() = 1)
       RETURNING file_key`,
    ).bind(userId, GARMIN, garminUserId ?? null),
  ])
  const keys = (items?.results ?? []).flatMap((row) =>
    row.file_key === null ? [] : [row.file_key],
  )
  if (keys.length === 0 || !env.FILES) return
  try {
    await reserveR2Operation(env.DB, now, { cleanup: true })
    await env.FILES.delete(keys)
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'garmin_inbox_files_left',
        errorClass: error instanceof Error ? error.constructor.name : typeof error,
      }),
    )
  }
}

/** The stored link's tokens, or null when they cannot be opened (a key dropped, a damaged row). */
export async function tokensOf(env: Bindings, link: StoredLink): Promise<GarminTokens | null> {
  try {
    const opened = (await openTokens(
      env.PROVIDER_TOKEN_KEY,
      link.userId,
      GARMIN,
      link.sealed,
    )) as Partial<GarminTokens> | null
    return typeof opened?.accessToken === 'string' ? (opened as GarminTokens) : null
  } catch {
    return null
  }
}

/**
 * Asks Garmin to stop sending a link's data. Best effort: a failure is logged by class and never stops the removal
 * the athlete asked for, since a push for an unknown Garmin user stores nothing.
 */
export async function deregisterQuietly(
  env: Bindings,
  deps: Deps,
  link: StoredLink,
): Promise<void> {
  try {
    const tokens = await tokensOf(env, link)
    if (tokens === null) throw new Error('tokens unreadable')
    await deps.garmin(env).deregister(tokens.accessToken)
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'garmin_deregister_failed',
        errorClass: error instanceof Error ? error.constructor.name : typeof error,
      }),
    )
  }
}

/** Whether two tokens are the same, in time that does not depend on where they differ. */
export function sameToken(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  if (left.length !== right.length) return false
  let difference = 0
  for (let i = 0; i < left.length; i += 1) difference |= left[i]! ^ right[i]!
  return difference === 0
}
