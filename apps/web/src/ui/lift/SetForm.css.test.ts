import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../components/stylesheet'

describe('set form styles', () => {
  it('use tokens only and let the rows wrap at 320 px', async () => {
    const css = await readStylesheet(import.meta.url, './SetForm.css')
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    expect(css).toContain('flex-wrap: wrap')
  })
})
