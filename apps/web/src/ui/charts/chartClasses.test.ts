import { describe, expect, it } from 'vitest'
import {
  readFilesUnder,
  readStylesheet,
  readStylesheetsUnder,
  ruleBody,
} from '../components/stylesheet'

const seriesCss = await readStylesheet(import.meta.url, './ChartSeries.css')

/**
 * A class on a drawn shape must have a rule outside the forced-colours blocks. An unstyled shape takes the
 * SVG default, so a missing rule paints a band solid black rather than failing visibly. Forced colours only
 * replace the tints, so the base rule has to stand without them. A className the scan cannot read fails the
 * test, rather than being skipped.
 */

interface Source {
  path: string
  text: string
}

/** One class a shape uses. A dynamic one is the start of a class, such as `chart-series__marker--` before a sport. */
interface ClassUse {
  text: string
  dynamic: boolean
}

const SINGLE_LITERAL = /^(`[^`]*`|'[^']*'|"[^"]*")$/

function words(text: string, dynamic: boolean): ClassUse[] {
  return text
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => ({ text: word, dynamic }))
}

/** A template's classes: its literal words, the quoted words inside each ${…}, and each prefix before one. */
function templateUses(raw: string): ClassUse[] {
  const uses: ClassUse[] = []
  for (const match of raw.matchAll(/([\w-]*)\$\{([^}]*)\}/g)) {
    if (match[1]) uses.push({ text: match[1], dynamic: true })
    for (const quoted of (match[2] ?? '').matchAll(/'([^']*)'/g)) {
      uses.push(...words(quoted[1] ?? '', false))
    }
  }
  uses.push(...words(raw.replace(/[\w-]*\$\{[^}]*\}/g, ' '), false))
  return uses
}

/** A single string literal, with its quotes or backticks, as the classes it names; null when it is not one. */
function literalUses(literal: string): ClassUse[] | null {
  if (!SINGLE_LITERAL.test(literal)) return null
  if (literal.startsWith('`')) return templateUses(literal.slice(1, -1))
  return words(literal.slice(1, -1), false)
}

/** The text inside the braces that open at the start of `text`, or null when they never close. */
function bracedFrom(text: string): string | null {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') depth++
    if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(1, i)
    }
  }
  return null
}

/** Every string literal in an expression, whichever branch of a ternary it sits in. */
function literalsIn(expression: string): string[] {
  return [...expression.matchAll(/`[^`]*`|'[^']*'|"[^"]*"/g)].map((match) => match[0])
}

/** Each `const name = 'literal'` (or template) in a source, by name. */
function constantsIn(text: string): Map<string, string> {
  return new Map(
    [...text.matchAll(/const\s+(\w+)\s*=\s*(`[^`]*`|'[^']*'|"[^"]*")/g)].map((match) => [
      match[1] ?? '',
      match[2] ?? '',
    ]),
  )
}

/** The classes a shape's className names, or null when the scan cannot read its attribute. */
function classUses(element: string, constants: Map<string, string>): ClassUse[] | null {
  const at = element.indexOf('className=')
  if (at === -1) return []
  const value = element.slice(at + 'className='.length)
  if (value.startsWith('"')) {
    const end = value.indexOf('"', 1)
    return end === -1 ? null : words(value.slice(1, end), false)
  }
  if (!value.startsWith('{')) return null
  const body = bracedFrom(value)
  if (body === null) return null
  const expression = body.trim()
  const whole = literalUses(expression)
  if (whole !== null) return whole
  if (/^\w+$/.test(expression)) {
    const named = constants.get(expression)
    return named === undefined ? null : literalUses(named)
  }
  // A ternary: both branches' literals count, since either can be drawn.
  const literals = literalsIn(expression)
  if (literals.length === 0) return null
  const uses = literals.map((literal) => literalUses(literal))
  return uses.every((found) => found !== null) ? uses.flatMap((found) => found ?? []) : null
}

