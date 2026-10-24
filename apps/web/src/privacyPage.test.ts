import type { ActivityRecord, Profile } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { buildAccountExport } from './export/accountExport'
import { APP_NAME } from './appName'
import { BRAND_RIDING, BRAND_RUNNING, pathData } from './ui/components/iconPaths'
import { readStylesheet } from './ui/components/stylesheet'

/*
 * These tests check the privacy page's stated facts against the source files they name: the
 * strings, numbers, field names and labels. They do not run the app and they do not check layout.
 * A change to one of those source strings fails here until the page is updated to match.
 */
const page = await readStylesheet(import.meta.url, '../public/privacy.html')
const privacyCss = await readStylesheet(import.meta.url, '../public/privacy.css')
const tokensCss = await readStylesheet(import.meta.url, './styles/tokens.css')
const icons = await readStylesheet(import.meta.url, './ui/components/icons.tsx')
const app = await readStylesheet(import.meta.url, './App.tsx')
const device = await readStylesheet(import.meta.url, './worker/device.ts')
const profilePage = await readStylesheet(import.meta.url, './ui/pages/ProfilePage.tsx')
const digestTypes = await readStylesheet(import.meta.url, '../../../packages/core/src/types.ts')
const sessionSource = await readStylesheet(import.meta.url, '../../api/src/auth/session.ts')
const authRoutes = await readStylesheet(import.meta.url, '../../api/src/routes/auth.ts')
const apiLimits = await readStylesheet(import.meta.url, '../../api/LIMITS.md')
const backupWorkflow = await readStylesheet(
  import.meta.url,
  '../../../.github/workflows/backup.yml',
)
const accountDeletion = await readStylesheet(import.meta.url, '../../api/src/accountDeletion.ts')
const budget = await readStylesheet(import.meta.url, '../../api/src/budget.ts')
const storage = await readStylesheet(import.meta.url, '../../api/src/storage.ts')

/** The page's visible text: markup removed and whitespace collapsed. */
function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
}

const text = textOf(page)

/** The sentence of the page's text that contains `phrase`, or '' when none does. */
function sentenceWith(phrase: string): string {
  return text.split('. ').find((sentence) => sentence.includes(phrase)) ?? ''
}

describe('privacy page brand', () => {
  it('shows the app name in the header, as the app does', () => {
    expect(page).toContain(`<span class="header__name">${APP_NAME}</span>`)
  })

  it('draws the brand mark with the same paths as the app', () => {
    expect(page).toContain(`d="${pathData(BRAND_RUNNING)}"`)
    expect(page).toContain(`d="${pathData(BRAND_RIDING)}"`)
  })

  it('draws the brand mark in the same colours as the app', () => {
    for (const colour of ['fill="#0e1116"', 'stroke="#f0435f"', 'stroke="#4d6ef5"']) {
      expect(icons).toContain(colour)
      expect(page).toContain(colour)
    }
  })

  it('links back to the app and to Profile from the header', () => {
    expect(page).toContain('class="header__brand" href="/"')
    expect(page).toContain('href="/#/profile"')
  })
})

describe('privacy page type matches the app', () => {
  it.each(['--font-sans', '--font-display'])('uses the %s stack from tokens.css', (name) => {
    const stack = new RegExp(`${name}: ([^;]+);`).exec(tokensCss)?.[1]
    expect(stack).toBeDefined()
    // Prettier may break a long stack over lines; the stack is the same without that whitespace.
    expect(privacyCss.replace(/\s+/g, ' ')).toContain(stack ?? '')
  })
})

describe('privacy page names controls as the app does', () => {
  const controls: Array<[label: string, source: string]> = [
    ['Keep original files in my library', 'ui/components/FileRetention.tsx'],
    ['Download my data', 'ui/components/AccountSection.tsx'],
    ['Delete account', 'ui/components/AccountSection.tsx'],
    ['Saved library', 'ui/components/SavedLibraryCard.tsx'],
    ['Kept in this browser', 'ui/components/SavedLibraryCard.tsx'],
    ['Start over', 'ui/pages/ProfilePage.tsx'],
    ['Prefer not to say', 'ui/components/AthleteFields.tsx'],
  ]

  it.each(controls)('"%s" is the label the app shows in %s', async (label, file) => {
    const source = await readStylesheet(import.meta.url, `./${file}`)
    expect(source).toContain(label)
    expect(text).toContain(label)
  })
})

