import { describe, expect, it } from 'vitest'
import { readStylesheet, readStylesheetsUnder, ruleBody } from '../ui/components/stylesheet'

const components = await readStylesheet(import.meta.url, './components.css')
const sheets = await readStylesheetsUnder(import.meta.url, '../')

/** The label classes that were seven rules of their own and now take the one `.tag` (D10: fewer boxes). */
const TAGGED = [
  '.stat-tile__name',
  '.stat-tile__basis',
  '.sport-hero__period',
  '.balance-levels__name',
  '.balance-changes__tag',
  '.fitness-card__sport',
  '.fitness-track__tag',
]
const FACE = /(font-family|font-size|font-weight|letter-spacing|text-transform)\s*:/

describe('the tag', () => {
  it('sets the face, size, weight, tracking and capitals once, as the eyebrow has them', () => {
    const body = ruleBody(components, '.eyebrow,\n.tag')
    expect(body).toMatch(/font-family:\s*var\(--font-display\)/)
    expect(body).toMatch(/font-size:\s*var\(--text-sm\)/)
    expect(body).toMatch(/font-weight:\s*700/)
    expect(body).toMatch(/letter-spacing:\s*var\(--tracking-caps\)/)
    expect(body).toMatch(/text-transform:\s*uppercase/)
    expect(ruleBody(components, '.tag--small')).toMatch(/font-size:\s*var\(--text-xs\)/)
  })

  it.each(TAGGED)('leaves %s only its layout, shape and state', (selector) => {
    const own = new RegExp(`(^|\\n)${selector.replaceAll('.', '\\.')}\\s*\\{([^}]*)\\}`)
    for (const { path, css } of sheets) {
      if (path.endsWith('components.css')) continue
      const rule = own.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))
      if (rule?.[2] !== undefined) expect(rule[2], `${path} ${selector}`).not.toMatch(FACE)
    }
  })

  it('beats the tag where a state sets its colour, since the tag is later in the bundle', () => {
    const changes = sheets.find(({ path }) => path.endsWith('BalanceChanges.css'))?.css ?? ''
    expect(changes).toMatch(/\.tag\.balance-changes__tag--recorded\s*\{/)
    const track = sheets.find(({ path }) => path.endsWith('FitnessTrack.css'))?.css ?? ''
    expect(track).toMatch(/\.tag\.fitness-track__tag--now\s*\{/)
  })
})