/** The drawn shapes in a source: each path, rect, circle or line, up to its self-closing end. */
function shapesIn(text: string): string[] {
  return [...text.matchAll(/<(path|rect|circle|line)\b[\s\S]*?\/>/g)].map((match) => match[0])
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Scan {
  uses: ClassUse[]
  unreadable: string[]
}

function scan(sources: Source[]): Scan {
  const result: Scan = { uses: [], unreadable: [] }
  for (const source of sources) {
    const constants = constantsIn(source.text)
    for (const shape of shapesIn(source.text)) {
      const uses = classUses(shape, constants)
      if (uses === null) result.unreadable.push(`${source.path}: ${shape.slice(0, 80)}`)
      else result.uses.push(...uses)
    }
  }
  return result
}

/** The CSS outside every forced-colours block, which closes at the first line that is only a brace. */
function outsideForced(css: string): string {
  const open = '@media (forced-colors: active) {'
  const parts: string[] = []
  let rest = css
  let start = rest.indexOf(open)
  while (start !== -1) {
    parts.push(rest.slice(0, start))
    const end = rest.indexOf('\n}', start)
    rest = end === -1 ? '' : rest.slice(end + 2)
    start = rest.indexOf(open)
  }
  parts.push(rest)
  return parts.join('\n')
}

/** A literal class is styled as a whole class; a dynamic one, as the start of any class it builds. */
function styled(use: ClassUse, css: string): boolean {
  const name = escapeRegex(use.text)
  return new RegExp(use.dynamic ? `\\.${name}` : `\\.${name}(?![\\w-])`).test(css)
}

/** The classes on the shapes in these sources that no rule outside forced colours styles. */
function unstyledClasses(sources: Source[], css: string): string[] {
  const base = outsideForced(css)
  const unstyled = scan(sources).uses.filter((use) => use.text !== '' && !styled(use, base))
  return [...new Set(unstyled.map((use) => use.text))]
}

/** The shapes whose className the scan cannot read: each one fails the guard. */
function unreadableShapes(sources: Source[]): string[] {
  return scan(sources).unreadable
}

describe('the class guard', () => {
  it('counts a class styled only inside forced colours as unstyled', () => {
    const css = '@media (forced-colors: active) {\n  .band-x {\n    fill: Canvas;\n  }\n}\n'
    expect(
      unstyledClasses([{ path: 'a.tsx', text: '<path className="band-x" d="" />' }], css),
    ).toEqual(['band-x'])
  })

  it('matches a literal class as a whole class, so a longer class does not style it', () => {
    expect(
      unstyledClasses(
        [{ path: 'a.tsx', text: '<rect className="band" />' }],
        '.band-ride {\n  fill: red;\n}\n',
      ),
    ).toEqual(['band'])
  })

  it('matches a dynamic name by the start of the class it builds', () => {
    const source = { path: 'a.tsx', text: '<path className={`marker--${sport}`} d="" />' }
    expect(unstyledClasses([source], '.marker--run {\n  fill: red;\n}\n')).toEqual([])
  })

  it('reads both branches of a ternary className, so an unstyled branch is named', () => {
    const source = {
      path: 'a.tsx',
      text: "<rect className={active ? 'band-a' : 'band-b'} d=\"\" />",
    }
    expect(unstyledClasses([source], '.band-b {\n  fill: red;\n}\n')).toEqual(['band-a'])
  })

  it('reads a className built in a const, so the class it names is checked', () => {
    const source = { path: 'a.tsx', text: 'const cls = \'band-c\'\n<rect className={cls} d="" />' }
    expect(unstyledClasses([source], '')).toEqual(['band-c'])
  })

  it('names each className it cannot read, rather than skipping the shape', () => {
    expect(
      unreadableShapes([{ path: 'a.tsx', text: '<path className={props.cls} d="" />' }]),
    ).toHaveLength(1)
    expect(
      unreadableShapes([{ path: 'a.tsx', text: '<path className={`a-${b}`} d="" />' }]),
    ).toEqual([])
  })

  it('finds the cycling band unstyled once its base rule is gone, though its forced rule remains', () => {
    const band = [{ path: 'a.tsx', text: '<path className="chart-series__band--ride" d="" />' }]
    expect(unstyledClasses(band, seriesCss)).toEqual([])
    const withoutBase = seriesCss.replace(/\n\.chart-series__band--ride \{[^}]*\}\n/, '\n')
    expect(withoutBase).not.toBe(seriesCss)
    expect(unstyledClasses(band, withoutBase)).toEqual(['chart-series__band--ride'])
  })
})

describe('chart shapes', () => {
  it('have a rule outside forced colours for every class they use, across the app’s UI', async () => {
    const sources = (await readFilesUnder(import.meta.url, '../', '.tsx'))
      .filter((source) => !source.path.endsWith('.test.tsx'))
      .map((source) => ({ path: source.path, text: source.text }))
    const css = (await readStylesheetsUnder(import.meta.url, '../../'))
      .map((sheet) => sheet.css)
      .join('\n')
    // A guard that found no shapes would pass for nothing, so the scan must see the charts.
    expect(sources.flatMap((source) => shapesIn(source.text)).length).toBeGreaterThan(20)
    expect(unreadableShapes(sources)).toEqual([])
    expect(unstyledClasses(sources, css)).toEqual([])
  })

  it('draws the cycling range as a soft tint with a ride-coloured outline, so its edges read on the page', () => {
    const body = ruleBody(seriesCss, '.chart-series__band--ride')
    expect(body).toMatch(/fill:\s*var\(--series-ride-soft\)/)
    expect(body).toMatch(/stroke:\s*var\(--series-ride\)/)
  })
})
