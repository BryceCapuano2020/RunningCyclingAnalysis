/*
 * Test helpers for asserting on stylesheet source. Vitest replaces CSS imports with empty strings,
 * so a test reads the .css file itself. The module name is kept in a variable so that the
 * Node built-in is never resolved by the browser build.
 */

interface FileSystem {
  readFileSync: (path: URL, encoding: 'utf8') => string
}

/** The source of a stylesheet, located relative to the test file's own URL. */
export async function readStylesheet(testUrl: string, relativePath: string): Promise<string> {
  const specifier = 'node:fs'
  const fs = (await import(/* @vite-ignore */ specifier)) as FileSystem
  return fs.readFileSync(new URL(relativePath, testUrl), 'utf8')
}

/** The declarations of the rule whose selector is exactly `selector`, or '' when there is none. */
export function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''
}
