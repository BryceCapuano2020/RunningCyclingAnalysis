import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { withoutComments } from './scanSource.mjs'

/*
 * The import reader the source guards share (figure-sources.test.mjs, boundaries.test.mjs). It reads TypeScript as text through the
 * shared scanner (scanSource.mjs), with no parser, so it holds across a TypeScript upgrade: it blanks comments, then reads every way a module comes in (`import { a }`,
 * `import d, { a }`, `import * as m`, `import('x')`, `export * from 'x'`, `export { a } from 'x'`). Type-only forms are skipped.
 */

/**
 * Every .ts and .tsx file under a directory. By default it skips test files, story files and `test` folders (production source);
 * with `{ tests: true }` it yields those too.
 */
export async function* sourceFiles(dir, { tests = false } = {}) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      if (entry.name === 'test' && !tests) continue
      yield* sourceFiles(path, { tests })
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      if (tests || !/\.(test|story)\.(ts|tsx)$/.test(entry.name)) yield path
    }
  }
}

/** The value names in `{ a, type b, c as d }`, as exported by their source module: type specifiers are erased and so are skipped. */
function namesIn(braces) {
  return braces
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !part.startsWith('type '))
    .map((part) => part.split(/\s+as\s+/)[0])
}

/**
 * Everything a file takes from other modules (with `{ withTypes: true }`, type-only forms and bare `import 'x'` count too, for the
 * layer rules, where a type import is still a dependency), as `{ from, names, whole }`: the value names it imports or re-exports by name, or
 * `whole` where it takes a module as a whole (namespace import, `export *`, dynamic `import('x')`). Type-only forms are skipped.
 */
export function importsOf(source, { withTypes = false } = {}) {
  const text = withoutComments(source)
  const found = []
  for (const match of text.matchAll(/\bimport\s+([^;'"`()]*?)\s+from\s*(['"])([^'"\n]+)\2/g)) {
    const clause = match[1]
    if (!withTypes && /^type\s/.test(clause)) continue
    const braces = /\{([^}]*)\}/.exec(clause)
    const whole = /\*\s*as\s+[\w$]+/.test(clause)
    const lead = /^([\w$]+)\s*(,|$)/.exec(clause)
    found.push({
      from: match[3],
      names: [...(lead ? ['default'] : []), ...(braces ? namesIn(braces[1]) : [])],
      whole,
    })
  }
  for (const match of text.matchAll(
    /\bexport\s+(type\s+)?(\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\3/g,
  )) {
    if (match[1] && !withTypes) continue
    const star = match[2].startsWith('*')
    found.push({
      from: match[4],
      names: star ? [] : namesIn(match[2].slice(1, -1)),
      whole: star,
    })
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*(['"`])([^'"`\n]+)\1/g)) {
    found.push({ from: match[2], names: [], whole: true })
  }
  if (withTypes) {
    for (const match of text.matchAll(/\bimport\s*(['"])([^'"\n]+)\1/g)) {
      found.push({ from: match[2], names: [], whole: true })
    }
  }
  return found
}
