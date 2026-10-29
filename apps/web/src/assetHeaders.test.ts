import { describe, expect, it } from 'vitest'
import {
  IMMUTABLE_CACHE_CONTROL,
  MAX_ASSET_RULES,
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

  it('refuses more files than the headers file can hold, rather than ship a file Cloudflare rejects', () => {
    const files = Array.from({ length: MAX_ASSET_RULES + 1 }, (_, index) => `f${index}.js`)
    expect(() => immutableAssetRules(files)).toThrow(/need 91 header rules/)
    expect(() => immutableAssetRules(files.slice(1))).not.toThrow()
  })

  it('says why the rules are written one by one, in the header file the pattern used to be in', async () => {
    const { readStylesheet } = await import('./ui/components/stylesheet')
    const headers = await readStylesheet(import.meta.url, '../public/_headers')
    expect(headers).not.toMatch(/^\/assets\/\*/m)
    expect(headers).toMatch(/appended by the build, one for each emitted file/)
  })
})
