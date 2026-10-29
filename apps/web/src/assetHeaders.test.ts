import { describe, expect, it } from 'vitest'
import {
  IMMUTABLE_CACHE_CONTROL,
  MAX_HEADER_RULES,
  countRules,
  RULES_MARKER,
  immutableAssetRules,
} from '../scripts/assetHeaders'

describe('immutableAssetRules', () => {
  it('writes one exact rule for each file, so a missing path matches none', () => {
    const rules = immutableAssetRules(['index-AbC123.js', 'font-9z.woff2', 'index-AbC123.css'])
    expect(rules).toContain(RULES_MARKER)
    expect(rules).toContain(`/assets/index-AbC123.js\n  Cache-Control: ${IMMUTABLE_CACHE_CONTROL}`)
    expect(rules).toContain(`/assets/font-9z.woff2\n  Cache-Control: ${IMMUTABLE_CACHE_CONTROL}`)
    // No splat or placeholder: a pattern would cover a file that is not there.
    expect(
      rules
        .split('\n')
        .filter((line) => line.startsWith('/'))
        .every((line) => !/[*:]/.test(line)),
    ).toBe(true)
  })

  it('lists the files in a fixed order, so a build writes the same file twice', () => {
    expect(immutableAssetRules(['b.js', 'a.js'])).toBe(immutableAssetRules(['a.js', 'b.js']))
  })

  it('counts the rules a headers text already holds: path lines only, not comments, headers or blanks', () => {
    expect(
      countRules('# a comment\n/*\n  A: b\n  C: d\n\n/.well-known/security.txt\n  E: f\n'),
    ).toBe(2)
  })

  it('refuses more files than fit beside the rules already in the headers file, not a fixed headroom', () => {
    const existing = '# c\n/*\n  A: b\n\n/x\n  C: d\n'
    const room = MAX_HEADER_RULES - countRules(existing)
    const files = (count: number) => Array.from({ length: count }, (_, index) => `f${index}.js`)
    expect(() => immutableAssetRules(files(room), existing)).not.toThrow()
    expect(() => immutableAssetRules(files(room + 1), existing)).toThrow(/beside the 2 already/)
    expect(() => immutableAssetRules(files(MAX_HEADER_RULES))).not.toThrow()
    expect(() => immutableAssetRules(files(MAX_HEADER_RULES + 1))).toThrow(/limit is 100/)
  })

  it('says why the rules are written one by one, in the header file the pattern used to be in', async () => {
    const { readStylesheet } = await import('./ui/components/stylesheet')
    const headers = await readStylesheet(import.meta.url, '../public/_headers')
    expect(headers).not.toMatch(/^\/assets\/\*/m)
    expect(headers).toMatch(/appended by the build, one for each emitted file/)
  })
})
