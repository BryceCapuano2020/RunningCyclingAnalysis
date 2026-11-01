import { and, eq, sql } from 'drizzle-orm'
import type { Deps } from '../deps.ts'
import type { Db } from '../env.ts'
import { oauthAccounts, users } from '../db/schema.ts'
import { accountDeleting, HttpError, notOnList } from '../errors.ts'
import { restoreCountsStatement, takeAccountCreate } from '../identityBudget.ts'
import { must } from '../util.ts'
import { GOOGLE_PROVIDER, refreshUser } from './accounts.ts'
import type { GoogleProfile } from './google.ts'
import type { SignupGate } from './signupGate.ts'

type UserRow = typeof users.$inferSelect

/** A concurrent sign-in can change the state once; after that the state is settled or it is a fault. */
const MAX_ATTEMPTS = 2

function profileValues(profile: GoogleProfile): { name: string; pictureUrl: string | null } {
  return { name: profile.name, pictureUrl: profile.pictureUrl }
}

function findLink(db: Db, sub: string) {
  return db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, GOOGLE_PROVIDER), eq(oauthAccounts.providerUserId, sub)))
    .get()
}

/**
 * Attaches a Google identity to an account that already exists for the verified email. Google
 * verifies the address, so the account is probably the same person. It is linked only when that
 * account has no Google identity yet; otherwise a second Google account could take it over by
 * claiming the same address. The check and the insert are one statement, so concurrent callbacks
 * for different subjects with the same email cannot both attach: the first identity wins.
 */
async function attachToExisting(
  db: Db,
  existing: UserRow,
  profile: GoogleProfile,
): Promise<UserRow> {
  if (existing.deletingAt !== null) throw accountDeleting()
  await db.run(sql`INSERT INTO oauth_accounts (provider, provider_user_id, user_id)
    SELECT ${GOOGLE_PROVIDER}, ${profile.sub}, ${existing.id}
    WHERE NOT EXISTS (
      SELECT 1 FROM oauth_accounts
      WHERE provider = ${GOOGLE_PROVIDER} AND user_id = ${existing.id}
    )
    ON CONFLICT(provider, provider_user_id) DO NOTHING`)
  const linked = await findLink(db, profile.sub)
  if (linked) return refreshUser(db, linked.userId, profileValues(profile))
  throw new HttpError(
    409,
    'account_conflict',
    'This email is already linked to a different Google account. Sign in with that account.',
  )
}

/**
 * Creates the account, its Google link and the counts its identity had spent today, in one batch:
 * either the user and the link both exist afterwards or neither does. A concurrent sign-in that wins
 * the email or the identity makes this batch fail whole, and the caller then reads the winner's
 * state. Returns undefined in that case, unless `final` says there is no state left to read.
 */
async function createAccount(
  db: Db,
  deps: Deps,
  profile: GoogleProfile,
  gate: SignupGate,
  final: boolean,
): Promise<UserRow | undefined> {
  if (!gate.allows(profile.email)) throw notOnList()
  const d1 = db.$client
  const now = deps.now()
  const identityKey = await gate.identityKey(profile.sub)
  const charge =
    identityKey === undefined ? undefined : await takeAccountCreate(d1, identityKey, now)
  const id = deps.randomUUID()
  const statements = [
    d1
      .prepare(
        'INSERT INTO users (id, email, name, picture_url, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(id, profile.email, profile.name, profile.pictureUrl, now),
    d1
      .prepare('INSERT INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)')
      .bind(GOOGLE_PROVIDER, profile.sub, id),
  ]
  if (identityKey !== undefined) statements.push(restoreCountsStatement(d1, identityKey, id, now))
  try {
    await d1.batch(statements)
  } catch (error) {
    await charge?.refund()
    if (final) throw error
    return undefined
  }
  return must(await db.select().from(users).where(eq(users.id, id)).get(), 'user')
}

/**
 * Finds or creates the user for a verified Google account and links the Google identity.
 *
 * An account that already exists for the identity or the email signs in without the gate; the gate
 * decides only whether a new account may be created. The sign-in steps are in docs/ARCHITECTURE.md.
 */
export async function signInWithGoogle(
  db: Db,
  deps: Deps,
  profile: GoogleProfile,
  gate: SignupGate,
): Promise<UserRow> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const link = await findLink(db, profile.sub)
    if (link) return refreshUser(db, link.userId, profileValues(profile))

    const existing = await db.select().from(users).where(eq(users.email, profile.email)).get()
    if (existing) return attachToExisting(db, existing, profile)

    const created = await createAccount(db, deps, profile, gate, attempt === MAX_ATTEMPTS)
    if (created) return created
  }
  throw new Error('sign-in did not settle')
}
