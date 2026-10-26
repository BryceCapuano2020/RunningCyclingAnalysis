import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { declared } from './tokenSheet'

const read = (path: string) => readStylesheet(import.meta.url, path)
const header = await read('../ui/components/Header.css')
const components = await read('./components.css')
const base = await read('./base.css')
const tokens = await read('./tokens.css')
const app = await read('../App.css')
const dropzone = await read('../ui/components/Dropzone.css')
const balanceMeter = await read('../ui/components/BalanceMeter.css')
const ladder = await read('../ui/components/LevelLadder.css')
const sportCard = await read('../ui/pages/SportCard.css')
const sportPage = await read('../ui/pages/SportPage.css')
const balancePage = await read('../ui/pages/BalancePage.css')
const chartFrame = await read('../ui/charts/ChartFrame.css')
const chartSeries = await read('../ui/charts/ChartSeries.css')
const crossSport = await read('../ui/pages/CrossSportCard.css')
const activityPage = await read('../ui/pages/ActivityPage.css')
const activityList = await read('../ui/components/ActivityList.css')
const accountMenu = await read('../ui/components/AccountMenu.css')
const segmented = await read('../ui/components/SegmentedControl.css')
const methodPage = await read('../ui/pages/MethodPage.css')
const skipLink = await read('../ui/components/SkipLink.css')
const exportGuides = await read('../ui/components/ExportGuides.css')
const privacyCss = await read('../../public/privacy.css')
const icons = await read('../ui/components/icons.tsx')
const iconsCss = await read('../ui/components/icons.css')
const balanceMeterTsx = await read('../ui/components/BalanceMeter.tsx')
const ladderTsx = await read('../ui/components/LevelLadder.tsx')

/** The declarations of every rule whose selector list names `selector` exactly, in source order. */
function rulesWith(css: string, selector: string): string {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const bodies: string[] = []
  for (const [, list = '', body = ''] of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (list.split(',').some((part) => part.trim() === selector)) bodies.push(body)
  }
  return bodies.join('\n')
}

/** The text of the first @media block with this query, braces included, or '' when there is none. */
function mediaOf(css: string, query: string): string {
  const open = css.indexOf(`@media ${query} {`)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open, i + 1)
    }
  }
  return ''
}

