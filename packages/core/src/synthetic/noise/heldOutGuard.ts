/**
 * Keeps the held-out configurations out of tuning code. Only a held-out test (or a held-out file)
 * may name a path containing "heldout", in any case, in an import, a require or a glob; may read
 * the `HELD_OUT_CONFIGS` table; or build an import specifier at run time that could land there.
 * That also stops a normal file from importing a `*.heldout.test` that re-exports the table.
 */
const ALLOWED = [
  /\.heldout(\.sim)?\.test\.ts$/,
  /\/heldOut\.ts$/,
  /\/heldOut\.bands\.ts$/,
  /\/heldOutGuard\.ts$/,
  /\/heldOutGuard\.node\.test\.ts$/,
]
const HELD_OUT_PATHS = [
  'packages/core/src/synthetic/noise/heldOut.ts',
  'packages/core/src/synthetic/noise/heldOut.bands.ts',
]
const STATIC_SPECIFIER = /\b(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g
const CALL = /\b(import|require)\s*\(\s*([^)]*?)\s*\)/g
const GLOB = /\bimport\.meta\.glob(?:Eager)?\s*\(\s*([^)]*)\)/g
const GLOB_TOKENS: Record<string, string> = {
  '**/': '(?:.*/)?',
  '**': '.*',
  '*': '[^/]*',
  '?': '[^/]',
}
const LITERAL = /^(['"])[^'"]*\1$/
const STRINGS = /(['"])((?:(?!\1).)*)\1/g

export interface SourceFile {
  path: string
  text: string
}

/** Block comments out; text inside strings is left alone (a glob like '/a/**\/b' holds a comment opener). */
const withoutComments = (text: string) =>
  text.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1|\/\*[\s\S]*?\*\//g, (m, quote) => (quote ? m : ' '))

function globReaches(pattern: string): boolean {
  if (/heldout/i.test(pattern)) return true
  const re = pattern
    .replace(/^\.?\//, '')
    .replace(/\*\*\/|\*\*|\*|\?|[.+^${}()|[\]\\]/g, (t) => GLOB_TOKENS[t] ?? `\\${t}`)
  const matcher = new RegExp(`(?:^|/)${re}$`)
  return HELD_OUT_PATHS.some((p) => matcher.test(p))
}

const NODE_MODULE = /^['"]node:[\w/]+['"]$/

/**
 * True when `argument` is a bare name the file binds to a `node:` module, as the repo's fs reads
 * do: `const name = 'node:fs'` or `const [a, b] = ['node:fs', 'node:zlib']`.
 */
function isNodeBuiltin(text: string, argument: string): boolean {
  if (!/^[A-Za-z_$][\w$]*$/.test(argument)) return false
  const single = new RegExp(`\\b(?:const|let)\\s+${argument}\\s*=\\s*['"]node:[\\w/]+['"]`)
  if (single.test(text)) return true
  for (const m of text.matchAll(/\b(?:const|let)\s*\[([^\]]*)\]\s*=\s*\[([^\]]*)\]/g)) {
    const names = m[1]!.split(',').map((n) => n.trim())
    const values = m[2]!.split(',').map((v) => v.trim())
    const at = names.indexOf(argument)
    if (at >= 0 && NODE_MODULE.test(values[at] ?? '')) return true
  }
  return false
}

function reachesHeldOut(raw: string): boolean {
  const text = withoutComments(raw)
  if (/HELD_OUT_CONFIGS/i.test(text)) return true
  for (const m of text.matchAll(STATIC_SPECIFIER)) if (/heldout/i.test(m[1]!)) return true
  for (const m of text.matchAll(CALL)) {
    const argument = m[2]!.trim()
    if (!LITERAL.test(argument) && !isNodeBuiltin(text, argument)) return true
  }
  for (const m of text.matchAll(GLOB)) {
    const patterns = [...m[1]!.matchAll(STRINGS)].map((s) => s[2]!)
    if (patterns.length === 0 || patterns.some(globReaches)) return true
  }
  return false
}

export function heldOutOffenders(files: readonly SourceFile[]): string[] {
  return files
    .filter((f) => !ALLOWED.some((ok) => ok.test(f.path)) && reachesHeldOut(f.text))
    .map((f) => f.path)
}
