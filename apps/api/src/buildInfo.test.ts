import { afterEach, describe, expect, it, vi } from 'vitest'

async function buildSha(): Promise<string> {
  vi.resetModules()
  return (await import('./buildInfo.ts')).BUILD_SHA
}

describe('BUILD_SHA', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is unknown when the build did not inject one', async () => {
    expect(await buildSha()).toBe('unknown')
  })

  it('is the injected commit id', async () => {
    vi.stubGlobal('__BUILD_SHA__', '1a2b3c4')
    expect(await buildSha()).toBe('1a2b3c4')
  })

  it('reports unknown for anything that is not a commit id, so no other text leaks into /api/health', async () => {
    vi.stubGlobal('__BUILD_SHA__', 'secret-token-value')
    expect(await buildSha()).toBe('unknown')
  })
})
