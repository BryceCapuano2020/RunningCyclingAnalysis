import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../components/stylesheet'

describe('lift form styles', () => {
  it('use tokens only and let the rows wrap at 320 px', async () => {
    for (const file of ['./SetForm.css', './LiftPicker.css']) {
      const css = await readStylesheet(import.meta.url, file)
      expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    }
    expect(await readStylesheet(import.meta.url, './SetForm.css')).toContain('flex-wrap: wrap')
  })
})