/** The stylesheet with every @media block removed, so a rule is read as the base rule it is. */
function outsideMedia(css: string): string {
  let rest = css
  for (let open = rest.indexOf('@media '); open >= 0; open = rest.indexOf('@media ')) {
    let depth = 0
    let end = open
    for (let i = open; i < rest.length; i += 1) {
      if (rest[i] === '{') depth += 1
      if (rest[i] === '}') {
        depth -= 1
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }
    rest = rest.slice(0, open) + rest.slice(end)
  }
  return rest
}

const PHONE = '(max-width: 760px)'
const FORCED = '(forced-colors: active)'
const DARK = ":root:not([data-theme='light'])"

/** The font sizes that near-duplicate the type scale: 12.8 to 13.6 px, which read as one size. */
const NEAR_DUPLICATE_SIZES = ['0.8rem', '0.8125rem', '0.85rem', '13px']

describe('header', () => {
  it('marks the current tab with a flat bar, not an inset shadow on a rounded box', () => {
    expect(header).not.toMatch(/box-shadow:\s*inset/)
    expect(header).toMatch(/\.header__tab\[aria-current='page'\]::after,[\s\S]*?height:\s*2px/)
  })

  it('keeps the current tab bar visible in forced colours, with a system colour', () => {
    const forced = mediaOf(header, FORCED)
    expect(rulesWith(forced, ".header__tab[aria-current='page']::after")).toMatch(
      /background:\s*Highlight/,
    )
  })

  it('sets the wordmark in capitals, in the tab type', () => {
    expect(rulesWith(header, '.header__name')).toMatch(/text-transform:\s*uppercase/)
  })

  it('keeps the phone wordmark small enough that the brand and actions share one row at 600 and 760 px', () => {
    expect(rulesWith(mediaOf(header, PHONE), '.header__name')).toMatch(/font-size:\s*1\.125rem/)
    expect(rulesWith(mediaOf(header, PHONE), '.header__name')).toMatch(/letter-spacing:\s*0\.04em/)
  })

  it('keeps the phone tab bar at its background and its height', () => {
    const phone = mediaOf(header, PHONE)
    expect(rulesWith(phone, '.header__tabs')).toMatch(/background:\s*var\(--surface-0\)/)
    expect(rulesWith(phone, '.header__tab')).toMatch(/min-height:\s*var\(--tab-bar-height\)/)
  })

  it('sets the phone tab labels from the tab tokens, not literal sizes', () => {
    const tab = rulesWith(mediaOf(header, PHONE), '.header__tab')
    expect(tab).toMatch(/font-size:\s*var\(--text-label\)/)
    expect(tab).toMatch(/letter-spacing:\s*var\(--tracking-tab\)/)
  })
})

describe('brand mark', () => {
  it('draws its tile and sport strokes from custom properties, not hex', () => {
    expect(icons).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    expect(icons).toContain('brand-mark__tile')
  })

  it('insets the tile half a unit, so its 1 px ring is not clipped at the edge', () => {
    expect(icons).toMatch(/brand-mark__tile"\s+x="0\.5"\s+y="0\.5"\s+width="31"\s+height="31"/)
  })

  it('rings the tile in dark, so it does not vanish on the dark page', () => {
    expect(rulesWith(iconsCss, '.brand-mark__tile')).toMatch(/stroke:\s*var\(--mark-ring\)/)
  })
})

describe('buttons and links', () => {
  it('sets every primary button rule in sentence case, not capitals', () => {
    expect(rulesWith(components, '.btn-primary')).not.toMatch(/text-transform/)
  })

  it('sets the link arrows in sentence case too', () => {
    expect(rulesWith(app, '.link-arrow')).not.toMatch(/text-transform/)
  })

  it('sets the export guide tiles and the skip link in sentence case', () => {
    expect(rulesWith(exportGuides, '.export-guides__tile')).not.toMatch(/text-transform/)
    expect(rulesWith(skipLink, '.skip-link')).not.toMatch(/text-transform/)
  })

  it('changes the primary button visibly on hover, in light as in dark', () => {
    expect(rulesWith(components, '.btn-primary:hover')).toMatch(
      /background:\s*var\(--accent-hover\)/,
    )
  })

  it('uses the navigation link size from the type scale', () => {
    expect(rulesWith(app, '.link-arrow')).toMatch(/font-size:\s*var\(--text-md\)/)
  })

  it('keeps disclosure summaries at the body size, since they are controls', () => {
    expect(rulesWith(base, 'summary')).not.toMatch(/font-size/)
  })
})

describe('colour tokens the chrome uses', () => {
  it('sets the accent hover and the brand ring to the values in DESIGN.md, in both schemes', () => {
    expect(declared(tokens, ':root').get('accent-hover')).toBe('#474f5c')
    expect(declared(tokens, DARK).get('accent-hover')).toBe('#d9f55a')
    expect(declared(tokens, ':root').get('mark-ring')).toBe('#0e1116')
    expect(declared(tokens, DARK).get('mark-ring')).toBe('#6b7380')
  })
})

describe('page chrome', () => {
  it('left-aligns the footer to the content edge', () => {
    expect(rulesWith(app, '.app__footer')).toMatch(/text-align:\s*start/)
  })

  it('draws the drop area with the hairline dashed rule', () => {
    expect(rulesWith(dropzone, '.dropzone')).toMatch(/border:\s*1px dashed/)
  })
})

describe('forced colours', () => {
  it('keeps the meter track and band edged in the system colours', () => {
    const forced = mediaOf(balanceMeter, FORCED)
    expect(rulesWith(forced, '.balance-meter__track')).toMatch(/border-color:\s*CanvasText/)
    expect(rulesWith(forced, '.balance-meter__band')).toMatch(/border-color:\s*Highlight/)
  })

  it('keeps the level ladder track, current band and chevrons in the system colours', () => {
    const forced = mediaOf(ladder, FORCED)
    expect(rulesWith(forced, '.level-ladder__track')).toMatch(/stroke:\s*CanvasText/)
    expect(rulesWith(forced, '.level-ladder__band--current')).toMatch(/fill:\s*Highlight/)
    expect(rulesWith(forced, '.level-ladder__beyond')).toMatch(/fill:\s*CanvasText/)
    expect(rulesWith(forced, '.level-ladder__beyond')).toMatch(/stroke:\s*CanvasText/)
  })

  it('keeps the two chart lines apart in the system colours', () => {
    const forced = mediaOf(chartSeries, FORCED)
    expect(rulesWith(forced, '.chart-series__line--run')).toMatch(/stroke:\s*CanvasText/)
    expect(rulesWith(forced, '.chart-series__line--ride')).toMatch(/stroke:\s*Highlight/)
  })
})

describe('header guides', () => {
  it('hides the header guides button below 1100 px, where it would wrap the actions onto a second row', () => {
    expect(rulesWith(outsideMedia(header), '.header__actions .header__guides')).toMatch(
      /display:\s*none/,
    )
  })

  it('shows the header guides button from 1100 px, beside Add files', () => {
    expect(
      rulesWith(mediaOf(header, '(min-width: 1100px)'), '.header__actions .header__guides'),
    ).toMatch(/display:\s*inline-flex/)
  })
})

describe('activity pages', () => {
  it('wraps a long activity name on the activity page, so the page does not widen', () => {
    expect(rulesWith(activityPage, '.activity-page__title')).toMatch(/overflow-wrap:\s*anywhere/)
    expect(rulesWith(activityList, '.activity-list__name')).toMatch(/overflow-wrap:\s*anywhere/)
  })
})

describe('control height', () => {
  it('sets segmented options from the shared control height, not a literal', () => {
    expect(rulesWith(segmented, '.segmented-control__option')).toMatch(
      /min-height:\s*var\(--control-height\)/,
    )
  })

  it('sets the method contents buttons from the shared control height', () => {
    expect(rulesWith(methodPage, '.method__contents button')).toMatch(
      /min-height:\s*var\(--control-height\)/,
    )
  })

  it('gives the static privacy page the control height token, mirrored from the app', () => {
    expect(rulesWith(privacyCss, '.header__brand')).toMatch(/min-height:\s*var\(--control-height\)/)
    expect(rulesWith(privacyCss, '.header__profile')).toMatch(
      /min-height:\s*var\(--control-height\)/,
    )
    expect(declared(privacyCss, ':root').get('control-height')).toBe('40px')
    expect(privacyCss).toMatch(
      /@media \(max-width: 760px\), \(pointer: coarse\) \{\s*:root \{\s*--control-height: 44px/,
    )
  })
})

describe('type scale', () => {
  it('defines the small sizes, the tab label and the caps tracking as tokens', () => {
    expect(tokens).toMatch(/--text-sm:\s*0\.875rem/)
    expect(tokens).toMatch(/--text-md:\s*1rem/)
    expect(tokens).toMatch(/--text-label:\s*0\.9375rem/)
    expect(tokens).toMatch(/--tracking-caps:/)
    expect(tokens).toMatch(/--tracking-tab:\s*0\.02em/)
  })

  it('defines the 12 px size the charts and the level ladder use as a token', () => {
    expect(tokens).toMatch(/--text-xs:\s*0\.75rem/)
  })

  it.each([
    ['components.css', components],
    ['base.css', base],
    ['App.css', app],
    ['Header.css', header],
    ['BalanceMeter.css', balanceMeter],
    ['LevelLadder.css', ladder],
    ['SportCard.css', sportCard],
    ['SportPage.css', sportPage],
    ['BalancePage.css', balancePage],
    ['ChartFrame.css', chartFrame],
    ['Dropzone.css', dropzone],
    ['AccountMenu.css', accountMenu],
  ])('%s uses no near-duplicate small size', (_name, css) => {
    const found = NEAR_DUPLICATE_SIZES.filter((size) =>
      new RegExp(`font-size:\\s*${size.replace('.', '\\.')}\\b`).test(css),
    )
    expect(found).toEqual([])
  })
})

describe('shared layout', () => {
  it('draws the meter and the ladder on one figure rule, so neither keeps its own margin', () => {
    expect(components).toMatch(/\.scale-figure \{/)
    expect(balanceMeterTsx).toContain('scale-figure')
    expect(ladderTsx).toContain('scale-figure')
    expect(balanceMeter).not.toMatch(/\.balance-meter \{/)
    expect(rulesWith(ladder, '.level-ladder')).not.toMatch(/margin:\s*0/)
  })

  it('takes the landing columns from a column token, not a literal width', () => {
    expect(app).not.toMatch(/minmax\(min\(100%, 360px\)/)
    expect(app).toMatch(/var\(--column-landing\)/)
    expect(tokens).toMatch(/--column-landing:\s*360px/)
  })

  it('wraps a long activity name in the cross-sport idea, so the page does not widen', () => {
    expect(rulesWith(crossSport, '.cross-sport')).toMatch(/min-width:\s*0/)
    expect(rulesWith(crossSport, '.cross-sport')).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
