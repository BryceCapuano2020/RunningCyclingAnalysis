import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import type { ActivityDigest } from '../../types'
import { parseDigest, serializeDigest } from '../serialize'

/**
 * The revision-6 digests of the study libraries, checked in under `fixtures/rev6` as one file per library with a
 * serialized digest on each line (D12 section 1.9). They were made by the digester of revision 6 and are not
 * remade: the study reads them beside the current digester's output, so it stays a regression test after the
 * code that wrote them is gone. They are synthetic (no athlete's data).
 */
const DIRECTORY = new URL('./fixtures/rev6/', import.meta.url)

/** The most the fixtures may weigh together, bytes. */
export const REV6_FIXTURES_MAX_BYTES = 4_000_000

export function rev6FixtureNames(): string[] {
  return readdirSync(DIRECTORY)
    .filter((file) => file.endsWith('.jsonl'))
    .map((file) => file.replace(/\.jsonl$/, ''))
    .sort()
}

export function rev6FixtureText(name: string): string {
  return readFileSync(new URL(`${name}.jsonl`, DIRECTORY), 'utf8')
}

/** The revision-6 digests of a library, oldest first. */
export function readRev6Fixture(name: string): ActivityDigest[] {
  return rev6FixtureText(name)
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => parseDigest(line))
}

/** Writes a library's fixture. Used by the one test that remakes them, while revision 6 can still be made. */
export function writeRev6Fixture(name: string, digests: readonly ActivityDigest[]): void {
  mkdirSync(DIRECTORY, { recursive: true })
  const sorted = [...digests].sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : 1))
  writeFileSync(
    new URL(`${name}.jsonl`, DIRECTORY),
    sorted.map((digest) => serializeDigest(digest)).join('\n') + '\n',
  )
}
