import { describe, expect, it } from 'vitest'
import { readFilesUnder, readStylesheet } from '../ui/test/stylesheet'

/** The page is paper in every system setting (docs/design/system.md, Rules): no second theme anywhere. */
const SECOND_THEME = /prefers-color-scheme|data-theme/

describe('one theme', () => {
  it('has no prefers-color-scheme rule or data-theme hook in a sheet, script, test or page of the app', async () => {
    const files = [
      ...(await readFilesUnder(import.meta.url, '../', '.css')),
      ...(await readFilesUnder(import.meta.url, '../', '.ts')),
      ...(await readFilesUnder(import.meta.url, '../', '.tsx')),
      ...(await readFilesUnder(import.meta.url, '../../scripts/', '.ts')),
      { path: 'README.md', text: await readStylesheet(import.meta.url, '../../../../README.md') },
      { path: 'index.html', text: await readStylesheet(import.meta.url, '../../index.html') },
      { path: 'privacy.html', text: await readStylesheet(import.meta.url, '../../privacy.html') },
      { path: '404.html', text: await readStylesheet(import.meta.url, '../../public/404.html') },
    ]
    const found = files
      .filter(({ path }) => !path.endsWith('oneTheme.test.ts'))
      .filter(({ text }) => SECOND_THEME.test(text))
      .map(({ path }) => path)
    expect(found).toEqual([])
  })

  it('tells the browser the page is light, with one theme colour', async () => {
    const index = await readStylesheet(import.meta.url, '../../index.html')
    expect(index).toContain('<meta name="color-scheme" content="light" />')
    expect(index.match(/<meta name="theme-color"/g)).toHaveLength(1)
    expect(index).toContain('<meta name="theme-color" content="#fbfaf8" />')
  })
})
