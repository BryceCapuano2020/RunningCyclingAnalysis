import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import {
  CONDENSED_800,
  FACES,
  SANS_600,
  CONDENSED_700,
  fitText,
  fontOf,
  loadCardFonts,
  wrapText,
  type CardContext,
  type Face,
} from './cardCanvas'
import { FakeContext, LONG_HEADLINE, cardModel, draw } from './fixtures'

const mainTsx = await readStylesheet(import.meta.url, '../main.tsx')
const tokensCss = await readStylesheet(import.meta.url, '../styles/tokens.css')

/** The face a family name and weight name, as "Barlow 600", from a CSS font family list. */
function faceName(face: Face): string {
  const family = face.family.split(',')[0] ?? ''
  return `${family.replace(/['"]/g, '').trim()} ${face.weight}`
}

/** The faces main.tsx imports from @fontsource, as "Barlow 600" and so on. */
function importedFaces(): string[] {
  const faces: string[] = []
  for (const match of mainTsx.matchAll(/@fontsource\/(barlow(?:-condensed)?)\/latin-(\d+)\.css/g)) {
    const [, pkg, weight] = match
    if (pkg === undefined || weight === undefined) continue
    const family = pkg === 'barlow' ? 'Barlow' : 'Barlow Condensed'
    faces.push(`${family} ${weight}`)
  }
  return faces
}

/** A custom property's value in tokens.css, from its first declaration. */
function tokenValue(name: string): string {
  const value = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]
  if (value === undefined) throw new Error(`no --${name} in tokens.css`)
  return value.trim()
}

/** The recording context, typed as the card's context for the fitting tests. */
const recording = () => new FakeContext() as unknown as CardContext

/** Ten pixels per character, so line breaks are easy to predict. */
const fixedMeasure = (text: string) => text.length * 10

/** A font with its size taken out, so that a face can be matched whatever size it is drawn at. */
const faceOf = (font: string) => font.replace(/ \d+(\.\d+)?px/, '')

describe('wrapText', () => {
  it('breaks lines at spaces so that no line is wider than the maximum', () => {
    expect(wrapText('one two three four', 100, fixedMeasure)).toEqual(['one two', 'three four'])
  })

  it('keeps a word longer than the maximum on a line of its own', () => {
    expect(wrapText('supercalifragilistic short', 50, fixedMeasure)).toEqual([
      'supercalifragilistic',
      'short',
    ])
  })

  it('returns no lines for blank text', () => {
    expect(wrapText('   ', 100, fixedMeasure)).toEqual([])
  })

  it('stops at the line limit and marks the cut with an ellipsis that fits', () => {
    const lines = wrapText('a bb ccc dddd eeeee', 40, fixedMeasure, 2)
    expect(lines).toEqual(['a bb', 'ccc…'])
    for (const line of lines) expect(fixedMeasure(line)).toBeLessThanOrEqual(40)
  })
})

describe('fitText', () => {
  it('uses the first size, from the largest, at which the text fits the lines allowed', () => {
    // At 100 px an 'ONE TWO' is 350 px and wraps to two lines; at 50 px it is 175 px and fits.
    const { style, lines } = fitText(recording(), 'ONE TWO', CONDENSED_800, [100, 50], 1, 200, 1)
    expect(style.size).toBe(50)
    expect(lines).toEqual(['ONE TWO'])
  })

  it('falls back to the smallest size and cuts the text when nothing fits', () => {
    const ctx = recording()
    const { style, lines } = fitText(ctx, 'A B C D E F', CONDENSED_800, [100, 50], 1, 40, 1)
    expect(style.size).toBe(50)
    expect(lines).toHaveLength(1)
  })
})

describe('loadCardFonts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Stubs document.fonts so that every face asked for is recorded, and returns those requests. */
  function stubFontLoading(): string[] {
    const requested: string[] = []
    const load = (font: string) => {
      requested.push(font)
      return Promise.resolve<FontFace[]>([])
    }
    vi.stubGlobal('document', { fonts: { load } })
    return requested
  }

  it('waits for exactly the faces main.tsx imports, so the card waits for what the page loads', () => {
    expect(FACES.map(faceName).sort()).toEqual(importedFaces().sort())
  })

  it('draws in the same font stacks as tokens.css, so the card matches the page', () => {
    expect(SANS_600.family).toBe(tokenValue('font-sans'))
    expect(CONDENSED_700.family).toBe(tokenValue('font-display'))
  })

  it('stops waiting after ten seconds when a face never loads, rather than hanging the download', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('document', {
        fonts: { load: () => new Promise<FontFace[]>(() => undefined) },
      })
      const outcome = loadCardFonts().then(
        () => 'loaded',
        () => 'failed',
      )
      await vi.advanceTimersByTimeAsync(9_999)
      await vi.advanceTimersByTimeAsync(1)
      expect(await outcome).toBe('failed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves no timer running once the faces have loaded', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('document', { fonts: { load: () => Promise.resolve<FontFace[]>([]) } })
      await loadCardFonts()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('arms no timer when a font load throws at once, so nothing is left to reject later', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('document', {
        fonts: {
          load: () => {
            throw new Error('the font API is broken')
          },
        },
      })
      await expect(loadCardFonts()).rejects.toThrow('the font API is broken')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('requests every face any card is drawn in, so no text is measured in a fallback', async () => {
    const requested = stubFontLoading()
    await loadCardFonts()
    const cards = [
      draw(cardModel(), 'square'),
      draw(cardModel({ badge: 'Sample data' }), 'story'),
      draw(cardModel({ magnitude: null, meter: null }), 'story'),
      draw(cardModel({ headline: LONG_HEADLINE, caveat: null }), 'square'),
    ]
    const drawn = new Set(cards.flatMap((card) => card.texts.map((text) => faceOf(text.font))))
    expect(drawn.size).toBeGreaterThan(1)
    for (const font of drawn) {
      expect(requested.map(faceOf)).toContain(font)
    }
    expect(requested).toEqual(FACES.map((face) => fontOf(face, 16)))
  })

  it('still resolves when a face fails to load, so the card falls back rather than failing', async () => {
    vi.stubGlobal('document', {
      fonts: { load: () => Promise.reject(new Error('offline')) },
    })
    await expect(loadCardFonts()).resolves.toBeUndefined()
  })

  it('resolves at once where there is no document.fonts API', async () => {
    vi.stubGlobal('document', {})
    await expect(loadCardFonts()).resolves.toBeUndefined()
  })
})