describe('privacy page describes what is stored as the app stores it', () => {
  it('uses the same words for the profile fields as the app', () => {
    expect(text).not.toMatch(/body mass|bike mass/i)
    expect(text).toContain('bike and gear weight')
  })

  it('says signed-in visitors do not see the summaries kept in this browser', () => {
    expect(text).toMatch(/signed in[^.]*not shown|not shown[^.]*signed in/i)
  })

  it('says signing out keeps the summaries, and Start over removes them when signed out', () => {
    expect(text).toMatch(/Signing out does not remove/)
    expect(text).toMatch(/Start over[^.]*signed out/i)
  })

  it('says deleting the account keeps this browser copy until it is cleared', () => {
    expect(text).toMatch(/does not clear this browser's copy of your settings/)
    expect(text).toMatch(/until you clear this site's data/)
  })

  it('says what is counted each day, and that the counts are kept seven days', () => {
    expect(text).toMatch(/downloads, saves, deletions, uploads, profile changes and library reads/)
    expect(text).toMatch(/kept for seven days/)
  })

  it('says when an account was created and when an activity was saved', () => {
    expect(text).toContain('when the account was created')
    expect(text).toContain('save time')
  })

  it('says what the error log holds for an unreadable activity', () => {
    expect(text).toContain('and, for a saved activity that cannot be read, its ID')
  })

  it('says the sign-in cookie lasts until the session ends', () => {
    expect(text).toContain('a sign-in cookie that lasts until your session ends')
  })

  it('says a backup keeps account and activity IDs in its object keys', () => {
    expect(text).toContain('keys that include your account and activity IDs')
  })

  it('says backups are on GitHub only when they are turned on', () => {
    expect(text).toMatch(
      /If backups are turned on, encrypted copies of the database are stored on GitHub/,
    )
  })

  it('says data is kept until deleted, and that expired sessions are removed in daily cleanup', () => {
    expect(text).toContain('until you delete them or delete your account')
    expect(text).toContain('removed in daily cleanup')
  })

  it('does not print internal status about backups', () => {
    expect(text).not.toMatch(/not enabled/i)
  })

  it('says how to delete from the Profile page', () => {
    expect(text).toContain('How to delete')
    expect(page).toContain('href="/#/profile"')
  })
})

describe('privacy page states the limits the code sets', () => {
  it('sessions end up to 30 days after last use and at most 90 days after creation', () => {
    expect(sessionSource).toMatch(/SESSION_TTL_MS = 30 \* DAY_MS/)
    expect(sessionSource).toMatch(/SESSION_ABSOLUTE_MS = 90 \* DAY_MS/)
    const sentence = sentenceWith('after last use')
    expect(sentence).toMatch(/30 days/)
    expect(sentence).toMatch(/90 days/)
  })

  it('the Google sign-in cookies last ten minutes', () => {
    expect(authRoutes).toMatch(/OAUTH_COOKIE_MAX_AGE_S = 10 \* 60/)
    expect(text).toMatch(/ten minutes/)
  })

  it('logs are kept three days, as the operations notes say', () => {
    expect(apiLimits).toMatch(/3-day retention/)
    expect(text).toMatch(/three days/)
  })

  it('backups are kept 90 days, as the backup workflow says', () => {
    expect(backupWorkflow).toMatch(/retention-days: 90/)
    expect(sentenceWith('If backups are turned on')).toMatch(/90 days/)
  })
})

describe('the code behind the page', () => {
  it('stores only the digest on this device, with no file hash or coordinates', () => {
    expect(device).toContain('async save({ digest })')
    expect(digestTypes).toContain('export interface ActivityDigest {')
    const digest = /export interface ActivityDigest \{[\s\S]*?\n\}/.exec(digestTypes)?.[0] ?? ''
    expect(digest).not.toBe('')
    expect(digest).not.toMatch(/\b(fileHash|lat|lon|latitude|longitude|coordinates)\??:/)
  })

  it('offers Start over only when signed out', () => {
    expect(profilePage).toContain('const canStartOver = !signedIn &&')
  })

  it('links the footer Privacy link to /privacy', () => {
    expect(app).toContain('<a href="/privacy">Privacy</a>')
  })

  it('deletes the account row, which cascades, and sweeps its original files', () => {
    expect(accountDeletion).toContain("'DELETE FROM users WHERE id = ?'")
    expect(accountDeletion).toContain('sweepUserFiles(env.DB, env.FILES, userId')
  })

  it.each([
    ['activityCreate', 'routes/activities/create.ts'],
    ['fileDownload', 'routes/activities/file.ts'],
    ['activityDelete', 'routes/activities/remove.ts'],
    ['fileUpload', 'routes/activities/upload.ts'],
    ['profileWrite', 'routes/me.ts'],
    ['read', 'routes/activities/list.ts'],
  ])('counts %s requests each day', async (action, file) => {
    const source = await readStylesheet(import.meta.url, `../../api/src/${file}`)
    expect(source).toContain(`'${action}'`)
  })

  it('keeps daily counts for seven days', () => {
    expect(budget).toMatch(/DAILY_ROW_RETENTION_DAYS = 7/)
  })

  it('keys original files by account and activity', () => {
    expect(storage).toContain('`users/${userId}/`')
    expect(storage).toContain('`${userFilePrefix(userId)}${activityId}`')
  })

  it('writes the export fields the page lists', () => {
    const profile = {
      massKg: 75,
      bikeMassKg: 9,
      units: 'metric',
      keepFiles: false,
      birthYear: null,
      sex: null,
      updatedAt: 0,
    } as unknown as Profile
    const activity = {
      id: 'a1',
      fileName: 'run.fit',
      hasFile: false,
      createdAt: 0,
      digest: { sport: 'run', startMs: 0, name: 'Run' },
    } as unknown as ActivityRecord
    const exported = buildAccountExport({
      now: new Date(0),
      account: { name: 'Athlete', email: 'athlete@example.com' },
      profile,
      activities: [activity],
      unreadable: 0,
    })
    expect(Object.keys(exported)).toEqual([
      'format',
      'version',
      'exportedAt',
      'account',
      'profile',
      'activities',
      'unreadable',
      'notes',
    ])
    expect(Object.keys(exported.profile)).toEqual([
      'massKg',
      'bikeMassKg',
      'units',
      'keepFiles',
      'birthYear',
      'sex',
      'updatedAt',
    ])
    expect(Object.keys(exported.activities[0] ?? {})).toEqual([
      'id',
      'sport',
      'startMs',
      'name',
      'fileName',
      'hasFile',
      'createdAt',
      'digest',
    ])
  })
})

describe('privacy page loads nothing from elsewhere', () => {
  it('has no script, and links only to the public repository', () => {
    expect(page).not.toMatch(/<script/i)
    const hosts = [...page.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(
      (match) => new URL(match[1] ?? '').host,
    )
    expect(new Set(hosts)).toEqual(new Set(['github.com']))
  })
})
