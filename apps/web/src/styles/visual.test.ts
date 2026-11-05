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
const sportPage = await read('../ui/pages/SportPage.css')
const sportHero = await read('../ui/pages/SportHero.css')
const sectionNav = await read('../ui/pages/SectionNav.css')
const sectionDisclosure = await read('../ui/pages/SectionDisclosure.css')
const racePredictions = await read('../ui/pages/RacePredictions.css')
const recordTiles = await read('../ui/pages/RecordTiles.css')
const balancePage = await read('../ui/pages/BalancePage.css')
const chartFrame = await read('../ui/charts/ChartFrame.css')
const chartSeries = await read('../ui/charts/ChartSeries.css')
const crossSport = await read('../ui/pages/CrossSportCard.css')
const activityPage = await read('../ui/pages/ActivityPage.css')
const activityList = await read('../ui/components/ActivityList.css')
const accountMenu = await read('../ui/components/AccountMenu.css')
const segmented = await read('../ui/components/SegmentedControl.css')
const pagerCss = await read('../ui/components/Pager.css')
const methodPage = await read('../ui/pages/MethodPage.css')
const skipLink = await read('../ui/components/SkipLink.css')
const exportGuides = await read('../ui/components/ExportGuides.css')
const privacyCss = await read('./privacy.css')
const icons = await read('../ui/components/icons.tsx')
const iconsCss = await read('../ui/components/icons.css')
const balanceMeterTsx = await read('../ui/components/BalanceMeter.tsx')
const ladderTsx = await read('../ui/components/LevelLadder.tsx')
const sportRecords = await read('../ui/components/SportRecords.css')
const googleSignIn = await read('../ui/components/GoogleSignInButton.css')
const emptySportCard = await read('../ui/pages/EmptySportCard.css')
const statTile = await read('../ui/pages/StatTile.css')
const statTileTsx = await read('../ui/pages/StatTile.tsx')
const balanceTiles = await read('../ui/pages/BalanceTiles.css')
const equivalenceCss = await read('../ui/components/EquivalenceTable.css')
const weightNote = await read('../ui/components/WeightNote.css')

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

/** The font sizes that near-duplicate the type scale: 12.8 to 13.6 px, which read as one size. */
const NEAR_DUPLICATE_SIZES = ['0.8rem', '0.8125rem', '0.85rem', '13px']

