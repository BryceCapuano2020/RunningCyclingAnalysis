import { StoredActivityDigestSchema } from '@rca/contract'
import type { ActivityRecord, Profile } from '@rca/contract'
import { digestActivity, serializeDigest } from '@rca/core/digest'
import type { ActivityDigest } from '@rca/core/types'
import { encodeFit } from '@rca/core/fit'
import { AnalysisSession } from '@rca/core/session'
import { sampleDataset } from '@rca/core/synthetic'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildAccountExport } from './export/accountExport'
import { APP_WORDS } from './appName'
import { BRAND_RIDING, BRAND_RUNNING, pathData } from './ui/components/iconPaths'
import { readStylesheet, ruleBody } from './ui/components/stylesheet'

/*
 * These tests check the privacy page's stated facts against the source files they name: the
 * strings, numbers, field names and labels. They do not run the app and they do not check layout.
 * A change to one of those source strings fails here until the page is updated to match.
 */
const page = await readStylesheet(import.meta.url, '../privacy.html')
const privacyCss = await readStylesheet(import.meta.url, './styles/privacy.css')
const mainSource = await readStylesheet(import.meta.url, './main.tsx')
const tokensCss = await readStylesheet(import.meta.url, './styles/tokens.css')
const icons = await readStylesheet(import.meta.url, './ui/components/icons.tsx')
const app = await readStylesheet(import.meta.url, './App.tsx')
const appSignOut = await readStylesheet(import.meta.url, './ui/useAppSignOut.ts')
const device = await readStylesheet(import.meta.url, './worker/device.ts')
const deviceLibrary = await readStylesheet(import.meta.url, './worker/deviceLibrary.ts')
const digestTypes = await readStylesheet(import.meta.url, '../../../packages/core/src/types.ts')
const routeShapeSource = await readStylesheet(
  import.meta.url,
  '../../../packages/core/src/route/routeShape.ts',
)
const sessionSource = await readStylesheet(import.meta.url, '../../api/src/auth/session.ts')
const authRoutes = await readStylesheet(import.meta.url, '../../api/src/routes/auth.ts')
const apiLimits = await readStylesheet(import.meta.url, '../../api/LIMITS.md')
const backupWorkflow = await readStylesheet(
  import.meta.url,
  '../../../.github/workflows/backup.yml',
)
const importActionsSource = await readStylesheet(import.meta.url, './ui/analysis/importActions.ts')
const deviceSetup = await readStylesheet(import.meta.url, './ui/useSetup.ts')
const seenNotes = await readStylesheet(import.meta.url, './ui/aboutDataStore.ts')
const workbenchStore = await readStylesheet(import.meta.url, './worker/workbenchStore.ts')
const retentionComponent = await readStylesheet(
  import.meta.url,
  './ui/components/FileRetention.tsx',
)
const accountDeletion = await readStylesheet(import.meta.url, '../../api/src/accountDeletion.ts')
const budget = await readStylesheet(import.meta.url, '../../api/src/budget.ts')
const identityBudget = await readStylesheet(import.meta.url, '../../api/src/identityBudget.ts')
const identitySignIn = await readStylesheet(import.meta.url, '../../api/src/auth/signIn.ts')
const signupGate = await readStylesheet(import.meta.url, '../../api/src/auth/signupGate.ts')
const contractLimits = await readStylesheet(
  import.meta.url,
  '../../../packages/contract/src/limits.ts',
)
const storage = await readStylesheet(import.meta.url, '../../api/src/storage.ts')
const activitiesCsvSource = await readStylesheet(
  import.meta.url,
  '../../../packages/core/src/import/activitiesCsv.ts',
)
const periodPreference = await readStylesheet(import.meta.url, './ui/periodPreference.ts')
const cardName = await readStylesheet(import.meta.url, './share/cardName.ts')
const uploadTitlesPreference = await readStylesheet(
  import.meta.url,
  './ui/uploadTitlesPreference.ts',
)
const minimiseSource = await readStylesheet(
  import.meta.url,
  '../../../packages/core/src/import/minimise.ts',
)
const apiSchema = await readStylesheet(import.meta.url, '../../api/src/db/schema.ts')
const rateLimit = await readStylesheet(import.meta.url, '../../api/src/rateLimit.ts')
const apiList = await readStylesheet(import.meta.url, '../../api/src/routes/activities/list.ts')
const productionNotes = await readStylesheet(import.meta.url, '../../../docs/PRODUCTION.md')
const wrangler = await readStylesheet(import.meta.url, '../../api/wrangler.toml')
const importPipeline = await readStylesheet(
  import.meta.url,
  '../../../packages/core/src/import/pipeline.ts',
)
const privacyNoteSource = await readStylesheet(import.meta.url, './ui/components/PrivacyNote.tsx')
const removeRoute = await readStylesheet(
  import.meta.url,
  '../../api/src/routes/activities/remove.ts',
)
const measurementStore = await readStylesheet(import.meta.url, './ui/measurementStore.ts')
const keptPowerStore = await readStylesheet(import.meta.url, './ui/keptPowerStore.ts')
const measurementRoutes = await readStylesheet(
  import.meta.url,
  '../../api/src/routes/measurements.ts',
)
const maintenance = await readStylesheet(import.meta.url, '../../api/src/maintenance.ts')
const readme = await readStylesheet(import.meta.url, '../../../README.md')
const deployGuide = await readStylesheet(import.meta.url, '../../../docs/DEPLOY.md')
const accountsSource = await readStylesheet(import.meta.url, '../../api/src/auth/accounts.ts')

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

