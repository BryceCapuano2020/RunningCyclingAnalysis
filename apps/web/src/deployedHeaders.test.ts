import { describe, expect, it } from 'vitest'
import { readStylesheet } from './ui/components/stylesheet'

/*
 * The headers Workers Static Assets sends with every page, read from the file that sets them. The
 * e2e-worker suite checks the same header on the running Worker; this guards the file itself.
 */
const headers = await readStylesheet(import.meta.url, '../public/_headers')

/** Each directive of the Content-Security-Policy header, as its name and its source tokens. */
function cspDirectives(): Map<string, string[]> {
  const policy = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(headers)?.[1] ?? ''
  return new Map(
    policy
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .map(([name = '', ...sources]) => [name, sources] as const),
  )
}

describe('the Content-Security-Policy in _headers', () => {
  it('allows blob: images, which is how the share sheet shows its preview', () => {
    expect(cspDirectives().get('img-src')).toContain('blob:')
  })

  it('keeps the image sources it allowed before', () => {
    expect(cspDirectives().get('img-src')).toEqual(
      expect.arrayContaining(["'self'", 'data:', 'https://lh3.googleusercontent.com']),
    )
  })
})
