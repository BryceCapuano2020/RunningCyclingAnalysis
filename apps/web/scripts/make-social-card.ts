// Writes the share-preview image and the app icons in public/, and social-card.stamp, the hash of the figures and
// colours the image was drawn from. The figures are the sample athlete's own (scripts/landingFigures.ts) and the
// colours are tokens.css's, so the image moves only when they do; shareMetadata.test.ts fails on a stale stamp.
// Usage: npm run card   (needs the Playwright browser: npx playwright install chromium)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { formatGrade } from '../src/ui/gradeFormat.ts'
import { gapReading, meterFraction } from '../src/ui/components/balanceScale.ts'
import { RANGE_WORD, meterRange, meterValue } from '../src/ui/components/meterReading.ts'
import type { SportGrade } from '../src/ui/grades.ts'
import { cardInk, cardStamp } from '../src/ui/landingFigures.ts'
import { BALANCE_PAIR, SPORT_TITLE } from '../src/ui/sports.ts'
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

/** The meter's plot: the app's own reading of the sample's gap, so the image cannot differ from Balance. */
const READING = gapReading(FIGURES.gap)
const PLOT = { x: 720, width: 408 }
const TRACK_Y = 300
const markX = PLOT.x + meterFraction(READING.lead.centre) * PLOT.width
const VALUE = meterValue(READING)
const RANGE = meterRange(READING)

/** One sport's level on the line under the meter: its name, its grade in mono, its level. */
function level(x: number, sport: 'run' | 'ride', grade: SportGrade): string {
  return `<text x="${x}" y="588" fill="${INK.ink}" font-size="30">${SPORT_TITLE[sport]} <tspan class="num" font-size="26">${formatGrade(grade.centre.grade)}</tspan> <tspan fill="${INK.secondary}">${grade.centre.level}</tspan></text>`
}

function card(): string {
  const [left, right] = BALANCE_PAIR
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
  <rect x="72" y="120" width="1056" height="2" fill="${INK.rule}"/>
  <g fill="${INK.ink}" font-size="80" font-weight="500">
    <text x="72" y="236">Are you a better</text>
    <text x="72" y="320">runner or a</text>
    <text x="72" y="404">better cyclist?</text>
  </g>
  <g fill="${INK.secondary}" font-size="28">
    <text x="72" y="480">Your level in each sport for your age.</text>
  </g>
  <text class="meta" x="${PLOT.x + PLOT.width}" y="172" text-anchor="end" fill="${INK.secondary}">Sample athlete</text>
  <text class="meta" x="${PLOT.x}" y="262" fill="${INK.run}">${SPORT_TITLE[left]}</text>
  <text class="meta" x="${PLOT.x + PLOT.width}" y="262" text-anchor="end" fill="${INK.ride}">${SPORT_TITLE[right]}</text>
  <rect x="${PLOT.x}" y="${TRACK_Y - 1.5}" width="${PLOT.width}" height="3" fill="${INK.hairline}"/>
  <rect x="${PLOT.x}" y="${TRACK_Y - 14}" width="3" height="28" fill="${INK.run}"/>
  <rect x="${PLOT.x + PLOT.width - 3}" y="${TRACK_Y - 14}" width="3" height="28" fill="${INK.ride}"/>
  <rect x="${PLOT.x + PLOT.width / 2 - 1.5}" y="${TRACK_Y - 14}" width="3" height="28" fill="${INK.secondary}"/>
  <rect x="${markX - 2}" y="${TRACK_Y - 28}" width="4" height="56" fill="${INK.ink}"/>
  <text class="num" x="${markX}" y="${TRACK_Y + 94}" fill="${INK.ink}" font-size="64" font-weight="500" text-anchor="middle">${VALUE.number}<tspan font-size="24" font-weight="400" fill="${INK.secondary}" dx="10">${VALUE.unit}</tspan></text>
  ${RANGE === null ? '' : `<text class="meta" x="${markX}" y="${TRACK_Y + 132}" text-anchor="middle" fill="${INK.secondary}">${RANGE_WORD} ${RANGE}</text>`}
  <rect x="72" y="540" width="1056" height="2" fill="${INK.rule}"/>
  ${level(72, 'run', FIGURES.grades.run)}
  ${level(420, 'ride', FIGURES.grades.ride)}
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
