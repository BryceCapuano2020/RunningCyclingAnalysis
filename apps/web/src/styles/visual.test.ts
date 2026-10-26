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
const pagerCss = await read('../ui/components/Pager.css')
const methodPage = await read('../ui/pages/MethodPage.css')
const skipLink = await read('../ui/components/SkipLink.css')
const exportGuides = await read('../ui/components/ExportGuides.css')
const privacyCss = await read('../../public/privacy.css')
const icons = await read('../ui/components/icons.tsx')
const iconsCss = await read('../ui/components/icons.css')
const balanceMeterTsx = await read('../ui/components/BalanceMeter.tsx')
const ladderTsx = await read('../ui/components/LevelLadder.tsx')
const sportRecords = await read('../ui/components/SportRecords.css')
const googleSignIn = await read('../ui/components/GoogleSignInButton.css')
const emptySportCard = await read('../ui/pages/EmptySportCard.css')
const balanceStrip = await read('../ui/pages/BalanceStrip.css')
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

  it('sets the current tab in the system text colour in forced colours, as its neighbours are', () => {
    // The current tab's own rule is more specific than the tab's, so forced colours must name it too.
    expect(rulesWith(mediaOf(header, FORCED), ".header__tab[aria-current='page']")).toMatch(
      /color:\s*CanvasText/,
    )
  })

  it('sets the wordmark in capitals, in the tab type', () => {
    expect(rulesWith(header, '.header__name')).toMatch(/text-transform:\s*uppercase/)
  })

  it('keeps the phone wordmark small enough that the brand and actions share one row at 600 and 760 px', () => {
    expect(rulesWith(mediaOf(header, PHONE), '.header__name')).toMatch(
      /font-size:\s*var\(--text-lead\)/,
    )
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

  it('draws both sport strokes at 4 px, so the crossing reads at 32 px', () => {
    expect(icons).toMatch(/brand-mark__run"[\s\S]*?strokeWidth="4"/)
    expect(icons).toMatch(/brand-mark__ride"[\s\S]*?strokeWidth="4"/)
    expect(icons).not.toMatch(/brand-mark__(run|ride)"[\s\S]*?strokeWidth="3"/)
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

  it('draws a pressed button one pixel lower, in its pressed fill', () => {
    const pressed = rulesWith(components, ".btn:active:not([aria-disabled='true'])")
    expect(pressed).toMatch(/background:\s*var\(--surface-pressed\)/)
    expect(pressed).toMatch(/transform:\s*translateY\(1px\)/)
    expect(pressed).toMatch(/box-shadow:\s*inset 0 0 0 2px var\(--control-border\)/)
  })

  it('draws a pressed primary button in its own pressed fill, after its hover', () => {
    const pressed = rulesWith(components, ".btn-primary:active:not([aria-disabled='true'])")
    expect(pressed).toMatch(/background:\s*var\(--accent-pressed\)/)
    expect(pressed).toMatch(/border-color:\s*var\(--accent-pressed\)/)
    expect(pressed).toMatch(/box-shadow:\s*inset 0 0 0 2px var\(--accent-contrast\)/)
    expect(components.indexOf('.btn-primary:active')).toBeGreaterThan(
      components.indexOf('.btn-primary:hover'),
    )
  })

  it('sets the pressed fills to the values in DESIGN.md, in both schemes', () => {
    expect(declared(tokens, ':root').get('surface-pressed')).toBe('#dde2ea')
    expect(declared(tokens, DARK).get('surface-pressed')).toBe('#101318')
    expect(declared(tokens, ':root').get('accent-pressed')).toBe('#000000')
    expect(declared(tokens, DARK).get('accent-pressed')).toBe('#8fb81c')
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
    expect(declared(tokens, DARK).get('accent-hover')).toBe('#a9d62c')
    expect(declared(tokens, ':root').get('mark-ring')).toBe('#0e1116')
    expect(declared(tokens, DARK).get('mark-ring')).toBe('#6b7380')
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
  it('keeps the meter track and band edged in the system colours', () => {
    const forced = mediaOf(balanceMeter, FORCED)
    expect(rulesWith(forced, '.balance-meter__track')).toMatch(/border-color:\s*CanvasText/)
    expect(rulesWith(forced, '.balance-meter__band')).toMatch(/border-color:\s*Highlight/)
  })

  it('keeps the level ladder track, current band and chevrons in the system colours', () => {
    const forced = mediaOf(ladder, FORCED)
    expect(rulesWith(forced, '.level-ladder__track')).toMatch(/border-color:\s*CanvasText/)
    expect(rulesWith(forced, '.level-ladder__band--current')).toMatch(/background:\s*Highlight/)
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
  it('draws a pressed tab in the pressed fill, with an inset outline and no inset shadow', () => {
    const pressed = rulesWith(header, '.header__tab:active')
    expect(pressed).toMatch(/background:\s*var\(--surface-pressed\)/)
    expect(pressed).toMatch(/outline:\s*2px solid var\(--control-border\)/)
    expect(pressed).toMatch(/outline-offset:\s*-2px/)
  })

  it('draws a pressed unselected segment in the pressed fill, and a pressed selected one with a light ring', () => {
    const unselected = rulesWith(
      segmented,
      '.segmented-control__option:not(.segmented-control__option--selected):active',
    )
    expect(unselected).toMatch(/background:\s*var\(--surface-pressed\)/)
    expect(unselected).toMatch(/box-shadow:\s*inset 0 0 0 2px var\(--control-border\)/)
    expect(rulesWith(segmented, '.segmented-control__option--selected:active')).toMatch(
      /box-shadow:\s*inset 0 0 0 2px var\(--selected-contrast\)/,
    )
  })

  it('gives each pressed control an outline in forced colours, since its fill and shadow are dropped', () => {
    expect(
      rulesWith(mediaOf(components, FORCED), ".btn:active:not([aria-disabled='true'])"),
    ).toMatch(/outline:\s*2px solid CanvasText/)
    expect(rulesWith(mediaOf(header, FORCED), '.header__tab:active')).toMatch(
      /outline:\s*2px solid CanvasText/,
    )
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
    expect(tokens).toMatch(/--text-md:\s*1rem/)
    expect(tokens).toMatch(/--text-label:\s*0\.9375rem/)
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

describe('balance hero, meter and evidence', () => {
  it('stacks the share button under the lede, so the headline is a block, and balances its line', () => {
    expect(rulesWith(balancePage, '.balance-hero__head')).not.toMatch(/flex/)
    expect(rulesWith(balancePage, '.balance-hero__head h1')).toMatch(/text-wrap:\s*balance/)
  })

  it('gives the quiet evidence card a gap between its chip, sentence and link', () => {
    const quiet = rulesWith(balancePage, '.balance__cards .evidence-card--quiet')
    expect(quiet).toMatch(/display:\s*grid/)
    expect(quiet).toMatch(/gap:\s*var\(--space-2\)/)
    expect(quiet).toMatch(/justify-items:\s*start/)
  })

  it('takes the card heading’s paragraph up to the heading', () => {
    expect(rulesWith(balancePage, '.balance__cards .card > h2 + p')).toMatch(/margin-top:\s*0/)
  })

  it('insets the cross-sport idea past a boxed card’s border, only where the cards sit side by side', () => {
    expect(
      rulesWith(
        mediaOf(balancePage, '(min-width: 45.5rem)'),
        '.balance__cards > .card + .cross-sport',
      ),
    ).toMatch(/padding-inline:\s*calc\(var\(--space-5\) \+ 1px\)/)
    expect(rulesWith(outsideMedia(balancePage), '.balance__cards > .card + .cross-sport')).toBe('')
  })

  it('gives the meter’s value flag room above the track, clear of the even line', () => {
    expect(rulesWith(balanceMeter, '.balance-meter__plot')).toMatch(/padding-top:\s*1\.75rem/)
  })

  it('sets the meter ticks a step below the track', () => {
    expect(rulesWith(balanceMeter, '.balance-meter__ticks')).toMatch(
      /margin-top:\s*var\(--space-1\)/,
    )
  })

  it('clamps the flag and the dot to one edge inside the plot, so they stay centred together', () => {
    expect(rulesWith(balanceMeter, '.balance-meter__plot')).toMatch(/--meter-edge:\s*2rem/)
    const clamp =
      /left:\s*clamp\(var\(--meter-edge\),\s*var\(--at\),\s*calc\(100% - var\(--meter-edge\)\)\)/
    expect(rulesWith(balanceMeter, '.balance-meter__flag')).toMatch(clamp)
    expect(rulesWith(balanceMeter, '.balance-meter__dot')).toMatch(clamp)
  })

  it('draws the dot in the system text colour in forced colours, past the sport colour rule', () => {
    const forced = mediaOf(balanceMeter, FORCED)
    for (const selector of [
      '.balance-meter--run .balance-meter__dot',
      '.balance-meter--ride .balance-meter__dot',
    ]) {
      expect(rulesWith(forced, selector), selector).toMatch(/background:\s*CanvasText/)
      // Forced colours drop box-shadow, so the ring is an outline, which they keep.
      expect(rulesWith(forced, selector), selector).toMatch(/outline:\s*2px solid Canvas/)
      expect(rulesWith(forced, selector), selector).toMatch(/outline-offset:\s*0/)
      expect(rulesWith(forced, selector), selector).not.toMatch(/box-shadow/)
    }
  })

  it('keeps each grade on the phone strip in the secondary colour, at the body weight', () => {
    expect(rulesWith(balanceStrip, '.balance-strip')).toMatch(/font-weight:\s*400/)
    expect(rulesWith(balanceStrip, '.balance-strip')).toMatch(/color:\s*var\(--text-secondary\)/)
    expect(rulesWith(balanceStrip, '.balance-strip__sport')).toMatch(/white-space:\s*nowrap/)
  })

  it('gives the held note’s Profile link and the Set on link the control height on a phone', () => {
    const phone = '(max-width: 760px), (pointer: coarse)'
    expect(mediaOf(weightNote, phone)).toMatch(
      /\.weight-note__link \{[^}]*min-height:\s*var\(--control-height\)/,
    )
    expect(mediaOf(crossSport, phone)).toMatch(
      /\.cross-sport__link \{[^}]*min-height:\s*var\(--control-height\)/,
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

describe('balance sport cards', () => {
  it('stretches the sport cards to one height, so their links sit on one line at the foot', () => {
    expect(rulesWith(balancePage, '.balance__sports')).toMatch(/align-items:\s*stretch/)
    expect(rulesWith(balancePage, '.balance__cards')).toMatch(/align-items:\s*start/)
  })

  it('lets a sport card fill its height, with its link pushed to the foot', () => {
    expect(rulesWith(sportCard, '.sport-card')).toMatch(/align-content:\s*normal/)
    expect(rulesWith(sportCard, '.sport-card')).not.toMatch(/align-content:\s*start/)
    expect(rulesWith(sportCard, '.sport-card > .link-arrow')).toMatch(/margin-top:\s*auto/)
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
    expect(rulesWith(sportRecords, '.records__set')).toMatch(/color:\s*var\(--text-muted\)/)
  })
})

describe('header details', () => {
  it('sets the phone tab focus ring inside the tab bar, which would otherwise clip it', () => {
    expect(rulesWith(mediaOf(header, PHONE), '.header__tab:focus-visible')).toMatch(
      /outline-offset:\s*-4px/,
    )
  })

  it('sets the first wide tab flush with the brand, so its glyph lines up under the wordmark', () => {
    expect(rulesWith(mediaOf(header, '(min-width: 761px)'), '.header__tab:first-child')).toMatch(
      /padding-left:\s*0/,
    )
  })

  it('sets Profile in sentence case, keeping its outline', () => {
    expect(rulesWith(header, '.header__profile')).toMatch(/text-transform:\s*none/)
    expect(rulesWith(header, '.header__profile')).toMatch(
      /border:\s*1px solid var\(--control-border\)/,
    )
  })

  it('draws the tab labels in the system text colour in forced colours', () => {
    expect(rulesWith(mediaOf(header, FORCED), '.header__tab')).toMatch(/color:\s*CanvasText/)
  })

  it('hides the wordmark from 840 px down, and the account name only from 560 px down', () => {
    expect(rulesWith(mediaOf(header, '(max-width: 840px)'), '.header__name')).toMatch(
      /position:\s*absolute/,
    )
    expect(
      rulesWith(mediaOf(header, '(max-width: 560px)'), '.header__account .account-menu__name'),
    ).toMatch(/position:\s*absolute/)
  })

  it('underlines the wordmark on hover, as the brand is a link', () => {
    expect(rulesWith(header, '.header__brand:hover .header__name')).toMatch(
      /text-decoration:\s*underline/,
    )
  })

  it('pads the foot of the phone header, so its row clears the border below it', () => {
    expect(rulesWith(mediaOf(header, PHONE), '.header')).toMatch(
      /padding-bottom:\s*var\(--space-2\)/,
    )
  })

  it('draws a wide header with no tabs as one row, so no empty gap sits under it', () => {
    expect(rulesWith(header, '.header:not(:has(.header__tabs))')).toMatch(
      /grid-template-areas:\s*'brand actions'/,
    )
  })

  it('presses Profile as a tab does, with the pressed fill and an inset outline', () => {
    const pressed = rulesWith(header, '.header__profile:active')
    expect(pressed).toMatch(/background:\s*var\(--surface-pressed\)/)
    expect(pressed).toMatch(/outline:\s*2px solid var\(--control-border\)/)
    expect(pressed).toMatch(/outline-offset:\s*-2px/)
    expect(rulesWith(mediaOf(header, FORCED), '.header__profile:active')).toMatch(
      /outline:\s*2px solid CanvasText/,
    )
  })

  it('presses the account trigger as a button does, with the pressed fill and a pixel drop', () => {
    const pressed = rulesWith(accountMenu, '.account-menu__trigger:active')
    expect(pressed).toMatch(/background:\s*var\(--surface-pressed\)/)
    expect(pressed).toMatch(/transform:\s*translateY\(1px\)/)
    expect(rulesWith(mediaOf(accountMenu, FORCED), '.account-menu__trigger:active')).toMatch(
      /outline:\s*2px solid CanvasText/,
    )
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
    expect(rulesWith(googleSignIn, '.google-sign-in')).toMatch(/min-width:\s*11\.75rem/)
    expect(rulesWith(googleSignIn, '.google-sign-in')).toMatch(/justify-content:\s*center/)
  })

  it('lets the compact phone sign-in shrink to the control height, past that minimum', () => {
    expect(rulesWith(mediaOf(header, PHONE), '.header__account .google-sign-in')).toMatch(
      /min-width:\s*0/,
    )
  })
})

describe('global controls', () => {
  it('draws a button edge in the secondary text colour on hover', () => {
    expect(rulesWith(components, '.btn:hover')).toMatch(/border-color:\s*var\(--text-secondary\)/)
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
      /background:\s*var\(--selected\)/,
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
  it('sets a row’s activity and its count on one line in the second column, the count after a dot', () => {
    expect(rulesWith(sportRecords, '.records__row > .records__source')).toMatch(/grid-column:\s*2/)
    expect(rulesWith(sportRecords, '.records__source > .records__set')).toMatch(
      /margin-left:\s*var\(--space-1\)/,
    )
  })

  it('gives the label column 6rem, so "Half marathon" fits beside its figure', () => {
    expect(rulesWith(sportRecords, '.records__row')).toMatch(
      /grid-template-columns:\s*6rem minmax\(0, 1fr\)/,
    )
  })

  it('keeps every record link at least 24 px tall, for a pointer as for a finger', () => {
    expect(rulesWith(sportRecords, '.records__link')).toMatch(/min-height:\s*24px/)
  })

  it('lets the shared line’s link wrap, so the date is never cut short', () => {
    expect(rulesWith(sportRecords, '.records__shared .records__link')).toMatch(
      /white-space:\s*normal/,
    )
    expect(rulesWith(sportRecords, '.records__shared .records__link')).toMatch(
      /overflow:\s*visible/,
    )
  })

  it('sets the sub-line on the numeral’s baseline, beside it, and not indented below', () => {
    const hero = rulesWith(sportCard, '.sport-card__hero > p:has(.hero-number)')
    expect(hero).toMatch(/display:\s*flex/)
    expect(hero).toMatch(/align-items:\s*baseline/)
    expect(hero).toMatch(/column-gap:\s*var\(--space-3\)/)
    expect(rulesWith(sportCard, '.sport-card__sub')).toMatch(/margin-left:\s*0/)
  })

  it('sets the best efforts summary as a label, in the eyebrow’s display face and caps', () => {
    const summary = rulesWith(sportCard, '.sport-card summary')
    expect(summary).toMatch(/font-family:\s*var\(--font-display\)/)
    expect(summary).toMatch(/font-weight:\s*700/)
    expect(summary).toMatch(/font-size:\s*var\(--text-sm\)/)
    expect(summary).toMatch(/text-transform:\s*uppercase/)
    expect(summary).toMatch(/letter-spacing:\s*var\(--tracking-caps\)/)
  })

  it('sets a gap above the shared line on the Balance card, so it reads apart from the rows', () => {
    expect(rulesWith(sportCard, '.sport-card__records > .records__shared')).toMatch(
      /margin-top:\s*var\(--space-3\)/,
    )
  })

  it('sets the threshold heading on the eyebrow’s line, and keeps the heading’s own display face', () => {
    const threshold = rulesWith(sportPage, '.sport-page__threshold')
    expect(threshold).not.toMatch(/font-family/)
    expect(threshold).toMatch(/line-height:\s*1\.5/)
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
