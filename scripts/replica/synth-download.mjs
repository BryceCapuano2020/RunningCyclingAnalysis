#!/usr/bin/env node
/**
 * Writes a synthetic RCA account download, so anyone can try scripts/replica/replica.mjs without real data.
 * It digests the activity files in the e2e sample export (apps/web/e2e/fixtures/sample-export.zip, a
 * synthetic set kept in the repository) and wraps the digests in the same JSON that Profile > "Download
 * my data" writes. Run it through tsx, which reads the core library's TypeScript:
 *
 *   node --import tsx scripts/replica/synth-download.mjs [out.json]
 *
 *   out.json   where to write the download. Default: .replica-out/synthetic.rca-export.json (git ignores it).
 *
 * Exit codes: 0 written; 1 the sample could not be read.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { digestActivity } from '@rca/core/digest'
import { parseActivityFile } from '@rca/core/import'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SAMPLE = resolve(ROOT, 'apps/web/e2e/fixtures/sample-export.zip')
const { unzipSync } = createRequire(resolve(ROOT, 'packages/core/package.json'))('fflate')

const out = resolve(process.argv[2] ?? resolve(ROOT, '.replica-out/synthetic.rca-export.json'))

const files = unzipSync(readFileSync(SAMPLE))
const activities = []
for (const path of Object.keys(files).sort()) {
  if (!path.startsWith('activities/') || path.endsWith('.csv')) continue
  const name = path.slice('activities/'.length)
  const bytes = name.endsWith('.gz') ? gunzipSync(files[path]) : files[path]
  const parsed = parseActivityFile(bytes, name)
  const activity = parsed.ok ? parsed.activities[0] : undefined
  if (activity === undefined) continue
  const digest = digestActivity(activity)
  activities.push({
    id: name,
    sport: digest.sport,
    startMs: digest.startMs,
    name: digest.name,
    fileName: name,
    hasFile: false,
    createdAt: 0,
    digest,
  })
}
if (activities.length === 0) {
  console.error(`no activities could be read from ${SAMPLE}`)
  process.exit(1)
}

const download = {
  format: 'rca-export',
  version: 2,
  exportedAt: new Date().toISOString(),
  account: { name: 'Synthetic', email: 'synthetic@example.test' },
  profile: {
    massKg: 75,
    bikeMassKg: 9,
    units: 'metric',
    keepFiles: false,
    birthYear: 1990,
    sex: 'male',
    updatedAt: 0,
  },
  measurements: [{ kind: 'massKg', value: 75, from: '2025-01-01' }],
  activities,
  unreadable: 0,
  notes: [],
}
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(download))
console.log(`${activities.length} activities written to ${out}`)
