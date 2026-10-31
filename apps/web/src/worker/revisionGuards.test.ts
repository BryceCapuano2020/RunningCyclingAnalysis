import { describe, expect, it } from 'vitest'
import { CONSUMERS, INDIRECT } from '@rca/core/digest/consumers'
import { REVISIONS } from '@rca/core/digest/revisions'
import { readFilesUnder } from '../ui/components/stylesheet'

/** Source outside tests, fixtures and test helpers, with its path from the repository root. */
async function sourceUnder(...dirs: string[]): Promise<{ path: string; text: string }[]> {
  const files = await Promise.all(
    dirs.flatMap((dir) =>
      ['.ts', '.tsx'].map(async (suffix) =>
        (await readFilesUnder(import.meta.url, `../../../../${dir}/`, suffix)).map(
          ({ path, text }) => ({ path: `${dir}/${path}`, text }),
        ),
      ),
    ),
  )
  return files.flat().filter(({ path }) => !/\.test\.tsx?$|(^|\/)test\//.test(path))
}

const READERS = ['packages/core/src', 'apps/web/src']

/** The first argument of every `orderedFor(` call outside the module that defines it. */
async function callSites(): Promise<{ path: string; first: string }[]> {
  const source = await sourceUnder(...READERS)
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
    const source = await sourceUnder(...READERS)
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
 * Reading a digest's `modelRevision`: `x.modelRevision`, `x['modelRevision']` or a destructuring that names
 * it. Whatever is then done with the value (a comparison, a subtraction, an alias) is a way round
 * `revisionStatus`, so the read itself is what is forbidden. Writing the field (`modelRevision: n`) is not.
 */
const READ_REVISION =
  /\.modelRevision\b|\[\s*['"]modelRevision['"]\s*\]|\{[^{}]*\bmodelRevision\b[^{}]*\}\s*=(?!=)/

/** A read that is handed straight to `revisionStatus`, which is the way to ask. */
const ASKED = /\brevisionStatus\(\s*[\w.?]*\.modelRevision\s*[,)]/g

/**
 * The files that read it, and why. revisions.ts and consumers.ts are the table and its filter. readDigest.ts
 * and readResult.ts parse the field from untrusted input. create.ts orders two stored digests for an upgrade
 * (strictly newer), which does not ask whether either is current. revisionCheck.ts reads the claimed revision
 * from an unparsed body, to ask `revisionStatus` before the schema runs. labels.ts compares the stored revision
 * in SQL with the one the client read, so a label never lands on a row a rebuild has since replaced.
 */
const ALLOWED = [
  'packages/core/src/digest/revisions.ts',
  'packages/core/src/digest/consumers.ts',
  'packages/core/src/digest/readDigest.ts',
  'packages/core/src/digest/readResult.ts',
  'apps/api/src/routes/activities/create.ts',
  'apps/api/src/routes/activities/revisionCheck.ts',
  'apps/api/src/routes/activities/labels.ts',
]

describe('revision reads', () => {
  it('happen only where the model revision is asked about, parsed or ordered', async () => {
    const source = await sourceUnder(
      'packages/core/src',
      'packages/contract/src',
      'apps/api/src',
      'apps/web/src',
    )
    const found = source
      .filter(({ path }) => !ALLOWED.includes(path))
      .filter(({ text }) => READ_REVISION.test(text.replace(ASKED, '')))
      .map(({ path }) => path)
    expect(found).toEqual([])
  })

  it('sees the ways round revisionStatus, across lines, and leaves the allowed forms alone', () => {
    const flagged = [
      'const r = d.modelRevision\n  if (r < 6) return',
      'const { modelRevision } = digest',
      'const { id, modelRevision: r } = digest',
      'digest.modelRevision - 1',
      "digest['modelRevision'] > 5",
      'kept\n  .modelRevision >= x',
    ]
    for (const text of flagged) expect(READ_REVISION.test(text.replace(ASKED, '')), text).toBe(true)
    const allowed = [
      'revisionStatus(kept.modelRevision) === current',
      'revisionStatus(record.digest.modelRevision)',
      'return { id, modelRevision: MODEL_REVISION }',
      'modelRevision: number',
    ]
    for (const text of allowed)
      expect(READ_REVISION.test(text.replace(ASKED, '')), text).toBe(false)
  })
})
