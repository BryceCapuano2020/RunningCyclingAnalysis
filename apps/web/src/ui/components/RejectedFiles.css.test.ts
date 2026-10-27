import { describe, expect, it } from 'vitest'
import { readStylesheet } from './stylesheet'

const css = await readStylesheet(import.meta.url, './RejectedFiles.css')

/** The stylesheet with comments removed and every run of whitespace made a single space. */
function flat(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')
}

/** The text of the first @media block with this query, braces included, or '' when there is none. */
function mediaOf(source: string, query: string): string {
  const flatSource = flat(source)
  const open = flatSource.indexOf(`@media ${query} {`)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < flatSource.length; i += 1) {
    if (flatSource[i] === '{') depth += 1
    if (flatSource[i] === '}') {
      depth -= 1
      if (depth === 0) return flatSource.slice(open, i + 1)
    }
  }
  return ''
}

describe('the skipped files in forced colours', () => {
  it('sets the first file reason to CanvasText, since the summary it sits in computes to the link colour', () => {
    expect(mediaOf(css, '(forced-colors: active)')).toContain(
      '.rejected-files__first { color: CanvasText; }',
    )
  })
})

describe('the headline and the nested disclosure', () => {
  it('sets the grid row on the headline summary alone, so Show the files keeps the base row', () => {
    const rules = flat(css)
    expect(rules).toContain('.rejected-files > details > summary {')
    expect(rules).not.toMatch(/\.rejected-files summary/)
    expect(rules).not.toMatch(/\.rejected-files details/)
  })

  it('makes the headline of an import that left out only files the export does not list a line of text', () => {
    expect(flat(css)).toMatch(/\.rejected-files__tally \{[^}]*margin: 0;/)
  })
})
