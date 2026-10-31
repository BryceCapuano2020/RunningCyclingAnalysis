import { readFileSync, readdirSync } from 'node:fs'
import type { ActivityDigest } from '../../types'
import { parseDigest } from '../serialize'

/**
 * The revision-6 digests of the study libraries, checked in under `fixtures/rev6` as one file per library with a
 * serialized digest on each line (D12 section 1.9). They were made by the digester of revision 6, which no longer
 * exists, and cannot be remade: the study reads them beside the current digester's output, so it stays a regression test after the
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
