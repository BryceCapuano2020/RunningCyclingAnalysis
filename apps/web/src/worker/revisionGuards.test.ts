import { describe, expect, it } from 'vitest'
import { CONSUMERS, INDIRECT } from '@rca/core/digest/consumers'
import { REVISIONS } from '@rca/core/digest/revisions'
import { readFilesUnder } from '../ui/components/stylesheet'

/** Source outside tests, fixtures and test helpers, with its path from the repository root. */
async function sourceUnder(...dirs: string[]): Promise<{ path: string; text: string }[]> {
  const files = await Promise.all(
    dirs.map(async (dir) =>
      (await readFilesUnder(import.meta.url, `../../../../${dir}/`, '.ts')).map(
        ({ path, text }) => ({ path: `${dir}/${path}`, text }),
      ),
    ),
  )
  return files.flat().filter(({ path }) => !/\.test\.ts$|(^|\/)test\//.test(path))
}

/** The first argument of every `orderedFor(` call outside the module that defines it. */
async function callSites(): Promise<{ path: string; first: string }[]> {
  const source = await sourceUnder('packages/core/src', 'apps/web/src/worker')
  return source
    .filter(({ path }) => !path.endsWith('digest/consumers.ts'))
    .flatMap(({ path, text }) =>
      [...text.matchAll(/\borderedFor\(\s*([^,)\s]*)/g)].map((m) => ({ path, first: m[1] ?? '' })),
    )
}

describe('the consumer list', () => {
  it('has a quoted, known name at every orderedFor call', async () => {
    const sites = await callSites()
    expect(sites.length).toBeGreaterThan(0)
    for (const { path, first } of sites) {
      const name = /^'(\w+)'$/.exec(first)?.[1]
      expect(name, `${path} passes a literal consumer name`).toBeDefined()
      expect(Object.keys(CONSUMERS), `${path} names ${name}`).toContain(name)
    }
  })

  it('reads every consumer somewhere: a call site, or an entry that says where its input comes from', async () => {
    const called = new Set((await callSites()).map(({ first }) => first.replaceAll("'", '')))
    const indirect = new Set<string>(Object.keys(INDIRECT))
    for (const name of Object.keys(CONSUMERS)) {
      expect(called.has(name) || indirect.has(name), `${name} has a reader`).toBe(true)
      expect(
        called.has(name) && indirect.has(name),
        `${name} is not both direct and indirect`,
      ).toBe(false)
    }
    for (const name of indirect) expect(Object.keys(CONSUMERS)).toContain(name)
  })

  it('leaves no reader on the current-only filter', async () => {
    const source = await sourceUnder('packages/core/src', 'apps/web/src/worker')
    const readers = source.filter(
      ({ path, text }) =>
        /\borderedCurrent\(/.test(text) && !/digest\/(ordered|combine)\.ts$/.test(path),
    )
    expect(readers.map(({ path }) => path)).toEqual([])
  })
})

describe('the revision table', () => {
  it('names a study test for every mixable revision', async () => {
    const tests = await readFilesUnder(
      import.meta.url,
      '../../../../packages/core/src/',
      '.test.ts',
    )
    for (const declaration of REVISIONS.filter(({ kind }) => kind === 'mixable')) {
      expect(declaration.bound, `revision ${declaration.revision} names its bound`).toBeTruthy()
      expect(tests.map(({ path }) => path)).toContain(`digest/${declaration.bound}.test.ts`)
    }
  })
})

/**
 * A comparison of a model revision with anything. Revisions are compared in one place, `revisionStatus`.
 * Matches `modelRevision < x`, `x >= MODEL_REVISION` and `stored.revision !== next.modelRevision`, and
 * leaves a check for null or undefined alone.
 */
const COMPARISON =
  /(?:modelRevision|MODEL_REVISION)\s*(?:[<>]=?|[!=]==?)(?!=)(?!\s*(?:null|undefined)\b)|(?:[<>]=?|[!=]==?)\s*[\w.]*(?:modelRevision|MODEL_REVISION)\b/

/**
 * The files that may compare. revisions.ts is the one place. create.ts decides whether a rebuilt digest is
 * strictly newer than the stored one, which orders two digests and does not ask whether either is current.
 */
const ALLOWED = [
  'packages/core/src/digest/revisions.ts',
  'apps/api/src/routes/activities/create.ts',
]

describe('revision comparisons', () => {
  it('are made only in revisions.ts, apart from the one ordering of two stored digests', async () => {
    const source = await sourceUnder(
      'packages/core/src',
      'packages/contract/src',
      'apps/api/src',
      'apps/web/src',
    )
    const found = source
      .filter(({ path }) => !ALLOWED.includes(path))
      .filter(({ text }) => text.split('\n').some((line) => COMPARISON.test(line)))
      .map(({ path }) => path)
    expect(found).toEqual([])
  })

  it('still matches the shapes of the sites it replaced', () => {
    const before = [
      'kept.modelRevision < MODEL_REVISION',
      'digest.modelRevision !== MODEL_REVISION',
      'identity.modelRevision > MODEL_REVISION',
      'record.digest.modelRevision < MODEL_REVISION',
      'stored.revision >= next.modelRevision',
    ]
    for (const line of before) expect(COMPARISON.test(line), line).toBe(true)
    expect(COMPARISON.test('modelRevision: MODEL_REVISION,')).toBe(false)
    expect(COMPARISON.test('modelRevision === null')).toBe(false)
  })
})
