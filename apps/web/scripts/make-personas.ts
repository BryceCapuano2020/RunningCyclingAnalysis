// Writes a synthetic persona's library as files, for e2e, accessibility, reflow and single-sport checks.
// Nothing here is read from any real athlete. Output is deterministic in the seed.
// Usage: npx tsx scripts/make-personas.ts [persona ...] [--weeks 40] [--seed 1] [--out DIR] [--loose]
// Default personas: all. Default out: a folder in the system temp directory; never commit the output.
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PERSONA_NAMES, persona } from '@rca/core/synthetic'
import type { PersonaName } from '@rca/core/synthetic'
import { makeLibraryFiles, makeStravaZip } from './personaFiles'

function option(args: string[], flag: string, fallback: string): string {
  const at = args.indexOf(flag)
  return at >= 0 && args[at + 1] !== undefined ? args[at + 1]! : fallback
}

const args = process.argv.slice(2)
const weeks = Number(option(args, '--weeks', '40'))
const seed = Number(option(args, '--seed', '1'))
const out = option(args, '--out', join(tmpdir(), 'rca-personas'))
const loose = args.includes('--loose')
const flagValues = new Set(
  ['--weeks', '--seed', '--out'].flatMap((f) =>
    args.includes(f) ? [args[args.indexOf(f) + 1]] : [],
  ),
)
const asked = args.filter((a) => !a.startsWith('--') && !flagValues.has(a))
const unknown = asked.filter((a) => !(PERSONA_NAMES as readonly string[]).includes(a))
if (unknown.length > 0) {
  console.error(`Unknown persona: ${unknown.join(', ')}. Known: ${PERSONA_NAMES.join(', ')}`)
  process.exit(1)
}
const names = asked.length > 0 ? (asked as PersonaName[]) : [...PERSONA_NAMES]

// Generated libraries are never committed: refuse a folder inside the repository.
const repo = fileURLToPath(new URL('../../../', import.meta.url))
const fromRepo = relative(repo, resolve(out))
if (fromRepo === '' || !(fromRepo.startsWith('..') || isAbsolute(fromRepo))) {
  console.error(`Refusing to write inside the repository (${out}). Pick a folder outside it.`)
  process.exit(1)
}

mkdirSync(out, { recursive: true })
for (const name of names) {
  const library = persona(name, seed, weeks)
  if (loose) {
    const dir = join(out, name)
    mkdirSync(dir, { recursive: true })
    for (const file of makeLibraryFiles(library)) writeFileSync(join(dir, file.name), file.bytes)
    console.log(`${name}: ${library.entries.length} files in ${dir}`)
  } else {
    const path = join(out, `${name}.zip`)
    const bytes = makeStravaZip(library)
    writeFileSync(path, bytes)
    console.log(`${name}: ${library.entries.length} activities, ${bytes.length} bytes, ${path}`)
  }
}
