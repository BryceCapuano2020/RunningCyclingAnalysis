// Writes the share-preview image and the app icons in public/, and social-card.stamp, the hash of the figures and
// colours the image was drawn from. The figures are the sample athlete's own (scripts/landingFigures.ts) and the
// colours are tokens.css's, so the image moves only when they do; shareMetadata.test.ts fails on a stale stamp.
// Usage: npm run card   (needs the Playwright browser: npx playwright install chromium)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { TRIANGLE_SPORTS, triangleGeometry } from '@rca/core/standing'
import type { Point } from '@rca/core/standing'
import { gapReading } from '../src/ui/components/balanceScale.ts'
import { cardInk, cardStamp } from '../src/ui/landingFigures.ts'
import { triangleAnswer, triangleTitleText } from '../src/ui/pages/triangleCopy.ts'
import { TRIANGLE_TITLE } from '../src/ui/triangleSports.ts'
import type { TriangleView } from '../src/ui/triangleSports.ts'
import { cornerLines } from '../src/share/cardTriangle.ts'
import { computeLandingFigures } from './landingFigures.ts'

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url))
const FONTS = fileURLToPath(new URL('../../../node_modules/@fontsource/', import.meta.url))
const WIDTH = 1200
const HEIGHT = 630

/** The paper colours, read from src/styles/tokens.css so the card reads as the app does. */
const INK = cardInk(readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8'))
const FIGURES = computeLandingFigures()

function font(family: string, file: string, weight: number): string {
  const data = readFileSync(`${FONTS}${family}/files/${file}`).toString('base64')
  return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2')}`
}

/** The sample's triangle as the landing page holds it: run and ride graded, lifting with no grade yet. */
const VIEW: TriangleView = {
  grades: {
    run: { kind: 'graded', grade: FIGURES.grades.run },
    ride: { kind: 'graded', grade: FIGURES.grades.ride },
    lift: { kind: 'gap' },
  },
  notes: {},
}
const ANSWER = triangleAnswer(gapReading(FIGURES.gap), VIEW, undefined)
const TITLE = triangleTitleText(ANSWER.title)

/** The headline in lines of at most `limit` characters, broken at spaces, so it sets at one size left of the triangle. */
function wrap(text: string, limit: number): string[] {
  const lines: string[] = []
  for (const word of text.split(' ')) {
    const last = lines.at(-1)
    if (last !== undefined && `${last} ${word}`.length <= limit)
      lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines
}

/** The triangle's square: its left edge, top edge and side, in px. The corner words hang above and below it. */
const PLOT = { x: 722, y: 198, size: 380 }
const geometry = triangleGeometry(VIEW.grades, PLOT.size)
const at = (point: Point): string =>
  `${(PLOT.x + point.x).toFixed(1)},${(PLOT.y + point.y).toFixed(1)}`
const SPORT_INK = { run: INK.run, ride: INK.ride, lift: INK.lift }
const UNIT = PLOT.size / 300

/** The rings, the axes and the shape through the dots, from the same geometry as the app's figure and its share card. */
function plot(): string {
  const rings = geometry.rings
    .map(
      (ring, order) =>
        `<polygon points="${ring.points.map(at).join(' ')}" fill="none" stroke="${order === 0 ? INK.rule : INK.hairline}" stroke-width="${UNIT}"/>`,
    )
    .join('')
  const axes = TRIANGLE_SPORTS.map((sport) => {
    const corner = geometry.corners[sport]
    const cap =
      corner.cap === null
        ? ''
        : `<polyline points="${corner.cap.map(at).join(' ')}" fill="none" stroke="${INK.control}" stroke-width="${2 * UNIT}" stroke-linecap="round"/>`
    return `<polyline points="${[geometry.centre, corner.tip].map(at).join(' ')}" fill="none" stroke="${corner.dot === null ? INK.hairline : INK.rule}" stroke-width="${UNIT}"/>${cap}`
  }).join('')
  const { points, closed } = geometry.shape
  const shape =
    points.length < 2
      ? ''
      : `<${closed ? 'polygon' : 'polyline'} points="${points.map(at).join(' ')}" fill="${closed ? INK.ink : 'none'}" fill-opacity="0.07" stroke="${INK.ink}" stroke-width="${2 * UNIT}" stroke-linejoin="round" stroke-linecap="round"/>`
  const dots = TRIANGLE_SPORTS.flatMap((sport) => {
    const { dot } = geometry.corners[sport]
    if (dot === null) return []
    const [x, y] = at(dot).split(',')
    return [
      `<circle cx="${x}" cy="${y}" r="${6 * UNIT}" fill="${SPORT_INK[sport]}" stroke="${INK.paper}" stroke-width="${3 * UNIT}"/>`,
    ]
  }).join('')
  return rings + axes + shape + dots
}

/** One corner's three lines: its name in its ink, its percent, then its level or "No grade yet". */
function words(sport: (typeof TRIANGLE_SPORTS)[number]): string {
  const corner = geometry.corners[sport]
  const [first, second] = cornerLines(corner)
  const x = PLOT.x + corner.tip.x
  const top = sport === 'run' ? PLOT.y + corner.tip.y - 10 - 82 : PLOT.y + corner.tip.y + 10
  const name = `<text class="meta" x="${x}" y="${top + 16}" text-anchor="middle" fill="${SPORT_INK[sport]}">${TRIANGLE_TITLE[sport]}</text>`
  const percent =
    corner.percent === null
      ? `<text class="num" x="${x}" y="${top + 48}" text-anchor="middle" fill="${INK.secondary}" font-size="22">${first}</text>`
      : `<text class="num" x="${x}" y="${top + 52}" text-anchor="middle" fill="${INK.ink}" font-size="34" font-weight="500">${first}</text><text class="num" x="${x}" y="${top + 78}" text-anchor="middle" fill="${INK.secondary}" font-size="22">${second}</text>`
  return name + percent
}

function card(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${font('newsreader', 'newsreader-latin-400-normal.woff2', 400)}
${font('newsreader', 'newsreader-latin-500-normal.woff2', 500)}
${font('ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff2', 400)}
${font('ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff2', 500)}
body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;background:${INK.paper};font-family:'newsreader',serif;font-weight:400}
svg{display:block}
.num{font-family:'ibm-plex-mono',monospace}
.meta{font-family:'ibm-plex-mono',monospace;font-size:15px;letter-spacing:1.8px;text-transform:uppercase}
</style></head><body>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${INK.paper}"/>
  <text x="72" y="96" fill="${INK.ink}" font-size="32" font-weight="500">Running Cycling Analysis</text>
  <text class="meta" x="1128" y="94" text-anchor="end" fill="${INK.secondary}">Sample athlete</text>
  <rect x="72" y="120" width="1056" height="2" fill="${INK.rule}"/>
  <g fill="${INK.ink}" font-size="68" font-weight="500">
    ${wrap(TITLE, 18)
      .map((line, row) => `<text x="72" y="${270 + row * 74}">${line}</text>`)
      .join('')}
  </g>
  <text fill="${INK.secondary}" font-size="28" x="72" y="${270 + wrap(TITLE, 18).length * 74 + 12}">${ANSWER.line ?? ''}</text>
  ${plot()}
  ${TRIANGLE_SPORTS.map(words).join('')}
</svg></body></html>`
}

/** The favicon's drawing as a square icon at a size, with its own rounded tile. */
function icon(size: number): string {
  const svg = readFileSync(`${PUBLIC}favicon.svg`, 'utf8')
  return `<!doctype html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
  await page.setContent(card())
  await page.evaluate(() => document.fonts.ready)
  writeFileSync(
    `${PUBLIC}social-card.png`,
    await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } }),
  )
  writeFileSync(`${PUBLIC}social-card.stamp`, `${cardStamp(FIGURES, INK)}\n`)
  for (const [file, size] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['apple-touch-icon.png', 180],
  ] as const) {
    const iconPage = await browser.newPage({ viewport: { width: size, height: size } })
    await iconPage.setContent(icon(size))
    writeFileSync(`${PUBLIC}${file}`, await iconPage.screenshot({ omitBackground: true }))
    await iconPage.close()
  }
} finally {
  await browser.close()
}