/** The analysis figures a summary holds, named the same way in both lists. */
const ANALYSIS_FIGURES = [
  'splits per km and mile',
  'flat-pace times',
  'moving time',
  'average power',
  'power-meter calibration sums',
  'the indoor flag',
]

describe('privacy page date', () => {
  it('is dated 30 October 2026', () => {
    expect(page).toContain('<p class="updated">Last updated 31 October 2026</p>')
  })
})

describe('privacy page brand', () => {
  it('shows the app name in the header, as the app does', () => {
    expect(page).toContain(`<span class="header__name">${APP_WORDS}</span>`)
  })

  it('draws the brand mark with the same paths as the app', () => {
    expect(page).toContain(`d="${pathData(BRAND_RUNNING)}"`)
    expect(page).toContain(`d="${pathData(BRAND_RIDING)}"`)
  })

  it('draws the brand mark with the same classes as the app, so its colours come from the same tokens', () => {
    for (const name of ['brand-mark__tile', 'brand-mark__run', 'brand-mark__ride']) {
      expect(icons).toContain(name)
      expect(page).toContain(`class="${name}"`)
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

  it('sets the lead size from the same --text-lead value as tokens.css, with no literal copy', () => {
    const lead = /--text-lead: ([^;]+);/.exec(tokensCss)?.[1]
    expect(lead).toBeDefined()
    expect(privacyCss).toContain(`--text-lead: ${lead};`)
    expect(privacyCss).not.toMatch(/font-size: 1\.(125|0625)rem/)
  })
})

describe('privacy page loads the app fonts, from the same packages', () => {
  it('imports the faces main.tsx imports, so Barlow is bundled and not left to the system', () => {
    const appFaces = [...mainSource.matchAll(/^import '(@fontsource\/[^']+)'/gm)].map(
      ([, face]) => face,
    )
    const pageFaces = [...privacyCss.matchAll(/^@import '(@fontsource\/[^']+)';/gm)].map(
      ([, face]) => face,
    )
    expect(appFaces).toHaveLength(5)
    expect(pageFaces).toEqual(appFaces)
  })

  it('links its stylesheet from the page, so the build bundles the faces it imports', () => {
    expect(page).toContain('<link rel="stylesheet" href="./src/styles/privacy.css" />')
  })
})

describe('privacy page names controls as the app does', () => {
  const controls: Array<[label: string, source: string]> = [
    ['Keep original files in my library', 'ui/components/FileRetention.tsx'],
    ['Download my data', 'ui/components/AccountSection.tsx'],
    ['Delete account', 'ui/components/AccountSection.tsx'],
    ['Saved library', 'ui/components/SavedLibraryCard.tsx'],
    ['Kept in this browser', 'ui/components/SavedLibraryCard.tsx'],
    ['Remove all my activities', 'ui/pages/profileCopy.ts'],
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

  it('names the flag that remembers kept results in this browser, and says it holds no activity data', () => {
    expect(text).toContain('named rca.kept.v1')
    expect(text).toContain('It holds no activity data.')
  })

  it('names the record of imports this browser keeps, and says what clears it', async () => {
    const manifest = await readStylesheet(import.meta.url, './ui/importManifestStore.ts')
    const manifestSource = await readStylesheet(import.meta.url, './ui/importManifest.ts')
    expect(text).toContain('database rca-import-meta')
    expect(manifest).toContain("DB_NAME = 'rca-import-meta'")
    expect(text).toContain('The last five per library are kept.')
    expect(manifest).toContain('KEPT_PER_SCOPE = 5')
    expect(text).toContain('Signing out and deleting your account clear the account')
    expect(text).toContain('rca.importTab.v1')
    expect(manifestSource).toContain("TAB_KEY = 'rca.importTab.v1'")
  })

  it('names the flags and choices this browser keeps beyond the summaries, as the app stores them', async () => {
    const keptLibrary = await readStylesheet(import.meta.url, './ui/analysis/keptLibrary.ts')
    const countedRuns = await readStylesheet(import.meta.url, './ui/countedRunsStore.ts')
    expect(text).toContain('rca.deviceKept.v1')
    expect(keptLibrary).toContain("DEVICE_KEY = 'rca.deviceKept.v1'")
    expect(text).toContain('rca.persistNote.v1')
    expect(keptLibrary).toContain("PERSIST_NOTE_KEY = 'rca.persistNote.v1'")
    expect(text).toContain('Signing out and deleting your account clear it')
    expect(text).toContain('Remove all my activities, which is offered only when signed out')
    expect(text).toContain('rca.countedRuns.v1')
    expect(countedRuns).toContain("COUNTED_RUNS_KEY = 'rca.countedRuns.v1'")
    expect(text).toContain('It is never uploaded, signed in or not')
    expect(text).toContain("asks the browser to keep this site's storage")
  })

  it('names the database of files already read, as the worker opens it, and what it keeps and does not', async () => {
    const store = await readStylesheet(import.meta.url, './worker/checkinStore.ts')
    const held = await readStylesheet(import.meta.url, './worker/heldIndex.ts')
    const name = /CHECKIN_DB = '([^']+)'/.exec(store)?.[1]
    expect(name).toBeDefined()
    expect(text).toContain(`named ${name}`)
    // What an entry holds is the fields of HeldEntry, and nothing else.
    expect(
      /interface HeldEntry \{([^}]*)\}/
        .exec(held)?.[1]
        ?.match(/^\s+(\w+):/gm)
        ?.map((f) => f.trim()),
    ).toEqual(['size:', 'keys:', 'revision:', 'meta:'])
    // What the export's list said is kept as a signature, never as the words (the worker test reads the stored rows).
    const held2 = await readStylesheet(import.meta.url, '../../../packages/core/src/importHeld.ts')
    expect(held2).toMatch(/return signatureOf\(\s*`csv:/)
    expect(held2).toMatch(/return signatureOf\(\s*`garmin:/)
    expect(text).toMatch(/SHA-256 hash of the file, its size, the sport and start second/)
    expect(text).toMatch(/no names, routes or heart rates/)
    expect(text).toMatch(/never uploaded/)
    expect(text).toMatch(/signing in as someone else clears the other account's rows/)
    expect(text).toMatch(/Nothing is written for a session that keeps nothing/)
  })

  it('says what the summary taken before an import holds, and that it holds no names, routes or heart rates', async () => {
    const snapshot = await readStylesheet(
      import.meta.url,
      '../../../packages/core/src/lookback/snapshot.ts',
    )
    // The summary is the fields of CheckInSnapshot, none of which can carry a name, a route or a heart rate.
    expect(
      /interface CheckInSnapshot \{([\s\S]*?)\n\}/
        .exec(snapshot)?.[1]
        ?.match(/^\s{2}(\w+):/gm)
        ?.map((f) => f.trim()),
    ).toEqual([
      'v:',
      'revision:',
      'atMs:',
      'asOfMs:',
      'keys:',
      'counts:',
      'bests:',
      'fitness:',
      'episodes:',
    ])
    expect(text).toMatch(/summary of the library as it stood\s+before your last import/)
    expect(text).toMatch(/values and dates of your best efforts/)
    expect(text).toMatch(/whether you have seen what was said/)
  })

  it('says signed-in visitors do not see the summaries kept in this browser', () => {
    expect(text).toMatch(/signed in[^.]*not shown|not shown[^.]*signed in/i)
  })

  it('says signing out keeps the summaries, and removing them clears them when signed out', () => {
    expect(text).toMatch(/Signing out does not remove/)
    expect(text).toMatch(/Remove all my activities[^.]*signed out/i)
  })

  it('says deleting the account keeps this browser copy until it is cleared', () => {
    expect(text).toMatch(/does not clear this browser's copy of your settings/)
    expect(text).toMatch(/until you clear this site's data/)
  })

  it('says the route outline has no coordinates or scale, stays in this browser, is never uploaded, and is drawn from the original only on request', () => {
    expect(text).toMatch(/outline of the route[^.]*no coordinates or scale/)
    expect(text).not.toContain('position and scale removed')
    expect(text).toMatch(/kept only in this browser and is never uploaded/)
    expect(text).toMatch(/drawn from your original only when you ask for it/)
  })

  it('lists the figures once, for a summary kept in this browser, and the library refers to them', () => {
    const kept = sentenceWith('It holds the figures shown')
    const saved = sentenceWith('the analysis summary')
    for (const figure of [
      ...ANALYSIS_FIGURES,
      'elevation gain',
      'the power source (measured, estimated or none)',
    ]) {
      expect(kept).toContain(figure)
    }
    expect(saved).toContain('the same figures as the summary kept in this browser')
    expect(saved).not.toContain('flat-pace times')
  })

  it('says what the waiting list of saves holds and when it is removed', () => {
    expect(text).toContain('Saves waiting on this device')
    expect(text).toContain('It holds no route, per-second recording or original file.')
    expect(text).toContain(
      'Signing out asks first when saves are still waiting, then removes the list',
    )
    expect(text).toContain('When a session ends on its own, the list stays')
    expect(text).toContain('their sign-in removes the list of any other account.')
    expect(text).toContain('are offered to the account you sign in to')
    expect(text).toContain('but without its route')
    expect(text).toContain('Remove from this browser deletes them without changing the account.')
    expect(text).toContain(
      'Remove all my activities removes every waiting save from this browser too.',
    )
  })

  it('distinguishes compact summaries from local detailed recordings', () => {
    expect(text).toContain('The summary has no per-second data or original file')
    expect(text).toContain('It contains no GPS coordinates or original files and is not uploaded.')
    expect(text).toContain('Recording data is limited to 64 MiB across this browser’s cache;')
    expect(text).toContain(
      'the recordings of the oldest activities are removed first to make room.',
    )
    expect(text).toContain(
      'Account recordings are kept separately from signed-out recordings and other accounts.',
    )
    expect(text).toContain('They are removed from this browser when you sign out.')
    expect(text).toContain('and the app reads them only for their account.')
    expect(text).not.toContain('survive sign-out')
    expect(text).toContain('reports a local cleanup failure separately')
  })

  it('says a summary keeps a SHA-256 hash of its file when the file yields several summaries, and from now on for every summary kept here', () => {
    expect(text).toContain(
      'When one file yields several summaries, including a split activity, each keeps a SHA-256 hash of that file, so they are shown together.',
    )
    expect(text).toContain(
      'Summaries kept from now on also keep the file name and a SHA-256 hash of the file, for adding them to an account later.',
    )
    expect(importPipeline).toContain('(multi || parts > 1) && context.sessionKey !== undefined')
  })

  it('says anyone using a browser can see the summaries kept in it, as the note says', () => {
    expect(text).toContain('anyone using this browser can see them')
    expect(privacyNoteSource).toContain('anyone using it can see them')
  })

  it('lists the account bookkeeping the server keeps beside the summaries', () => {
    expect(text).toContain('Bookkeeping:')
    expect(text).toContain('an upload reservation token while a file uploads')
    expect(apiSchema).toMatch(/activityCount: integer\('activity_count'\)/)
    expect(apiSchema).toMatch(/digestBytes: integer\('digest_bytes'\)/)
    expect(apiSchema).toMatch(/deletingAt: integer\('deleting_at'\)/)
    expect(apiSchema).toMatch(/fileReservationToken: text\('file_reservation_token'\)/)
    expect(apiSchema).toMatch(/dedupeKey: text\('dedupe_key'\)/)
    expect(apiSchema).toMatch(/digestVersion: integer\('digest_version'\)/)
    expect(apiSchema).toMatch(/updatedAt: integer\('updated_at'\)\.notNull\(\)/)
  })

  it('says deleting an activity removes its original at once, or in the next daily cleanup if that fails', () => {
    expect(removeRoute).toContain('c.env.FILES.delete([...keys])')
    expect(maintenance).toMatch(/sweepOrphanObjects\(bound, deps\)/)
    expect(text).toContain(
      'This removes its summary and any original file at once, or in the next daily cleanup if deleting the file fails.',
    )
  })

  it('keeps each figure it lists in the digest the server stores', () => {
    const digests = sampleDataset().activities.map((activity) => digestActivity(activity))
    const run = digests.find((digest) => digest.splits !== undefined)
    const ride = digests.find((digest) => digest.calibration !== null)
    if (run === undefined || ride === undefined) throw new Error('The sample has no such digest')
    const stored = (digest: ActivityDigest, extra: object = {}) =>
      StoredActivityDigestSchema.parse({ ...JSON.parse(serializeDigest(digest)), ...extra })
    const marked = stored(run, { movingS: 600, avgPowerW: 210, walkingPace: true, race: true })
    expect(marked.splits?.km.length).toBeGreaterThan(0)
    expect(marked.splits?.km[0]?.gradeAdjustedSeconds).toBeTypeOf('number')
    expect(marked.indoor).toBe(run.indoor)
    expect(marked.movingS).toBe(600)
    expect(marked.avgPowerW).toBe(210)
    expect(marked.walkingPace).toBe(true)
    expect(marked.race).toBe(true)
    expect(stored(ride).calibration).toEqual(ride.calibration)
    expect(sentenceWith('It holds the figures shown')).toMatch(/walking pace.*race mark/s)
  })

  it('names the view period key the app reads, among the settings kept in this browser', () => {
    expect(periodPreference).toContain("PERIOD_KEY = 'rca.period.v1'")
    expect(sentenceWith('Settings are kept')).toContain('rca.period.v1')
  })

  it('says titles are saved only by choice, file names are hashed, and the choice stays in this browser under its key', () => {
    expect(uploadTitlesPreference).toContain("UPLOAD_TITLES_KEY = 'rca.uploadTitles.v1'")
    expect(minimiseSource).toContain('`rca-${sha256TextHex(fileName).slice(0, 16)}${extension}`')
    expect(sentenceWith('an activity saved from now on keeps its title')).toContain(
      'Send my activity titles to my library',
    )
    expect(text).toContain('rca- and sixteen characters')
    expect(text).toContain(
      'Activities saved before keep the title and file name they were saved with',
    )
    expect(text).not.toContain('model revision 7')
    expect(text).toContain('it is not secrecy')
    expect(text).toContain('rca.uploadTitles.v1')
  })

  it('says the name printed on a shared card stays in this browser, under the key the app reads', () => {
    expect(cardName).toContain("CARD_NAME_KEY = 'rca.card-name.v1'")
    expect(text).toContain('The name printed on a shared card stays in this browser')
    expect(sentenceWith('stays in this browser')).toContain('rca.card-name.v1')
    expect(sentenceWith('stays in this browser')).toContain('never uploaded')
  })

  it('says the database holds each kept original size, and short-lived rows for uploads and deletions', () => {
    expect(apiSchema).toMatch(/fileSize: integer\('file_size'\)/)
    expect(apiSchema).toMatch(/sqliteTable\(\s*'upload_slots'/)
    expect(apiSchema).toMatch(/sqliteTable\(\s*'pending_account_deletions'/)
    expect(text).toContain('the size of each kept original')
    expect(text).toContain('short-lived rows for uploads in progress and for account deletions')
  })

  it('says what each request carries, and that the address is only a rate-limit key', () => {
    expect(rateLimit).toContain("c.req.header('CF-Connecting-IP')")
    expect(rateLimit).toContain('`ip:${address}`')
    expect(text).toContain(
      "Cloudflare's request logs may include each request's network address, approximate location, browser user agent and the address of the request (URL)",
    )
    expect(text).toContain('can carry the one-time Google sign-in code and state')
    expect(text).toContain('The network address is used only as a rate-limit key.')
  })

  it('names the pending-deletion row and the tombstone in the production notes', () => {
    const notes = productionNotes.replace(/\s+/g, ' ')
    expect(notes).toContain('A complete deletion log.')
    expect(notes).toContain('account_tombstones')
    expect(notes).toContain('keeps it 100 days')
  })

  it('says a deleted account leaves only a random ID and a time for 100 days, as the code writes it', () => {
    expect(apiSchema).toMatch(/sqliteTable\(\s*'account_tombstones'/)
    expect(apiSchema).toMatch(
      /userId: text\('user_id'\)\.primaryKey\(\)\.notNull\(\),\s*deletedAt: integer\('deleted_at'\)\.notNull\(\),\s*\},/,
    )
    expect(accountDeletion).toContain('TOMBSTONE_RETENTION_DAYS = 100')
    expect(accountDeletion).toContain(
      'INSERT OR IGNORE INTO account_tombstones (user_id, deleted_at)',
    )
    expect(text).toContain('a random account ID and the time are kept for 100 days')
    expect(text).toContain('It holds no name, email, Google ID or activity.')
  })

  it('discloses the Time Travel history: 7 days on Free, 30 on Paid', () => {
    expect(text).toContain('point-in-time history of the database, between 7 and 30 days')
    expect(text).toContain('Data you delete can stay in that history until it expires.')
  })

  it('says what is counted each day, and that the counts are kept seven days', () => {
    expect(text).toMatch(
      /downloads, saves, deletions, uploads, profile changes, dated-setting changes and library reads/,
    )
    expect(text).toMatch(/kept about a week, up to eight UTC days/)
  })

  it('says where dated settings are kept, and how many an account keeps', () => {
    expect(text).toContain('rca.measurements.v1')
    expect(measurementStore).toContain("const KEY = 'rca.measurements.v1'")
    expect(text).toMatch(/At most 200\./)
    expect(measurementRoutes).toContain('MAX_MEASUREMENTS_PER_USER')
    expect(apiSchema).toContain("'athlete_measurements'")
  })

  it('says where the rides whose implausible power was kept are remembered', () => {
    expect(text).toContain('rca.keepPower.v1')
    expect(keptPowerStore).toContain("const KEY = 'rca.keepPower.v1'")
  })

  it('says when an account was created and when an activity was saved', () => {
    expect(text).toContain('when the account was created')
    expect(text).toContain('save time')
  })

  it('says what the error log holds for an unreadable activity', () => {
    expect(text).toContain('and, for a saved activity that cannot be read, its ID')
  })

  it('says the sign-in cookie has an expiry date and outlives the browser', () => {
    expect(sessionSource).toMatch(/expires: new Date\(expiresAt\)/)
    expect(text).toContain('has an expiry date and stays after you close the browser')
  })

  it('says what stays on the device after sign-out, deletion and Remove all', () => {
    expect(deviceSetup).toContain("DEVICE_SETUP_KEY = 'rca.setup.v1'")
    expect(seenNotes).toContain("STORAGE_KEY = 'rca.aboutDataSeen'")
    expect(text).toContain('rca.setup.v1')
    expect(text).toContain(
      'signing out, deleting your account and Remove all my activities leave it, and the next person using this browser can see it',
    )
    expect(text).toContain(
      'Signing out and Remove all my activities remove it; deleting your account leaves it.',
    )
    expect(workbenchStore).toContain('owners.put({ scopeKey: key, deletedAt: Date.now() }')
    expect(text).toContain('one small record for each account that signed out or was deleted')
    expect(text).toContain(
      'The record for a deleted account stays until you clear this site’s data.',
    )
    expect(text).toContain(
      'The record for a sign-out ends the next time that account signs in here.',
    )
    expect(workbenchStore).toContain('row.deletedAt === undefined) owners.delete(scopeKey(scope))')
  })

  // Which of the settings-copy and seen-notes keys each action clears, read from the real code.
  const clearsSeenNotes = (source: string, handler: string) =>
    new RegExp(`${handler}[\\s\\S]{0,400}?forgetSeenNotes\\(\\)`).test(source)
  it.each([
    [
      'sign-out',
      appSignOut,
      'useSignOutWarning\\(account\\.me\\?\\.user\\.id, \\(\\) => \\{',
      true,
    ],
    [
      'Remove all my activities',
      importActionsSource,
      'const clear = useCallback\\(\\(\\) => \\{',
      true,
    ],
    ['account deletion', app, 'const deleteAccount = async \\(\\) => \\{', false],
  ])(
    '%s: rca.aboutDataSeen cleared is %s, and the settings copy is not',
    (_a, source, handler, cleared) => {
      expect(clearsSeenNotes(source, handler)).toBe(cleared)
      // Nothing removes the settings copy or the setup answer from local storage, whichever the action.
      expect(source).not.toMatch(/removeItem\(['"]rca\.(preferences|setup)/)
    },
  )

  it('says an original holds the full GPS track and every second of heart rate, as the checkbox does', () => {
    expect(text).toContain(
      'An original holds your full GPS track, including where you start and finish',
    )
    expect(text).toContain('every recorded second of heart rate and power')
    expect(retentionComponent).toContain('They hold your full GPS track, including')
    expect(retentionComponent).toContain('every second of heart rate and power')
  })

  it('says a backup keeps account and activity IDs in its object keys', () => {
    expect(text).toContain('keys that include your account and activity IDs')
  })

  it('says what a backup holds, where it is stored, and that age is its only protection', () => {
    expect(text).toMatch(/If backups are run, each is an encrypted archive of the database/)
    expect(text).toContain(
      'account identifiers, email addresses, session hashes and activity summaries',
    )
    expect(text).toContain('a list of original-file keys and sizes, but not the files')
    expect(text).toContain(
      'a downloadable artifact of the public GitHub repository, so anyone who can read the repository can download it',
    )
    expect(text).toContain(
      'Age encryption is its only protection, and the private key is kept outside GitHub',
    )
    expect(text).not.toContain('turned on')
    expect(backupWorkflow).toContain('workflow_dispatch:')
    expect(backupWorkflow).toContain('age -R ops/backup-recipient.txt')
    expect(backupWorkflow).toContain('actions/upload-artifact')
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
    expect(text).toContain("Request and error logs are kept three days on Cloudflare's Free plan")
    expect(wrangler).toMatch(/3 days on the Free plan/)
  })

  it('backups are kept 90 days, as the backup workflow says', () => {
    expect(backupWorkflow).toMatch(/retention-days: 90/)
    expect(text).toContain('Each archive is kept up to 90 days, then deleted')
  })
})

describe('the code behind the page', () => {
  it('stores the digest, its route outline and its file’s name and hash on this device, with no coordinates', () => {
    expect(device).toContain('async save({ digest, route, fileName, fileHash })')
    expect(deviceLibrary).toContain(
      'store.put({ digest: serializeDigest(digest), route, ...(file ?? {}) }, workoutKey)',
    )
    expect(digestTypes).toContain('export interface ActivityDigest {')
    const digest = /export interface ActivityDigest \{[\s\S]*?\n\}/.exec(digestTypes)?.[0] ?? ''
    expect(digest).not.toBe('')
    expect(digest).not.toMatch(/\b(fileHash|lat|lon|latitude|longitude|coordinates)\??:/)
  })

  it('keeps no latitude or longitude in the route outline it stores beside the digest', () => {
    const outline = /export interface RouteShape \{[\s\S]*?\n\}/.exec(routeShapeSource)?.[0] ?? ''
    expect(outline).toMatch(/points: \[number, number\]\[\]/)
    expect(outline).toMatch(/aspect: number/)
    expect(outline).not.toMatch(/\b(lat|lon|latitude|longitude|coordinates)\??:/)
  })

  // Who sees the removal is a behaviour of the Profile page, pinned in ProfilePage.test.tsx.

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

  it('keeps no library page cursor: the cursor is a position, nothing is stored', () => {
    expect(text).not.toContain('library page cursor')
    expect(apiList).not.toContain('list_cursor')
  })

  it('keeps at most ten sessions per account', () => {
    expect(contractLimits).toMatch(/MAX_SESSIONS_PER_USER = 10/)
    expect(text).toContain('At most ten are kept')
  })

  it("keeps a deleted account's day counts under a keyed one-way code for two UTC days", () => {
    expect(accountDeletion).toContain('saveCountsStatement')
    expect(signupGate).toContain("name: 'HMAC'")
    expect(signupGate).toContain('identity:google:${sub}')
    // Rows from before yesterday are pruned, so a code lives at most two UTC days.
    expect(identityBudget).toMatch(/utcDay\(now - DAY_MS\)/)
    expect(contractLimits).toMatch(/MAX_ACCOUNT_CREATES_PER_DAY = 5/)
    expect(text).toContain(
      'When you create or delete an account, a one-way code made from your Google ID',
    )
    expect(text).toContain('These are kept about two days.')
    // Written at creation (the account-create count) as well as at deletion (the saved counts).
    expect(identitySignIn).toContain('takeAccountCreate')
    expect(accountDeletion).toContain('saveCountsStatement')
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
      'measurements',
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

describe('privacy page says where activity names come from', () => {
  it('says so in the summary kept without an account', () => {
    const sentence = sentenceWith('Its name comes from')
    expect(sentence).toMatch(/activity list in a Strava export/)
    expect(sentence).toMatch(/activity summaries in a Garmin export/)
    expect(sentence).toMatch(/title in the file/)
    expect(sentence).toMatch(/start time and sport/)
    expect(sentenceWith('A name from an export')).toContain(
      'kept as the export writes it, and can name a place',
    )
  })

  it('says the account list names an activity as the summary kept in this browser does', () => {
    const sentence = sentenceWith('Activity summaries')
    expect(sentence).toContain('name (as in the summary kept in this browser)')
    expect(sentence).not.toMatch(/activity list in a Strava export/)
    expect(text).toContain(
      'A name can name a place, and in a Strava export the file name is the number of the activity on Strava.',
    )
  })

  it('names the list and its column as the importer reads them', () => {
    expect(activitiesCsvSource).toContain("const LIST_NAME = 'activities.csv'")
    expect(activitiesCsvSource).toContain("columns.indexOf('activity name')")
  })

  it('keeps the name a Garmin export gives as it is written, as the page says, place names included', async () => {
    const run = sampleDataset().activities.find((activity) => activity.sport === 'run')!
    const summaries = JSON.stringify([
      {
        summarizedActivitiesExport: [
          { name: 'Green Lake Loop, Seattle', startTimeGmt: run.startMs, activityType: 'running' },
        ],
      },
    ])
    const zip = new File(
      [
        new Uint8Array(
          zipSync({
            'DI_CONNECT/DI-Connect-Fitness/a_0_summarizedActivities.json': strToU8(summaries),
            'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip': zipSync({
              'a_1.fit': encodeFit(run, { gps: true }),
            }),
          }),
        ),
      ],
      'export.zip',
    )
    const state = await new AnalysisSession().addFiles([zip], { massKg: 75, bikeMassKg: 9 })

    expect(state.library.map((activity) => activity.name)).toEqual(['Green Lake Loop, Seattle'])
  })
})

describe('the README and deploy guide say original files are not kept', () => {
  it('says so by default, which is the default for a new account', () => {
    expect(accountsSource).toContain('keepFiles: false')
    expect(readme.replace(/\s+/g, ' ')).toContain('original files are not kept by default')
    expect(readme).not.toContain('stay on your device')
    const guide = deployGuide.replace(/\s+/g, ' ')
    expect(guide).toContain('Original activity files are not kept by default.')
    expect(guide).toContain('original files are not kept and must be re-imported to reprocess')
    expect(guide).not.toContain('stay on the device')
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

describe('privacy page layout and copy', () => {
  const darkBlock =
    /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}/.exec(privacyCss)?.[1] ?? ''

  it('titles the page with a middle dot, as the app names its pages', () => {
    expect(page).toContain('<title>Privacy policy · RunningCyclingAnalysis</title>')
  })

  it('says the browser-kept summaries are stated once, in the signed-out list', () => {
    expect(text).not.toContain('Summaries kept without an account stay in your browser')
    expect(text.match(/where the browser allows/g)).toHaveLength(1)
  })

  it('says we do not sell data once, on the lede', () => {
    expect(text.match(/We do not sell your data/g)).toHaveLength(1)
  })

  it('says summaries are kept in this browser where the browser allows', () => {
    expect(text).toContain("kept in this browser's IndexedDB where the browser allows")
  })

  it('takes the control height from the phone rule, not the dark scheme, so a phone gets 44 px', () => {
    expect(darkBlock).not.toBe('')
    expect(darkBlock).not.toMatch(/--control-height/)
  })

  it('gives the footer links a 24 px target at least', () => {
    expect(ruleBody(privacyCss, '.footer a')).toMatch(/min-height:\s*24px;/)
  })

  it('hides the wordmark at 560 px and below, so the header is one row', () => {
    expect(privacyCss).toMatch(
      /@media \(max-width: 560px\) \{\s*\.header__name \{[^}]*clip-path:\s*inset\(50%\);/,
    )
  })

  it('measures prose at the app’s reading measure', () => {
    expect(ruleBody(privacyCss, 'p,\nli')).toMatch(/max-width:\s*var\(--measure\);/)
  })

  it('thickens the underline of a link on hover, as the app does', () => {
    expect(ruleBody(privacyCss, 'a:hover')).toMatch(/text-decoration-thickness:\s*2px;/)
  })
})
