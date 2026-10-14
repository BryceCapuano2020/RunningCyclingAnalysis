// Writes the committed test fixtures in e2e/fixtures. Output is deterministic: run it again and
// every file is byte-for-byte identical. Usage: npx tsx scripts/make-fixtures.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync, strToU8, zipSync } from 'fflate'
import type { Zippable } from 'fflate'
import { encodeFit } from '../src/core/fit'
import { mulberry32 } from '../src/core/math'
import { DEFAULT_ATHLETE, generateActivity, sampleDataset } from '../src/core/synthetic'
import type { Activity } from '../src/core/types'

const OUT_DIR = fileURLToPath(new URL('../e2e/fixtures/', import.meta.url))
/** Fixed zip entry time. Zip cannot store a date before 1980, so this is a fixed 2025 date. */
const ZIP_MTIME = new Date('2025-06-15T12:00:00Z')
const ONE_RUN_START_MS = Date.UTC(2025, 5, 14, 7, 0, 0)
const ONE_RUN_SEED = 42
const NOT_A_FIT_SEED = 7
const NOT_A_FIT_LENGTH = 512

/** Deterministic gzip: mtime 0 keeps the current time out of the header. */
function gzip(data: Uint8Array): Uint8Array {
  return gzipSync(data, { mtime: 0, level: 9 })
}

function activityDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

/** A Strava-style activities.csv, one row per activity, pointing at its file in the archive. */
function activitiesCsv(activities: Activity[], fileNames: string[]): Uint8Array {
  const header = 'Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Filename\n'
  const rows = activities.map((activity, index) => {
    const type = activity.sport === 'run' ? 'Run' : 'Ride'
    const fileName = fileNames[index] ?? ''
    return [index + 1, activityDate(activity.startMs), activity.name, type, activity.n, fileName]
      .map((cell) => (String(cell).includes(',') ? `"${cell}"` : String(cell)))
      .join(',')
  })
  return strToU8(header + rows.join('\n') + '\n')
}

function stravaExport(): Uint8Array {
  const activities = sampleDataset().activities
  const files: Zippable = {}
  const fileNames: string[] = []
  activities.forEach((activity, index) => {
    const fileName = `activities/${index + 1}.fit.gz`
    fileNames.push(fileName)
    files[fileName] = [gzip(encodeFit(activity, { gps: true })), { mtime: ZIP_MTIME, level: 0 }]
  })
  files['activities/999.gpx.gz'] = [
    gzip(strToU8('<?xml version="1.0"?>\n<gpx version="1.1" creator="fixture"/>\n')),
    { mtime: ZIP_MTIME, level: 0 },
  ]
  files['activities.csv'] = [activitiesCsv(activities, fileNames), { mtime: ZIP_MTIME, level: 9 }]
  return zipSync(files)
}

function oneRun(): Uint8Array {
  const activity = generateActivity(
    DEFAULT_ATHLETE,
    {
      id: 'one-run',
      name: 'Easy Run',
      sport: 'run',
      startMs: ONE_RUN_START_MS,
      durationS: 20 * 60,
      effort: 'easy',
      terrain: 'flat',
    },
    ONE_RUN_SEED,
  )
  return encodeFit(activity, { gps: true })
}

/** Printable text with a seeded generator, so it looks like noise but never changes. */
function notAFit(): Uint8Array {
  const rand = mulberry32(NOT_A_FIT_SEED)
  const alphabet = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;:-'
  let text = ''
  for (let i = 0; i < NOT_A_FIT_LENGTH; i++) {
    text += alphabet[Math.floor(rand() * alphabet.length)]
  }
  return strToU8(text + '\n')
}

mkdirSync(OUT_DIR, { recursive: true })
const outputs: [string, Uint8Array][] = [
  ['sample-export.zip', stravaExport()],
  ['one-run.fit', oneRun()],
  ['not-a-fit.fit', notAFit()],
]
for (const [name, bytes] of outputs) {
  writeFileSync(join(OUT_DIR, name), bytes)
  console.log(`${name}: ${bytes.length} bytes`)
}
