import { describe, expect, it } from 'vitest'
import { LANDING_EXAMPLE } from './ui/landingExample'
import { SPORT_NOUN } from './ui/sports'
import { readStylesheet } from './ui/components/stylesheet'

/*
 * The page's share metadata, its manifest and its 404 page, read from the files that carry them.
 * The e2e-worker suite checks the same files as the running Worker serves them.
 */
const index = await readStylesheet(import.meta.url, '../index.html')
const wrangler = await readStylesheet(import.meta.url, '../../api/wrangler.toml')
const wranglerLocal = await readStylesheet(import.meta.url, '../../api/wrangler.local.toml')
const manifestText = await readStylesheet(import.meta.url, '../public/manifest.webmanifest')
const notFound = await readStylesheet(import.meta.url, '../public/404.html')
const headers = await readStylesheet(import.meta.url, '../public/_headers')

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** The bytes of a file in apps/web/public. The module name is a variable so the browser build never resolves it. */
async function publicFile(name: string): Promise<Uint8Array> {
  const specifier = 'node:fs'
  const fs = (await import(/* @vite-ignore */ specifier)) as {
    readFileSync: (path: URL) => Uint8Array
  }
  return new Uint8Array(fs.readFileSync(new URL(`../public/${name}`, import.meta.url)))
}

/** The width and height a PNG's header states. */
function pngSize(bytes: Uint8Array): [number, number] {
  expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_SIGNATURE)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return [view.getUint32(16), view.getUint32(20)]
}

/** The content of the first meta tag with this attribute value, or the link's href. */
function metaContent(attribute: 'name' | 'property', value: string): string | undefined {
  const tag = new RegExp(`<meta\\s+${attribute}="${value}"[^>]*?content="([^"]*)"`, 's').exec(index)
  return tag?.[1]
}

const APP_URL = /^APP_URL = "(.+)"$/m.exec(wrangler)?.[1] ?? ''

describe('share metadata in index.html', () => {
  it('names the page with the hero’s own question, for Open Graph and Twitter alike', () => {
    const title = 'Are you a better runner or a better cyclist?'
    expect(metaContent('property', 'og:title')).toBe(title)
    expect(metaContent('name', 'twitter:title')).toBe(title)
    expect(metaContent('property', 'og:type')).toBe('website')
    expect(metaContent('name', 'twitter:card')).toBe('summary_large_image')
    expect(metaContent('property', 'og:description')).toBe(
      metaContent('name', 'twitter:description'),
    )
    expect(metaContent('property', 'og:description')).toMatch(/Nothing leaves your device\.$/)
  })

  it('points the canonical link, the URL and the image at the origin the Worker serves from', () => {
    expect(APP_URL).toMatch(/^https:\/\//)
    expect(index).toContain(`<link rel="canonical" href="${APP_URL}/" />`)
    expect(metaContent('property', 'og:url')).toBe(`${APP_URL}/`)
    expect(metaContent('property', 'og:image')).toBe(`${APP_URL}/social-card.png`)
    expect(metaContent('name', 'twitter:image')).toBe(`${APP_URL}/social-card.png`)
  })

  it('describes the image with the figures it shows, which are the landing example’s', () => {
    const { grades, gap } = LANDING_EXAMPLE
    const alt = `A sample athlete's result: running at ${grades.run.centre.level} level, cycling at ${grades.ride.centre.level}, balance leaning ${Math.abs(gap.centre)} points toward ${SPORT_NOUN[gap.lean]}.`
    expect(metaContent('property', 'og:image:alt')).toBe(alt)
    expect(metaContent('name', 'twitter:image:alt')).toBe(alt)
  })

  it('sets a theme colour for each colour scheme, matching the page’s own surface', () => {
    expect(index).toMatch(
      /<meta name="theme-color" content="#f5f6f8" media="\(prefers-color-scheme: light\)"/,
    )
    expect(index).toMatch(
      /<meta name="theme-color" content="#0f1115" media="\(prefers-color-scheme: dark\)"/,
    )
  })

  it('links the manifest and the touch icon, from files that exist', async () => {
    expect(index).toContain('<link rel="manifest" href="./manifest.webmanifest" />')
    expect(index).toContain('<link rel="apple-touch-icon" href="./apple-touch-icon.png" />')
    expect(pngSize(await publicFile('apple-touch-icon.png'))).toEqual([180, 180])
  })

  it('serves nothing that the Content-Security-Policy would block: no inline script, no remote asset', () => {
    expect(index).not.toMatch(/<script(?![^>]*\bsrc=)/)
    const csp = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1] ?? ''
    expect(csp).toContain("default-src 'self'")
  })
})

describe('the share image', () => {
  it('is 1200 by 630, the size the metadata states, and light enough to be fetched by any crawler', async () => {
    const bytes = await publicFile('social-card.png')
    expect(pngSize(bytes)).toEqual([1200, 630])
    expect(metaContent('property', 'og:image:width')).toBe('1200')
    expect(metaContent('property', 'og:image:height')).toBe('630')
    expect(bytes.byteLength).toBeLessThan(200 * 1024)
  })
})

describe('the web app manifest', () => {
  const manifest = JSON.parse(manifestText) as {
    name: string
    start_url: string
    scope: string
    display: string
    theme_color: string
    icons: { src: string; sizes: string; type: string }[]
  }

  it('names the app, starts at the root and stays inside it', () => {
    expect(manifest.name).toBe('RunningCyclingAnalysis')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.theme_color).toBe('#0f1115')
  })

  it('lists icons that exist, at the sizes it states', async () => {
    const png = manifest.icons.filter((icon) => icon.type === 'image/png')
    expect(png.map((icon) => icon.sizes).sort()).toEqual(['192x192', '512x512'])
    for (const icon of png) {
      const [width, height] = icon.sizes.split('x').map(Number)
      expect(pngSize(await publicFile(icon.src.slice(1)))).toEqual([width, height])
    }
  })
})

describe('the 404 page and where it is served', () => {
  it('is a complete page for a path of any depth: no relative URL, no script, not indexed', () => {
    expect(notFound).toContain('<title>Page not found')
    expect(notFound).toContain('<meta name="robots" content="noindex" />')
    expect(notFound).not.toMatch(/<script/)
    expect(notFound).not.toMatch(/(?:href|src)="(?!\/|https?:)[^"]*"/)
    expect(notFound).toContain('<a href="/">Go to the app</a>')
  })

  it('is what the Worker serves for an unknown path, while /api always runs the Worker first', () => {
    for (const config of [wrangler, wranglerLocal]) {
      expect(config).toMatch(/^not_found_handling = "404-page"$/m)
      expect(config).toMatch(/^run_worker_first = \["\/api", "\/api\/\*"\]$/m)
    }
  })
})