describe('header', () => {
  it('marks the current page link by ink alone: no bar, box or shadow', () => {
    expect(header).not.toMatch(/box-shadow|::after\s*\{[^}]*height:\s*2px/)
    expect(rulesWith(header, '.header__link--current')).toMatch(/color:\s*var\(--ink\)/)
    expect(rulesWith(header, '.header__link')).toMatch(/color:\s*var\(--ink-secondary\)/)
  })

  it('underlines the current page link in forced colours, where its ink is lost', () => {
    expect(rulesWith(mediaOf(header, FORCED), '.header__link--current')).toMatch(
      /text-decoration:\s*underline/,
    )
  })

  it('sets the wordmark in the serif at 500, in sentence case, with no tile', () => {
    const brand = rulesWith(header, '.header__brand')
    expect(brand).toMatch(/font-family:\s*var\(--font-serif\)/)
    expect(brand).toMatch(/font-weight:\s*500/)
    expect(brand).not.toMatch(/text-transform/)
    expect(header).not.toMatch(/brand-mark|header__name/)
  })

  it('puts the wordmark and Add files on the phone’s first row, and the links on a second', () => {
    const phone = mediaOf(header, PHONE)
    expect(rulesWith(phone, '.header::after')).toMatch(/flex-basis:\s*100%/)
    expect(rulesWith(phone, '.header__actions > .btn')).toMatch(/order:\s*1/)
    expect(rulesWith(phone, '.header__pages')).toMatch(/order:\s*3/)
  })

  it('lets the header scroll away below the rail’s width, and holds it at the top from it', () => {
    expect(rulesWith(outsideMedia(header), '.header')).not.toMatch(/position/)
    expect(rulesWith(mediaOf(header, '(min-width: 1024px)'), '.header')).toMatch(
      /position:\s*sticky/,
    )
  })

  it('sets the page links in the serif at the prose size', () => {
    const link = rulesWith(header, '.header__link')
    expect(link).toMatch(/font-family:\s*var\(--font-serif\)/)
    expect(link).toMatch(/font-size:\s*var\(--text-md\)/)
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

  it('draws both sport strokes at 4 px, so the crossing reads at 32 px', () => {
    expect(icons).toMatch(/brand-mark__run"[\s\S]*?strokeWidth="4"/)
    expect(icons).toMatch(/brand-mark__ride"[\s\S]*?strokeWidth="4"/)
    expect(icons).not.toMatch(/brand-mark__(run|ride)"[\s\S]*?strokeWidth="3"/)
  })

  it('rings the tile with the mark ring token', () => {
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

  it('draws a pressed button in its pressed fill, with no shadow or drop', () => {
    const pressed = rulesWith(components, ".btn:active:not([aria-disabled='true'])")
    expect(pressed).toMatch(/background:\s*var\(--paper-pressed\)/)
    expect(pressed).not.toMatch(/transform|box-shadow/)
  })

  it('draws a pressed primary button back in solid ink, after its hover', () => {
    const pressed = rulesWith(components, ".btn-primary:active:not([aria-disabled='true'])")
    expect(pressed).toMatch(/background:\s*var\(--ink\)/)
    expect(pressed).toMatch(/border-color:\s*var\(--ink\)/)
    expect(components.indexOf('.btn-primary:active')).toBeGreaterThan(
      components.indexOf('.btn-primary:hover'),
    )
  })

  it('sets the pressed fills to the paper and ink tokens', () => {
    expect(declared(tokens, ':root').get('surface-pressed')).toBe('var(--paper-pressed)')
    expect(declared(tokens, ':root').get('accent-pressed')).toBe('var(--ink)')
  })

  it('changes the primary button visibly on hover', () => {
    expect(rulesWith(components, '.btn-primary:hover')).toMatch(/background:\s*var\(--ink-hover\)/)
  })

  it('sets every other button small and outlined: the button height, sans, at the small size', () => {
    const button = rulesWith(components, '.btn')
    expect(button).toMatch(/min-height:\s*var\(--button-height\)/)
    expect(button).toMatch(/border:\s*1px solid var\(--control-border\)/)
    expect(button).toMatch(/font-family:\s*var\(--font-sans\)/)
    expect(button).toMatch(/font-size:\s*var\(--text-sm\)/)
    expect(declared(tokens, ':root').get('button-height')).toBe('40px')
  })

  it('uses the navigation link size from the type scale', () => {
    expect(rulesWith(app, '.link-arrow')).toMatch(/font-size:\s*var\(--text-md\)/)
  })

  it('keeps disclosure summaries at the body size, since they are controls', () => {
    expect(rulesWith(base, 'summary')).not.toMatch(/font-size/)
  })
})

describe('colour tokens the chrome uses', () => {
  it('sets the accent hover and the brand ring from the ink tokens', () => {
    expect(declared(tokens, ':root').get('accent-hover')).toBe('var(--ink-hover)')
    expect(declared(tokens, ':root').get('mark-ring')).toBe('var(--ink)')
  })
})

describe('page chrome', () => {
  it('pins the footer to the foot of the window on a short page, and lets the main part grow', () => {
    expect(rulesWith(components, '.page')).toMatch(/min-height:\s*100svh/)
    expect(rulesWith(components, '.page')).toMatch(/display:\s*flex/)
    expect(rulesWith(app, '.app__main')).toMatch(/flex-grow:\s*1/)
  })

  it('lets a page title and the page stack shrink to the phone width, so a long name cannot widen the page', () => {
    expect(rulesWith(app, '.page-title')).toMatch(/min-width:\s*0/)
    expect(rulesWith(app, '.page-stack')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  })

  it('left-aligns the footer to the content edge', () => {
    expect(rulesWith(app, '.app__footer')).toMatch(/text-align:\s*start/)
  })

  it('draws the drop area with the hairline dashed rule', () => {
    expect(rulesWith(dropzone, '.dropzone')).toMatch(/border:\s*1px dashed/)
  })
})

describe('forced colours', () => {
  it('keeps the meter line, its end caps, its tick and its mark in the system colours', () => {
    const forced = mediaOf(balanceMeter, FORCED)
    for (const selector of [
      '.balance-meter__track::before',
      '.balance-meter__even',
      '.balance-meter__dot',
    ]) {
      expect(rulesWith(forced, selector), selector).toMatch(/background:\s*CanvasText/)
    }
    expect(rulesWith(forced, '.balance-meter__track::after')).toMatch(/border-color:\s*CanvasText/)
  })

  it('keeps the level ladder line, its ticks, its mark and chevrons in the system colours', () => {
    const forced = mediaOf(ladder, FORCED)
    for (const selector of [
      '.level-ladder__track::before',
      '.level-ladder__edge',
      '.level-ladder__dot',
    ]) {
      expect(rulesWith(forced, selector), selector).toMatch(/background:\s*CanvasText/)
    }
    expect(rulesWith(forced, '.level-ladder__name--current')).toMatch(
      /text-decoration:\s*underline/,
    )
    expect(rulesWith(forced, '.level-ladder__beyond')).toMatch(/stroke:\s*CanvasText/)
  })

  it('keeps the two chart lines apart in the system colours', () => {
    const forced = mediaOf(chartSeries, FORCED)
    expect(rulesWith(forced, '.chart-series__line--run')).toMatch(/stroke:\s*CanvasText/)
    expect(rulesWith(forced, '.chart-series__line--ride')).toMatch(/stroke:\s*Highlight/)
  })
})

describe('header actions', () => {
  it('keeps the guides button out of the header, which holds Add files, Profile and the account', () => {
    expect(header).not.toMatch(/header__guides/)
    expect(header).not.toMatch(/min-width:\s*1100px/)
  })
})

describe('activity pages', () => {
  it('wraps a long activity name on the activity page, so the page does not widen', () => {
    expect(rulesWith(activityPage, '.activity-page__title')).toMatch(/overflow-wrap:\s*anywhere/)
    expect(rulesWith(activityList, '.activity-list__name')).toMatch(/overflow-wrap:\s*anywhere/)
  })
})

describe('activity record links', () => {
  it('sets a record chip that links to its sport page at the control height, a target of its own', () => {
    expect(rulesWith(activityPage, '.activity-page__chips a.chip')).toMatch(
      /min-height:\s*var\(--control-height\)/,
    )
  })

  it('takes the underline off a record chip link, which underlines on hover', () => {
    expect(rulesWith(activityPage, '.activity-page__chips a.chip')).toMatch(
      /text-decoration:\s*none/,
    )
    expect(rulesWith(activityPage, '.activity-page__chips a.chip:hover')).toMatch(
      /text-decoration:\s*underline/,
    )
  })
})

describe('pressed states', () => {
  it('draws a pressed unselected segment in the pressed fill, and a pressed selected one with a paper ring', () => {
    const unselected = rulesWith(
      segmented,
      '.segmented-control__option:not(.segmented-control__option--selected):active',
    )
    expect(unselected).toMatch(/background:\s*var\(--paper-pressed\)/)
    expect(unselected).toMatch(/box-shadow:\s*inset 0 0 0 2px var\(--control-border\)/)
    expect(rulesWith(segmented, '.segmented-control__option--selected:active')).toMatch(
      /box-shadow:\s*inset 0 0 0 2px var\(--paper\)/,
    )
  })

  it('gives each pressed control an outline in forced colours, since its fill is dropped', () => {
    expect(
      rulesWith(mediaOf(components, FORCED), ".btn:active:not([aria-disabled='true'])"),
    ).toMatch(/outline:\s*2px solid CanvasText/)
    expect(rulesWith(mediaOf(segmented, FORCED), '.segmented-control__option:active')).toMatch(
      /outline:\s*2px solid CanvasText/,
    )
  })

  it('keeps the current Pager page in the system highlight in forced colours, as segments are', () => {
    const forced = mediaOf(pagerCss, FORCED)
    expect(rulesWith(forced, ".pager .pager__page[aria-current='page']")).toMatch(
      /background:\s*Highlight/,
    )
    expect(rulesWith(forced, ".pager .pager__page[aria-current='page']")).toMatch(
      /color:\s*HighlightText/,
    )
  })

  it('stops forced colours from painting a backplate over the primary button label, in its rest, hover and press states', () => {
    // The system Highlight fill and HighlightText label stay; only the browser's own colour
    // adjustment is switched off, since it draws a backplate that hides the label.
    const forced = mediaOf(components, FORCED)
    for (const selector of [
      '.btn-primary',
      '.btn-primary:hover',
      ".btn-primary:active:not([aria-disabled='true'])",
    ]) {
      const body = rulesWith(forced, selector)
      expect(body).toMatch(/forced-color-adjust:\s*none/)
      expect(body).toMatch(/background:\s*Highlight/)
      expect(body).toMatch(/color:\s*HighlightText/)
    }
  })
})

describe('control height', () => {
  it('sets segmented options from the shared button height, not a literal', () => {
    expect(rulesWith(segmented, '.segmented-control__option')).toMatch(
      /min-height:\s*var\(--button-height\)/,
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

describe('footer', () => {
  it('sets the footer links as flex boxes at the control height on a finger, so a tap lands on them', () => {
    const finger = mediaOf(app, '(pointer: coarse)')
    expect(rulesWith(finger, '.app__footer a')).toMatch(/display:\s*inline-flex/)
    expect(rulesWith(finger, '.app__footer a')).toMatch(/align-items:\s*center/)
    expect(rulesWith(finger, '.app__footer a')).toMatch(/min-height:\s*var\(--control-height\)/)
  })
})

describe('type scale', () => {
  it('defines the small sizes, the tab label and the caps tracking as tokens', () => {
    expect(tokens).toMatch(/--text-sm:\s*0\.875rem/)
    expect(tokens).toMatch(/--text-md:\s*1\.0625rem/)
    expect(tokens).toMatch(/--text-label:\s*var\(--text-sm\)/)
    expect(tokens).toMatch(/--tracking-caps:/)
    expect(tokens).toMatch(/--tracking-tab:\s*0\.02em/)
  })

  it('defines the 12 px size the charts and the level ladder use as a token', () => {
    expect(tokens).toMatch(/--text-xs:\s*0\.75rem/)
  })

  it('defines the 18 px lead size as a token, which replaces the 17 px and 18 px literals', () => {
    expect(tokens).toMatch(/--text-lead:\s*1\.125rem/)
  })

  it.each([
    ['components.css', components],
    ['base.css', base],
    ['App.css', app],
    ['Header.css', header],
    ['BalanceMeter.css', balanceMeter],
    ['LevelLadder.css', ladder],
    ['StatTile.css', statTile],
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

  it('lets the ride on foot row shrink, so the page does not widen', () => {
    expect(statTileTsx).toContain('className="row__body stat-tile__body"')
    expect(rulesWith(crossSport, '.cross-sport__details')).toMatch(/min-width:\s*0/)
  })
})

describe('balance hero, meter and evidence', () => {
  it('sets the headline as a block, and balances its line', () => {
    expect(rulesWith(balancePage, '.balance-hero__head')).not.toMatch(/flex/)
    expect(rulesWith(balancePage, '.balance-hero__head h1')).toMatch(/text-wrap:\s*balance/)
  })

  it('has no evidence line or card, and keeps one section gap between bands', () => {
    expect(balancePage).not.toMatch(/evidence-line|evidence-card/)
    expect(rulesWith(balancePage, '.balance-page > .band')).toMatch(/margin-top:\s*0;/)
  })

  it('gives the value room under the track, clear of the line, for the number and its range', () => {
    expect(rulesWith(balanceMeter, '.balance-meter__plot')).toMatch(/padding-bottom:\s*3\.5rem/)
    expect(rulesWith(balanceMeter, '.balance-meter__track')).toMatch(/height:\s*1\.5rem/)
    expect(rulesWith(balanceMeter, '.balance-meter__reading')).toMatch(/top:\s*1\.875rem/)
  })

  it('clamps the mark and the value to an edge inside the plot, so each stays whole at either end of the scale', () => {
    expect(rulesWith(balanceMeter, '.balance-meter__plot')).toMatch(/--dot-edge:\s*1px/)
    expect(rulesWith(balanceMeter, '.balance-meter__dot')).toMatch(
      /left:\s*clamp\(var\(--dot-edge\),\s*var\(--at\),\s*calc\(100% - var\(--dot-edge\)\)\)/,
    )
    const reading = rulesWith(balanceMeter, '.balance-meter__reading')
    expect(reading).toMatch(
      /left:\s*clamp\(var\(--edge-left\),\s*var\(--at\),\s*calc\(100% - var\(--edge-right\)\)\)/,
    )
    // The room each side comes from the reading's own characters, so a long range keeps clear of the gutter.
    expect(reading).toMatch(/--edge-left:[^;]*var\(--number-chars[^;]*var\(--range-chars/)
    expect(reading).toMatch(/--edge-right:[^;]*var\(--unit-chars[^;]*var\(--range-chars/)
  })

  it('centres the value with a zero-width anchor and flex, never a transform, which would trap a definition’s fixed sheet on a phone', () => {
    const reading = rulesWith(balanceMeter, '.balance-meter__reading')
    expect(reading).toMatch(/width:\s*0;/)
    expect(reading).toMatch(/align-items:\s*center/)
    for (const selector of [
      '.balance-meter',
      '.balance-meter__plot',
      '.balance-meter__reading',
      '.balance-meter__value',
      '.balance-meter__range',
    ]) {
      expect(rulesWith(balanceMeter, selector), selector).not.toMatch(
        /(^|[;{\s])(transform|filter|backdrop-filter|perspective|contain|will-change|container-type):/,
      )
    }
  })

  it('gives "range" a little room, since it sits against the figures, and prose terms none', () => {
    expect(rulesWith(balanceMeter, '.balance-meter__range .definition__term')).toMatch(
      /margin:\s*-4px 2px 0/,
    )
  })

  it('sets the value in the mono, tabular, with its unit quieter beside it and the range as meta', () => {
    const value = rulesWith(balanceMeter, '.balance-meter__value')
    expect(value).toMatch(/font-family:\s*var\(--font-mono\)/)
    expect(value).toMatch(/tabular-nums/)
    expect(rulesWith(balanceMeter, '.balance-meter__unit')).toMatch(
      /color:\s*var\(--ink-secondary\)/,
    )
    const range = rulesWith(balanceMeter, '.balance-meter__range')
    expect(range).toMatch(/font-size:\s*var\(--text-meta\)/)
    expect(range).toMatch(/text-transform:\s*uppercase/)
  })

  it('draws one ink mark, an upright with no ring, halo or sport colour', () => {
    const mark = rulesWith(balanceMeter, '.balance-meter__dot')
    expect(mark).toMatch(/background:\s*var\(--ink\)/)
    expect(mark).toMatch(/width:\s*2px/)
    expect(balanceMeter).not.toMatch(/box-shadow|balance-meter__band|border-radius/)
  })

  it('gives the held note’s Profile link the control height on a phone', () => {
    const phone = '(max-width: 760px), (pointer: coarse)'
    expect(mediaOf(weightNote, phone)).toMatch(
      /\.weight-note__link \{[^}]*min-height:\s*var\(--control-height\)/,
    )
  })

  it('sets the phone list’s labels once, above the rows, in the same columns as each row', () => {
    const phone = mediaOf(equivalenceCss, '(max-width: 479px)')
    expect(phone).toMatch(/\.equivalence-list__labels \{[^}]*display:\s*grid/)
    // The base columns, above 379 px: the phone's own columns are pinned with its own width.
    const base = outsideMedia(equivalenceCss)
    const columns =
      /grid-template-columns:\s*minmax\(0,\s*1\.2fr\)\s*minmax\(0,\s*0\.75fr\)\s*minmax\(0,\s*1\.25fr\)/
    expect(rulesWith(base, '.equivalence-list__labels')).toMatch(columns)
    expect(rulesWith(base, '.equivalence-list dl')).toMatch(columns)
  })
})

describe('balance tiles', () => {
  it('lists the headline numbers as rows at every width, never a grid of tiles', () => {
    expect(balanceTiles).not.toMatch(/grid-template-columns|@media/)
  })

  it('sets a row’s figure in the mono at the right of its serif title, with its unit smaller', () => {
    expect(statTileTsx).toContain('className="row__title"')
    expect(statTileTsx).toContain('className="row__figure stat-tile__figure"')
    expect(statTileTsx).toContain('className="row__unit stat-tile__unit"')
    expect(statTileTsx).not.toMatch(/className="(tag|display)\b/)
  })
})

describe('sport records', () => {
  it('sets the shared line’s link and count in one flex column that can shrink', () => {
    expect(rulesWith(sportRecords, '.records__source')).toMatch(/display:\s*flex/)
    expect(rulesWith(sportRecords, '.records__source')).toMatch(/min-width:\s*0/)
    expect(rulesWith(sportRecords, '.records__source .records__link')).toMatch(/min-width:\s*0/)
    expect(rulesWith(sportRecords, '.records__source .records__link')).toMatch(/flex:\s*0 1 auto/)
  })

  it('keeps the shared count whole while the link gives way, so it never wraps alone', () => {
    expect(rulesWith(sportRecords, '.records__source > .records__set')).toMatch(/flex:\s*none/)
    expect(rulesWith(sportRecords, '.records__source > .records__set')).toMatch(
      /white-space:\s*nowrap/,
    )
  })

  it('sets every count as quiet text, not as a chip, in the row and on the shared line', () => {
    for (const selector of ['.records__set', '.records__source > .records__set']) {
      expect(rulesWith(sportRecords, selector), selector).not.toMatch(
        /text-transform|background|border|padding/,
      )
    }
    expect(rulesWith(sportRecords, '.records__set')).toMatch(/color:\s*var\(--ink-secondary\)/)
  })
})

describe('header details', () => {
  it('sets Profile as a text link, as History and Activities are, with no outline', () => {
    expect(rulesWith(header, '.header__profile')).not.toMatch(/border|text-transform/)
  })

  it('keeps the wordmark and the account name at every width', () => {
    expect(header).not.toMatch(/max-width:\s*840px|max-width:\s*560px/)
  })

  it('underlines the wordmark on hover, as the brand is a link', () => {
    expect(rulesWith(header, '.header__brand:hover')).toMatch(/text-decoration:\s*underline/)
  })

  it('draws a hairline under the header', () => {
    expect(rulesWith(header, '.header')).toMatch(/border-bottom:\s*1px solid var\(--hairline\)/)
  })

  it('lays the header out as one wrapping row, with the actions pushed to its end', () => {
    expect(rulesWith(header, '.header')).toMatch(/display:\s*flex/)
    expect(rulesWith(header, '.header__actions')).toMatch(/margin-left:\s*auto/)
  })

  it('sets the account trigger as plain text, its name and a caret, with no pill', () => {
    const trigger = rulesWith(accountMenu, '.account-menu__trigger')
    expect(trigger).toMatch(/border:\s*0/)
    expect(trigger).toMatch(/background:\s*none/)
    expect(trigger).toMatch(/font-family:\s*var\(--font-serif\)/)
    expect(accountMenu).not.toMatch(/account-menu__avatar|radius-pill/)
  })

  it('keeps the skip link at rest at the top of the page, hidden by its translate, not under the header', () => {
    const rest = rulesWith(skipLink, '.skip-link')
    expect(rest).toMatch(/top:\s*var\(--space-2\)/)
    expect(rest).not.toMatch(/--header-height/)
    expect(rest).toMatch(/transform:\s*translateY\(-200%\)/)
  })

  it('moves the skip link under the header on focus, and clears its translate there', () => {
    const focus = rulesWith(skipLink, '.skip-link:focus')
    expect(focus).toMatch(/top:\s*calc\(var\(--header-height\) \+ var\(--space-2\)\)/)
    expect(focus).toMatch(/transform:\s*none/)
  })
})

describe('sign-in button', () => {
  it('sets the sign-in button to the width of the pending status, so the header does not move', () => {
    expect(rulesWith(googleSignIn, '.google-sign-in')).toMatch(
      /min-width:\s*min\(11\.75rem, 100%\)/,
    )
    expect(rulesWith(googleSignIn, '.google-sign-in')).toMatch(/justify-content:\s*center/)
  })

  it('lets the pending status take no room on a phone, keeping its words for a screen reader', () => {
    const pending = rulesWith(mediaOf(header, PHONE), '.header__account .account-menu__pending')
    expect(pending).toMatch(/font-size:\s*0/)
    expect(pending).toMatch(/min-width:\s*0/)
    // A box of a pixel, out of the row: the status is still in the page, and the second row keeps its line.
    expect(pending).toMatch(/position:\s*absolute/)
    expect(pending).toMatch(/width:\s*1px/)
    expect(pending).toMatch(/height:\s*1px/)
  })
})

describe('global controls', () => {
  it('draws a button edge in the secondary ink on hover', () => {
    expect(rulesWith(components, '.btn:hover')).toMatch(/border-color:\s*var\(--ink-secondary\)/)
  })

  it('sets the link arrow and the activity back link to their own width, not the full row', () => {
    expect(rulesWith(app, '.link-arrow')).toMatch(/justify-self:\s*start/)
    expect(rulesWith(activityPage, '.activity-page__back')).toMatch(/justify-self:\s*start/)
  })

  it('keeps the primary button fill on hover and press, since its rules come after the generic button rules', () => {
    const at = (selector: string) => components.indexOf(`\n${selector} {`)
    expect(at('.btn-primary:hover')).toBeGreaterThan(at('.btn:hover'))
    expect(at(".btn-primary:active:not([aria-disabled='true'])")).toBeGreaterThan(
      at(".btn:active:not([aria-disabled='true'])"),
    )
  })

  it('keeps the current Pager page filled on hover and press, as its rule outranks the generic button rules', () => {
    expect(rulesWith(pagerCss, ".pager .pager__page[aria-current='page']")).toMatch(
      /background:\s*var\(--highlight\)/,
    )
  })

  it('nudges the link arrow 2 px on hover', () => {
    expect(rulesWith(app, '.link-arrow:hover svg')).toMatch(/translateX\(2px\)/)
  })

  it('draws the primary button in the system highlight in forced colours', () => {
    const forced = rulesWith(mediaOf(components, FORCED), '.btn-primary')
    expect(forced).toMatch(/background:\s*Highlight/)
    expect(forced).toMatch(/color:\s*HighlightText/)
    expect(forced).toMatch(/border-color:\s*Highlight/)
  })

  it('outlines a chip in forced colours, since its fill is dropped there', () => {
    expect(rulesWith(mediaOf(components, FORCED), '.chip')).toMatch(
      /outline:\s*1px solid CanvasText/,
    )
  })

  it('keeps the focus ring on a chip button in forced colours, outside its outline', () => {
    const focus = rulesWith(mediaOf(components, FORCED), '.chip:focus-visible')
    expect(focus).toMatch(/outline:\s*2px solid CanvasText/)
    expect(focus).toMatch(/outline-offset:\s*2px/)
  })

  it('draws the disclosure triangle as a solid shape in forced colours, not as a box of borders', () => {
    const triangle = rulesWith(mediaOf(base, FORCED), 'summary::before')
    expect(triangle).toMatch(/background:\s*CanvasText/)
    expect(triangle).toMatch(/clip-path:\s*polygon\(/)
    expect(triangle).toMatch(/border:\s*0/)
  })
})

describe('footer', () => {
  it('sets every footer link at least 24 px tall, the smallest target WCAG allows', () => {
    expect(rulesWith(outsideMedia(app), '.app__footer a')).toMatch(/min-height:\s*24px/)
  })

  it('sets the footer links as flex boxes at the control height on a finger, so a tap lands on them', () => {
    const finger = mediaOf(app, '(pointer: coarse)')
    expect(rulesWith(finger, '.app__footer a')).toMatch(/display:\s*inline-flex/)
    expect(rulesWith(finger, '.app__footer a')).toMatch(/align-items:\s*center/)
    expect(rulesWith(finger, '.app__footer a')).toMatch(/min-height:\s*var\(--control-height\)/)
  })
})

describe('sport records, on the card and the page', () => {
  it('sets a row’s activity and its count on one line, the count after a dot', () => {
    expect(rulesWith(sportRecords, '.records__source')).toMatch(/flex-wrap:\s*wrap/)
    expect(rulesWith(sportRecords, '.records__dot')).toMatch(/flex:\s*none/)
  })

  it('lets a record’s label wrap rather than widen the row at a large text size', () => {
    expect(rulesWith(sportRecords, '.records__label')).toMatch(/overflow-wrap:\s*anywhere/)
    expect(rulesWith(sportRecords, '.records__figure')).toMatch(/min-width:\s*0/)
  })

  it('keeps every record link at least 24 px tall, for a pointer as for a finger', () => {
    expect(rulesWith(sportRecords, '.records__link')).toMatch(/min-height:\s*24px/)
  })

  it('sets every record link at the body size, as the other inline source links are', () => {
    expect(rulesWith(sportRecords, '.records__link')).toMatch(/font-size:\s*var\(--text-md\)/)
  })

  it('lets the shared line’s link wrap, so the date is never cut short', () => {
    expect(rulesWith(sportRecords, '.records__shared .records__link')).toMatch(
      /white-space:\s*normal/,
    )
    expect(rulesWith(sportRecords, '.records__shared .records__link')).toMatch(
      /overflow:\s*visible/,
    )
  })

  it('sets the threshold title in the serif at --title, over its figure in the mono', () => {
    expect(rulesWith(sportHero, '.sport-hero__title')).toMatch(/font-size:\s*var\(--title\)/)
    expect(sportHero).toMatch(
      /\.sport-hero__unit,\s*\.sport-hero__side\s*\{[^}]*font-family:\s*var\(--font-mono\)/,
    )
  })

  it('sets the sport page’s threshold and level 60 and 40 on a desktop, and stacked below it', () => {
    expect(rulesWith(sportHero, '.sport-hero')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/)
    const desktop = mediaOf(sportHero, '(min-width: 1081px)')
    expect(rulesWith(desktop, '.sport-hero')).toMatch(
      /grid-template-columns:\s*minmax\(0, 3fr\) minmax\(0, 2fr\)/,
    )
  })

  it('pairs two sections 60 and 40 on a desktop only, and uses 1,200 px of it', () => {
    expect(rulesWith(sportPage, '.sport-row')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/)
    expect(rulesWith(mediaOf(sportPage, '(min-width: 1081px)'), '.sport-row--pair')).toMatch(
      /minmax\(0, 3fr\) minmax\(0, 2fr\)/,
    )
    // The width is the shell's, 75rem (1,200 px) on every page, so the sport pages set none of their own.
    expect(rulesWith(components, '.page')).toMatch(/max-width:\s*var\(--page-width\)/)
    expect(sportPage).not.toMatch(/max-width:\s*(1080|1200)px/)
  })

  it('sets “On this page” as one plain line of mono words that wraps and never sticks', () => {
    expect(sectionNav).not.toMatch(/position:\s*sticky|border-radius|overflow-x/)
    expect(rulesWith(sectionNav, '.section-nav__list')).toMatch(/flex-wrap:\s*wrap/)
    expect(rulesWith(sectionNav, '.section-nav__button')).toMatch(
      /font-family:\s*var\(--font-mono\)/,
    )
    expect(rulesWith(sectionNav, '.section-nav__button')).toMatch(/border:\s*0/)
  })

  it('sets a section’s fold as a serif summary with its finding, and no box', () => {
    expect(rulesWith(sectionDisclosure, '.sport-disclosure__title')).toMatch(
      /font-family:\s*var\(--font-serif\)/,
    )
    expect(sectionDisclosure).not.toMatch(/border-radius|background|border:/)
  })

  it('lets a record tile’s link shrink to its tile, so a long activity name wraps whole and never widens a phone', () => {
    const link = rulesWith(recordTiles, '.record-tiles__link')
    expect(link).toMatch(/min-width:\s*0/)
    expect(link).toMatch(/justify-self:\s*stretch/)
    expect(link).toMatch(/flex-wrap:\s*wrap/)
    const name = rulesWith(recordTiles, '.record-tiles__name')
    expect(name).toMatch(/overflow-wrap:\s*anywhere/)
    expect(name).not.toMatch(/text-overflow|white-space:\s*nowrap/)
  })

  it('draws a race bar in the sport’s wash, with its two estimates as triangles above and below', () => {
    expect(rulesWith(racePredictions, '.race-bar__band')).toMatch(
      /background:\s*var\(--sport-wash\)/,
    )
    expect(rulesWith(racePredictions, '.race-bar__mark--above')).toMatch(/clip-path/)
    expect(rulesWith(racePredictions, '.race-bar__mark--below')).toMatch(/clip-path/)
  })

  it('sets the empty sport page’s two actions side by side, wrapping on a narrow phone', () => {
    const actions = rulesWith(sportPage, '.sport-page__actions')
    expect(actions).toMatch(/display:\s*flex/)
    expect(actions).toMatch(/flex-wrap:\s*wrap/)
  })

  it('starts the one-sport empty prompt at the same height as a card heading, with the wider top space', () => {
    expect(rulesWith(emptySportCard, '.empty-sport')).toMatch(/padding-top:\s*var\(--space-5\)/)
  })
})
