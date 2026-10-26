/*
 * Test helpers for asserting on stylesheet source. Vitest replaces CSS imports with empty strings,
 * so a test reads the .css file itself. The module name is kept in a variable so that the
 * Node built-in is never resolved by the browser build.
 */

interface FileSystem {
  readFileSync: (path: URL, encoding: 'utf8') => string
  readdirSync: (path: URL, options: { recursive: true }) => string[]
}

/** The source of a stylesheet, located relative to the test file's own URL. */
export async function readStylesheet(testUrl: string, relativePath: string): Promise<string> {
  const specifier = 'node:fs'
  const fs = (await import(/* @vite-ignore */ specifier)) as FileSystem
  return fs.readFileSync(new URL(relativePath, testUrl), 'utf8')
}

/**
 * The declarations of every top-level rule whose selector is exactly `selector`, in source order and
 * joined, or '' when there is none. A selector can be declared more than once, so every block counts.
 */
export function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`, 'g')
  return [...css.matchAll(pattern)].map((match) => match[1] ?? '').join('\n')
}

/** Every stylesheet under a directory, as its path and its source, for a test that sweeps them. */
export async function readStylesheetsUnder(
  testUrl: string,
  relativeDir: string,
): Promise<{ path: string; css: string }[]> {
  const specifier = 'node:fs'
  const fs = (await import(/* @vite-ignore */ specifier)) as FileSystem
  const root = new URL(relativeDir, testUrl)
  return fs
    .readdirSync(root, { recursive: true })
    .filter((path) => path.endsWith('.css'))
    .map((path) => ({ path, css: fs.readFileSync(new URL(path, root), 'utf8') }))
}
