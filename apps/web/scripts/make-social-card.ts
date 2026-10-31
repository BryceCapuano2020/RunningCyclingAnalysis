// Writes the share-preview image and the app icons in public/. Output is drawn from the landing
// example's numbers, which are the sample athlete's own, so it moves only when they do.
// Usage: npx tsx scripts/make-social-card.ts   (needs the Playwright browser: npx playwright install chromium)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { formatGrade } from '../src/ui/gradeFormat.ts'
import { LANDING_EXAMPLE } from '../src/ui/landingExample.ts'
import { SPORT_NOUN } from '../src/ui/sports.ts'

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url))
const FONTS = fileURLToPath(new URL('../../../node_modules/@fontsource/', import.meta.url))
const WIDTH = 1200
const HEIGHT = 630

/** The dark theme's own colours (src/styles/tokens.css), so the card reads as the app does. */
const INK = {
  surface0: '#0f1115',
  surface1: '#171a20',
  border: '#2a2f38',
  text: '#eef0f3',
  secondary: '#b6bcc6',
  muted: '#8d95a2',
  run: '#f56333',
  ride: '#4d6ef5',
  brand: '#c8f03c',
}

/** The level ladder's scale: age grade from 30% to 100%, with the band edges the app draws. */
const SCALE = { from: 0.3, to: 1 }
const BANDS = [
  { name: 'Recreational', from: 0.3, to: 0.6, fill: '#232830' },
  { name: 'Local', from: 0.6, to: 0.7, fill: '#2b313b' },
  { name: 'Regional', from: 0.7, to: 0.8, fill: '#333a47' },
  { name: 'National', from: 0.8, to: 0.9, fill: '#3b4352' },
  { name: 'World', from: 0.9, to: 1, fill: '#454e61' },
]

function font(family: string, file: string, weight: number): string {
  const data = readFileSync(`${FONTS}${family}/files/${file}`).toString('base64')
  return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2')}`
}

const PANEL = { x: 712, y: 64, width: 424, height: 502 }
/** The top of each sport's row in the panel. */
const RUN_TOP = PANEL.y + 230
const RIDE_TOP = PANEL.y + 336
const LADDER = { x: PANEL.x + 32, width: PANEL.width - 64 }
const at = (grade: number) =>
  LADDER.x + ((grade - SCALE.from) / (SCALE.to - SCALE.from)) * LADDER.width

function ladder(top: number, label: string, colour: string, draw: string): string {
  const bands = BANDS.map(
    (band) =>
      `<rect x="${at(band.from)}" y="${top + 34}" width="${at(band.to) - at(band.from)}" height="44" fill="${band.fill}"/>`,
  ).join('')
  // The band edges, as the percentages the ladder prints, below the band.
  const edges = BANDS.slice(1)
    .map(
      (band) =>
        `<text x="${at(band.from)}" y="${top + 98}" text-anchor="middle" fill="${INK.muted}" font-size="15" font-weight="500">${Math.round(band.from * 100)}%</text>`,
    )
    .join('')
  return `<text x="${LADDER.x}" y="${top + 16}" fill="${colour}" font-size="25" font-weight="600">${label}</text>${bands}${edges}${draw}`
}

function card(): string {
  const run = LANDING_EXAMPLE.grades.run
  const ride = LANDING_EXAMPLE.grades.ride
  const lead = LANDING_EXAMPLE.gap
  const rideRange = ride.range!
  // The range is signed toward running; the card states it from the side the balance leans to.
  const leanRange =
    lead.lean === 'ride' ? { from: -lead.high, to: -lead.low } : { from: lead.low, to: lead.high }
  const runDot = `<circle cx="${at(run.centre.grade)}" cy="${RUN_TOP + 56}" r="14" fill="${INK.run}" stroke="${INK.surface1}" stroke-width="4"/>`
  const rideBand = `<rect x="${at(rideRange.low.grade)}" y="${RIDE_TOP + 44}" width="${at(rideRange.high.grade) - at(rideRange.low.grade)}" height="24" rx="12" fill="${INK.ride}" fill-opacity="0.35" stroke="${INK.ride}" stroke-width="2"/>`
  const rideRing = `<circle cx="${at(ride.centre.grade)}" cy="${RIDE_TOP + 56}" r="14" fill="${INK.surface1}" stroke="${INK.ride}" stroke-width="5"/>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${font('barlow-condensed', 'barlow-condensed-latin-800-normal.woff2', 800)}
${font('barlow', 'barlow-latin-500-normal.woff2', 500)}
${font('barlow', 'barlow-latin-600-normal.woff2', 600)}
body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;background:${INK.surface0};font-family:'barlow',sans-serif}
svg{display:block}
.display{font-family:'barlow-condensed',sans-serif;font-weight:800}
</style></head><body>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${INK.surface0}"/>
  <g transform="translate(64 64)">
    <svg width="44" height="44" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0e1116" stroke="#6b7380" stroke-width="0.8"/><path d="M5 22c5-1 8-5 11-9s6-6 11-6" fill="none" stroke="${INK.run}" stroke-width="3" stroke-linecap="round"/><path d="M5 12c5 0 8 3 11 6s6 6 11 6" fill="none" stroke="${INK.ride}" stroke-width="3" stroke-linecap="round"/></svg>
    <text class="display" x="60" y="33" fill="${INK.text}" font-size="30" letter-spacing="2.4">RUNNING CYCLING ANALYSIS</text>
  </g>
  <g class="display" fill="${INK.text}" font-size="84" letter-spacing="0.5">
    <text x="64" y="226">ARE YOU A BETTER</text>
    <text x="64" y="304"><tspan fill="${INK.run}">RUNNER</tspan> OR A</text>
    <text x="64" y="382">BETTER <tspan fill="${INK.ride}">CYCLIST</tspan>?</text>
  </g>
  <g fill="${INK.secondary}" font-size="28" font-weight="500">
    <text x="64" y="470">Your level in each sport for your age,</text>
    <text x="64" y="506">with honest ranges. Nothing leaves your device.</text>
  </g>
  <rect x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.width}" height="${PANEL.height}" rx="16" fill="${INK.surface1}" stroke="${INK.border}" stroke-width="2"/>
  <text class="display" x="${LADDER.x}" y="${PANEL.y + 54}" fill="${INK.muted}" font-size="20" letter-spacing="1.6">SAMPLE ATHLETE</text>
  <text class="display" x="${LADDER.x}" y="${PANEL.y + 168}" fill="${INK.text}" font-size="132">+${Math.abs(Math.round(lead.centre))}</text>
  <text class="display" x="${LADDER.x + 150}" y="${PANEL.y + 128}" fill="${INK.secondary}" font-size="24" letter-spacing="1.9">PTS TOWARD ${SPORT_NOUN[lead.lean].toUpperCase()}</text>
  <text x="${LADDER.x + 150}" y="${PANEL.y + 160}" fill="${INK.muted}" font-size="23" font-weight="500">range ${leanRange.from} to ${leanRange.to} points</text>
  ${ladder(RUN_TOP, `Run · ${run.centre.level} · ${formatGrade(run.centre.grade)}`, INK.run, runDot)}
  ${ladder(RIDE_TOP, `Ride · ${ride.centre.level} · ${formatGrade(ride.centre.grade)}`, INK.ride, rideBand + rideRing)}
  <g fill="${INK.muted}" font-size="17" font-weight="500">
    <text x="${LADDER.x}" y="${PANEL.y + 462}">Solid dot: recorded.</text>
    <text x="${LADDER.x}" y="${PANEL.y + 486}">Ring and band: estimated, with its 90% range.</text>
  </g>
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
