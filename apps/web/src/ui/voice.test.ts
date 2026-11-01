import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { readFilesUnder, readStylesheet } from './components/stylesheet'

/**
 * The voice rules in docs/DESIGN.md (Voice) as a ratchet. Every string the athlete can read, in the web
 * app's UI source and in the core's copy modules, is checked for the phrasings the rules retire. Each
 * pattern has a budget set to the count the source held when the rules were written, so the counts only
 * go down: new copy uses the athlete terms, and a rewrite that clears a pattern lowers its budget.
 *
 * Only string literals, template pieces and JSX text count. Comments, the tests and their fixtures, import
 * paths, class names and `data-` attributes are not user text and are skipped.
 */
const PATTERN = {
  'em dash': /—|\\u2014/gi,
  ', not a': /,\s+not\s+a/gi,
  honest: /\bhonest/gi,
  'read from': /\bread\s+from\b/gi,
  comparable: /\bcomparable/gi,
  'reference heart rate': /reference\s+heart\s+rate/gi,
  'flat pace': /\bflat\s+pace/gi,
  'Ride on foot': /\bride\s+on\s+foot/gi,
  'Output per heartbeat': /\boutput\s+per\s+heartbeat/gi,
  'Late in long sessions': /\blate\s+in\s+long\s+sessions/gi,
  'Your years': /\byour\s+years/gi,
  'Stand-out': /\bstand-out(?![\w-])/gi,
  'It takes': /\bit\s+takes\b/gi,
  '; ': /;\s/g,
} as const

type Rule = keyof typeof PATTERN

const RULES = Object.keys(PATTERN) as Rule[]

/** The most matches of each pattern the source may hold. Lower a budget when a rewrite clears matches. */
const BUDGET: Record<Rule, number> = {
  'em dash': 18,
  ', not a': 7,
  honest: 1,
  'read from': 11,
  comparable: 0,
  'reference heart rate': 13,
  'flat pace': 16,
  'Ride on foot': 4,
  'Output per heartbeat': 9,
  'Late in long sessions': 4,
  'Your years': 6,
  'Stand-out': 1,
  'It takes': 2,
  '; ': 56,
}

/** The core's modules that write the athlete's sentences, relative to packages/core/src. */
const CORE_COPY = [
  'fitness/copy.ts',
  'findings/copy.ts',
  'lookback/copy.ts',
  'lookback/checkInCopy.ts',
  'lookback/sectionCopy.ts',
  'profile/sentence.ts',
]

/** Files under the UI that hold no user text: tests, the helpers and fixtures they use, and declarations. */
const NOT_USER_TEXT = /\.d\.ts$|\.test\.tsx?$|(^|\/)test\/|Fixtures?\.tsx?$/

/** Attributes whose strings name a style or a hook for tests, not words. */
const NOT_WORDS_ATTRIBUTE = /^(?:className|id|key|data-.*)$/

interface Hit {
  rule: Rule
  /** `path:line`, from the repository root. */
  where: string
  /** The words around the match, on one line. */
  around: string
}

/** Each match of a pattern in the user text of one source file, with its line. Comments never reach it. */
function findHits(path: string, source: string): Hit[] {
  const kind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, kind)
  const hits: Hit[] = []
  const check = (raw: string, start: number): void => {
    for (const rule of RULES) {
      for (const match of raw.matchAll(PATTERN[rule])) {
        const line = file.getLineAndCharacterOfPosition(start + match.index).line + 1
        const around = raw.slice(Math.max(0, match.index - 24), match.index + 40)
        hits.push({ rule, where: `${path}:${line}`, around: around.replace(/\s+/g, ' ').trim() })
      }
    }
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    if (ts.isJsxAttribute(node) && NOT_WORDS_ATTRIBUTE.test(node.name.getText(file))) return
    if (ts.isJsxText(node)) check(node.text, node.pos)
    else if (ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node)) {
      check(node.getText(file), node.getStart(file))
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return hits
}

/** The source of every file that holds user text, with its path from the repository root. */
async function userTextSource(): Promise<{ path: string; text: string }[]> {
  const ui = [
    ...(await readFilesUnder(import.meta.url, './', '.ts')),
    ...(await readFilesUnder(import.meta.url, './', '.tsx')),
  ].filter(({ path }) => !NOT_USER_TEXT.test(path))
  // readStylesheet reads any one file next to the test, whatever its extension.
  const core = await Promise.all(
    CORE_COPY.map(async (path) => ({
      path,
      text: await readStylesheet(import.meta.url, `../../../../packages/core/src/${path}`),
    })),
  )
  return [
    ...ui.map(({ path, text }) => ({ path: `apps/web/src/ui/${path}`, text })),
    ...core.map(({ path, text }) => ({ path: `packages/core/src/${path}`, text })),
  ]
}

/** A line that starts a comment or sits inside a block comment, as the source is formatted. */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/

/**
 * Whether a file could hold a match outside its comments, from its text alone. Parsing a file costs far
 * more than this, and most of the source has no match, or only one in a comment.
 */
function mayMatch(text: string): boolean {
  const code = text
    .split('\n')
    .filter((line) => !COMMENT_LINE.test(line))
    .join('\n')
  return RULES.some((rule) => code.search(PATTERN[rule]) >= 0)
}

let scan: Promise<{ files: number; hits: Hit[] }> | undefined

/** Every hit in the source, found once for the whole file. */
function scanned(): Promise<{ files: number; hits: Hit[] }> {
  scan ??= userTextSource().then((files) => ({
    files: files.length,
    hits: files
      .filter(({ text }) => mayMatch(text))
      .flatMap(({ path, text }) => findHits(path, text)),
  }))
  return scan
}

describe('voice rules', () => {
  it.each(RULES)('keeps %j within its budget', async (rule) => {
    const found = (await scanned()).hits.filter((hit) => hit.rule === rule)
    const sites = found.map((hit) => `  ${hit.where}  ${hit.around}`).join('\n')
    expect(
      found.length,
      `${rule}: ${found.length} found, budget ${BUDGET[rule]}. Use the athlete terms in docs/DESIGN.md (Voice). Found at:\n${sites}`,
    ).toBeLessThanOrEqual(BUDGET[rule])
  })

  it('reads the UI source and the core copy modules', async () => {
    expect((await scanned()).files).toBeGreaterThan(100 + CORE_COPY.length)
  })

  it('finds a pattern in a string, a template piece and JSX text, and skips comments and class names', () => {
    const source = [
      '// Output per heartbeat, in a comment',
      "export const a = 'Output per heartbeat'",
      'export const b = `Your best ${x}, not a ranking`',
      'export const View = () => (',
      '  <p className="stand-out" data-testid="stand-out">',
      '    Late in',
      '    long sessions',
      '  </p>',
      ')',
    ].join('\n')
    const hits = findHits('view.tsx', source)
    expect(hits.map(({ rule, where }) => `${rule} ${where}`)).toEqual([
      'Output per heartbeat view.tsx:2',
      ', not a view.tsx:3',
      'Late in long sessions view.tsx:6',
    ])
  })
})
